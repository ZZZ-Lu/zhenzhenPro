/**
 * 阶段一：渲染隔离（P0）。
 *
 * 做什么：给 <html> 打上标记类，样式表里所有隔离规则都挂在该类下，让**离屏的列与卡片**
 * 借助 `content-visibility: auto` 跳过样式重算、布局与绘制，并用 `contain` 把失效范围
 * 限制在元素内部、用 `contain-intrinsic-size` 按接近真实的尺寸占位，避免滚动条与布局跳动。
 *
 * 独立开关：
 *  - RENDER_ISOLATION.enabled     总开关，false 时不挂任何标记类（等同回到基线）
 *  - RENDER_ISOLATION.columnEnabled 列容器隔离，可单独关闭
 *  - RENDER_ISOLATION.cardEnabled   卡片容器隔离，可单独关闭
 * 运行期也可用开发钩子 window.__renderIsolation 临时开关，便于做 A/B 对照。
 *
 * 尺寸安全：
 *  - 列容器：宽由列宽档位（w-[88vw] / md:w-[460px|650px|840px]）、高由 h-full 决定，
 *    都是确定尺寸，跳过时尺寸不变，因此占位值只影响“从未布局过”的那一帧。
 *  - 卡片容器：高度由内容决定，用 `auto <估算值>` 占位——首次真实布局后浏览器会记住实测
 *    高度，估算值只在首次出现时生效。
 *
 * 几何安全：被跳过的子树没有布局盒，直接读 getBoundingClientRect 会得到全 0 矩形。
 * 因此所有“可能落在被跳过容器内部”的几何读取都要走 rectOf / measureWithIsolationSafe：
 * 读取瞬间把相关容器临时恢复为 content-visibility: visible，强制一次同步布局，读完立即还原。
 */

export const RENDER_ISOLATION = {
  enabled: true,
  /** 列容器隔离开关（可单独关闭回退）。 */
  columnEnabled: true,
  /** 卡片容器隔离开关（可单独关闭回退）。 */
  cardEnabled: true,
  /**
   * 列容器兜底占位尺寸（两个轴都写，`auto` 关键字表示记住上次真实尺寸）。
   * 列本身是确定尺寸，这里只是“从未布局过”时的保守值。
   */
  columnIntrinsicSize: "auto 460px auto 900px",
  /**
   * 卡片容器兜底占位高度（只有高度轴，宽度由列宽决定）。
   * 这是“从未渲染过”的卡片在跳过期间的占位值；渲染过一次后由 `auto` 关键字记住
   * 实测高度。卡片组件会用 estimateCardHeight() 按列宽与图片比例算出更贴近真实的
   * 值写到 --zz-card-h，所以这个常量只是最终兜底。
   */
  cardIntrinsicHeight: "400px",
  /** 卡片头部 + 提示词区的固定高度（实测），用于估算占位高度。 */
  cardFixedHeightPx: 134,
  /** 列边框 + 卡片两侧内边距（实测），用于由列宽推算卡片宽度。 */
  cardHorizontalChromePx: 34,
} as const;

const COLUMN_CLASS = "zz-iso-col";
const CARD_CLASS = "zz-iso-card";
const COL_SIZE_VAR = "--zz-iso-col-size";
const CARD_SIZE_VAR = "--zz-iso-card-h";
/** 单张卡片自身的占位高度变量（由卡片组件按估算写入，覆盖全局兜底）。 */
export const CARD_HEIGHT_VAR = "--zz-card-h";

/** 隔离容器的统一标记属性；列与卡片各占一个取值。 */
export const ISO_TARGET_ATTR = "data-iso-target";
/** 列容器上的标记值。 */
export const ISO_TARGET_COLUMN = "column";
/** 卡片容器上的标记值。 */
export const ISO_TARGET_CARD = "card";

/** 启动隔离：返回撤销函数。幂等，重复调用只会重设类名与尺寸变量。 */
export function applyRenderIsolation(): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;

  const clear = () => {
    root.classList.remove(COLUMN_CLASS, CARD_CLASS);
    root.style.removeProperty(COL_SIZE_VAR);
    root.style.removeProperty(CARD_SIZE_VAR);
  };

  const sync = () => {
    clear();
    if (!RENDER_ISOLATION.enabled) return;
    root.style.setProperty(COL_SIZE_VAR, RENDER_ISOLATION.columnIntrinsicSize);
    root.style.setProperty(CARD_SIZE_VAR, RENDER_ISOLATION.cardIntrinsicHeight);
    if (RENDER_ISOLATION.columnEnabled) root.classList.add(COLUMN_CLASS);
    if (RENDER_ISOLATION.cardEnabled) root.classList.add(CARD_CLASS);
  };

  sync();

  const devEnv = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  if (devEnv?.DEV) {
    (window as unknown as Record<string, unknown>).__renderIsolation = {
      state: () => ({
        enabled: RENDER_ISOLATION.enabled,
        column: root.classList.contains(COLUMN_CLASS),
        card: root.classList.contains(CARD_CLASS),
      }),
      setColumn: (on: boolean) => {
        if (on) root.classList.add(COLUMN_CLASS);
        else root.classList.remove(COLUMN_CLASS);
      },
      setCard: (on: boolean) => {
        if (on) root.classList.add(CARD_CLASS);
        else root.classList.remove(CARD_CLASS);
      },
      reset: sync,
      clear,
    };
  }

  return clear;
}

/** 隔离是否处于生效状态（任一维度启用即需要几何安全读取）。 */
function isolationActive(): boolean {
  if (typeof document === "undefined") return false;
  const cl = document.documentElement.classList;
  return cl.contains(COLUMN_CLASS) || cl.contains(CARD_CLASS);
}

/** 收集 el 自身及其全部隔离祖先（列 / 卡片）。 */
function collectIsolationTargets(
  el: Element | null | undefined,
  into: Set<HTMLElement>,
): void {
  let node: Element | null = el ?? null;
  while (node) {
    if (node instanceof HTMLElement && node.hasAttribute(ISO_TARGET_ATTR)) {
      into.add(node);
    }
    node = node.parentElement;
  }
}

/**
 * 在“临时解除隔离”的前提下完成一段几何读取。
 *
 * 传入所有会被读取的元素；函数会把它们自身及其全部隔离祖先临时置为
 * content-visibility: visible，调用 read()（其中任何几何读取都会触发一次同步布局），
 * 随后立即还原。
 *
 * 同一段逻辑里的多次读取请合并到一次 read() 中，单位换算成本只付一次。
 */
export function measureWithIsolationSafe<T>(
  els: Array<Element | null | undefined>,
  read: () => T,
): T {
  if (!isolationActive()) return read();

  const targets = new Set<HTMLElement>();
  for (const el of els) collectIsolationTargets(el, targets);
  if (targets.size === 0) return read();

  const previous = new Map<HTMLElement, string>();
  targets.forEach((t) => {
    previous.set(t, t.style.contentVisibility);
    t.style.contentVisibility = "visible";
  });

  try {
    return read();
  } finally {
    targets.forEach((t) => {
      t.style.contentVisibility = previous.get(t) ?? "";
    });
  }
}

/** 读取单个元素的几何；自动规避内容隔离导致的“全 0 矩形”。 */
export function rectOf(el: Element | null | undefined): DOMRect | null {
  if (!el) return null;
  return measureWithIsolationSafe([el], () => el.getBoundingClientRect());
}

/**
 * 是否处于“值得为几何读取做恢复”的状态。
 * 关闭隔离时恒为 false，调用方可直接跳过额外分支。
 */
export function isIsolationActive(): boolean {
  return isolationActive();
}

/**
 * 估算一张卡片的高度占位（px），让“从未渲染过”的卡片也能按接近真实的高度占位，
 * 避免首次滚到某列时列内 scrollHeight 明显变化（滚动条跳动）。
 *
 * 依据：卡片宽度 = 列宽档位（窄 460 / 中 650 / 宽 840，小屏为 88vw）减去边框与内边距，
 * 图片区高度 = 卡片宽度 / 图片比例 × 行数，再加上头部与提示词区的实测固定高度。
 * 卡片一旦真实布局过，`auto` 关键字会用实测值覆盖这里的估算。
 */
export function estimateCardHeight(opts: {
  columnWidth?: "narrow" | "medium" | "wide";
  aspectRatio?: string;
  imageCount?: number;
  viewportWidth?: number;
}): number {
  const { columnWidth, aspectRatio, imageCount = 1 } = opts;
  const viewportWidth =
    opts.viewportWidth ??
    (typeof window !== "undefined" ? window.innerWidth : 1280);

  let columnWidthPx: number;
  if (viewportWidth < 768) columnWidthPx = viewportWidth * 0.88;
  else if (columnWidth === "wide") columnWidthPx = 840;
  else if (columnWidth === "medium") columnWidthPx = 650;
  else columnWidthPx = 460;

  const cardWidth = Math.max(
    120,
    columnWidthPx - RENDER_ISOLATION.cardHorizontalChromePx,
  );

  const parts = (aspectRatio ?? "1 / 1").split(/[\/\s]+/).filter(Boolean);
  const ratioW = parseFloat(parts[0]) || 1;
  const ratioH = parseFloat(parts[1]) || 1;
  const ratio = ratioW / ratioH || 1;

  const count = Math.max(1, imageCount);
  const cols = count > 1 ? 2 : 1;
  const rows = Math.ceil(count / cols);
  const imageWidth = (cardWidth - (cols - 1) * 2) / cols;
  const imageBlock = rows * (imageWidth / ratio) + (rows - 1) * 2;

  return Math.round(RENDER_ISOLATION.cardFixedHeightPx + imageBlock);
}

/** 卡片组件直接展开到 style 上的占位高度变量。 */
export function cardHeightStyle(heightPx: number): Record<string, string> {
  return { [CARD_HEIGHT_VAR]: `${heightPx}px` };
}