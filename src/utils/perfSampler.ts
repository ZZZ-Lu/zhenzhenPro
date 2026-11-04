/**
 * 开发期帧率采样器（仅 DEV 生效，生产构建会被摇树移除）。
 *
 * 存在的理由：页面本身很重时，自动化探针（page.evaluate / CDP 观测）会因为主线程
 * 饱和而超时，拿不到帧率。这个采样器把帧率等指标周期性写进 console，而 console 会
 * 被浏览器通道落盘到日志文件——因此即使页面响应不过来，也能从日志里读出真实帧数。
 *
 * 同时把最新样本挂到 window.__perfSampler 上，页面可响应时可直接读取。
 *
 * 采样口径：
 *  - fps：本窗口内 requestAnimationFrame 回调次数 / 窗口时长（与页面左下角 FPS 面板同源）
 *  - longtasks：本窗口内 >50ms 的长任务数量与总耗时（用于区分“环境不要求出帧”与“主线程饱和”）
 *  - vis/hidden：页面可见性（用于判断是否被降频）
 */

export interface PerfSample {
  seq: number;
  windowMs: number;
  frames: number;
  fps: number;
  longTasks: number;
  longTaskMs: number;
  nodes: number;
  imgs: number;
  visibility: string;
  hidden: boolean;
  at: string;
  /** 页面左下角帧数面板当前显示的数值（读不到时为 null）。 */
  panelFps: number | null;
}

/** 读取页面左下角帧数面板显示的 FPS 数值。 */
function readPanelFps(): number | null {
  try {
    const spans = document.querySelectorAll("span");
    for (let i = 0; i < spans.length; i++) {
      const el = spans[i];
      if ((el.textContent || "").trim() !== "FPS") continue;
      const next = el.nextElementSibling;
      const raw = next ? (next.textContent || "").trim() : "";
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) ? value : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

const devEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;

export function startPerfSampler(intervalMs = 2000): () => void {
  if (typeof window === "undefined" || !devEnv?.DEV) return () => {};

  let frames = 0;
  let longTasks = 0;
  let longTaskMs = 0;
  let seq = 0;
  let windowStart = performance.now();
  let rafId = 0;

  const tick = () => {
    frames++;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks++;
        longTaskMs += Math.round(entry.duration);
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // 不支持 Long Tasks API 时只统计帧率
  }

  let latest: PerfSample | null = null;
  (window as unknown as Record<string, unknown>).__perfSampler = {
    latest: () => latest,
  };

  const flush = () => {
    const now = performance.now();
    const elapsed = now - windowStart;
    seq++;
    latest = {
      seq,
      windowMs: Math.round(elapsed),
      frames,
      fps: +(frames / (elapsed / 1000)).toFixed(1),
      longTasks,
      longTaskMs,
      nodes: document.getElementsByTagName("*").length,
      imgs: document.querySelectorAll("img").length,
      visibility: document.visibilityState,
      hidden: document.hidden,
      at: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      panelFps: readPanelFps(),
    };
    console.log(
      `[perf] #${latest.seq} fps=${latest.fps} frames=${latest.frames}/${latest.windowMs}ms ` +
        `longtasks=${latest.longTasks}(${latest.longTaskMs}ms) nodes=${latest.nodes} imgs=${latest.imgs} ` +
        `vis=${latest.visibility} hidden=${latest.hidden} panel=${latest.panelFps} @${latest.at}`,
    );
    // 把样本 POST 到本机监听端口：这样即使页面重到自动化通道附着不上，
    // 也能从监听端落盘的文件里读到真实帧率（不依赖 console 捕获）。
    try {
      fetch("http://127.0.0.1:8899/perf", {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(latest),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* 监听端不在时忽略 */
    }
    frames = 0;
    longTasks = 0;
    longTaskMs = 0;
    windowStart = now;
  };

  const timer = setInterval(flush, intervalMs);

  return () => {
    clearInterval(timer);
    cancelAnimationFrame(rafId);
    if (observer) observer.disconnect();
  };
}