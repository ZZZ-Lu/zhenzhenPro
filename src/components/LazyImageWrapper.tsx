import React, { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 直接渲染包装器（已移除全部自定义加载机制）。
//
// 现在只做一件事：给图片内容提供一个带背景色的容器，并把 children 直接渲染出来。
// 不再申请加载槽位、不做预载/保留边距、不做并发上限、不做离屏释放——所有图片都由
// 浏览器按普通页面的方式一次性加载与渲染。
// ---------------------------------------------------------------------------

/**
 * 保留原有导出：其它组件仍按原样引用于此。
 * 注意：这不是加载机制，只是一个滚动状态 hook。
 */
export function useIsScrolling(idleTimeoutMs = 150) {
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      setIsScrolling(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsScrolling(false);
      }, idleTimeoutMs);
    };

    window.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true });
      if (timer) clearTimeout(timer);
    };
  }, [idleTimeoutMs]);

  return isScrolling;
}

interface LazyImageWrapperProps {
  children: React.ReactNode;
  /**
   * Optional custom aspect ratio or min-height for placeholder during offscreen state
   */
  placeholderAspectRatio?: string;
  loadMarginPercent?: string;
  theme?: string;
}

export function LazyImageWrapper({
  children,
  placeholderAspectRatio,
  theme,
}: LazyImageWrapperProps) {
  const isLight =
    theme === "light" ||
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("light"));

  const bgClass = isLight ? "bg-slate-200/60" : "bg-slate-800/40";

  return (
    <div
      className={`w-full h-full relative ${bgClass}`}
      style={{
        minHeight: "120px",
        aspectRatio: placeholderAspectRatio || undefined,
      }}
    >
      <div className="relative w-full h-full">{children}</div>
    </div>
  );
}