/**
 * Global image-load governor.
 *
 * Rationale — "trade time for frames":
 * mounting an `<img>` is cheap, but fetching + decoding it is not. When the user
 * flings the board horizontally, an entire column (10 cards) can enter the
 * preload margin at once, which queues dozens of simultaneous decodes and shows
 * up as dropped frames. Instead of loading everything the instant it enters the
 * margin, every consumer asks this governor for a "slot". The governor hands out
 * slots on a small budget:
 *
 *   - idle (not scrolling) : generous budget, but still chunked per frame
 *   - scrolling            : reduced budget
 *   - scrolling fast       : minimal budget (1 image per frame / 8 per second)
 *
 * As soon as the user stops scrolling the budget opens up again and the backlog
 * is drained nearest-to-viewport first, so what the user is looking at arrives
 * before what they scrolled past. Nothing here ever *drops* a request: it is
 * only delayed, exactly the "let the user wait for the image" behaviour.
 *
 * The governor is intentionally dependency-free and side-effect-light: one
 * passive scroll listener for velocity, one rAF loop that only runs while there
 * is a backlog.
 */

export interface ImageLoadBudgets {
  perFrame: number;
  perSecond: number;
}

const IDLE_BUDGET: ImageLoadBudgets = { perFrame: 10, perSecond: 120 };
const SCROLL_BUDGET: ImageLoadBudgets = { perFrame: 3, perSecond: 24 };
const FAST_BUDGET: ImageLoadBudgets = { perFrame: 1, perSecond: 8 };

/** px/ms above which the user counts as "scrolling fast". */
const FAST_SPEED = 1.2;
/** px/ms above which the user counts as "scrolling" at all. */
const MOVING_SPEED = 0.05;
/** Silence after which the scroll velocity starts decaying. */
const VELOCITY_DECAY_MS = 140;
/** Silence after which the scroll velocity is treated as zero. */
const VELOCITY_STOP_MS = 320;

type Entry = {
  el: Element;
  cb: () => void;
  seq: number;
  dist: number;
  cancelled: boolean;
};

const queue: Entry[] = [];
const pendingByEl = new WeakMap<Element, Entry>();

let rafId = 0;
let running = false;

/** Smoothed scroll velocity in px/ms (max across axes, across containers). */
let speed = 0;
let lastScrollAt = 0;
const lastScrollPos = new WeakMap<Element, { x: number; y: number; t: number }>();

let idleSorted = false;
let seqCounter = 0;

/** Dispatch timestamps inside the last second (for observability/tests). */
const recentDispatchTimes: number[] = [];

const stats = {
  dispatched: 0,
  cancelled: 0,
  peakPerSecond: 0,
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// Scroll velocity tracking
// ---------------------------------------------------------------------------

function onGlobalScroll(e: Event) {
  const target = e.target as
    | (Element & { scrollLeft?: number; scrollTop?: number })
    | null;
  if (!target) return;

  let x: number;
  let y: number;
  if (typeof target.scrollLeft === "number") {
    x = target.scrollLeft;
    y = target.scrollTop || 0;
  } else {
    x = typeof window !== "undefined" ? window.scrollX : 0;
    y = typeof window !== "undefined" ? window.scrollY : 0;
  }

  const ts =
    typeof e.timeStamp === "number" && e.timeStamp > 0 ? e.timeStamp : now();

  const prev = lastScrollPos.get(target);
  lastScrollPos.set(target, { x, y, t: ts });

  if (prev) {
    const dt = Math.max(1, ts - prev.t);
    const d = Math.max(Math.abs(x - prev.x), Math.abs(y - prev.y));
    if (d > 0) {
      const inst = d / dt;
      // Cheap EWMA that never overshoots the instantaneous reading, so a single
      // fast burst is recognised on the very next frame.
      const smoothed = speed * 0.5 + inst * 0.5;
      speed = Math.min(inst, smoothed);
    }
  }

  lastScrollAt = ts;
  if (!running && queue.length) start();
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", onGlobalScroll, {
    capture: true,
    passive: true,
  });
}

// ---------------------------------------------------------------------------
// Dispatch loop
// ---------------------------------------------------------------------------

function schedule() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function start() {
  running = true;
  const t = now();
  // Keep the velocity measured by the scroll listener: during a continuous
  // fling the queue often drains empty for a frame or two, and resetting the
  // speed here would hand out the full idle budget right in the middle of it.
  // Only a genuinely stale reading (user really stopped) is discarded.
  if (t - lastScrollAt > VELOCITY_STOP_MS) speed = 0;
  if (!lastScrollAt) lastScrollAt = t;
  idleSorted = false;
  schedule();
}

/** Drop dispatch timestamps that fell out of the rolling one-second window. */
function trimRecent(t: number) {
  const cutoff = t - 1000;
  while (recentDispatchTimes.length && recentDispatchTimes[0] < cutoff) {
    recentDispatchTimes.shift();
  }
}

function budgetFor(currentSpeed: number): ImageLoadBudgets {
  if (currentSpeed > FAST_SPEED) return FAST_BUDGET;
  if (currentSpeed > MOVING_SPEED) return SCROLL_BUDGET;
  return IDLE_BUDGET;
}

/** Distance from the viewport centre, used to drain the closest images first. */
function sortByDistance() {
  const vw = typeof window !== "undefined" ? window.innerWidth || 1 : 1;
  const vh = typeof window !== "undefined" ? window.innerHeight || 1 : 1;
  const cx = vw / 2;
  const cy = vh / 2;
  for (const entry of queue) {
    if (entry.cancelled) continue;
    const r = entry.el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    entry.dist = Math.sqrt(dx * dx + dy * dy);
  }
  queue.sort((a, b) => {
    if (a.cancelled !== b.cancelled) return a.cancelled ? 1 : -1;
    return a.dist - b.dist || a.seq - b.seq;
  });
}

function tick() {
  rafId = 0;
  const t = now();

  // Decay velocity once the user stops generating scroll events.
  if (t - lastScrollAt > VELOCITY_DECAY_MS) speed *= 0.4;
  if (t - lastScrollAt > VELOCITY_STOP_MS) speed = 0;

  const budget = budgetFor(speed);

  if (budget === IDLE_BUDGET) {
    if (!idleSorted && queue.length > 1) {
      sortByDistance();
      idleSorted = true;
    }
  } else {
    idleSorted = false;
  }

  // Rolling-window rate limit: never more than `perSecond` slots granted in
  // any one-second span, and never more than `perFrame` in a single frame.
  trimRecent(t);
  let allow = Math.min(budget.perFrame, budget.perSecond - recentDispatchTimes.length);
  if (allow < 0) allow = 0;
  while (allow > 0 && queue.length) {
    const entry = queue.shift()!;
    if (entry.cancelled) continue;
    pendingByEl.delete(entry.el);
    stats.dispatched++;
    allow--;
    recentDispatchTimes.push(t);
    if (recentDispatchTimes.length > stats.peakPerSecond) {
      stats.peakPerSecond = recentDispatchTimes.length;
    }
    entry.cb();
  }

  if (queue.length) {
    schedule();
  } else {
    running = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask for permission to start loading the image owned by `el`. `cb` runs on the
 * frame the governor grants a slot (it may run much later than the call when
 * the user is scrolling fast). A second call for the same element just replaces
 * the callback instead of queueing a duplicate.
 */
export function requestImageLoadSlot(el: Element, cb: () => void): void {
  const existing = pendingByEl.get(el);
  if (existing) {
    existing.cb = cb;
    existing.cancelled = false;
    if (!running) start();
    else schedule();
    return;
  }
  const entry: Entry = { el, cb, seq: ++seqCounter, dist: 0, cancelled: false };
  pendingByEl.set(el, entry);
  queue.push(entry);
  if (!running) start();
  else schedule();
}

/**
 * Withdraw a pending request (element scrolled away / unmounted / already
 * loaded). Safe to call for elements that were never queued.
 */
export function cancelImageLoadSlot(el: Element): void {
  const entry = pendingByEl.get(el);
  if (!entry) return;
  entry.cancelled = true;
  pendingByEl.delete(el);
  stats.cancelled++;
}

export interface ImageLoadGovernorStats {
  /** Images actually released to load in the last ~1s. */
  perSecond: number;
  /** Highest observed dispatch rate (per second) since page load. */
  peakPerSecond: number;
  /** Requests still waiting for a slot. */
  pending: number;
  /** Total slots granted since page load. */
  dispatched: number;
  /** Total pending requests withdrawn (scrolled past / unmounted). */
  cancelled: number;
  /** Smoothed scroll velocity, px/ms. */
  speed: number;
  /** Whether the loop is currently draining a backlog. */
  running: boolean;
}

export function getImageLoadGovernorStats(): ImageLoadGovernorStats {
  return {
    perSecond: recentDispatchTimes.length,
    peakPerSecond: stats.peakPerSecond,
    pending: queue.reduce((n, e) => (e.cancelled ? n : n + 1), 0),
    dispatched: stats.dispatched,
    cancelled: stats.cancelled,
    speed: Math.round(speed * 100) / 100,
    running,
  };
}

export const IMAGE_LOAD_BUDGETS = {
  idle: IDLE_BUDGET,
  scrolling: SCROLL_BUDGET,
  fast: FAST_BUDGET,
  fastSpeed: FAST_SPEED,
  movingSpeed: MOVING_SPEED,
} as const;

// Dev-only observability hook used by the scroll/load measurement harness.
// `import.meta.env.DEV` is inlined to `false` by the production build, so this
// whole block is dropped from the shipped bundle.
const devEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
if (typeof window !== "undefined" && devEnv?.DEV) {
  (window as unknown as Record<string, unknown>).__imageLoadGovernor = {
    stats: getImageLoadGovernorStats,
    budgets: IMAGE_LOAD_BUDGETS,
  };
}