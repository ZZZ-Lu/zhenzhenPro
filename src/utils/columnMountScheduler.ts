/**
 * Global column-mount governor ("mount scheduler").
 *
 * Why this exists — the horizontal board renders every column through a
 * skeleton ⇄ live swap: leaving the shared observer margin tears the whole
 * `TrackColumn` subtree down, coming back rebuilds it (~544 DOM nodes for a
 * 10-card column). Measured on the 100×10 fixture, one rebuild costs ~178 ms of
 * main-thread time (83 ms at 0 cards, 289 ms at 30 cards), always emits a
 * 50–150 ms long task, and a single fast drag produced 26 rebuilds / 26
 * teardowns while the main thread was busy for ~96 % of the frame time
 * (29.7 fps, p95 166.7 ms).
 *
 * This governor applies the "trade time for frames" policy already proven for
 * image loading (see ./imageLoadScheduler.ts): instead of rebuilding a column
 * the moment it crosses the preload margin, the consumer asks for a "slot", and
 * the governor hands out slots on a small budget:
 *
 *   - idle        : 1 column per frame, 6 per second  (drain the backlog)
 *   - scrolling   : 1 column per frame, 3 per second
 *   - fast fling  : 0 — nothing is granted while the user is flinging
 *
 * Holding the skeleton during a fling costs nothing visually: skeleton and live
 * column boxes were measured to be identical (460×796), so nothing shifts and
 * CLS stays 0. As soon as the fling ends the budget opens again and the backlog
 * is drained nearest-to-viewport first, so what the user is looking at arrives
 * before what they scrolled past. A request is never dropped — only delayed,
 * which is exactly the agreed "let the user wait for it" behaviour.
 *
 * Deliberate differences from the image governor:
 *
 *   1. Ordering uses a caller-supplied `distance`, never a layout read. Nothing
 *      in this module calls getBoundingClientRect() — a per-frame rect read is
 *      precisely the anti-pattern that had to be removed from
 *      `checkOffscreenGenerating`. Callers keep their own cached column
 *      geometry (offsetLeft/offsetWidth) and pass the distance;
 *      `distanceFromViewportCenterX` is exported as a pure helper for that
 *      arithmetic. Because ordering is pure arithmetic it is re-evaluated every
 *      tick (not only when idle), so the closest column still wins during slow
 *      scrolling.
 *   2. `perFrame` never exceeds 1 in any state. One rebuild is already a
 *      50–178 ms task, so batching two per frame is never a win; the perSecond
 *      cap is what actually paces the board.
 *
 * Extra safety valve: if a consumer reports how long a rebuild took via
 * `recordColumnMountDuration`, a rebuild that ran past `SPREAD_THRESHOLD_MS`
 * pushes the next grant far enough away that consecutive long tasks do not
 * stack. The valve can be turned off (`setColumnMountSpreadLongTasks(false)`)
 * so its effect can be A/B tested.
 *
 * Wiring is intentionally NOT part of this change — the module is added on its
 * own so it can be reviewed and measured in isolation:
 *
 *   - src/components/VirtualTrackColumn.tsx: the `intersecting === true` branch
 *     of the shared column observer stops calling `setIsInViewport(true)`
 *     directly; it calls `requestColumnMountSlot(...)` and calls
 *     `setIsInViewport(true)` from `onGrant`. The leave branch keeps the existing
 *     240 ms hysteresis and calls `cancelColumnMountSlot`.
 *   - src/App.tsx: owns the column geometry cache (offsetLeft/offsetWidth,
 *     invalidated on resize and on column add/remove) that feeds `distance`.
 */

import { IMAGE_LOAD_BUDGETS } from "./imageLoadScheduler";

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export interface ColumnMountBudgets {
  /** Columns granted per animation frame. Never configured above 1. */
  perFrame: number;
  /** Columns granted per rolling second. */
  perSecond: number;
}

export interface ColumnMountBudgetSet {
  readonly idle: ColumnMountBudgets;
  readonly scrolling: ColumnMountBudgets;
  readonly fast: ColumnMountBudgets;
  /** px/ms above which the user counts as flinging (shared with image governor). */
  readonly fastSpeed: number;
  /** px/ms above which the user counts as scrolling at all. */
  readonly movingSpeed: number;
}

const IDLE_BUDGET: ColumnMountBudgets = { perFrame: 1, perSecond: 6 };
const SCROLL_BUDGET: ColumnMountBudgets = { perFrame: 1, perSecond: 3 };
const FAST_BUDGET: ColumnMountBudgets = { perFrame: 0, perSecond: 0 };

/**
 * "What counts as fast scrolling" has exactly one definition, owned by the
 * image governor — reusing it here keeps both governors in agreement instead of
 * letting two tuned thresholds drift apart.
 */
const FAST_SPEED = IMAGE_LOAD_BUDGETS.fastSpeed;
const MOVING_SPEED = IMAGE_LOAD_BUDGETS.movingSpeed;

/** Silence after which the scroll velocity starts decaying. */
const VELOCITY_DECAY_MS = 140;
/** Silence after which the scroll velocity is treated as zero. */
const VELOCITY_STOP_MS = 320;

/**
 * Exposed by reference, and mutable through `setColumnMountBudgets`, so a run
 * can switch pacing (or roll the whole thing back to "grant immediately") at
 * runtime without a rebuild. Do not treat these as frozen constants.
 */
export const COLUMN_MOUNT_BUDGETS: ColumnMountBudgetSet = {
  idle: IDLE_BUDGET,
  scrolling: SCROLL_BUDGET,
  fast: FAST_BUDGET,
  fastSpeed: FAST_SPEED,
  movingSpeed: MOVING_SPEED,
};

/** A rebuild slower than this is treated as a long task worth spreading out. */
const SPREAD_THRESHOLD_MS = 50;
/** Upper bound on the spreading delay, so pacing cannot collapse entirely. */
const SPREAD_MAX_MS = 200;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface MountEntry {
  key: string;
  distance: number;
  urgent: boolean;
  onGrant: () => void;
  seq: number;
}

const queue: MountEntry[] = [];
const pendingByKey = new Map<string, MountEntry>();

let rafId = 0;
let running = false;
let seqCounter = 0;

/** Smoothed scroll velocity in px/ms (max across axes, across containers). */
let speed = 0;
let lastScrollAt = 0;
const lastScrollPos = new WeakMap<
  Element,
  { x: number; y: number; t: number }
>();

/** Earliest timestamp at which the next grant is allowed (long-task spreading). */
let earliestNextGrantAt = 0;
let spreadEnabled = true;

/** Dispatch timestamps inside the last second. */
const recentGrantTimes: number[] = [];

const counters = {
  granted: 0,
  cancelled: 0,
  queuedWhileFast: 0,
  grantErrors: 0,
};

let peakPerSecond = 0;
let lastMountMs = 0;
let maxMountMs = 0;
let mountSamples = 0;
let mountMsTotal = 0;

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
      // Same EWMA as the image governor: never overshoots the instantaneous
      // reading, so a single fast burst is recognised on the very next frame.
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
  // Keep the velocity the scroll listener measured: during a continuous fling
  // the queue often drains empty for a frame or two, and resetting the speed
  // here would hand out the full idle budget right in the middle of it. Only a
  // genuinely stale reading (the user really stopped) is discarded.
  if (t - lastScrollAt > VELOCITY_STOP_MS) speed = 0;
  if (!lastScrollAt) lastScrollAt = t;
  schedule();
}

function budgetFor(currentSpeed: number): ColumnMountBudgets {
  if (currentSpeed > FAST_SPEED) return FAST_BUDGET;
  if (currentSpeed > MOVING_SPEED) return SCROLL_BUDGET;
  return IDLE_BUDGET;
}

/**
 * Nearest to the viewport centre first; urgent entries jump the queue; `seq`
 * keeps the order stable for equal distances. Pure arithmetic over values the
 * caller already computed — no layout reads.
 */
function sortQueue() {
  queue.sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return a.distance - b.distance || a.seq - b.seq;
  });
}

/** Drop grant timestamps that fell out of the rolling one-second window. */
function trimRecent(t: number) {
  const cutoff = t - 1000;
  while (recentGrantTimes.length && recentGrantTimes[0] < cutoff) {
    recentGrantTimes.shift();
  }
}

const devEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;

function tick() {
  rafId = 0;
  const t = now();

  // Decay velocity once the user stops generating scroll events.
  if (t - lastScrollAt > VELOCITY_DECAY_MS) speed *= 0.4;
  if (t - lastScrollAt > VELOCITY_STOP_MS) speed = 0;

  const budget = budgetFor(speed);

  // Rolling-window rate limit: never more than `perSecond` slots in any
  // one-second span, never more than `perFrame` in a single frame.
  trimRecent(t);
  let allow = Math.min(
    budget.perFrame,
    budget.perSecond - recentGrantTimes.length,
  );
  if (allow < 0) allow = 0;

  // Long-task spreading: a rebuild that already ran past the threshold keeps
  // the next grant off this frame, so long tasks do not stack back-to-back.
  if (allow > 0 && t < earliestNextGrantAt) allow = 0;

  if (allow > 0 && queue.length > 1) sortQueue();

  while (allow > 0 && queue.length) {
    const entry = queue.shift()!;
    pendingByKey.delete(entry.key);
    counters.granted++;
    allow--;
    recentGrantTimes.push(t);
    if (recentGrantTimes.length > peakPerSecond) {
      peakPerSecond = recentGrantTimes.length;
    }
    try {
      entry.onGrant();
    } catch (err) {
      // A throwing consumer must never kill the governor: without this the rAF
      // loop would die while `running` stayed true and the board would stop
      // mounting columns altogether. Count it and keep draining.
      counters.grantErrors++;
      if (devEnv?.DEV) console.error("[columnMountScheduler] onGrant threw", err);
    }
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

export interface ColumnMountSlotRequest {
  /** Stable column identity, e.g. the workspace id. */
  key: string;
  /**
   * Horizontal distance from the viewport centre, in px, computed by the caller
   * from cached geometry (see `distanceFromViewportCenterX`). Small wins.
   */
  distance: number;
  /**
   * Ordering hint only: urgent entries are granted before nearer non-urgent
   * ones. It does NOT bypass the budget — during a fast fling nothing is
   * granted, urgent or not, so the skeleton is kept for every column and the
   * main thread stays free until the user slows down.
   */
  urgent?: boolean;
  /** Runs on the frame a slot is granted; this is where the consumer mounts. */
  onGrant: () => void;
}

/**
 * Ask for permission to mount (rebuild) the live column `key`. `onGrant` may run
 * much later than the call when the user is scrolling fast. Calling again for
 * the same key is idempotent: it refreshes the callback and ordering inputs
 * instead of queueing a duplicate.
 */
export function requestColumnMountSlot(req: ColumnMountSlotRequest): void {
  const existing = pendingByKey.get(req.key);
  if (existing) {
    existing.onGrant = req.onGrant;
    existing.distance = req.distance;
    if (req.urgent !== undefined) existing.urgent = req.urgent;
    if (!running) start();
    else schedule();
    return;
  }

  const entry: MountEntry = {
    key: req.key,
    distance: req.distance,
    urgent: req.urgent === true,
    onGrant: req.onGrant,
    seq: ++seqCounter,
  };
  pendingByKey.set(req.key, entry);
  queue.push(entry);

  if (speed > FAST_SPEED) counters.queuedWhileFast++;

  if (!running) start();
  else schedule();
}

/**
 * Refresh the ordering inputs of a pending request (the caller's geometry moved
 * or the column became urgent). No-op for keys that are not queued.
 */
export function updateColumnMountSlotPriority(
  key: string,
  patch: { distance?: number; urgent?: boolean },
): void {
  const entry = pendingByKey.get(key);
  if (!entry) return;
  if (patch.distance !== undefined) entry.distance = patch.distance;
  if (patch.urgent !== undefined) entry.urgent = patch.urgent;
}

/**
 * Withdraw a pending request (column scrolled away, unmounted, or already
 * mounted by other means). Safe to call for keys that were never queued.
 */
export function cancelColumnMountSlot(key: string): void {
  const entry = pendingByKey.get(key);
  if (!entry) return;
  pendingByKey.delete(key);
  const idx = queue.indexOf(entry);
  if (idx >= 0) queue.splice(idx, 1);
  counters.cancelled++;
}

/** Whether `key` is still waiting for a slot. */
export function isColumnMountPending(key: string): boolean {
  return pendingByKey.has(key);
}

/**
 * Optional: report how long a granted mount actually took (ms). Feeding this in
 * lets the governor spread consecutive long tasks instead of stacking them.
 * Calling it is optional and never required for correctness.
 */
export function recordColumnMountDuration(ms: number): void {
  if (!(ms > 0)) return;
  lastMountMs = ms;
  mountSamples++;
  mountMsTotal += ms;
  if (ms > maxMountMs) maxMountMs = ms;
  if (spreadEnabled && ms >= SPREAD_THRESHOLD_MS) {
    const delay = Math.min(ms, SPREAD_MAX_MS);
    earliestNextGrantAt = Math.max(earliestNextGrantAt, now() + delay);
  }
}

/** Turn the long-task spreading valve on/off (used for A/B testing). */
export function setColumnMountSpreadLongTasks(enabled: boolean): void {
  spreadEnabled = enabled;
  if (!enabled) earliestNextGrantAt = 0;
}

/**
 * Retune pacing at runtime; this is the rollback switch — restoring
 * `perFrame/perSecond` to a very large value makes the governor grant every
 * request on the next frame, i.e. the pre-scheduler behaviour.
 */
export function setColumnMountBudgets(patch: {
  idle?: Partial<ColumnMountBudgets>;
  scrolling?: Partial<ColumnMountBudgets>;
  fast?: Partial<ColumnMountBudgets>;
}): void {
  if (patch.idle) Object.assign(IDLE_BUDGET, patch.idle);
  if (patch.scrolling) Object.assign(SCROLL_BUDGET, patch.scrolling);
  if (patch.fast) Object.assign(FAST_BUDGET, patch.fast);
}

/**
 * Pure helper for callers that keep cached column geometry: distance between
 * the column centre and the viewport centre, both along X. Uses only numbers the
 * caller already has, so no getBoundingClientRect() is needed anywhere.
 */
export function distanceFromViewportCenterX(
  columnLeft: number,
  columnWidth: number,
  viewportClientWidth: number,
  viewportScrollLeft: number,
): number {
  const columnCenter = columnLeft + columnWidth / 2;
  const viewportCenter = viewportScrollLeft + viewportClientWidth / 2;
  return Math.abs(columnCenter - viewportCenter);
}

export interface ColumnMountSchedulerStats {
  /** Slots granted in the last ~1s. */
  perSecond: number;
  /** Highest observed grant rate since page load. */
  peakPerSecond: number;
  /** Requests still waiting for a slot. */
  pending: number;
  /** Total slots granted since page load. */
  granted: number;
  /** Total pending requests withdrawn. */
  cancelled: number;
  /** Requests that arrived while the user was flinging. */
  queuedWhileFast: number;
  /** onGrant callbacks that threw (the loop survives them). */
  grantErrors: number;
  /** Smoothed scroll velocity, px/ms. */
  speed: number;
  /** Which budget tier the current velocity selects. */
  budget: "idle" | "scrolling" | "fast";
  /** Whether the loop is currently draining a backlog. */
  running: boolean;
  /** Whether long-task spreading is enabled. */
  spread: boolean;
  /** Duration of the most recently reported mount, ms. */
  lastMountMs: number;
  /** Mean reported mount duration, ms. */
  avgMountMs: number;
  /** Longest reported mount duration, ms. */
  maxMountMs: number;
}

export function getColumnMountSchedulerStats(): ColumnMountSchedulerStats {
  const budget = budgetFor(speed);
  return {
    perSecond: recentGrantTimes.length,
    peakPerSecond,
    pending: queue.length,
    granted: counters.granted,
    cancelled: counters.cancelled,
    queuedWhileFast: counters.queuedWhileFast,
    grantErrors: counters.grantErrors,
    speed: Math.round(speed * 100) / 100,
    budget:
      budget === FAST_BUDGET
        ? "fast"
        : budget === SCROLL_BUDGET
          ? "scrolling"
          : "idle",
    running,
    spread: spreadEnabled,
    lastMountMs,
    avgMountMs: mountSamples ? Math.round((mountMsTotal / mountSamples) * 10) / 10 : 0,
    maxMountMs,
  };
}

/** Test/measurement helper: drop all state. Not used by the application. */
export function __resetColumnMountSchedulerForTests(): void {
  queue.length = 0;
  pendingByKey.clear();
  recentGrantTimes.length = 0;
  speed = 0;
  lastScrollAt = 0;
  earliestNextGrantAt = 0;
  spreadEnabled = true;
  counters.granted = 0;
  counters.cancelled = 0;
  counters.queuedWhileFast = 0;
  counters.grantErrors = 0;
  peakPerSecond = 0;
  lastMountMs = 0;
  maxMountMs = 0;
  mountSamples = 0;
  mountMsTotal = 0;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  running = false;
}

// Dev-only observability hook used by the mount/scroll measurement harness.
// `import.meta.env.DEV` is inlined to `false` by the production build, so this
// whole block is dropped from the shipped bundle (same pattern as the image
// governor).
if (typeof window !== "undefined" && devEnv?.DEV) {
  (window as unknown as Record<string, unknown>).__columnMountGovernor = {
    stats: getColumnMountSchedulerStats,
    budgets: COLUMN_MOUNT_BUDGETS,
    reset: __resetColumnMountSchedulerForTests,
  };
}