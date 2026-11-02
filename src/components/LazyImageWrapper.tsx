import React, { useEffect, useRef, useState } from "react";
import {
  requestImageLoadSlot,
  cancelImageLoadSlot,
} from "../utils/imageLoadScheduler";

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

// ---------------------------------------------------------------------------
// Shared "scrolling has settled" notifier.
//
// A single global passive listener drives every instance, so we never pay for
// one scroll listener per image. Far-offscreen images are released only after
// scrolling settles, so fast scrolling never pays for unmount/remount churn.
// ---------------------------------------------------------------------------
let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;
let isScrollIdle = true;
const scrollIdleSubscribers = new Set<() => void>();

function notifyScrollActivity() {
  isScrollIdle = false;
  if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
  scrollIdleTimer = setTimeout(() => {
    scrollIdleTimer = null;
    isScrollIdle = true;
    scrollIdleSubscribers.forEach((cb) => cb());
  }, 160);
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", notifyScrollActivity, {
    capture: true,
    passive: true,
  });
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

type LazyHandle = {
  loadRoot: Element | Document | null;
  unloadRoot: Element | Document | null;
  onEnter: () => void;
  onLeave: () => void;
};
const lazyHandles = new WeakMap<Element, LazyHandle>();

// Load as soon as the image comes near the viewport; release it again only once
// it is much further away. The wide hysteresis keeps the loader and the unloader
// from fighting each other around a single threshold.
const LOAD_ROOT_MARGIN = "600px 800px 600px 800px";
const UNLOAD_ROOT_MARGIN = "1200px 1600px 1200px 1600px";

const loadObserversByRoot = new Map<
  Element | Document | null,
  IntersectionObserver
>();
const unloadObserversByRoot = new Map<
  Element | Document | null,
  IntersectionObserver
>();

function getLoadObserver(
  root: Element | Document | null,
): IntersectionObserver {
  let obs = loadObserversByRoot.get(root);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries, observer) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry.isIntersecting) continue;
          const handle = lazyHandles.get(entry.target);
          // Stop watching for "entering" and start watching for "leaving".
          observer.unobserve(entry.target);
          if (handle) {
            getUnloadObserver(handle.unloadRoot).observe(entry.target);
            handle.onEnter();
          }
        }
      },
      {
        root,
        rootMargin: LOAD_ROOT_MARGIN,
      },
    );
    loadObserversByRoot.set(root, obs);
  }
  return obs;
}

function getUnloadObserver(
  root: Element | Document | null,
): IntersectionObserver {
  let obs = unloadObserversByRoot.get(root);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries, observer) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.isIntersecting) continue;
          const handle = lazyHandles.get(entry.target);
          observer.unobserve(entry.target);
          if (handle) {
            // Re-arm the load observer so the image can come back later.
            getLoadObserver(handle.loadRoot).observe(entry.target);
            handle.onLeave();
          }
        }
      },
      {
        root,
        rootMargin: UNLOAD_ROOT_MARGIN,
      },
    );
    unloadObserversByRoot.set(root, obs);
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
  const loadedRef = useRef(false);
  const pendingUnloadRef = useRef(false);

  // Apply the deferred release once scrolling has settled.
  useEffect(() => {
    const handleScrollIdle = () => {
      if (pendingUnloadRef.current) {
        pendingUnloadRef.current = false;
        loadedRef.current = false;
        setHasLoaded(false);
      }
    };
    scrollIdleSubscribers.add(handleScrollIdle);
    return () => {
      scrollIdleSubscribers.delete(handleScrollIdle);
    };
  }, []);

  // Load on approach (shared IntersectionObserver), release when far away again.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof window === "undefined" || !window.IntersectionObserver) {
      loadedRef.current = true;
      setHasLoaded(true);
      return;
    }

    let disposed = false;

    // Horizontal proximity is measured against the whole board viewport...
    const boardRoot =
      el.closest("#tracks-scroll-viewport") ||
      document.getElementById("tracks-scroll-viewport") ||
      null;
    // ...while vertical proximity must be measured against this column's own
    // scroller, because that is the box that actually clips the image.
    const columnRoot =
      el.closest('[id^="track-scroll-container-"]') || boardRoot;

    const loadObs = getLoadObserver(boardRoot);
    const unloadObs = getUnloadObserver(columnRoot);

    lazyHandles.set(el, {
      loadRoot: boardRoot,
      unloadRoot: columnRoot,
      onEnter: () => {
        pendingUnloadRef.current = false;
        // Do NOT mount the <img> immediately: ask the global governor for a
        // slot. It caps how many images start fetching/decoding per frame and
        // per second, and shrinks that budget while the user scrolls fast, so
        // the board keeps its frame rate at the cost of a short wait for the
        // picture ("trade time for frames"). The request is only ever delayed,
        // never dropped, and is drained nearest-to-viewport first once the
        // scrolling settles.
        requestImageLoadSlot(el, () => {
          if (disposed) return;
          loadedRef.current = true;
          setHasLoaded(true);
        });
      },
      onLeave: () => {
        // Scrolled (or flung) past before it ever got a slot -> forget it.
        cancelImageLoadSlot(el);
        if (!loadedRef.current) return;
        if (isScrollIdle) {
          loadedRef.current = false;
          setHasLoaded(false);
        } else {
          // Defer the unmount until the user stops scrolling.
          pendingUnloadRef.current = true;
        }
      },
    });

    loadObs.observe(el);

    return () => {
      disposed = true;
      cancelImageLoadSlot(el);
      lazyHandles.delete(el);
      loadObs.unobserve(el);
      unloadObs.unobserve(el);
      pendingUnloadRef.current = false;
    };
  }, []);

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
      {/* The placeholder stays mounted underneath instead of being swapped
          out: while the governor is still holding this image's slot there is
          no blank hole, and when the slot arrives the reveal cross-fades
          rather than popping in. */}
      <div
        className={`absolute inset-0 ${bgClass} flex items-center justify-center pointer-events-none transition-opacity duration-300 ease-out motion-reduce:transition-none`}
        style={{
          aspectRatio: placeholderAspectRatio || undefined,
          opacity: hasLoaded ? 0 : 1,
        }}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${isLight ? "bg-slate-400/40" : "bg-slate-700/40"}`} />
      </div>
      {hasLoaded ? (
        <div className="relative w-full h-full">{children}</div>
      ) : null}
    </div>
  );
}