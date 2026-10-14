import React, { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Check,
  Copy,
  Undo,
  RefreshCw,
  XCircle,
  Download,
  Star,
  Plus,
  GitCompare,
  Sparkles,
  Trash2,
  X,
  Palette,
} from "lucide-react";
import { GenerationItem, ImageReference } from "../types";
import { SmartImage } from "./SmartImage";
import { LazyImageWrapper } from "./LazyImageWrapper";
import { getAspectRatioParams } from "../App";

const formatDuration = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (m > 0) {
    return `${m}分${s}秒`;
  }
  return `${s}秒`;
};

const getDisplayModelName = (
  model: string,
  columnWidth?: "narrow" | "medium" | "wide",
  hasRefImages?: boolean,
) => {
  if (columnWidth === "narrow" && hasRefImages) {
    switch (model) {
      case "gpt-image-2-2in1":
        return "2in1-gpt-image-2";
      case "gpt-image-2-low":
        return "low-gpt-image-2";
      case "gpt-image-2-medium":
        return "medium-gpt-image-2";
      case "gpt-image-2-high":
        return "high-gpt-image-2";
      case "gpt-image-2-all":
        return "all-gpt-image-2";
      case "gpt-image-2.5-flare":
        return "flare-gpt-image-2.5";
      case "gpt-image-2.5-sunburst":
        return "sunburst-gpt-image-2.5";
      case "nano-banana-pro":
        return "pro-nano-banana";
      case "gemini-3.1-flash-image-preview":
        return "2-nano-banana";
      default:
        return model;
    }
  } else {
    switch (model) {
      case "gemini-3.1-flash-image-preview":
        return "nano-banana-2";
      default:
        return model;
    }
  }
};

const GeneratingTimer = ({
  theme,
  createdAt,
}: {
  theme: string;
  createdAt?: number;
}) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const start = createdAt || Date.now();

    // Update immediately
    setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));

    const timer = setInterval(() => {
      setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  return (
    <div
      className={`text-xs font-mono font-bold mt-2 px-2.5 py-0.5 rounded-full shadow-sm animate-pulse ${
        theme === "light"
          ? "bg-indigo-50 text-indigo-600 border border-indigo-100"
          : "bg-indigo-950/40 text-indigo-400 border border-indigo-900/40"
      }`}
    >
      {formatDuration(seconds)}
    </div>
  );
};

interface GenerationsListProps {
  wsId: string;
  generations: GenerationItem[];
  theme: string;
  currentFilter: "all" | "starred" | "downloaded";
  dragOverImageId: string | null;
  setDragOverImageId: (id: string | null) => void;
  setDraggedImageItem: (item: any) => void;
  setCompareMode: (mode: any) => void;
  setLightboxImage: (img: any) => void;
  justCopiedCardGenId: string | null;
  handleCopyGenConfig: (gen: GenerationItem, label: string) => void;
  handleApplyConfigSlices: (gen: GenerationItem) => void;
  handleCopyPromptToClipboard: (prompt: string) => void;
  handleDownloadImage: (
    url: string,
    prompt: string,
    trackId: string,
    genId: string,
  ) => void;
  handleCopyImageToClipboard: (url: string | Blob) => void;
  toggleStarGeneration: (trackId: string, genId: string) => void;
  runTrackGeneration: (
    trackId: string,
    retryGenId?: string,
    overrideOptions?: { model?: string },
  ) => void;
  executeDeleteGenItem: (genId: string) => void;
  deleteConfirmGen: { trackId: string; genId: string } | null;
  setDeleteConfirmGen: (val: any) => void;
  setWorkspaces: React.Dispatch<React.SetStateAction<any[]>>;
  hoveredImageItemRef: React.MutableRefObject<any>;
  draggedImageItemRef: React.MutableRefObject<any>;
  dragLeaveTimerRef: React.MutableRefObject<any>;
  draggedImageItem: any;
  setToast: (val: string) => void;
  columnWidth?: "narrow" | "medium" | "wide";
}

const areEqual = (prev: GenerationsListProps, next: GenerationsListProps) => {
  return (
    prev.wsId === next.wsId &&
    prev.generations === next.generations &&
    prev.theme === next.theme &&
    prev.currentFilter === next.currentFilter &&
    prev.dragOverImageId === next.dragOverImageId &&
    prev.justCopiedCardGenId === next.justCopiedCardGenId &&
    prev.deleteConfirmGen?.genId === next.deleteConfirmGen?.genId &&
    prev.columnWidth === next.columnWidth
  );
};

export const GenerationsList = React.memo(
  ({
    wsId,
    generations,
    theme,
    currentFilter,
    dragOverImageId,
    setDragOverImageId,
    setDraggedImageItem,
    setCompareMode,
    setLightboxImage,
    justCopiedCardGenId,
    handleCopyGenConfig,
    handleApplyConfigSlices,
    handleCopyPromptToClipboard,
    handleDownloadImage,
    handleCopyImageToClipboard,
    toggleStarGeneration,
    runTrackGeneration,
    executeDeleteGenItem,
    deleteConfirmGen,
    setDeleteConfirmGen,
    setWorkspaces,
    hoveredImageItemRef,
    draggedImageItemRef,
    dragLeaveTimerRef,
    draggedImageItem,
    setToast,
    columnWidth,
  }: GenerationsListProps) => {
    let displayedGenerations = generations || [];

    if (currentFilter === "starred") {
      displayedGenerations = displayedGenerations.filter((g) => g.isStarred);
    } else if (currentFilter === "downloaded") {
      displayedGenerations = displayedGenerations.filter(
        (g) => g.downloadedUrls && g.downloadedUrls.length > 0,
      );
    }

    if (currentFilter !== "all" && displayedGenerations.length === 0) {
      return (
        <AnimatePresence initial={false}>
          <motion.div
            key="starred-empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="py-10 px-4 border border-dashed border-slate-800/80 rounded-3xl flex flex-col items-center justify-center text-center space-y-2 select-none"
          >
            {currentFilter === "downloaded" ? (
              <Download className="w-7 h-7 text-emerald-600/30" />
            ) : (
              <Star className="w-7 h-7 text-yellow-600/30" />
            )}
            <p className="text-xs font-bold text-slate-400">
              {currentFilter === "downloaded"
                ? "本列无已下载画作"
                : "本列无备选画作"}
            </p>
            <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed">
              {currentFilter === "downloaded"
                ? "下载过的画作将展示在这里。"
                : "没有找到符合条件的画作。"}
            </p>
          </motion.div>
        </AnimatePresence>
      );
    }

    return (
      <AnimatePresence initial={false}>
        {displayedGenerations.map((gen, gIdx) => {
          const imageList: {
            url: string;
            thumbnail_url?: string;
            thumbnail_url_1k?: string;
          }[] = [];
          if (gen.status === "success" && gen.result?.data) {
            gen.result.data.forEach((item: any) => {
              if (item.url) {
                imageList.push({
                  url: item.url,
                  thumbnail_url: item.thumbnail_url,
                  thumbnail_url_1k: item.thumbnail_url_1k,
                });
              }
            });
          }

          return (
            <motion.div
              key={gen.id}
              id={`gen-card-${gen.id}`}
              data-gen-id={gen.id}
              data-gen-status={gen.status}
              data-generating-card={gen.status === "generating"}
              initial={{ opacity: 0, y: 15, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.18 }}
              style={{
                contentVisibility: "auto",
                containIntrinsicSize: "380px 320px",
              }}
              className="bg-slate-950 hover:bg-slate-950/95 border border-slate-800 hover:border-slate-700/60 rounded-2xl p-0 flex flex-col relative group transition-colors duration-250 shadow-inner overflow-hidden"
            >
              {/* Header of Card */}
              <div className="flex items-center justify-between gap-1.5 text-xs p-4 pb-3">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                  <span className="font-mono text-indigo-400 font-bold flex-shrink-0">
                    {(gen.resolution || "1k").toUpperCase()}
                  </span>
                  <span className="text-slate-650 flex-shrink-0">•</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wide truncate flex-1 min-w-0 animate-none border ${
                      theme === "light"
                        ? "bg-slate-200/90 border-slate-300/80 text-slate-700"
                        : "bg-slate-850 border-slate-800/80 text-slate-400"
                    }`}
                    style={{ display: "inline-block" }}
                    title={getDisplayModelName(
                      gen.model,
                      columnWidth,
                      !!(gen.refImages && gen.refImages.length > 0),
                    )}
                  >
                    {getDisplayModelName(
                      gen.model,
                      columnWidth,
                      !!(gen.refImages && gen.refImages.length > 0),
                    )}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wide flex-shrink-0 border ${
                      theme === "light"
                        ? "bg-slate-200/90 border-slate-300/80 text-slate-700"
                        : "bg-slate-850 border-slate-800/80 text-slate-400"
                    }`}
                  >
                    {gen.size}
                  </span>
                  {gen.refImages && gen.refImages.length > 0 && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold tracking-wide flex-shrink-0 border ${
                        theme === "light"
                          ? "bg-slate-200/90 border-slate-300/80 text-slate-700"
                          : "bg-slate-850 border-slate-800/80 text-slate-400"
                      }`}
                    >
                      参考（{gen.refImages.length}）
                    </span>
                  )}
                  {gen.callFormat === "chat" && (
                    <span className="text-[9px] bg-sky-950 text-sky-400 border border-sky-900 px-1.5 py-0.2 rounded font-sans font-bold flex-shrink-0 uppercase">
                      CHAT
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => handleCopyGenConfig(gen, "该画作")}
                    className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer ${
                      theme === "light"
                        ? "bg-slate-200/90 hover:bg-slate-300/80 border border-slate-300/80 text-slate-700 hover:text-indigo-600"
                        : "bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-indigo-400"
                    }`}
                    title="复制配置 (模型、比例、参考图和提示词)"
                  >
                    {justCopiedCardGenId === gen.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-green-500">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制配置</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyConfigSlices(gen)}
                    className={`text-xs font-bold flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg cursor-pointer ${
                      theme === "light"
                        ? "bg-slate-200/90 hover:bg-slate-300/80 border border-slate-300/80 text-slate-700 hover:text-indigo-600"
                        : "bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-indigo-400"
                    }`}
                    title="一键将参数和参考图应用回当前列"
                  >
                    <Undo className="w-3.5 h-3.5" />
                    <span>应用配置</span>
                  </button>
                </div>
              </div>

              {/* Loaded state / Generating progress */}
              {gen.status === "generating" && (
                <div
                  style={getAspectRatioParams(gen.size).style}
                  data-lightbox-wrapper={`generating-${gen.id}`}
                  data-lightbox-src={`generating-${gen.id}`}
                  data-track-id={wsId}
                  data-gen-id={gen.id}
                  data-img-index={0}
                  onClick={() => {
                    setLightboxImage({
                      url: `generating-${gen.id}`,
                      prompt: gen.prompt,
                      gen,
                      trackId: wsId,
                      imgIndex: 0,
                    } as any);
                  }}
                  className={`lightbox-thumb relative w-full overflow-hidden flex items-center justify-center animate-shimmer cursor-pointer transition-all duration-300 hover:scale-[1.01] active:scale-98 ${
                    theme === "light"
                      ? "border-y border-slate-200 bg-slate-100 hover:bg-slate-200/55"
                      : "border-y border-slate-850 bg-slate-950 hover:bg-slate-900/55"
                  }`}
                >
                  <div className="relative z-10 flex flex-col items-center justify-center">
                    <Sparkles
                      className={`w-5 h-5 animate-pulse ${
                        theme === "light"
                          ? "text-indigo-600/50"
                          : "text-indigo-400/40"
                      }`}
                    />
                    <GeneratingTimer theme={theme} createdAt={gen.createdAt} />
                  </div>
                  <div className="absolute bottom-2.5 right-2.5 z-30">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWorkspaces((prev) =>
                          prev.map((w) => {
                            if (w.id === wsId) {
                              return {
                                ...w,
                                generations: w.generations.filter(
                                  (g) => g.id !== gen.id,
                                ),
                              };
                            }
                            return w;
                          }),
                        );
                      }}
                      className={`border px-2 py-1 rounded text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        theme === "light"
                          ? "bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-600 shadow-sm"
                          : "bg-black/70 hover:bg-rose-950/70 border-slate-800 text-slate-400 hover:text-rose-400"
                      }`}
                    >
                      <X className="w-3 h-3" />
                      <span>中断</span>
                    </button>
                  </div>
                </div>
              )}

              {gen.status === "error" && (
                <div className="px-4 pb-4">
                  <div
                    className={`p-3 border rounded-xl space-y-1.5 animate-fadeIn ${
                      theme === "light"
                        ? "bg-rose-50 border-rose-200"
                        : "bg-rose-950/20 border-rose-900/30"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-1.5 font-bold text-xs ${
                        theme === "light" ? "text-rose-800" : "text-rose-450"
                      }`}
                    >
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      <span>生成进程发生阻断</span>
                    </div>
                    <p
                      className={`text-[10px] font-mono leading-relaxed breakdown-all ${
                        theme === "light"
                          ? "text-rose-900 font-medium"
                          : "text-rose-300"
                      }`}
                    >
                      {gen.error || "未捕获到的服务端接口连接错误。"}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => runTrackGeneration(wsId, gen.id)}
                        className={`text-[10px] px-2.5 py-1 rounded transition-all font-bold flex items-center gap-1 w-max cursor-pointer ${
                          theme === "light"
                            ? "bg-rose-100 hover:bg-rose-200 text-rose-800 hover:text-rose-900 border border-rose-200"
                            : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200"
                        }`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>重新尝试生成</span>
                      </button>
                      {gen.model === "nano-banana-pro" && (
                        <button
                          type="button"
                          onClick={() => runTrackGeneration(wsId, gen.id, { model: "nano-banana-2" })}
                          className={`text-[10px] px-2.5 py-1 rounded transition-all font-bold flex items-center gap-1 w-max cursor-pointer ${
                            theme === "light"
                              ? "bg-amber-100 hover:bg-amber-200 text-amber-800 hover:text-amber-900 border border-amber-200"
                              : "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200"
                          }`}
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>用 nano-banana-2 尝试</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {gen.status === "success" && (
                <div className="w-full">
                  {imageList.length > 0 ? (
                    <div
                      className={`grid gap-0.5 bg-slate-900 border-y border-slate-800 ${imageList.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                    >
                      {imageList.map((imgItem, uidx) => {
                        const url = imgItem.url;
                        const displayUrl =
                          imgItem.thumbnail_url ||
                          imgItem.thumbnail_url_1k ||
                          (imgItem as any).thumbnail ||
                          imgItem.url;
                        const isImageDownloaded =
                          gen.downloadedUrls?.includes(url);

                        return (
                          <div
                            key={`${gen.id}-${url || uidx}`}
                            data-lightbox-wrapper={url}
                            data-track-id={wsId}
                            data-gen-id={gen.id}
                            data-img-index={uidx}
                            className={`relative group/img overflow-hidden cursor-pointer select-none transition-all duration-300 ${
                              theme === "light" ? "bg-slate-200/60" : "bg-slate-800/40"
                            } ${
                              dragOverImageId === `${wsId}-${gen.id}-${uidx}`
                                ? "ring-2 ring-indigo-500 z-10"
                                : ""
                            }`}
                            style={getAspectRatioParams(gen.size).style}
                            draggable
                            onMouseEnter={() => {
                              hoveredImageItemRef.current = {
                                url,
                                prompt: gen.prompt,
                                gen,
                                trackId: wsId,
                                imgIndex: uidx,
                              };
                            }}
                            onMouseLeave={() => {
                              hoveredImageItemRef.current = null;
                            }}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              const stringUrl =
                                typeof url === "string"
                                  ? url
                                  : (url as any) instanceof Blob
                                    ? URL.createObjectURL(url as any)
                                    : "";
                              e.dataTransfer.setData("image-url", stringUrl);
                              e.dataTransfer.setData("text/plain", stringUrl);
                              const draggedData = {
                                trackId: wsId,
                                url,
                                prompt: gen.prompt,
                                gen,
                                imgIndex: uidx,
                              };
                              draggedImageItemRef.current = draggedData;
                              setDraggedImageItem(draggedData);
                            }}
                            onDragEnd={() => {
                              setDraggedImageItem(null);
                              draggedImageItemRef.current = null;
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const y = e.clientY - rect.top;
                              const isCenter =
                                x > rect.width * 0.15 &&
                                x < rect.width * 0.85 &&
                                y > rect.height * 0.15 &&
                                y < rect.height * 0.85;

                              if (isCenter) {
                                if (dragLeaveTimerRef.current) {
                                  clearTimeout(dragLeaveTimerRef.current);
                                }
                                setDragOverImageId(`${wsId}-${gen.id}-${uidx}`);
                              } else {
                                setDragOverImageId(null);
                              }
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              dragLeaveTimerRef.current = setTimeout(() => {
                                setDragOverImageId(null);
                              }, 100);
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOverImageId(null);

                              const incomingImg =
                                draggedImageItemRef.current || draggedImageItem;
                              if (incomingImg) {
                                const imageA = { ...incomingImg };
                                const imageB = {
                                  url,
                                  prompt: gen.prompt,
                                  gen,
                                  trackId: wsId,
                                  imgIndex: uidx,
                                };
                                hoveredImageItemRef.current = imageB;
                                setCompareMode({ imageA, imageB });
                              }
                            }}
                            onClick={() =>
                              setLightboxImage({
                                url,
                                prompt: gen.prompt,
                                gen,
                                trackId: wsId,
                                imgIndex: uidx,
                              } as any)
                            }
                            onContextMenu={(e) => {
                              e.preventDefault();
                              window.dispatchEvent(
                                new CustomEvent("show-image-context-menu", {
                                  detail: {
                                    x: e.clientX,
                                    y: e.clientY,
                                    url,
                                    prompt: gen.prompt,
                                    gen,
                                    trackId: wsId,
                                    imgIndex: uidx,
                                  },
                                }),
                              );
                            }}
                          >
                            <LazyImageWrapper
                              theme={theme}
                              placeholderAspectRatio={
                                (getAspectRatioParams(gen.size).style.aspectRatio as string) || undefined
                              }
                            >
                              <SmartImage
                                src={displayUrl}
                                alt={`output for prompt: ${gen.prompt}`}
                                data-track-id={wsId}
                                data-gen-id={gen.id}
                                data-img-index={uidx}
                                referrerPolicy="no-referrer"
                                decoding="async"
                                draggable={false}
                                className={`lightbox-thumb w-full h-full ${
                                  getAspectRatioParams(gen.size).imageClass
                                } transition-transform duration-300 ${
                                  dragOverImageId ===
                                  `${wsId}-${gen.id}-${uidx}`
                                    ? "scale-105"
                                    : "group-hover/img:scale-102"
                                }`}
                                data-lightbox-src={url}
                              />

                              <AnimatePresence>
                                {dragOverImageId ===
                                  `${wsId}-${gen.id}-${uidx}` && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0 }}
                                    className="absolute inset-0 bg-indigo-500/80 z-30 flex items-center justify-center backdrop-blur-sm pointer-events-none"
                                  >
                                    <motion.div
                                      initial={{ scale: 0.8, rotate: -3 }}
                                      animate={{ scale: 1.1, rotate: 0 }}
                                      transition={{
                                        type: "spring",
                                        stiffness: 500,
                                        damping: 10,
                                        mass: 1,
                                      }}
                                      className="bg-white px-4 py-2 rounded-full font-bold text-indigo-600 flex items-center gap-2 shadow-xl shrink-0"
                                    >
                                      <GitCompare className="w-5 h-5" />
                                      进入全屏对比
                                    </motion.div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <div className="absolute top-2 left-2 z-20 flex flex-col items-start gap-1 pointer-events-none">
                                <AnimatePresence>
                                  {isImageDownloaded && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.8 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.8 }}
                                      className="px-2 py-1 rounded-full bg-black/50 backdrop-blur-md border border-emerald-500/30 flex items-center gap-1 shadow-sm font-sans"
                                    >
                                      <Download className="w-3 h-3 text-emerald-400" />
                                      <span className="text-[9px] font-bold text-emerald-100 uppercase tracking-wider">
                                        已下载
                                      </span>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStarGeneration(wsId, gen.id);
                                }}
                                className={`absolute top-2 right-2 z-20 p-1.5 rounded-full backdrop-blur-[2px] transition-all duration-300 ${
                                  gen.isStarred
                                    ? "bg-black/40 text-yellow-500 scale-100 opacity-100"
                                    : "bg-black/20 text-white/80 opacity-0 group-hover/img:opacity-100 hover:bg-black/50 scale-95 hover:scale-100 drop-shadow-md"
                                }`}
                                title={gen.isStarred ? "取消备选" : "设为备选"}
                              >
                                <Star
                                  className={`w-4 h-4 ${gen.isStarred ? "fill-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.4)]" : ""}`}
                                />
                              </button>

                              <div className="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-between gap-1.5 bg-transparent opacity-0 group-hover/img:opacity-100 transition-opacity duration-250 select-none">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyImageToClipboard?.(url);
                                  }}
                                  className="flex-1 py-1 px-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                                  title="复制原图"
                                >
                                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                                  <span>复制</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadImage(
                                      url,
                                      gen.prompt,
                                      wsId,
                                      gen.id,
                                    );
                                  }}
                                  className="flex-1 py-1 px-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                                  title="下载高清原图"
                                >
                                  <Download className="w-3.5 h-3.5 text-slate-400" />
                                  <span>下载</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWorkspaces((prev) =>
                                      prev.map((w) => {
                                        if (w.id === wsId) {
                                          if (w.refImages.length >= 16) {
                                            setToast("参考图最多仅支持 16 张");
                                            return w;
                                          }
                                          if (
                                            w.refImages.some(
                                              (img) => img.url === url,
                                            )
                                          ) {
                                            setToast("该图已在参考图中");
                                            return w;
                                          }
                                          const nextId = (
                                            Math.max(
                                              ...w.refImages.map(
                                                (img) =>
                                                  parseInt(img.id, 10) || 0,
                                              ),
                                              0,
                                            ) + 1
                                          ).toString();
                                          setToast(
                                            "成功将该图添加至本列参考图区域",
                                          );
                                          return {
                                            ...w,
                                            refImages: [
                                              ...w.refImages,
                                              {
                                                id: nextId,
                                                url,
                                                name: `生成图片_${nextId}.png`,
                                              },
                                            ],
                                          };
                                        }
                                        return w;
                                      }),
                                    );
                                  }}
                                  className="flex-1 py-1 px-1.5 rounded bg-indigo-600 hover:bg-indigo-555 text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                                  title="以此图作为本栏的参考图"
                                >
                                  <Plus className="w-3.5 h-3.5 text-indigo-250" />
                                  <span>作为参考</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const event = new CustomEvent("open-image-editor", { detail: { url } });
                                    window.dispatchEvent(event);
                                  }}
                                  className="flex-1 py-1 px-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-medium flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer"
                                  title="发送到画布并自动打开"
                                >
                                  <Palette className="w-3.5 h-3.5 text-emerald-250" />
                                  <span>发送到画布</span>
                                </button>
                              </div>
                            </LazyImageWrapper>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 mx-4 my-2 bg-slate-950 border border-slate-850 rounded-xl max-h-40 overflow-y-auto text-xs selection:bg-indigo-650/40 select-text">
                      {gen.result?.textValue ? (
                        <p className="font-mono text-emerald-400 leading-relaxed whitespace-pre-wrap">
                          {gen.result.textValue}
                        </p>
                      ) : (
                        <div className="text-slate-500 italic text-[10px] py-1 text-center font-mono animate-pulse">
                          未直接识别出图像，可能是空回复。RAW：
                          {JSON.stringify(gen.result).slice(0, 300)}...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Prompts info section */}
              <div className="space-y-2 p-4 pt-3 group/prompt relative">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="text-[13px] text-slate-200 leading-relaxed font-sans font-medium select-text selection:bg-indigo-600/30 line-clamp-2 break-words border-l-2 border-slate-700/80 pl-3 flex-1"
                    title={gen.prompt}
                  >
                    {gen.prompt.replace(/@(\d+)/g, (match, idStr) => {
                      const refItem = gen.refImages?.find((img) => 
                        typeof img !== "string" && img.id === idStr
                      );
                      if (refItem && typeof refItem !== "string") {
                        const fileName =
                          refItem.name || `参考图_${refItem.id}.png`;
                        const cleanName = fileName.replace(/\.[^/.]+$/, "");
                        const displayName =
                          cleanName.length > 15
                            ? cleanName.slice(0, 15) + "..."
                            : cleanName;
                        return `@${displayName}`;
                      }
                      return match;
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyPromptToClipboard(gen.prompt)}
                    className="text-slate-500 hover:text-slate-350 hover:bg-slate-900 p-1 rounded transition-all cursor-pointer self-start opacity-0 group-hover/prompt:opacity-100 focus:opacity-100 flex-shrink-0"
                    title="仅复制提示词到剪贴板"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pl-3 pt-0.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                    <span>{gen.timestamp}</span>
                    {gen.latency && (
                      <>
                        <span className="text-slate-700">•</span>
                        <span className="text-emerald-500/90 font-bold">
                          {formatDuration(gen.latency / 1000)} 完成
                        </span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmGen({ trackId: wsId, genId: gen.id });
                    }}
                    className="text-slate-500 hover:text-rose-400 hover:bg-slate-900 p-1 rounded transition-all cursor-pointer opacity-0 group-hover/prompt:opacity-100 focus:opacity-100 relative z-10 flex-shrink-0"
                    title="删除此项"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* OVERLAY for Delete Gen Confirm */}
              {deleteConfirmGen?.genId === gen.id && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-2 animate-in fade-in duration-150">
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl flex flex-col items-center text-center space-y-3 w-[85%] max-w-[200px] animate-in zoom-in-95 duration-150">
                    <div className="w-8 h-8 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500">
                      <Trash2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-slate-200 text-sm font-medium mb-1">
                        确定删除此项？
                      </h3>
                      <p className="text-slate-400 text-xs leading-relaxed">
                        不可恢复
                      </p>
                    </div>
                    <div className="flex gap-2 pt-2 w-full">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmGen(null);
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white text-xs font-medium transition-colors cursor-pointer"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          executeDeleteGenItem(gen.id);
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-rose-600/90 text-white hover:bg-rose-500 text-xs font-medium transition-colors cursor-pointer"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    );
  },
  areEqual,
);
