import React, { useState, useEffect, useRef, useCallback } from "react";

export interface ViewportState {
  scrollLeft: number;
  scrollTop: number;
  width: number;
  height: number;
  isScrolling: boolean;
  isInteracting: boolean;
}

export function useViewportCulling(containerRef: React.RefObject<HTMLElement | null>) {
  const [viewport, setViewport] = useState<ViewportState>({
    scrollLeft: 0,
    scrollTop: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    isScrolling: false,
    isInteracting: false,
  });

  const scrollTimeoutRef = useRef<any>(null);
  const idleTimerRef = useRef<any>(null);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    
    setViewport((prev) => ({
      ...prev,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      width: el.clientWidth,
      height: el.clientHeight,
      isScrolling: true,
      isInteracting: false, // Scrolling/panning mode -> persistent degradation of heavy CSS
    }));

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // After scroll stops for 150ms, switch from active scroll to idle check
    scrollTimeoutRef.current = setTimeout(() => {
      setViewport((prev) => ({ ...prev, isScrolling: false }));
    }, 150);

    // Absolute Idle Fallback (2000ms): fully restore heavy CSS effects
    idleTimerRef.current = setTimeout(() => {
      setViewport((prev) => ({ ...prev, isInteracting: true }));
    }, 2000);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll, { passive: true });
    
    const handleResize = () => {
      setViewport((prev) => ({
        ...prev,
        width: el.clientWidth,
        height: el.clientHeight,
      }));
    };
    window.addEventListener("resize", handleResize, { passive: true });

    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [containerRef, handleScroll]);

  // Instant Restoration on User Click / Interaction
  const triggerInstantRestoration = useCallback(() => {
    setViewport((prev) => ({ ...prev, isScrolling: false, isInteracting: true }));
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setViewport((prev) => ({ ...prev, isInteracting: true }));
    }, 2000);
  }, []);

  return { viewport, triggerInstantRestoration };
}

/**
 * X-axis column culling helper
 */
export function cullColumns<T extends { xOffset?: number; width?: number }>(
  columns: T[],
  scrollLeft: number,
  viewportWidth: number,
  bufferX: number = 800
): { visibleColumns: (T & { originalIndex: number })[]; culledCount: number } {
  const minX = scrollLeft - bufferX;
  const maxX = scrollLeft + viewportWidth + bufferX;

  let visibleCount = 0;
  const visibleColumns = columns.map((col, idx) => {
    const x = col.xOffset ?? (idx * 420); // default column spacing
    const w = col.width ?? 380;
    const isVisible = (x + w >= minX) && (x <= maxX);
    if (isVisible) visibleCount++;
    return { ...col, originalIndex: idx, _isVisible: isVisible };
  }).filter((col) => col._isVisible);

  return {
    visibleColumns,
    culledCount: columns.length - visibleCount,
  };
}

/**
 * Y-axis vertical card culling helper using binary search or range filtering
 */
export function cullCards<T extends { yOffset?: number; height?: number }>(
  cards: T[],
  scrollTop: number,
  viewportHeight: number,
  bufferY: number = 1000
): T[] {
  const minY = scrollTop - bufferY;
  const maxY = scrollTop + viewportHeight + bufferY;

  return cards.filter((card, idx) => {
    const y = card.yOffset ?? (idx * 250);
    const h = card.height ?? 300;
    return (y + h >= minY) && (y <= maxY);
  });
}
