import React, { useEffect, useRef, useState } from "react";

// Global hook to track whether ANY scroll container or window is actively scrolling
// Global hook for scroll tracking (kept for compatibility)
export function useIsScrolling(idleTimeoutMs = 150) {
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const handleScroll = () => {
      setIsScrolling(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setIsScrolling(false);
      }, idleTimeoutMs);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
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

type LazyCallback = () => void;
const lazyCallbacksMap = new WeakMap<Element, LazyCallback>();
const lazyObserversByRoot = new Map<
  Element | Document | null,
  IntersectionObserver
>();

function getSharedLazyObserver(
  root: Element | Document | null,
): IntersectionObserver {
  let obs = lazyObserversByRoot.get(root);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries, observer) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.isIntersecting) {
            const cb = lazyCallbacksMap.get(entry.target);
            if (cb) {
              lazyCallbacksMap.delete(entry.target);
              observer.unobserve(entry.target);
              cb();
            }
          }
        }
      },
      {
        root,
        rootMargin: "600px 800px 600px 800px",
      },
    );
    lazyObserversByRoot.set(root, obs);
  }
  return obs;
}

export function LazyImageWrapper({
  children,
  placeholderAspectRatio,
  theme,
}: LazyImageWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Shared IntersectionObserver to check if element is in/near viewport
  useEffect(() => {
    if (hasLoaded) return;
    if (typeof window === "undefined" || !window.IntersectionObserver) {
      setHasLoaded(true);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const scrollRoot =
      el.closest("#tracks-scroll-viewport") ||
      document.getElementById("tracks-scroll-viewport") ||
      null;

    const observer = getSharedLazyObserver(scrollRoot);
    lazyCallbacksMap.set(el, () => {
      setHasLoaded(true);
    });
    observer.observe(el);

    return () => {
      lazyCallbacksMap.delete(el);
      observer.unobserve(el);
    };
  }, [hasLoaded]);

  const isLight =
    theme === "light" ||
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("light"));

  const bgClass = isLight ? "bg-slate-200/60" : "bg-slate-800/40";

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${bgClass}`}
      style={{
        minHeight: "120px",
        aspectRatio: placeholderAspectRatio || undefined,
      }}
    >
      {hasLoaded ? (
        children
      ) : (
        <div
          className={`w-full h-full ${bgClass} flex items-center justify-center transition-colors duration-200`}
          style={{ aspectRatio: placeholderAspectRatio || undefined }}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${isLight ? "bg-slate-400/40" : "bg-slate-700/40"}`} />
        </div>
      )}
    </div>
  );
}




