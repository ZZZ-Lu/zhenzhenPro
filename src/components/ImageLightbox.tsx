import React, { useState, useRef, useEffect, useLayoutEffect, startTransition } from "react";
import {
  X,
  Download,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Star,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { LazyImageWrapper } from "./LazyImageWrapper";
import { SmartImage } from "./SmartImage";
import { getCachedBlobUrl } from "../utils/blobUrlCache";

interface ImageLightboxProps {
  url: string | Blob;
  prompt: string;
  trackId?: string;
  genId?: string;
  imgIndex?: number;
  onClose: () => void;
  onDownload: (url: string | Blob, prompt: string) => Promise<void> | void;
  onCopy: (text: string, identifier: string) => void;
  copiedText: string | null;
  onCopyConfig?: () => void;
  isStarred?: boolean;
  onToggleStar?: () => void;
  onNavigate?: (direction: "up" | "down" | "left" | "right") => void;
  workspaces?: any[];
  trackFilters?: Record<string, "all" | "starred" | "downloaded">;
  onSelectImage?: (
    url: string | Blob,
    prompt: string,
    gen: any,
    trackId: string,
  ) => void;
  isSpacebarOverviewMode?: boolean;
  panoramaCompareSourceImage?: any;
  theme?: "light" | "dark";
  onPanoramaScrollStateChange?: (isScrolling: boolean) => void;
}

// Helper to reliably find the thumbnail triggered.
// It iterates through all thumbnail images to find the match.
const findSourceThumbnail = (
  url: string | Blob,
  trackId?: string,
  genId?: string,
  imgIndex?: number,
): HTMLElement | null => {
  // Prioritize active board column container if trackId is supplied
  let thumbs: HTMLElement[] = [];
  if (trackId) {
    const colEl = document.getElementById(`track-container-${trackId}`);
    if (colEl) {
      thumbs = Array.from(colEl.querySelectorAll<HTMLElement>(".lightbox-thumb"));
    }
  }
  // Fallback to searching all lightbox-thumbs in the page
  if (thumbs.length === 0) {
    thumbs = Array.from(document.querySelectorAll<HTMLElement>(".lightbox-thumb"));
  }
  
  let exactMatch: HTMLElement | null = null;
  let trackGenMatch: HTMLElement | null = null;
  let urlMatchVisible: HTMLElement | null = null;
  let urlMatchAny: HTMLElement | null = null;
  
  for (let i = 0; i < thumbs.length; i++) {
    const thumb = thumbs[i];
    
    // 排除全景视图（Map）中的缩略图，我们寻找的是画板上的原始缩略图
    if (thumb.closest('[data-map-thumb="true"]')) continue;

    const tTrackId = thumb.getAttribute("data-track-id") || thumb.parentElement?.getAttribute("data-track-id");
    const tGenId = thumb.getAttribute("data-gen-id") || thumb.parentElement?.getAttribute("data-gen-id");
    const tImgIndex = thumb.getAttribute("data-img-index") || thumb.parentElement?.getAttribute("data-img-index");

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
        (thumb as any).src === url
      ) {
        trackGenMatch = thumb;
      }
    }

    // Match 3: URL/Blob Fallback
    const thumbSrc = thumb.getAttribute("data-lightbox-src");
    if (
      thumbSrc === url ||
      (url instanceof Blob && thumbSrc === "[object Blob]") ||
      (thumb as any).src === url
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

const getAspectRatioParams = (
  size: string | undefined,
): { style: React.CSSProperties } => {
  if (!size || size === "Auto") {
    return { style: { aspectRatio: "auto" } };
  }
  const parts = size.split(":");
  if (parts.length === 2) {
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isNaN(w) && !isNaN(h)) {
      return { style: { aspectRatio: `${w} / ${h}` } };
    }
  }
  return { style: { aspectRatio: "auto" } };
};

const getStaticElementCenter = (
  container: HTMLElement,
  element: HTMLElement
) => {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const elementCenterX = elementRect.left + elementRect.width / 2;
  const elementCenterY = elementRect.top + elementRect.height / 2;

  const containerCenterX = containerRect.left + containerRect.width / 2;
  const containerCenterY = containerRect.top + containerRect.height / 2;

  return {
    targetLeft: container.scrollLeft + (elementCenterX - containerCenterX),
    targetTop: container.scrollTop + (elementCenterY - containerCenterY),
  };
};

const customSmoothScroll = (
  el: HTMLElement,
  targetLeft: number | null,
  targetTop: number | null,
  duration: number = 320,
  rafRef?: React.MutableRefObject<number | null>,
  targetPosRef?: React.MutableRefObject<{ left: number; top: number } | null>,
  onScrollStateChange?: (isScrolling: boolean) => void,
) => {
  const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);

  const clampLeft =
    targetLeft !== null
      ? Math.max(0, Math.min(maxScrollLeft, targetLeft))
      : el.scrollLeft;
  const clampTop =
    targetTop !== null
      ? Math.max(0, Math.min(maxScrollTop, targetTop))
      : el.scrollTop;

  if (targetPosRef) {
    targetPosRef.current = {
      left: clampLeft,
      top: clampTop,
    };
  }

  if (rafRef && rafRef.current !== null) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  const startLeft = el.scrollLeft;
  const startTop = el.scrollTop;
  const deltaLeft = clampLeft - startLeft;
  const deltaTop = clampTop - startTop;

  if (duration === 0 || (Math.abs(deltaLeft) < 1 && Math.abs(deltaTop) < 1)) {
    el.scrollLeft = clampLeft;
    el.scrollTop = clampTop;
    if (targetPosRef) targetPosRef.current = null;
    onScrollStateChange?.(false);
    return;
  }

  onScrollStateChange?.(true);
  const startTime = performance.now();

  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / duration);
    // Cubic ease-out: 1 - (1 - t)^3 for silky-smooth deceleration
    const ease = 1 - Math.pow(1 - progress, 3);

    el.scrollLeft = startLeft + deltaLeft * ease;
    el.scrollTop = startTop + deltaTop * ease;

    if (progress < 1) {
      const nextId = requestAnimationFrame(step);
      if (rafRef) rafRef.current = nextId;
    } else {
      el.scrollLeft = clampLeft;
      el.scrollTop = clampTop;
      if (rafRef) rafRef.current = null;
      if (targetPosRef) targetPosRef.current = null;
      onScrollStateChange?.(false);
    }
  };

  const firstId = requestAnimationFrame(step);
  if (rafRef) {
    rafRef.current = firstId;
  }
};

interface PanoramaColumnProps {
  ws: any;
  currentFilter: "all" | "starred" | "downloaded";
  activeUrl: string | Blob | null;
  activeGenId?: string;
  activeImgIndex?: number;
  theme: "light" | "dark";
  activeThumbnailRef: React.RefObject<HTMLDivElement | null>;
  onThumbClick: (
    e: React.MouseEvent<HTMLDivElement>,
    imgUrl: string | Blob,
    gen: any,
    wsId: string,
  ) => void;
}

const PanoramaColumn = React.memo(
  function PanoramaColumn({
    ws,
    currentFilter,
    activeUrl,
    activeGenId,
    activeImgIndex,
    theme,
    activeThumbnailRef,
    onThumbClick,
  }: PanoramaColumnProps) {
    let generationsList = ws.generations || [];
    if (currentFilter === "starred") {
      generationsList = generationsList.filter((g: any) => g.isStarred);
    } else if (currentFilter === "downloaded") {
      generationsList = generationsList.filter(
        (g: any) => g.downloadedUrls && g.downloadedUrls.length > 0,
      );
    }

    const validGenerations = generationsList.filter((gen: any) => {
      if (gen.status === "generating") {
        return true;
      }
      if (gen.status !== "success" || !gen.result?.data) return false;
      return gen.result.data.some((item: any) => item.url);
    });

    if (validGenerations.length === 0) return null;

    const columnWidthClass =
      ws.columnWidth === "wide"
        ? "w-[270px] max-w-[270px]"
        : ws.columnWidth === "medium"
          ? "w-[205px] max-w-[205px]"
          : "w-[155px] max-w-[155px]";

    return (
      <div
        data-map-column={ws.id}
        className={`flex-shrink-0 ${columnWidthClass} flex flex-col gap-4`}
      >
        {validGenerations.map((gen: any) => {
          const imageList: {
            url: string | Blob;
            thumbnail_url?: string;
            originalIdx: number;
          }[] = [];
          if (gen.status === "generating") {
            imageList.push({
              url: `generating-${gen.id}`,
              originalIdx: 0,
            });
          } else {
            gen.result.data.forEach((item: any, uidx: number) => {
              if (item.url)
                imageList.push({
                  url: item.url,
                  thumbnail_url: item.thumbnail_url,
                  originalIdx: uidx,
                });
            });
          }

          const isGrid = imageList.length > 1;

          return (
            <div
              key={`${ws.id}-${gen.id}`}
              className={`grid gap-4 transition-colors ${
                isGrid ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {imageList.map(({ url: imgUrl, thumbnail_url, originalIdx }) => {
                if (gen.status === "generating") {
                  const isActive =
                    activeUrl !== null &&
                    (imgUrl === activeUrl ||
                      (activeGenId === gen.id &&
                        (activeImgIndex === undefined ||
                          activeImgIndex === originalIdx)));
                  return (
                    <div
                      key={`map-thumb-generating-${ws.id}-${gen.id}`}
                      ref={isActive ? activeThumbnailRef : undefined}
                      data-map-thumb="true"
                      data-url={imgUrl}
                      data-track-id={ws.id}
                      data-gen-id={gen.id}
                      data-img-index={0}
                      onClick={(e) => onThumbClick(e, imgUrl, gen, ws.id)}
                      style={getAspectRatioParams(gen.size).style}
                      className={`group relative w-full overflow-hidden border cursor-pointer transition-[transform,border-color,box-shadow] duration-200 hover:scale-[1.04] active:scale-[0.96] hover:shadow-[0_12px_24px_-10px_rgba(0,0,0,0.7)] rounded-none animate-shimmer ${
                        isActive
                          ? `border-indigo-500 ring-2 ring-indigo-500 ring-offset-4 ${
                              theme === "light"
                                ? "ring-offset-zinc-50 shadow-[0_0_25px_rgba(99,102,241,0.3)] bg-slate-100/75"
                                : "ring-offset-neutral-950 shadow-[0_0_25px_rgba(99,102,241,0.55)] bg-neutral-900/45"
                            } scale-102`
                          : theme === "light"
                            ? "border-zinc-200 hover:border-zinc-400 bg-slate-100/75 grid-thumb-non-active"
                            : "border-neutral-800 hover:border-neutral-700 bg-neutral-900/45 grid-thumb-non-active"
                      }`}
                    >
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-2 text-center select-none pointer-events-none">
                        <Sparkles
                          className={`w-4 h-4 animate-pulse ${
                            theme === "light"
                              ? "text-indigo-600/50"
                              : "text-indigo-400/40"
                          }`}
                        />
                        <span
                          className={`text-[10px] mt-1 font-medium font-mono ${
                            theme === "light"
                              ? "text-zinc-400"
                              : "text-zinc-500"
                          }`}
                        >
                          正在生成
                        </span>
                      </div>
                      {isActive && (
                        <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center z-20">
                          <div className="bg-indigo-500 text-white p-1.5 shadow-lg rounded-full">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                const displaySrc =
                  typeof imgUrl === "string"
                    ? thumbnail_url || imgUrl
                    : getCachedBlobUrl(imgUrl);
                const isActive =
                  activeUrl !== null &&
                  ((activeGenId === gen.id &&
                    (activeImgIndex === undefined ||
                      activeImgIndex === originalIdx)) ||
                    imgUrl === activeUrl ||
                    displaySrc === activeUrl);
                const reactKey = `map-thumb-${ws.id}-${gen.id}-${originalIdx}`;
                return (
                  <div
                    key={reactKey}
                    ref={isActive ? activeThumbnailRef : undefined}
                    data-map-thumb="true"
                    data-url={displaySrc}
                    data-track-id={ws.id}
                    data-gen-id={gen.id}
                    data-img-index={originalIdx}
                    onClick={(e) => onThumbClick(e, imgUrl, gen, ws.id)}
                    style={getAspectRatioParams(gen.size).style}
                    className={`group relative w-full overflow-hidden border cursor-pointer transition-[transform,border-color,box-shadow] duration-200 hover:scale-[1.04] active:scale-[0.96] hover:shadow-[0_12px_24px_-10px_rgba(0,0,0,0.7)] ${
                      isActive
                        ? `border-indigo-500 ring-2 ring-indigo-500 ring-offset-4 ${
                            theme === "light"
                              ? "ring-offset-zinc-50 shadow-[0_0_25px_rgba(99,102,241,0.3)]"
                              : "ring-offset-neutral-950 shadow-[0_0_25px_rgba(99,102,241,0.55)]"
                          } scale-102`
                        : theme === "light"
                          ? "border-zinc-200 hover:border-zinc-400 bg-white grid-thumb-non-active"
                          : "border-neutral-800 hover:border-neutral-700 bg-neutral-950/25 grid-thumb-non-active"
                    }`}
                  >
                    <img
                      src={displaySrc}
                      alt={gen.prompt}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-contain select-none pointer-events-none block rounded-none"
                      data-lightbox-src={displaySrc}
                    />
                    {isActive && (
                      <div className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                        <div className="bg-indigo-500 text-white p-1.5 shadow-lg rounded-full">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                    )}
                    <div
                      className={`absolute inset-x-0 bottom-0 bg-gradient-to-t ${
                        theme === "light"
                          ? "from-zinc-950/90 via-zinc-950/60"
                          : "from-neutral-950/95 via-neutral-950/65"
                      } to-transparent p-2 md:p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200`}
                    >
                      <p className="text-[10px] text-zinc-100 line-clamp-2 select-none leading-normal font-medium">
                        {gen.prompt}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  },
  (prev, next) =>
    prev.ws === next.ws &&
    prev.currentFilter === next.currentFilter &&
    prev.activeUrl === next.activeUrl &&
    prev.activeGenId === next.activeGenId &&
    prev.activeImgIndex === next.activeImgIndex &&
    prev.theme === next.theme,
);

export default function ImageLightbox({
  url,
  prompt,
  trackId,
  genId,
  imgIndex,
  onClose,
  onDownload,
  onCopy,
  copiedText,
  onCopyConfig,
  isStarred,
  onToggleStar,
  onNavigate,
  workspaces,
  trackFilters,
  onSelectImage,
  isSpacebarOverviewMode = false,
  panoramaCompareSourceImage,
  theme = "dark",
  onPanoramaScrollStateChange,
}: ImageLightboxProps) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isMapOpen, setIsMapOpen] = useState(isSpacebarOverviewMode);
  const [localCopied, setLocalCopied] = useState<"prompt" | "config" | null>(
    null,
  );

  useEffect(() => {
    const onMapOpen = () => {
      if (imageRef.current) {
        lastFullscreenImageRectRef.current =
          imageRef.current.getBoundingClientRect();
      }
      setIsMapOpen(true);
    };

    const onMapClose = () => {
      if (activeThumbnailRef.current) {
        clickedOverviewThumbRectRef.current =
          activeThumbnailRef.current.getBoundingClientRect();
      }
      animTriggeredRef.current = false;
      setIsMapOpen(false);
      setTimeout(triggerEntranceAnimation, 10);
    };

    window.addEventListener("spacebar-map-open", onMapOpen);
    window.addEventListener("spacebar-map-close", onMapClose);
    return () => {
      window.removeEventListener("spacebar-map-open", onMapOpen);
      window.removeEventListener("spacebar-map-close", onMapClose);
    };
  }, []);

  const activeThumbnailRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const targetScrollPosRef = useRef<{ left: number; top: number } | null>(null);
  const justClickedMapThumbRef = useRef(false);
  const mouseDownStart = useRef({ x: 0, y: 0 });

  const lastFullscreenImageRectRef = useRef<DOMRect | null>(null);
  const clickedOverviewThumbRectRef = useRef<DOMRect | null>(null);
  const mapOverlayRef = useRef<HTMLDivElement>(null);
  const prevIsMapOpenRef = useRef(false);
  const prevUrlRef = useRef(url);

  const handlePanoramaThumbClick = React.useCallback(
    (
      e: React.MouseEvent<HTMLDivElement>,
      imgUrl: string | Blob,
      gen: any,
      wsId: string,
    ) => {
      e.stopPropagation();
      const targetEl = e.currentTarget;
      clickedOverviewThumbRectRef.current = targetEl.getBoundingClientRect();
      if (scrollContainerRef.current) {
        justClickedMapThumbRef.current = true;
        const { targetLeft, targetTop } = getStaticElementCenter(
          scrollContainerRef.current,
          targetEl,
        );
        customSmoothScroll(
          scrollContainerRef.current,
          targetLeft,
          targetTop,
          320,
          scrollRafRef,
          targetScrollPosRef,
          onPanoramaScrollStateChange,
        );
      }
      startTransition(() => {
        onSelectImage?.(imgUrl, gen.prompt, gen, wsId);
      });
    },
    [onSelectImage, onPanoramaScrollStateChange],
  );

  // Cleanup any active scroll animation on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  // FLIP transition from fullscreen image to selected thumbnail in map view on opening
  useLayoutEffect(() => {
    if (isMapOpen && activeThumbnailRef.current && scrollContainerRef.current) {
      const isOpening = !prevIsMapOpenRef.current;

      if (isOpening) {
        const container = scrollContainerRef.current!;
        const innerContainer = container.firstElementChild as HTMLElement;

        const origTransition = container.style.transition;
        const origTransform = container.style.transform;

        container.style.transition = "none";
        container.style.transform = "none";

        const mapColumns = Array.from(
          container.querySelectorAll("[data-map-column]"),
        );
        mapColumns.forEach((el) => {
          (el as HTMLElement).style.marginLeft = "";
          (el as HTMLElement).style.marginTop = "";
        });

        if (innerContainer) {
          innerContainer.style.marginLeft = "";
          innerContainer.style.marginTop = "";
        }

        // Pre-index mounted main board elements once in O(M) instead of 1000 querySelector calls
        const mainRectMap = new Map<string, DOMRect>();
        const mountedMainEls = document.querySelectorAll(
          "#tracks-scroll-viewport [data-lightbox-wrapper]",
        );
        mountedMainEls.forEach((el) => {
          const gId = el.getAttribute("data-gen-id");
          const iIdx = el.getAttribute("data-img-index") || "0";
          if (gId) {
            mainRectMap.set(`${gId}-${iIdx}`, el.getBoundingClientRect());
          }
        });

        if (activeThumbnailRef.current) {
          const activeMapThumb = activeThumbnailRef.current;
          const activeGenId = activeMapThumb.getAttribute("data-gen-id") || "";
          const activeImgIdx =
            activeMapThumb.getAttribute("data-img-index") || "0";
          const activeMainRect = mainRectMap.get(
            `${activeGenId}-${activeImgIdx}`,
          );

          if (activeMainRect && activeMainRect.width > 0) {
            const scx = window.innerWidth / 2;
            const scy = window.innerHeight / 2;

            const activeMainCx = activeMainRect.left + activeMainRect.width / 2;
            const activeMainCy = activeMainRect.top + activeMainRect.height / 2;
            const mapThumbWidth = activeMapThumb.getBoundingClientRect().width;
            const mapScale = mapThumbWidth / activeMainRect.width || 1;

            const targetActiveCx = scx + (activeMainCx - scx) * mapScale;
            const targetActiveCy = scy + (activeMainCy - scy) * mapScale;

            const colDesiredYOffset: number[] = [];

            mapColumns.forEach((mapColumnEl) => {
              const mapThumbs = Array.from(
                mapColumnEl.querySelectorAll('[data-map-thumb="true"]'),
              );
              let closestMapThumb: Element | null = null;
              let closestMainCy = 0;
              let minDist = Infinity;

              for (let i = 0; i < mapThumbs.length; i++) {
                const mThumb = mapThumbs[i];
                const gId = mThumb.getAttribute("data-gen-id") || "";
                const iIdx = mThumb.getAttribute("data-img-index") || "0";
                const mRect = mainRectMap.get(`${gId}-${iIdx}`);
                if (mRect) {
                  const mCy = mRect.top + mRect.height / 2;
                  const dist = Math.abs(mCy - activeMainCy);
                  if (dist < minDist) {
                    minDist = dist;
                    closestMapThumb = mThumb;
                    closestMainCy = mCy;
                  }
                }
              }

              if (closestMapThumb) {
                const targetThumbCy = scy + (closestMainCy - scy) * mapScale;
                const currentRect = closestMapThumb.getBoundingClientRect();
                const currentCy = currentRect.top + currentRect.height / 2;

                colDesiredYOffset.push(targetThumbCy - currentCy);
              } else {
                colDesiredYOffset.push(0);
              }
            });

            if (colDesiredYOffset.length > 0) {
              const minYOffset = Math.min(...colDesiredYOffset);

              mapColumns.forEach((mapColumnEl, index) => {
                const mt = Math.round(colDesiredYOffset[index] - minYOffset);
                if (mt > 0) {
                  (mapColumnEl as HTMLElement).style.marginTop = `${mt}px`;
                }
              });
            }

            const containerRect = container.getBoundingClientRect();
            const updatedActiveRect = activeMapThumb.getBoundingClientRect();
            const updatedActiveCx =
              updatedActiveRect.left + updatedActiveRect.width / 2;
            const updatedActiveCy =
              updatedActiveRect.top + updatedActiveRect.height / 2;

            const scrollLeftTarget =
              container.scrollLeft + (updatedActiveCx - targetActiveCx);
            const scrollTopTarget =
              container.scrollTop + (updatedActiveCy - targetActiveCy);

            container.scrollLeft = Math.max(0, scrollLeftTarget);
            container.scrollTop = Math.max(0, scrollTopTarget);
            void containerRect.width;
          } else {
            const { targetLeft, targetTop } = getStaticElementCenter(
              container,
              activeMapThumb,
            );
            container.scrollLeft = Math.max(0, targetLeft);
            container.scrollTop = Math.max(0, targetTop);
          }
        }

        container.style.transition = origTransition;
        container.style.transform = origTransform;
      } else if (prevUrlRef.current !== url) {
        if (justClickedMapThumbRef.current) {
          // Click handler already started smooth rAF scroll on the exact click frame
          justClickedMapThumbRef.current = false;
        } else if (activeThumbnailRef.current && scrollContainerRef.current) {
          const { targetLeft, targetTop } = getStaticElementCenter(
            scrollContainerRef.current,
            activeThumbnailRef.current,
          );
          customSmoothScroll(
            scrollContainerRef.current,
            targetLeft,
            targetTop,
            320,
            scrollRafRef,
            targetScrollPosRef,
            onPanoramaScrollStateChange,
          );
        }
      }

      if (isOpening) {
        // Animate only the visible thumbnails in the viewport to avoid 1000 layout reads & 1000 timers
        const allThumbs = Array.from(
          scrollContainerRef.current.querySelectorAll('[data-map-thumb="true"]'),
        ) as HTMLElement[];
        const activeRect = activeThumbnailRef.current.getBoundingClientRect();
        const aX = activeRect.left + activeRect.width / 2;
        const aY = activeRect.top + activeRect.height / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const visibleThumbData: { el: HTMLElement; dist: number }[] = [];
        for (let i = 0; i < allThumbs.length; i++) {
          const el = allThumbs[i];
          const rect = el.getBoundingClientRect();
          if (
            rect.right >= -100 &&
            rect.left <= vw + 100 &&
            rect.bottom >= -100 &&
            rect.top <= vh + 100
          ) {
            const cX = rect.left + rect.width / 2;
            const cY = rect.top + rect.height / 2;
            const dist = Math.hypot(cX - aX, cY - aY);
            el.style.opacity = "0";
            el.style.transform = "scale(1.12)";
            el.style.transition = "none";
            visibleThumbData.push({ el, dist });
          }
        }

        requestAnimationFrame(() => {
          for (let i = 0; i < visibleThumbData.length; i++) {
            const { el, dist } = visibleThumbData[i];
            const delay = Math.min(dist * 0.35, 450);
            el.style.transition = `opacity 320ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 380ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`;
            el.style.opacity = "1";
            el.style.transform = "scale(1)";
          }
          setTimeout(() => {
            for (let i = 0; i < visibleThumbData.length; i++) {
              visibleThumbData[i].el.style.transition = "";
            }
          }, 900);
        });

        // Fade-in the map backdrop overlay gracefully
        if (mapOverlayRef.current) {
          const startBg =
            theme === "light" ? "rgba(250, 250, 250, 0)" : "rgba(9, 9, 11, 0)";
          const endBg =
            theme === "light"
              ? "rgba(250, 250, 250, 0.8)"
              : "rgba(9, 9, 11, 0.8)";
          mapOverlayRef.current.animate(
            [
              { backgroundColor: startBg, backdropFilter: "blur(0px)" },
              { backgroundColor: endBg, backdropFilter: "blur(24px)" },
            ],
            {
              duration: 300,
              easing: "cubic-bezier(0.16, 1, 0.3, 1)",
              fill: "both",
            },
          );
        }

        const headerEl = mapOverlayRef.current?.querySelector(".map-header");
        if (headerEl) {
          headerEl.animate(
            [
              { opacity: 0, transform: "translate3d(0, -12px, 0)" },
              { opacity: 1, transform: "translate3d(0, 0, 0)" },
            ],
            {
              duration: 260,
              easing: "ease-out",
              fill: "both",
            },
          );
        }
      }
    }
    prevIsMapOpenRef.current = isMapOpen;
    prevUrlRef.current = url;
  }, [isMapOpen, url, theme, onPanoramaScrollStateChange]);
  const containerRef = useRef<HTMLDivElement>(null);
  const animTriggeredRef = useRef(false);
  const hiddenSourceRef = useRef<HTMLImageElement | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

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

  // Handle the graceful closing animation.
  // It calculates the reverse FLIP properties on-the-fly and runs standard WAAPI transitions
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    const imageEl = imageRef.current;
    const overlayEl = overlayRef.current;
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;

    let animFinished = false;
    const triggerFinish = () => {
      if (!animFinished) {
        animFinished = true;

        // Restore thumbnail opacity synchronously right before unmounting to prevent a 1-frame blank gap
        if (hiddenSourceRef.current) {
          hiddenSourceRef.current.style.opacity = "";
          hiddenSourceRef.current = null;
        }

        // Force hide the lightbox animating elements to completely prevent any WAAPI teardown unmount flashing
        if (imageEl) {
          imageEl.style.opacity = "0";
          imageEl.style.display = "none";
        }
        if (overlayEl) {
          overlayEl.style.opacity = "0";
          overlayEl.style.display = "none";
          overlayEl.style.backdropFilter = "none";
        }

        onClose();
      }
    };

    const sourceEl = findSourceThumbnail(url, trackId, genId, imgIndex);

    if (imageEl) {
      // 1. Capture the exact visually-panned-and-zoomed actual coordinates right now on the viewport
      const lastRect = imageEl.getBoundingClientRect();

      // 2. Clear parent transformation instantly in the DOM to return imageEl to its natural, un-transformed layout position
      if (imageEl.parentElement) {
        imageEl.parentElement.style.transform = "none";
        imageEl.parentElement.style.transition = "none";
      }

      // 3. Capture the baseline coordinates of the un-transformed center state layout
      const baseRect = imageEl.getBoundingClientRect();

      if (
        sourceEl &&
        lastRect.width > 0 &&
        lastRect.height > 0 &&
        baseRect.width > 0 &&
        baseRect.height > 0
      ) {
        const firstRect = sourceEl.getBoundingClientRect();

        // Calculate starting offsets relative to baseRect mapping to the visual hand-zoomed/panned position
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

        // Calculate ending offsets relative to baseRect mapping to the destination thumbnail bounding box
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
    } else {
      triggerFinish();
    }

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

    if (headerEl) {
      headerEl.animate(
        [
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
          { opacity: 0, transform: "translate3d(0, -20px, 0)" },
        ],
        {
          duration: 250,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      );
    }

    if (footerEl) {
      footerEl.animate(
        [
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
          { opacity: 0, transform: "translate3d(0, 20px, 0)" },
        ],
        {
          duration: 250,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "forwards",
        },
      );
    }
  };

  const triggerEntranceAnimation = () => {
    if (animTriggeredRef.current) return;
    animTriggeredRef.current = true;
    setIsImageLoaded(true);

    if (isSpacebarOverviewMode || isMapOpen) {
      // Direct map mode: do not run entrance animation on the big image
      // and do not hide any whiteboard/artboard thumbnails!
      return;
    }

    const imageEl = imageRef.current;
    const headerEl = headerRef.current;
    const footerEl = footerRef.current;

    if (!imageEl) return;

    const sourceEl = findSourceThumbnail(url, trackId, genId, imgIndex);
    const clickedRect = clickedOverviewThumbRectRef.current;
    clickedOverviewThumbRectRef.current = null; // Clear immediately

    const firstRect =
      clickedRect || (sourceEl ? sourceEl.getBoundingClientRect() : null);

    if (firstRect) {
      const lastRect = imageEl.getBoundingClientRect();

      if (lastRect.width > 0 && lastRect.height > 0) {
        if (!clickedRect && sourceEl) {
          if (hiddenSourceRef.current && hiddenSourceRef.current !== sourceEl) {
            hiddenSourceRef.current.style.opacity = "";
          }
          hiddenSourceRef.current = sourceEl;
          sourceEl.style.opacity = "0";
        }

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

    if (headerEl) {
      headerEl.animate(
        [
          { opacity: 0, transform: "translate3d(0, -20px, 0)" },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 380,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          delay: 60,
          fill: "both",
        },
      );
    }

    if (footerEl) {
      footerEl.animate(
        [
          { opacity: 0, transform: "translate3d(0, 20px, 0)" },
          { opacity: 1, transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 380,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          delay: 60,
          fill: "both",
        },
      );
    }
  };

  // Start overlay fade-in immediately on mount
  useEffect(() => {
    const overlayEl = overlayRef.current;
    if (overlayEl && !isMapOpen) {
      overlayEl.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 350,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "both",
      });
    }
  }, []);

  // Restore the hidden source element when url changes or component unmounts
  useLayoutEffect(() => {
    return () => {
      if (hiddenSourceRef.current) {
        hiddenSourceRef.current.style.opacity = "";
        hiddenSourceRef.current = null;
      }
    };
  }, [url]);

  // Hook up cached/loaded image fallback
  useEffect(() => {
    if (isSpacebarOverviewMode || isMapOpen) return;
    animTriggeredRef.current = false;
    setIsImageLoaded(false);
    setTransform({ scale: 1, x: 0, y: 0 });

    const imageEl = imageRef.current;
    if (imageEl && imageEl.complete) {
      // Small timeout to let rendering cycle layout out properly
      setTimeout(triggerEntranceAnimation, 10);
    }
  }, [url, isSpacebarOverviewMode, isMapOpen]);

  const handleImageLoad = () => {
    triggerEntranceAnimation();
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape
      if (e.key === "Escape") {
        e.preventDefault();
        
        if (isSpacebarOverviewMode) {
          handleClose();
          return;
        }

        if (isMapOpen) {
          window.dispatchEvent(new CustomEvent("spacebar-map-close"));
        } else {
          handleClose();
        }
        return;
      }

      // Space Click Toggle has been delegated to the global handler in App.tsx using custom events and isSpacebarOverviewMode prop

      // Direction keys for image selection navigation
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const dirMap: Record<string, "up" | "down" | "left" | "right"> = {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
        };
        const direction = dirMap[e.key];

        if (isMapOpen) {
          // Perform high-accuracy spatial navigation based on DOM client rect coordinates
          const thumbs = Array.from(
            document.querySelectorAll('[data-map-thumb="true"]'),
          ) as HTMLDivElement[];
          
          // 在全景图中，我们需要更精准地锁定“当前”那张图，尤其当同一张图出现在不同轨道时
          let activeThumb = thumbs.find(
            (t) => genId && t.getAttribute("data-gen-id") === genId && 
                  (imgIndex === undefined || t.getAttribute("data-img-index") === String(imgIndex)) &&
                  (!trackId || t.getAttribute("data-track-id") === trackId)
          );
          if (!activeThumb) {
            activeThumb = thumbs.find(
              (t) => t.getAttribute("data-url") === url && 
                    (!trackId || t.getAttribute("data-track-id") === trackId)
            );
          }

          if (activeThumb) {
            const activeRect = activeThumb.getBoundingClientRect();
            const aX = activeRect.left + activeRect.width / 2;
            const aY = activeRect.top + activeRect.height / 2;

            const activeTrackId = activeThumb.getAttribute("data-track-id");

            let bestThumb: HTMLDivElement | null = null;

            let candidates: HTMLDivElement[] = [];
            let scoreFunc: (cX: number, cY: number) => number;

            if (direction === "up") {
              candidates = thumbs.filter((t) => {
                const rect = t.getBoundingClientRect();
                const cY = rect.top + rect.height / 2;
                return cY < aY - 2;
              });
              scoreFunc = (cX, cY) => {
                const dx = cX - aX;
                const dy = cY - aY;
                return Math.abs(dy) + 2.0 * Math.abs(dx);
              };
            } else if (direction === "down") {
              candidates = thumbs.filter((t) => {
                const rect = t.getBoundingClientRect();
                const cY = rect.top + rect.height / 2;
                return cY > aY + 2;
              });
              scoreFunc = (cX, cY) => {
                const dx = cX - aX;
                const dy = cY - aY;
                return Math.abs(dy) + 2.0 * Math.abs(dx);
              };
            } else if (direction === "left") {
              candidates = thumbs.filter((t) => {
                const rect = t.getBoundingClientRect();
                const cX = rect.left + rect.width / 2;
                return cX < aX - 2;
              });
              scoreFunc = (cX, cY) => {
                const dx = cX - aX;
                const dy = cY - aY;
                return Math.abs(dx) + 2.0 * Math.abs(dy);
              };
            } else { // direction === "right"
              candidates = thumbs.filter((t) => {
                const rect = t.getBoundingClientRect();
                const cX = rect.left + rect.width / 2;
                return cX > aX + 2;
              });
              scoreFunc = (cX, cY) => {
                const dx = cX - aX;
                const dy = cY - aY;
                return Math.abs(dx) + 2.0 * Math.abs(dy);
              };
            }

            if (candidates.length > 0) {
              let bestScore = Infinity;
              candidates.forEach((t) => {
                const rect = t.getBoundingClientRect();
                const cX = rect.left + rect.width / 2;
                const cY = rect.top + rect.height / 2;
                const score = scoreFunc(cX, cY);
                if (score < bestScore) {
                  bestScore = score;
                  bestThumb = t;
                }
              });
            }

            if (bestThumb) {
              const matchUrl = (bestThumb as HTMLDivElement).getAttribute(
                "data-url",
              );
              const matchTrackId = (bestThumb as HTMLDivElement).getAttribute(
                "data-track-id",
              );
              if (matchUrl && matchTrackId) {
                const ws = workspaces?.find((w) => w.id === matchTrackId);
                if (ws) {
                  const currentFilter = trackFilters?.[ws.id] || "all";
                  let generationsList = ws.generations || [];
                  if (currentFilter === "starred") {
                    generationsList = generationsList.filter(
                      (g: any) => g.isStarred,
                    );
                  } else if (currentFilter === "downloaded") {
                    generationsList = generationsList.filter(
                      (g: any) =>
                        g.downloadedUrls && g.downloadedUrls.length > 0,
                    );
                  }
                  const matchGen = generationsList.find(
                    (g: any) => {
                      if (matchUrl.startsWith("generating-")) {
                        return g.status === "generating" && `generating-${g.id}` === matchUrl;
                      }
                      return (
                        g.status === "success" &&
                        g.result?.data?.some(
                          (item: any) => item.url === matchUrl,
                        )
                      );
                    }
                  );
                  if (matchGen) {
                    onSelectImage?.(
                      matchUrl,
                      matchGen.prompt,
                      matchGen,
                      ws.id,
                    );
                    return;
                  }
                }
              }
            }
          }
        }

        // Fallback to standard linear order / wrapping navigation in host component
        onNavigate?.(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("spacebar-lightbox-close", handleClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("spacebar-lightbox-close", handleClose);
    };
  }, [
    onClose,
    onToggleStar,
    url,
    isClosing,
    onNavigate,
    isMapOpen,
    workspaces,
    trackFilters,
    onSelectImage,
  ]);

  // Handle Zoom on Scroll Wheel with focal point tracking the cursor
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (isClosing) return;
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

      // Mouse coordinate relative to center of view
      const rx = mx - cx;
      const ry = my - cy;

      return {
        scale: nextScale,
        x: rx - (rx - prev.x) * ratio,
        y: ry - (ry - prev.y) * ratio,
      };
    });
  };

  // Mouse Drag / Pan Actions (Left Button)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isClosing) return;
    if (e.button !== 0) return; // Left mouse button only
    setIsDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    mouseDownStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isClosing) return;
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

  // Touch Support for Mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isClosing) return;
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
    if (isClosing) return;
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
    if (isClosing) return;
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
    if (isClosing) return;
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
    if (isClosing) return;
    setTransform({ scale: 1, x: 0, y: 0 });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (isClosing) return;
    const dx = e.clientX - mouseDownStart.current.x;
    const dy = e.clientY - mouseDownStart.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If moved less than 6 pixels, treat it as a static click and close the lightbox gracefully
    if (distance < 6) {
      handleClose();
    }
  };

  const getWorkspaceImages = (ws: any) => {
    const currentFilter = trackFilters?.[ws.id] || "all";
    let generationsList = ws.generations || [];
    if (currentFilter === "starred") {
      generationsList = generationsList.filter((g: any) => g.isStarred);
    } else if (currentFilter === "downloaded") {
      generationsList = generationsList.filter(
        (g: any) => g.downloadedUrls && g.downloadedUrls.length > 0,
      );
    }

    const list: { url: string; prompt: string; gen: any; trackId: string }[] =
      [];
    generationsList.forEach((gen: any) => {
      if (gen.status === "success" && gen.result?.data) {
        gen.result.data.forEach((item: any) => {
          if (item.url) {
            list.push({
              url: item.url,
              prompt: gen.prompt,
              gen,
              trackId: ws.id,
            });
          }
        });
      }
    });
    return list;
  };

  const isGeneratingUrl = typeof url === "string" && url.startsWith("generating-");

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col justify-between overflow-hidden select-none ${
        theme === "light" ? "text-zinc-900" : "text-zinc-100"
      }`}
    >
      {/* Dynamic black backdrop that can fade out separately */}
      <div
        ref={overlayRef}
        style={{
          opacity: 0,
          visibility: isSpacebarOverviewMode ? "hidden" : "visible",
        }}
        className={`absolute inset-0 -z-10 ${
          theme === "light"
            ? "bg-zinc-50/80 backdrop-blur-xl"
            : "bg-neutral-950/80 backdrop-blur-xl"
        }`}
      />
      {/* Upper floating actions rail */}
      <div
        ref={headerRef}
        style={{ opacity: 0, visibility: isMapOpen ? "hidden" : "visible" }}
        className="absolute top-0 inset-x-0 p-5 flex items-center justify-between pointer-events-none z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center gap-2 backdrop-blur-md border px-4 py-2 rounded-full text-xs font-medium ${
            theme === "light"
              ? "bg-white/65 border-zinc-200/60 text-zinc-600"
              : "bg-neutral-900/65 border-neutral-800/60 text-neutral-400"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
          <span>大图画布：</span>
          <span className="font-mono text-indigo-400 font-bold">
            {Math.round(transform.scale * 100)}%
          </span>
          <span
            className={`text-[9px] ml-1 hidden sm:inline ${theme === "light" ? "text-zinc-400" : "text-neutral-500"}`}
          >
            (滚轮以当前鼠标中心缩放 / 拖拽移动)
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Quick Toolbar */}
          <div
            className={`flex items-center gap-1.5 backdrop-blur-md border p-1 rounded-full ${
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

          <button
            type="button"
            onClick={handleClose}
            className={`p-2.5 backdrop-blur-md border rounded-full transition-colors cursor-pointer ${
              theme === "light"
                ? "bg-white/65 hover:bg-zinc-200 border-zinc-200/60 text-zinc-700 hover:text-zinc-900"
                : "bg-neutral-900/65 hover:bg-neutral-800 border-neutral-800/60 text-neutral-200 hover:text-white"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Fullscreen Interactive Canvas */}
      <div
        ref={containerRef}
        style={{
          visibility:
            isSpacebarOverviewMode || isMapOpen ? "hidden" : "visible",
        }}
        className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing relative overflow-hidden"
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
          className="w-[90vw] h-[78vh] flex items-center justify-center select-none pointer-events-none"
        >
          {isGeneratingUrl ? (
            <div className={`flex flex-col items-center justify-center p-8 rounded-2xl max-w-lg text-center backdrop-blur-md border ${
              theme === "light"
                ? "bg-white/80 border-slate-200/50 shadow-xl"
                : "bg-neutral-900/80 border-neutral-800/50 shadow-2xl"
            }`}>
              <Sparkles
                className={`w-12 h-12 animate-pulse mb-4 ${
                  theme === "light" ? "text-indigo-600" : "text-indigo-400"
                }`}
              />
              <h3 className={`text-xl font-bold mb-2`}>
                正在生成画作
              </h3>
              <p className={`text-sm mb-4 max-w-sm px-4 leading-relaxed ${
                theme === "light" ? "text-zinc-500" : "text-zinc-400"
              }`}>
                “{prompt}”
              </p>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full bg-indigo-500 animate-pulse`} />
                <span className={`text-xs font-mono font-medium ${
                  theme === "light" ? "text-indigo-600" : "text-indigo-400"
                }`}>
                  已启动生成线程：正在渲染高质细节
                </span>
              </div>
            </div>
          ) : !isSpacebarOverviewMode && !isMapOpen ? (
            <SmartImage
              ref={imageRef}
              src={url}
              alt={prompt}
              onLoad={handleImageLoad}
              referrerPolicy="no-referrer"
              decoding="async"
              style={{ opacity: isImageLoaded ? 1 : 0 }}
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          ) : null}
        </div>
      </div>

      {/* Sleek Floating Navigation Arrows */}
      {!isClosing && !isMapOpen && onNavigate && (
        <>
          {/* Left Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("left");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`absolute left-6 top-1/2 -translate-y-1/2 z-30 p-3 backdrop-blur-md border rounded-full shadow-lg pointer-events-auto transition-all hover:scale-110 active:scale-95 cursor-pointer group ${
              theme === "light"
                ? "bg-zinc-100/60 hover:bg-zinc-200/90 text-zinc-600 hover:text-zinc-900 border-zinc-300/60"
                : "bg-neutral-900/60 hover:bg-neutral-900/90 text-neutral-300 hover:text-white border-neutral-800/60"
            }`}
            title="上一个列图片 (左键)"
          >
            <ChevronLeft className="w-5.5 h-5.5 group-hover:-translate-x-0.5 transition-transform" />
          </button>

          {/* Right Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("right");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`absolute right-6 top-1/2 -translate-y-1/2 z-30 p-3 backdrop-blur-md border rounded-full shadow-lg pointer-events-auto transition-all hover:scale-110 active:scale-95 cursor-pointer group ${
              theme === "light"
                ? "bg-zinc-100/60 hover:bg-zinc-200/90 text-zinc-600 hover:text-zinc-900 border-zinc-300/60"
                : "bg-neutral-900/60 hover:bg-neutral-900/90 text-neutral-300 hover:text-white border-neutral-800/60"
            }`}
            title="下一个列图片 (右键)"
          >
            <ChevronRight className="w-5.5 h-5.5 group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Up Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("up");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`absolute top-22 left-1/2 -translate-x-1/2 z-30 p-2 backdrop-blur-md border rounded-full shadow-lg pointer-events-auto transition-all hover:scale-110 active:scale-95 cursor-pointer group ${
              theme === "light"
                ? "bg-zinc-100/60 hover:bg-zinc-200/90 text-zinc-600 hover:text-zinc-900 border-zinc-300/60"
                : "bg-neutral-900/60 hover:bg-neutral-900/90 text-neutral-300 hover:text-white border-neutral-800/60"
            }`}
            title="同列上一张 (上键)"
          >
            <ChevronUp className="w-4.5 h-4.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>

          {/* Down Arrow */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate("down");
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className={`absolute bottom-26 left-1/2 -translate-x-1/2 z-30 p-2 backdrop-blur-md border rounded-full shadow-lg pointer-events-auto transition-all hover:scale-110 active:scale-95 cursor-pointer group ${
              theme === "light"
                ? "bg-zinc-100/60 hover:bg-zinc-200/90 text-zinc-600 hover:text-zinc-900 border-zinc-300/60"
                : "bg-neutral-900/60 hover:bg-neutral-900/90 text-neutral-300 hover:text-white border-neutral-800/60"
            }`}
            title="同列下一张 (下键)"
          >
            <ChevronDown className="w-4.5 h-4.5 group-hover:translate-y-0.5 transition-transform" />
          </button>
        </>
      )}

      {/* Elegant Centered Bottom Buttons */}
      <div
        ref={footerRef}
        style={{ opacity: 0, visibility: isMapOpen ? "hidden" : "visible" }}
        className="absolute bottom-8 inset-x-0 flex flex-wrap items-center justify-center gap-2 z-30 pointer-events-auto px-4"
        onClick={(e) => e.stopPropagation()}
      >
        {onToggleStar && !isGeneratingUrl && (
          <button
            onClick={onToggleStar}
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

        {!isGeneratingUrl && (
          <button
            onClick={() => onDownload(url, prompt)}
            className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border ${
              theme === "light"
                ? "bg-white/80 backdrop-blur-md hover:bg-white text-zinc-600 hover:text-indigo-600 border-zinc-200/80"
                : "bg-neutral-900/80 backdrop-blur-md hover:bg-neutral-800 text-neutral-300 hover:text-indigo-400 border-neutral-800/80"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>下载图片</span>
          </button>
        )}

        <button
          onClick={() => {
            navigator.clipboard.writeText(prompt);
            setLocalCopied("prompt");
            setTimeout(() => setLocalCopied(null), 2000);
          }}
          className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border ${
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

        <button
          onClick={() => {
            if (onCopyConfig) {
              onCopyConfig();
            }
            setLocalCopied("config");
            setTimeout(() => setLocalCopied(null), 2000);
          }}
          className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer shadow-md border ${
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
          <span>{localCopied === "config" ? "配置已复制" : "复制配置"}</span>
        </button>
      </div>

      {/* Space Click Matrix Overview Map Overlay */}
      {isMapOpen && workspaces && workspaces.length > 0 && (
        <div
          ref={mapOverlayRef}
          className={`absolute inset-0 backdrop-blur-xl z-40 flex flex-col p-8 pointer-events-auto select-none overflow-hidden transition-colors duration-300 ${
            theme === "light"
              ? "bg-zinc-50/80 text-zinc-900"
              : "bg-neutral-950/80 text-zinc-100"
          }`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("spacebar-map-close"));
          }}
        >
          {/* Header */}
          <div
            className="map-header flex flex-col items-center justify-center gap-1 mb-6 text-center shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center gap-2 border px-3.5 py-1 rounded-none text-xs font-semibold uppercase tracking-wider ${
                theme === "light"
                  ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-600"
                  : "bg-indigo-500/10 border-indigo-500/25 text-indigo-400"
              }`}
            >
              <Sparkles
                className={`w-3.5 h-3.5 animate-pulse ${theme === "light" ? "text-indigo-600" : "text-indigo-400"}`}
              />
              <span>全景导航地图</span>
            </div>
            <h2
              className={`text-xl font-bold mt-2 ${theme === "light" ? "text-zinc-900" : "text-zinc-100"}`}
            >
              {panoramaCompareSourceImage ? "请从全景视图中挑选第二张图片进行对比" : "Space 键已切换全景定位模式"}
            </h2>
            <p
              className={`text-sm mt-1 max-w-lg ${theme === "light" ? "text-zinc-500" : "text-zinc-400"}`}
            >
              {panoramaCompareSourceImage ? "点击任意缩略图即可进入双图对比视图" : "鼠标点击或者键盘方向键选择图像，松开空格键返回单图或画板视图"}
            </p>
          </div>

          {/* Miniature Columns Container */}
          <div
            ref={scrollContainerRef}
            className="relative flex-1 min-h-0 w-full overflow-auto flex items-start justify-start scrollbar-custom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4 items-start select-none h-auto py-[50vh] px-[50vw]">
              {workspaces.map((ws) => {
                const currentFilter = trackFilters?.[ws.id] || "all";
                const isColumnActive = !trackId || ws.id === trackId;
                return (
                  <PanoramaColumn
                    key={ws.id}
                    ws={ws}
                    currentFilter={currentFilter}
                    activeUrl={isColumnActive ? url : null}
                    activeGenId={isColumnActive ? genId : undefined}
                    activeImgIndex={isColumnActive ? imgIndex : undefined}
                    theme={theme}
                    activeThumbnailRef={activeThumbnailRef}
                    onThumbClick={handlePanoramaThumbClick}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
