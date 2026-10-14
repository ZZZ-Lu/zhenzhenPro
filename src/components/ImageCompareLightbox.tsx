import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { motion } from "motion/react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  GitCompare,
  Download,
  Copy,
  Check,
  Star,
  Sparkles,
} from "lucide-react";

import { SmartImage } from "./SmartImage";

interface CompareItem {
  url: string | Blob;
  prompt: string;
  gen: any;
  trackId: string;
  imgIndex?: number;
}

interface ImageCompareLightboxProps {
  imageA: CompareItem;
  imageB: CompareItem;
  onClose: () => void;
  onDownload?: (
    url: string | Blob,
    prompt: string,
    trackId: string,
    genId?: string,
  ) => void;
  onCopy?: (text: string, identifier: string) => void;
  copiedText?: string | null;
  onCopyConfig?: (gen: any) => void;
  onToggleStar?: (trackId: string, genId: string) => void;
  theme?: "light" | "dark";
}

const findSourceThumbnail = (
  url: string | Blob,
  trackId?: string,
  genId?: string,
  imgIndex?: number,
): HTMLImageElement | null => {
  const thumbs = document.querySelectorAll<HTMLImageElement>(".lightbox-thumb");
  
  let exactMatch: HTMLImageElement | null = null;
  let trackGenMatch: HTMLImageElement | null = null;
  let urlMatchVisible: HTMLImageElement | null = null;
  let urlMatchAny: HTMLImageElement | null = null;
  
  for (let i = 0; i < thumbs.length; i++) {
    const thumb = thumbs[i];
    
    // 排除全景视图中的缩略图
    if (thumb.closest('[data-map-thumb="true"]')) continue;

    const tTrackId = thumb.getAttribute("data-track-id");
    const tGenId = thumb.getAttribute("data-gen-id");
    const tImgIndex = thumb.getAttribute("data-img-index");

    // Match 1: Structural Match (100% reliable even for Blobs)
    if (
      trackId &&
      genId &&
      imgIndex !== undefined &&
      tTrackId === trackId &&
      tGenId === genId &&
      tImgIndex === String(imgIndex)
    ) {
      exactMatch = thumb;
      break; // Found the absolute best match, can stop looking
    }

    // Match 2: Track + Gen matching (but maybe imgIndex is missing or different)
    if (
      !trackGenMatch &&
      trackId &&
      genId &&
      tTrackId === trackId &&
      tGenId === genId
    ) {
      const thumbSrc = thumb.getAttribute("data-lightbox-src");
      if (
        thumbSrc === url ||
        (url instanceof Blob && thumbSrc === "[object Blob]") ||
        thumb.src === url
      ) {
        trackGenMatch = thumb;
      }
    }

    // Match 3: URL/Blob Fallback
    const thumbSrc = thumb.getAttribute("data-lightbox-src");
    if (
      thumbSrc === url ||
      (url instanceof Blob && thumbSrc === "[object Blob]") ||
      thumb.src === url
    ) {
      const isTrackMatch = !trackId || !tTrackId || tTrackId === trackId;
      if (isTrackMatch) {
        const rect = thumb.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && 
                          rect.right > 0 && rect.left < window.innerWidth &&
                          rect.bottom > 0 && rect.top < window.innerHeight;
        
        if (isVisible && !urlMatchVisible) urlMatchVisible = thumb;
        if (!urlMatchAny) urlMatchAny = thumb;
      }
    }
  }

  if (exactMatch) return exactMatch;
  if (trackGenMatch) return trackGenMatch;
  if (urlMatchVisible) return urlMatchVisible;
  if (urlMatchAny) return urlMatchAny;

  // If no exact match was found, try to find strictly by track + gen if available
  if (trackId && genId) {
    for (let i = 0; i < thumbs.length; i++) {
      const thumb = thumbs[i];
      if (thumb.closest('[data-map-thumb="true"]')) continue;
      if (
        thumb.getAttribute("data-track-id") === trackId &&
        thumb.getAttribute("data-gen-id") === genId
      ) {
        return thumb;
      }
    }
  }

  return null;
};

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const getVisibleIntersectionRect = (el: HTMLElement): Rect => {
  const rect = el.getBoundingClientRect();
  let current: HTMLElement | null = el.parentElement;

  let left = rect.left;
  let top = rect.top;
  let right = rect.right;
  let bottom = rect.bottom;

  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowX = style.overflowX;
    const overflowY = style.overflowY;
    const isClippedX = overflowX === "hidden" || overflowX === "scroll" || overflowX === "auto" || overflowX === "clip";
    const isClippedY = overflowY === "hidden" || overflowY === "scroll" || overflowY === "auto" || overflowY === "clip";

    if (isClippedX || isClippedY) {
      const pRect = current.getBoundingClientRect();
      if (isClippedX) {
        left = Math.max(left, pRect.left);
        right = Math.min(right, pRect.right);
      }
      if (isClippedY) {
        top = Math.max(top, pRect.top);
        bottom = Math.min(bottom, pRect.bottom);
      }
    }
    current = current.parentElement;
  }

  // Account for the track-scroll-container's sticky header if present
  const scrollContainer = el.closest('[id^="track-scroll-container-"]');
  if (scrollContainer) {
    const stickyHeader = scrollContainer.querySelector('.sticky.top-0');
    if (stickyHeader) {
      const headerRect = stickyHeader.getBoundingClientRect();
      top = Math.max(top, headerRect.bottom);
    }
  }

  if (right < left) right = left;
  if (bottom < top) bottom = top;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

function InteractiveImageView({
  item,
  onDownload,
  onCopy,
  onCopyConfig,
  onToggleStar,
  onClose,
  label,
  isClosing,
  onAnimationFinished,
  theme = "dark",
  placement = "center",
}: {
  item: CompareItem;
  onDownload?: (
    url: string | Blob,
    prompt: string,
    trackId: string,
    genId?: string,
  ) => void;
  onCopy?: (text: string, identifier: string) => void;
  onCopyConfig?: (gen: any) => void;
  onToggleStar?: (trackId: string, genId: string) => void;
  onClose: () => void;
  label?: string;
  isClosing?: boolean;
  onAnimationFinished?: () => void;
  theme?: "light" | "dark";
  placement?: "left" | "right" | "top" | "bottom" | "center";
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [localCopied, setLocalCopied] = useState<"prompt" | "config" | null>(
    null,
  );
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  const mouseDownStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const animTriggeredRef = useRef(false);
  const hiddenSourceRef = useRef<HTMLImageElement | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const triggerEntranceAnimation = () => {
    if (animTriggeredRef.current) return;
    animTriggeredRef.current = true;
    setIsImageLoaded(true);

    const imageEl = imageRef.current;
    if (!imageEl) return;

    const sourceEl = findSourceThumbnail(item.url, item.trackId, item.gen?.id, item.imgIndex);

    if (sourceEl) {
      const firstRect = sourceEl.getBoundingClientRect();
      const lastRect = imageEl.getBoundingClientRect();

      if (lastRect.width > 0 && lastRect.height > 0) {
        if (hiddenSourceRef.current && hiddenSourceRef.current !== sourceEl) {
          hiddenSourceRef.current.style.opacity = "";
        }
        hiddenSourceRef.current = sourceEl;
        sourceEl.style.opacity = "0";

        const deltaX =
          firstRect.left +
          firstRect.width / 2 -
          (lastRect.left + lastRect.width / 2);
        const deltaY =
          firstRect.top +
          firstRect.height / 2 -
          (lastRect.top + lastRect.height / 2);
        const scaleX = firstRect.width / lastRect.width;
        const scaleY = firstRect.height / lastRect.height;

        let insetTop = 0;
        let insetRight = 0;
        let insetBottom = 0;
        let insetLeft = 0;

        if (sourceEl) {
          const imgRect = firstRect;
          const visibleRect = getVisibleIntersectionRect(sourceEl);
          if (imgRect.width > 0 && imgRect.height > 0) {
            insetTop = Math.max(0, Math.min(100, ((visibleRect.top - imgRect.top) / imgRect.height) * 100));
            insetRight = Math.max(0, Math.min(100, ((imgRect.right - visibleRect.right) / imgRect.width) * 100));
            insetBottom = Math.max(0, Math.min(100, ((imgRect.bottom - visibleRect.bottom) / imgRect.height) * 100));
            insetLeft = Math.max(0, Math.min(100, ((visibleRect.left - imgRect.left) / imgRect.width) * 100));
          }
        }

        imageEl.animate(
          [
            {
              transform: `translate3d(${deltaX}px, ${deltaY}px, 0px) scale(${scaleX}, ${scaleY})`,
              clipPath: `inset(${insetTop}% ${insetRight}% ${insetBottom}% ${insetLeft}%)`,
              opacity: 0.85,
            },
            {
              transform: "translate3d(0px, 0px, 0px) scale(1, 1)",
              clipPath: "inset(0% 0% 0% 0%)",
              opacity: 1,
            },
          ],
          {
            duration: 380,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
      } else {
        imageEl.animate(
          [
            { transform: "scale(0.95)", opacity: 0 },
            { transform: "scale(1)", opacity: 1 },
          ],
          {
            duration: 300,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
      }
    } else {
      imageEl.animate(
        [
          { transform: "scale(0.95)", opacity: 0 },
          { transform: "scale(1)", opacity: 1 },
        ],
        {
          duration: 300,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        },
      );
    }
  };

  useLayoutEffect(() => {
    return () => {
      if (hiddenSourceRef.current) {
        hiddenSourceRef.current.style.opacity = "";
        hiddenSourceRef.current = null;
      }
    };
  }, [item.url]);

  useEffect(() => {
    animTriggeredRef.current = false;
    setIsImageLoaded(false);
    const imageEl = imageRef.current;
    if (imageEl && imageEl.complete) {
      setTimeout(triggerEntranceAnimation, 10);
    }
  }, [item.url]);

  const handleImageLoad = () => {
    setTimeout(triggerEntranceAnimation, 10);
  };

  useEffect(() => {
    if (isClosing) {
      const imageEl = imageRef.current;
      if (!imageEl) {
        onAnimationFinished?.();
        return;
      }

      const sourceEl = findSourceThumbnail(item.url, item.trackId, item.gen?.id, item.imgIndex);
      const lastRect = imageEl.getBoundingClientRect();

      if (imageEl.parentElement) {
        imageEl.parentElement.style.transform = "none";
        imageEl.parentElement.style.transition = "none";
      }

      const baseRect = imageEl.getBoundingClientRect();

      const triggerFinish = () => {
        if (hiddenSourceRef.current) {
          hiddenSourceRef.current.style.opacity = "";
          hiddenSourceRef.current = null;
        }
        if (imageEl) {
          imageEl.style.opacity = "0";
          imageEl.style.display = "none";
        }
        onAnimationFinished?.();
      };

      if (
        sourceEl &&
        lastRect.width > 0 &&
        lastRect.height > 0 &&
        baseRect.width > 0 &&
        baseRect.height > 0
      ) {
        const firstRect = sourceEl.getBoundingClientRect();

        const deltaX_start =
          lastRect.left +
          lastRect.width / 2 -
          (baseRect.left + baseRect.width / 2);
        const deltaY_start =
          lastRect.top +
          lastRect.height / 2 -
          (baseRect.top + baseRect.height / 2);
        const scaleX_start = lastRect.width / baseRect.width;
        const scaleY_start = lastRect.height / baseRect.height;

        const deltaX_end =
          firstRect.left +
          firstRect.width / 2 -
          (baseRect.left + baseRect.width / 2);
        const deltaY_end =
          firstRect.top +
          firstRect.height / 2 -
          (baseRect.top + baseRect.height / 2);
        const scaleX_end = firstRect.width / baseRect.width;
        const scaleY_end = firstRect.height / baseRect.height;

        let insetTop = 0;
        let insetRight = 0;
        let insetBottom = 0;
        let insetLeft = 0;

        if (sourceEl) {
          const imgRect = firstRect;
          const visibleRect = getVisibleIntersectionRect(sourceEl);
          if (imgRect.width > 0 && imgRect.height > 0) {
            insetTop = Math.max(0, Math.min(100, ((visibleRect.top - imgRect.top) / imgRect.height) * 100));
            insetRight = Math.max(0, Math.min(100, ((imgRect.right - visibleRect.right) / imgRect.width) * 100));
            insetBottom = Math.max(0, Math.min(100, ((imgRect.bottom - visibleRect.bottom) / imgRect.height) * 100));
            insetLeft = Math.max(0, Math.min(100, ((visibleRect.left - imgRect.left) / imgRect.width) * 100));
          }
        }

        const imgAnim = imageEl.animate(
          [
            {
              transform: `translate3d(${deltaX_start}px, ${deltaY_start}px, 0px) scale(${scaleX_start}, ${scaleY_start})`,
              clipPath: "inset(0% 0% 0% 0%)",
              opacity: 1,
            },
            {
              transform: `translate3d(${deltaX_end}px, ${deltaY_end}px, 0px) scale(${scaleX_end}, ${scaleY_end})`,
              clipPath: `inset(${insetTop}% ${insetRight}% ${insetBottom}% ${insetLeft}%)`,
              opacity: 1,
            },
          ],
          {
            duration: 320,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "forwards",
          },
        );

        imgAnim.onfinish = triggerFinish;
      } else {
        const deltaX_start =
          lastRect.width > 0 && baseRect.width > 0
            ? lastRect.left +
              lastRect.width / 2 -
              (baseRect.left + baseRect.width / 2)
            : 0;
        const deltaY_start =
          lastRect.height > 0 && baseRect.height > 0
            ? lastRect.top +
              lastRect.height / 2 -
              (baseRect.top + baseRect.height / 2)
            : 0;
        const scaleX_start =
          lastRect.width > 0 && baseRect.width > 0
            ? lastRect.width / baseRect.width
            : 1;
        const scaleY_start =
          lastRect.height > 0 && baseRect.height > 0
            ? lastRect.height / baseRect.height
            : 1;

        const imgAnim = imageEl.animate(
          [
            {
              transform: `translate3d(${deltaX_start}px, ${deltaY_start}px, 0px) scale(${scaleX_start}, ${scaleY_start})`,
              opacity: 1,
            },
            {
              transform: `translate3d(${deltaX_start}px, ${deltaY_start + 15}px, 0px) scale(${scaleX_start * 0.9}, ${scaleY_start * 0.9})`,
              opacity: 0,
            },
          ],
          {
            duration: 250,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "forwards",
          },
        );

        imgAnim.onfinish = triggerFinish;
      }
    }
  }, [isClosing]);

  // Prevent default scroll actions on container to lock scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preventDefaultWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    container.addEventListener("wheel", preventDefaultWheel, {
      passive: false,
    });
    return () => {
      container.removeEventListener("wheel", preventDefaultWheel);
    };
  }, []);

  const handleWheelZoom = (e: React.WheelEvent) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const mx = e.clientX;
    const my = e.clientY;

    const zoomIntensity = 0.13;
    const factor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

    setTransform((prev) => {
      const nextScale = Math.min(Math.max(0.4, prev.scale * factor), 16);
      const ratio = nextScale / prev.scale;

      const rx = mx - cx;
      const ry = my - cy;

      return {
        scale: nextScale,
        x: rx - (rx - prev.x) * ratio,
        y: ry - (ry - prev.y) * ratio,
      };
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    mouseDownStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTransform((prev) => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      setDragStart({
        x: touch.clientX - transform.x,
        y: touch.clientY - transform.y,
      });
      mouseDownStart.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setTransform((prev) => ({
        ...prev,
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      }));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setTransform((prev) => {
      const next = Math.min(prev.scale + 0.25, 16);
      const ratio = next / prev.scale;
      return {
        scale: next,
        x: prev.x * ratio,
        y: prev.y * ratio,
      };
    });
  };

  const handleZoomOut = () => {
    setTransform((prev) => {
      const next = Math.max(prev.scale - 0.25, 0.4);
      const ratio = next / prev.scale;
      return {
        scale: next,
        x: prev.x * ratio,
        y: prev.y * ratio,
      };
    });
  };

  const handleReset = () => {
    setTransform({ scale: 1, x: 0, y: 0 });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dx = e.clientX - mouseDownStart.current.x;
    const dy = e.clientY - mouseDownStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If moved less than 6 pixels, treat it as a static click and close the lightbox
    if (distance < 6) {
      onClose();
    }
  };

  const isStarred = item.gen?.isStarred;

  return (
    <div className="relative flex-1 min-h-0 min-w-0 flex flex-col group/view">
      {/* Upper floating actions rail specifically for this image, faint until hover */}
      {!isClosing && (
        <div
          className="absolute top-4 left-4 flex flex-col items-start gap-2 pointer-events-none z-10 opacity-60 group-hover/view:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`flex items-center gap-2 backdrop-blur-md border px-3 py-1.5 rounded-full text-xs font-medium shadow-md ${
              theme === "light"
                ? "bg-white/65 border-zinc-200/60 text-zinc-600"
                : "bg-neutral-900/65 border-neutral-800/60 text-neutral-400"
            }`}
          >
            {label && (
              <span
                className={`font-bold mr-1 ${theme === "light" ? "text-zinc-800" : "text-neutral-300"}`}
              >
                {label}
              </span>
            )}
            <span className="font-mono text-indigo-400 font-bold">
              {Math.round(transform.scale * 100)}%
            </span>
          </div>

          <div
            className={`flex items-center gap-1 backdrop-blur-md border p-1 rounded-full shadow-md pointer-events-auto ${
              theme === "light"
                ? "bg-white/65 border-zinc-200/60"
                : "bg-neutral-900/65 border-neutral-800/60"
            }`}
          >
            <button
              onClick={handleZoomIn}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                theme === "light"
                  ? "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"
                  : "hover:bg-neutral-800 text-neutral-300 hover:text-white"
              }`}
              title="放大 (Zoom In)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                theme === "light"
                  ? "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"
                  : "hover:bg-neutral-800 text-neutral-300 hover:text-white"
              }`}
              title="缩小 (Zoom Out)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleReset}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                theme === "light"
                  ? "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900"
                  : "hover:bg-neutral-800 text-neutral-300 hover:text-white"
              }`}
              title="重置视图"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={`w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing relative ${isClosing ? "overflow-visible" : "overflow-hidden"}`}
        onWheel={handleWheelZoom}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleCanvasClick}
      >
        <div
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0px) scale(${transform.scale})`,
            transformOrigin: "center center",
            transition: isDragging
              ? "none"
              : "transform 0.07s ease-out",
          }}
          className={`w-full h-full flex select-none pointer-events-none p-12 ${
            placement === "left"
              ? "justify-end items-center pr-2"
              : placement === "right"
                ? "justify-start items-center pl-2"
                : placement === "top"
                  ? "justify-center items-end pb-2"
                  : placement === "bottom"
                    ? "justify-center items-start pt-2"
                    : "items-center justify-center"
          }`}
        >
          <SmartImage
            ref={imageRef}
            src={item.url}
            referrerPolicy="no-referrer"
            decoding="async"
            style={{ opacity: isImageLoaded ? 1 : 0 }}
            className="max-w-full max-h-full object-contain pointer-events-none"
            onLoad={handleImageLoad}
          />
        </div>
      </div>

      {/* Elegant Centered Bottom Buttons exactly matching ImageLightbox */}
      {!isClosing && (
        <div
          className={`absolute bottom-8 inset-x-0 flex flex-wrap items-center gap-1 sm:gap-2 z-30 pointer-events-auto w-full ${
            placement === "left"
              ? "justify-end pr-8 sm:pr-12 md:pr-16 lg:pr-[12%] pl-2"
              : placement === "right"
                ? "justify-start pl-8 sm:pl-12 md:pl-16 lg:pl-[12%] pr-2"
                : "justify-center px-2"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {onToggleStar && (
            <button
              onClick={() => onToggleStar(item.trackId, item.gen?.id)}
              className={`text-xs font-bold flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border ${
                isStarred
                  ? theme === "light"
                    ? "bg-yellow-50/90 backdrop-blur-md hover:bg-yellow-100/90 text-yellow-600 border-yellow-400/60"
                    : "bg-yellow-500/20 backdrop-blur-md hover:bg-yellow-500/30 text-yellow-400 border-yellow-500/40"
                  : theme === "light"
                    ? "bg-white/80 backdrop-blur-md hover:bg-white text-zinc-600 hover:text-zinc-900 border-zinc-200/80"
                    : "bg-neutral-900/80 backdrop-blur-md hover:bg-neutral-800 text-neutral-300 hover:text-white border-neutral-800/80"
              }`}
              title={isStarred ? "取消备选" : "设为备选"}
            >
              <Star
                className={`w-3.5 h-3.5 ${isStarred ? "fill-yellow-500 text-yellow-500 animate-pulse" : "text-current opacity-70"}`}
              />
              <span>{isStarred ? "取消备选" : "设为备选"}</span>
            </button>
          )}

          {onDownload && (
            <button
              onClick={() =>
                onDownload(item.url, item.prompt, item.trackId, item.gen?.id)
              }
              className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border shrink-0 ${
                theme === "light"
                  ? "bg-white/80 backdrop-blur-md hover:bg-white text-zinc-600 hover:text-indigo-600 border-zinc-200/80"
                  : "bg-neutral-900/80 backdrop-blur-md hover:bg-neutral-800 text-neutral-300 hover:text-indigo-400 border-neutral-800/80"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>下载图片</span>
            </button>
          )}

          {onCopy && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(item.prompt);
                setLocalCopied("prompt");
                setTimeout(() => setLocalCopied(null), 2000);
              }}
              className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border shrink-0 ${
                theme === "light"
                  ? "bg-white/80 backdrop-blur-md hover:bg-white text-zinc-600 hover:text-emerald-600 border-zinc-200/80"
                  : "bg-neutral-900/80 backdrop-blur-md hover:bg-neutral-800 text-neutral-300 hover:text-emerald-400 border-neutral-800/80"
              }`}
            >
              {localCopied === "prompt" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {localCopied === "prompt" ? "已复制提示词" : "复制提示词"}
              </span>
            </button>
          )}

          {onCopyConfig && (
            <button
              onClick={() => {
                onCopyConfig(item.gen);
                setLocalCopied("config");
                setTimeout(() => setLocalCopied(null), 2000);
              }}
              className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border shrink-0 ${
                theme === "light"
                  ? "bg-white/80 backdrop-blur-md hover:bg-white text-zinc-600 hover:text-indigo-600 border-zinc-200/80"
                  : "bg-neutral-900/80 backdrop-blur-md hover:bg-neutral-800 text-neutral-300 hover:text-indigo-400 border-neutral-800/80"
              }`}
            >
              {localCopied === "config" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>
                {localCopied === "config" ? "配置已复制" : "复制配置"}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ImageCompareLightbox({
  imageA,
  imageB,
  onClose,
  onDownload,
  onCopy,
  copiedText,
  onCopyConfig,
  onToggleStar,
  theme = "dark",
}: ImageCompareLightboxProps) {
  const [hoveredSide, setHoveredSide] = useState<"A" | "B" | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const finishedCountRef = useRef(0);

  const handleStartClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    // Fade out overlay backdrop
    const overlayEl = overlayRef.current;
    if (overlayEl) {
      overlayEl.animate(
        [
          {
            opacity: 1,
            backdropFilter: "blur(24px)",
          },
          {
            opacity: 0,
            backdropFilter: "blur(0px)",
          },
        ],
        {
          duration: 320,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      );
    }

    // Fade and scale down close button
    const closeBtnEl = closeBtnRef.current;
    if (closeBtnEl) {
      closeBtnEl.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: "scale(0.9)" },
        ],
        {
          duration: 250,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      );
    }

    // Absolute fallback safety to ensure dialog completely unmounts
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const handleChildAnimationFinished = () => {
    finishedCountRef.current += 1;
    if (finishedCountRef.current >= 2) {
      if (overlayRef.current) {
        overlayRef.current.style.opacity = "0";
        overlayRef.current.style.display = "none";
        overlayRef.current.style.backdropFilter = "none";
      }
      if (closeBtnRef.current) {
        closeBtnRef.current.style.opacity = "0";
        closeBtnRef.current.style.display = "none";
      }
      onClose();
    }
  };

  // Fade in overlay backdrop on mount
  useEffect(() => {
    const overlayEl = overlayRef.current;
    if (overlayEl) {
      overlayEl.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 350,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "both",
      });
    }
  }, []);

  // Scale/fade close button on mount
  useEffect(() => {
    const closeBtnEl = closeBtnRef.current;
    if (closeBtnEl) {
      closeBtnEl.animate(
        [
          { opacity: 0, transform: "scale(0.9)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        {
          duration: 380,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          delay: 60,
          fill: "both",
        },
      );
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === "Escape") {
        handleStartClose();
        return;
      }

      // Space to toggle close
      if (e.key === " " || e.code === "Space") {
        if (
          document.activeElement?.tagName === "INPUT" ||
          document.activeElement?.tagName === "TEXTAREA" ||
          (document.activeElement as HTMLElement)?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        handleStartClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onToggleStar, imageA, imageB, hoveredSide, isClosing]);

  // Determine layout based on aspect ratio of the first image
  const isPortrait = (size: string) => {
    if (!size || size === "Auto" || size === "1:1") return true;
    const parts = size.split(":");
    if (parts.length === 2) {
      const w = parseInt(parts[0], 10);
      const h = parseInt(parts[1], 10);
      if (!isNaN(w) && !isNaN(h)) {
        return w <= h;
      }
    }
    return true; // Default to side-by-side
  };

  const layoutIsSideBySide =
    isPortrait(imageA.gen?.size || "1:1") ||
    isPortrait(imageB.gen?.size || "1:1");

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden select-none ${
        theme === "light" ? "text-zinc-900" : "text-zinc-100"
      }`}
    >
      {/* Background overlay backdrop */}
      <div
        ref={overlayRef}
        className={`absolute inset-0 -z-10 cursor-pointer ${
          theme === "light"
            ? "bg-zinc-50/80 backdrop-blur-xl"
            : "bg-neutral-950/80 backdrop-blur-xl"
        }`}
        onClick={handleStartClose}
      />

      {/* Shared Absolute Close Button */}
      <div className="absolute top-4 right-4 z-50 pointer-events-auto">
        <button
          ref={closeBtnRef}
          type="button"
          onClick={handleStartClose}
          className={`p-3 backdrop-blur-md border rounded-full transition-all cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.5)] group ${
            theme === "light"
              ? "bg-white/65 hover:bg-red-50 text-zinc-700 hover:text-red-500 border-zinc-200/60 hover:border-red-400"
              : "bg-neutral-900/65 hover:bg-red-500/80 border-neutral-800/60 hover:border-red-500 text-neutral-200 hover:text-white"
          }`}
          title="退出全屏对比 (Esc)"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>
      </div>

      {/* Wrapping Two Independent Views */}
      <div
        className={`flex-1 w-full h-full flex ${layoutIsSideBySide ? "flex-row" : "flex-col"}`}
      >
        <div
          className="flex-1 min-w-0 min-h-0 flex flex-col"
          onMouseEnter={() => setHoveredSide("A")}
          onMouseLeave={() => setHoveredSide(null)}
        >
          <InteractiveImageView
            item={imageA}
            label={layoutIsSideBySide ? "左图 (对照)" : "上图 (对照)"}
            onDownload={onDownload}
            onCopy={onCopy}
            onCopyConfig={onCopyConfig}
            onToggleStar={onToggleStar}
            onClose={handleStartClose}
            isClosing={isClosing}
            onAnimationFinished={handleChildAnimationFinished}
            theme={theme}
            placement={layoutIsSideBySide ? "left" : "top"}
          />
        </div>
        <div
          className="flex-1 min-w-0 min-h-0 flex flex-col"
          onMouseEnter={() => setHoveredSide("B")}
          onMouseLeave={() => setHoveredSide(null)}
        >
          <InteractiveImageView
            item={imageB}
            label={layoutIsSideBySide ? "右图 (当前)" : "下图 (当前)"}
            onDownload={onDownload}
            onCopy={onCopy}
            onCopyConfig={onCopyConfig}
            onToggleStar={onToggleStar}
            onClose={handleStartClose}
            isClosing={isClosing}
            onAnimationFinished={handleChildAnimationFinished}
            theme={theme}
            placement={layoutIsSideBySide ? "right" : "bottom"}
          />
        </div>
      </div>
    </div>
  );
}
