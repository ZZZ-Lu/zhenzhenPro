/**
 * 图片加载闸门（阶段二）。
 *
 * 做什么：把「给 img 挂上 src（= 触发下载与解码）」这件事收口到单一入口，按配额放行，
 * 用更长的加载时间换更平稳的帧率：
 *  1) 速率配额：每帧最多放行 N 张、每秒最多放行 M 张；滚动期间收紧，停下之后放宽补齐；
 *  2) 排队顺序：离视口最近优先（列容器是确定尺寸，即便被渲染隔离跳过也能拿到真实矩形；
 *     没有列祖先的弹层/灯箱图片直接视为最高优先）；
 *  3) 工作集上限（默认关闭，见下方说明）：同时已加载张数设上限，超额时最远优先释放，
 *     正在视口内的图片有硬保护，永不释放。
 *
 * 关于「正在滚动」的判定（关键）：
 *  只靠 document 捕获到的 scroll 事件是不够的——实测会出现「时而暂停、大多数时候仍然
 *  边滚动边加载」。原因是滚动判定只有一个输入：事件的时间戳。只要事件缺失、被合并，
 *  或位移不是由 DOM 滚动容器产生（拖拽/变换/程序化滚动等），判定就会立刻失效并回退到
 *  停下配额（120/秒）。因此这里改为双信号：事件只是「快信号」，另加一条按 motionPollMs
 *  节流的**位移轮询**（采样画板与视口内列容器的滚动位置与位置），任一信号在 scrollIdleMs
 *  内出现过就视为「正在滚动」，两个信号都停了才恢复放行。
 *
 * 关于工作集释放：实测（100 列 × 10 图夹具、同一页面内 A/B）打开「超额释放」会让滚动
 * 明显变差——快速甩动 17.6fps、长任务 47.3s；关掉释放只留速率配额后长任务降到 10.8s
 * 量级。原因是释放会清空 src，来回滚动时反复重载与重复解码，代价远大于它回收的工作集。
 * 因此默认只启用速率配额（用户要求的那条），释放作为可选开关保留，需要限制解码工作集时
 * 再打开。
 *
 * 开关各自独立，可单独关闭回退：
 *  - enabled           总开关：false 时直接挂 src，等于回到无闸门行为
 *  - rateLimitEnabled  速率配额（每帧 / 每秒）
 *  - workingSetEnabled 同时已加载上限与最远优先释放
 *
 * 调参只改 IMAGE_LOAD_GATE 这一处常量。
 */

import { useEffect, useState } from "react";

interface Budget {
  perFrame: number;
  perSecond: number;
}

interface ImageLoadGateConfig {
  enabled: boolean;
  rateLimitEnabled: boolean;
  workingSetEnabled: boolean;
  scrollBudget: Budget;
  idleBudget: Budget;
  scrollIdleMs: number;
  /** 位移轮询间隔（ms）：不依赖滚动事件也能判定「正在滚动」。 */
  motionPollMs: number;
  maxConcurrent: number;
  releaseBatch: number;
  softMarginPx: number;
  /** 排队顺序与释放判定的重算间隔（ms）：逐帧重算会把主线程打满。 */
  rankRefreshMs: number;
}

export const IMAGE_LOAD_GATE: ImageLoadGateConfig = {
  enabled: true,
  /** 速率配额开关：用户要求「设置每帧/每秒的加载数」就是这一条。 */
  rateLimitEnabled: true,
  /** 工作集上限与释放开关：默认关闭（实测打开会让滚动更卡，见文件头说明）。 */
  workingSetEnabled: false,

  /**
   * 滚动期间的放行配额。
   * 现在取 0/0 = 滚动过程中一张都不放行：正在滚动时未放行的图片保持占位，
   * 只等停下来再补。想回到「滚动期少量放行」就把这里改成 { perFrame: 3, perSecond: 24 }。
   */
  scrollBudget: { perFrame: 0, perSecond: 0 },
  /** 停下之后的放行配额（补齐）。 */
  idleBudget: { perFrame: 12, perSecond: 120 },
  /** 距最近一次「滚动事件或轮询到位移」超过该时长即视为「已停下」。 */
  scrollIdleMs: 320,
  /** 位移轮询间隔：越小越灵敏、读布局越频繁；100ms 足够覆盖人手滚动。 */
  motionPollMs: 100,

  /** 同时已加载张数上限（仅工作集开关打开时生效）。 */
  maxConcurrent: 48,
  /** 单轮最多释放张数（仅工作集开关打开时生效）。 */
  releaseBatch: 8,
  /** 软安全边距：该范围内已加载的图片尽量不释放（仅工作集开关打开时生效）。 */
  softMarginPx: 400,
  /** 排队顺序与释放判定的重算间隔。 */
  rankRefreshMs: 150,
};

type Entry = {
  id: number;
  seq: number;
  url: string;
  getEl: () => HTMLElement | null;
  sink: (url: string | null) => void;
  admitted: boolean;
  /** 缓存所属列容器：DOM 结构不会变，逐帧重新 closest() 太贵。 */
  col: HTMLElement | null;
  colResolved: boolean;
};

const entries = new Map<number, Entry>();

let nextSeq = 1;
let rafId: number | null = null;
let lastScrollAt = -1e9;
let listenersBound = false;
let secondWindowStart = 0;
let admittedInSecond = 0;

/** 位移轮询状态：上一次采样的时间与签名。 */
let lastMotionPollAt = -1e9;
let lastMotionSig: number[] = [];
/** 轮询到「确实发生了位移」的时间。 */
let lastMotionAt = -1e9;
/** 诊断计数：收到多少滚动事件、轮询到多少次位移。 */
let scrollEventsSeen = 0;
let motionDetectedCount = 0;

/** 已排序的待放行列表 + 其重算时间。 */
let rankedPending: Array<{ e: Entry; gap: number }> = [];
let rankedAt = -1e9;
let rankedDirty = true;
let lastReleaseAt = -1e9;

const stats = {
  released: 0,
  lastTickAt: 0,
  lastTickReleased: 0,
  lastTickAdmitted: 0,
};

function countAdmitted(): number {
  let n = 0;
  entries.forEach((e) => {
    if (e.admitted) n += 1;
  });
  return n;
}

/** 距最近一次「滚动事件或轮询到位移」的时长（ms）。 */
function activityAge(now: number): number {
  return now - Math.max(lastScrollAt, lastMotionAt);
}

function bindListeners() {
  if (listenersBound || typeof document === "undefined") return;
  listenersBound = true;
  // scroll 不冒泡，但捕获阶段能收到所有内层滚动容器（画板、列内滚动区）的事件。
  // 事件只是快信号，真正的兜底是 pollMotion() 的位移轮询。
  document.addEventListener(
    "scroll",
    () => {
      const now = performance.now();
      scrollEventsSeen += 1;
      lastScrollAt = now;
      lastMotionAt = now;
      rankedDirty = true;
      requestTick();
    },
    { capture: true, passive: true },
  );
}

function requestTick() {
  if (typeof window === "undefined") return;
  if (rafId !== null) return;
  rafId = window.requestAnimationFrame(() => {
    rafId = null;
    tick();
  });
}

/**
 * 采样「页面是否有位移」的签名：画板滚动位置、窗口滚动位置，以及当前视口内最多 4 个
 * 列容器自身的位置与其内层滚动区的滚动位置。列容器是确定尺寸，即便被渲染隔离跳过也能
 * 读到真实矩形，整段成本很低。
 */
function motionSignature(): number[] {
  const sig: number[] = [];
  const board = document.getElementById("tracks-scroll-viewport");
  if (board) sig.push(board.scrollLeft, board.scrollTop);
  sig.push(window.scrollX, window.scrollY);

  const vpRight = window.innerWidth;
  const cols = document.querySelectorAll<HTMLElement>(
    '[data-iso-target="column"]',
  );
  let seen = 0;
  for (let i = 0; i < cols.length && seen < 4; i++) {
    const col = cols[i];
    const r = col.getBoundingClientRect();
    if (r.right <= 0 || r.left >= vpRight) continue;
    seen += 1;
    sig.push(Math.round(r.left), Math.round(r.top));
    const sc = col.querySelector<HTMLElement>(
      "[id^='track-scroll-container-']",
    );
    if (sc) sig.push(sc.scrollTop, sc.scrollLeft);
  }
  return sig;
}

/** 按 motionPollMs 节流地采样位移；发现位移就刷新 lastMotionAt。 */
function pollMotion(now: number) {
  if (now - lastMotionPollAt < IMAGE_LOAD_GATE.motionPollMs) return;
  lastMotionPollAt = now;
  const sig = motionSignature();
  const prev = lastMotionSig;
  lastMotionSig = sig;

  // 任何差异都算位移：包括长度不同（视口内的列集合变了，本身就是内容在移动）。
  // 之前只在长度相同时逐项比较，一旦集合变化就被跳过，实测会让「无事件位移」漏判。
  let moved = prev.length !== sig.length;
  if (!moved) {
    for (let i = 0; i < sig.length; i++) {
      if (sig[i] !== prev[i]) {
        moved = true;
        break;
      }
    }
  }
  if (moved) {
    lastMotionAt = now;
    motionDetectedCount += 1;
    rankedDirty = true;
  }
}

function gapOfColumn(
  col: HTMLElement | null,
  vp: { left: number; right: number },
  cache: Map<HTMLElement, number>,
): number {
  if (!col) return 0; // 无列祖先：灯箱 / 编辑器 / 参考图等，最高优先
  const cached = cache.get(col);
  if (cached !== undefined) return cached;
  const r = col.getBoundingClientRect();
  const gap = Math.max(vp.left - r.right, r.left - vp.right, 0);
  cache.set(col, gap);
  return gap;
}

/** 重算待放行顺序（离视口最近优先）。最多每 rankRefreshMs 一次。 */
function refreshRanking(now: number, vp: { left: number; right: number }) {
  rankedAt = now;
  rankedDirty = false;
  const colGapCache = new Map<HTMLElement, number>();
  const list: Array<{ e: Entry; gap: number }> = [];
  entries.forEach((e) => {
    if (e.admitted) return;
    if (!e.colResolved) {
      e.col = e.getEl()?.closest('[data-iso-target="column"]') ?? null;
      e.colResolved = true;
    }
    list.push({ e, gap: gapOfColumn(e.col, vp, colGapCache) });
  });
  list.sort((a, b) => a.gap - b.gap || a.e.seq - b.e.seq);
  rankedPending = list;
}

function tick() {
  if (typeof window === "undefined") return;
  if (entries.size === 0) return;
  if (!IMAGE_LOAD_GATE.enabled) {
    // 总开关关闭：把还在排队的图片一次性放行，等价于无闸门行为，
    // 避免开关一关就留下永远不加载的空白图。
    entries.forEach((e) => {
      if (!e.admitted) {
        e.admitted = true;
        e.sink(e.url);
      }
    });
    return;
  }

  const now = performance.now();
  stats.lastTickAt = now;
  stats.lastTickReleased = 0;
  stats.lastTickAdmitted = 0;

  // 先采样一次位移：这是不依赖滚动事件的兜底判定，必须在暂停分支之前跑，
  // 否则滚动期间一旦事件缺失就永远醒不过来。
  pollMotion(now);

  const vp = { left: 0, right: window.innerWidth };
  const vpRect = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
  };
  const scrolling = activityAge(now) < IMAGE_LOAD_GATE.scrollIdleMs;

  // 0. 滚动期完全暂停放行（scrollBudget 取 0 即此语义）：正在滚动时既不重算排名也不扫描
  //    待放行列表，把整帧留给滚动本身；仍然逐帧 tick，滚动停下后立刻恢复放行。
  if (IMAGE_LOAD_GATE.scrollBudget.perSecond === 0 && scrolling) {
    requestTick();
    return;
  }

  // 1. 待放行排序：离视口最近优先。重算有节流——逐帧对近千张图做 ancestor 遍历与排序
  //    本身就会把主线程打满（实测长任务因此暴涨）。
  if (rankedDirty || now - rankedAt >= IMAGE_LOAD_GATE.rankRefreshMs) {
    refreshRanking(now, vp);
  } else {
    // 两次重算之间只把已放行的条目摘掉，保留既有顺序
    if (rankedPending.length) {
      const filtered = rankedPending.filter((x) => !x.e.admitted);
      if (filtered.length !== rankedPending.length) rankedPending = filtered;
    }
  }
  const pendingNear = rankedPending.filter((x) => x.gap === 0).length;

  // 2. 配额：滚动期间收紧，停下之后放宽
  const budget: Budget = scrolling
    ? IMAGE_LOAD_GATE.scrollBudget
    : IMAGE_LOAD_GATE.idleBudget;
  if (now - secondWindowStart >= 1000) {
    secondWindowStart = now;
    admittedInSecond = 0;
  }

  // 3. 释放（默认关闭）：为「视口内还等着放行」的图片腾位置，最远优先，
  //    视口内的图片硬保护。释放判定同样按 rankRefreshMs 节流。
  let admittedCount = countAdmitted();
  if (
    IMAGE_LOAD_GATE.workingSetEnabled &&
    now - lastReleaseAt >= IMAGE_LOAD_GATE.rankRefreshMs
  ) {
    lastReleaseAt = now;
    const needRoom = Math.min(pendingNear, budget.perFrame);
    let toRelease = admittedCount - (IMAGE_LOAD_GATE.maxConcurrent - needRoom);
    if (toRelease > 0) {
      toRelease = Math.min(toRelease, IMAGE_LOAD_GATE.releaseBatch);
      const colGapCache = new Map<HTMLElement, number>();
      const candidates: Array<{
        e: Entry;
        gap: number;
        nearSoftMargin: boolean;
      }> = [];
      entries.forEach((e) => {
        if (!e.admitted) return;
        const el = e.getEl();
        const r = el ? el.getBoundingClientRect() : null;
        // 正在视口内的图片硬保护：永不释放
        const inViewport =
          !!r &&
          r.left < vpRect.right &&
          r.right > vpRect.left &&
          r.top < vpRect.bottom &&
          r.bottom > vpRect.top;
        if (inViewport) return;
        const gap = gapOfColumn(e.col, vp, colGapCache);
        candidates.push({
          e,
          gap,
          nearSoftMargin: gap <= IMAGE_LOAD_GATE.softMarginPx,
        });
      });
      candidates.sort((a, b) => {
        if (a.nearSoftMargin !== b.nearSoftMargin) {
          return a.nearSoftMargin ? 1 : -1; // 软边距之外的先释放
        }
        if (b.gap !== a.gap) return b.gap - a.gap; // 更远的先释放
        return b.e.seq - a.e.seq;
      });
      for (let i = 0; i < toRelease && i < candidates.length; i++) {
        const c = candidates[i];
        c.e.admitted = false;
        c.e.sink(null);
        admittedCount -= 1;
        stats.released += 1;
        stats.lastTickReleased += 1;
      }
    }
  }

  // 4. 放行：每帧 / 每秒 / 工作集三重上限取最小
  let allowance: number;
  if (!IMAGE_LOAD_GATE.rateLimitEnabled) {
    allowance = Number.POSITIVE_INFINITY;
  } else {
    allowance = Math.min(
      budget.perFrame,
      Math.max(0, budget.perSecond - admittedInSecond),
    );
  }
  if (IMAGE_LOAD_GATE.workingSetEnabled) {
    allowance = Math.min(
      allowance,
      Math.max(0, IMAGE_LOAD_GATE.maxConcurrent - admittedCount),
    );
  }
  allowance = Math.min(allowance, rankedPending.length);
  if (!Number.isFinite(allowance)) allowance = rankedPending.length;

  for (let i = 0; i < allowance; i++) {
    const e = rankedPending[i].e;
    e.admitted = true;
    e.sink(e.url);
    admittedInSecond += 1;
    stats.lastTickAdmitted += 1;
  }

  // 5. 继续 tick 的条件：
  //    - 还有「视口内」的图片在等放行；
  //    - 或者开着工作集释放、且已加载张数超上限（需要继续靠释放把工作集压下来）。
  //    注意：工作集关闭时绝不能带这个条件——否则 admittedCount 一超过 maxConcurrent，
  //    ticker 就永远不停，会在停顿期间把整块画板（上千张）全量预取，既是停顿时的解码
  //    高峰，也让「远图等滚动进入视口再加载」这条策略失效。
  const nextPending = rankedPending[allowance];
  if (
    (nextPending && nextPending.gap === 0) ||
    (IMAGE_LOAD_GATE.workingSetEnabled &&
      admittedCount > IMAGE_LOAD_GATE.maxConcurrent)
  ) {
    requestTick();
  }
}

export interface GatedImageHandle {
  admitted: boolean;
  dispose: () => void;
}

/** 注册一张受闸门管理的图片；放行/释放通过 sink 回传（null = 释放）。 */
export function registerGatedImage(
  url: string,
  getEl: () => HTMLElement | null,
  sink: (url: string | null) => void,
): GatedImageHandle {
  if (!IMAGE_LOAD_GATE.enabled) {
    sink(url);
    return { admitted: true, dispose: () => {} };
  }
  bindListeners();

  const entry: Entry = {
    id: nextSeq,
    seq: nextSeq,
    url,
    getEl,
    sink,
    admitted: false,
    col: null,
    colResolved: false,
  };
  nextSeq += 1;
  entries.set(entry.id, entry);
  rankedDirty = true;

  if (!IMAGE_LOAD_GATE.rateLimitEnabled && !IMAGE_LOAD_GATE.workingSetEnabled) {
    entry.admitted = true;
    sink(url);
  } else {
    requestTick();
  }

  return {
    admitted: entry.admitted,
    dispose: () => {
      entries.delete(entry.id);
      rankedDirty = true;
    },
  };
}

/** 受闸门管理的图片 URL；未放行时返回 null，让 img 先不挂 src。 */
export function useGatedImageUrl(
  url: string | null,
  elRef: { current: HTMLElement | null },
): string | null {
  const [gatedUrl, setGatedUrl] = useState<string | null>(() =>
    url && !IMAGE_LOAD_GATE.enabled ? url : null,
  );

  useEffect(() => {
    if (!url) {
      setGatedUrl(null);
      return;
    }
    const handle = registerGatedImage(url, () => elRef.current, setGatedUrl);
    return () => handle.dispose();
    // elRef 是稳定引用；url 变化才需要重新注册
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return gatedUrl;
}

/** 开发期钩子：查看状态与统计、单独开关某一维度，便于做 A/B 对照。 */
export function installGateDevHook() {
  if (typeof window === "undefined") return;
  const devEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  if (!devEnv?.DEV) return;
  const w = window as unknown as Record<string, unknown>;
  w.__imageLoadGate = {
    config: IMAGE_LOAD_GATE,
    state: () => ({
      enabled: IMAGE_LOAD_GATE.enabled,
      rateLimitEnabled: IMAGE_LOAD_GATE.rateLimitEnabled,
      workingSetEnabled: IMAGE_LOAD_GATE.workingSetEnabled,
    }),
    stats: () => ({
      pending: entries.size - countAdmitted(),
      admitted: countAdmitted(),
      registered: entries.size,
      released: stats.released,
      admittedInSecond,
      lastTickAt: Math.round(stats.lastTickAt),
      lastTickAdmitted: stats.lastTickAdmitted,
      lastTickReleased: stats.lastTickReleased,
      // 判定「正在滚动」的两个信号与结果，便于排查「时而生效时而无效」：
      scrollEventsSeen,
      motionDetected: motionDetectedCount,
      scrollAgeMs: Math.round(performance.now() - lastScrollAt),
      motionAgeMs: Math.round(performance.now() - lastMotionAt),
      scrolling: activityAge(performance.now()) < IMAGE_LOAD_GATE.scrollIdleMs,
    }),
    poke: () => {
      rankedDirty = true;
      requestTick();
    },
  };
}