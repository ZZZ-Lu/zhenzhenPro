import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  GripVertical,
  Plus,
  Trash2,
  Edit3,
  Check,
  Copy,
  ClipboardPaste,
  Eraser,
  ChevronDown,
  ImagePlus,
  X,
  Play,
  RefreshCw,
  Star,
  Download,
  Sparkles,
  GitCompare,
  Undo,
  History,
  XCircle,
} from "lucide-react";
import { ImageWorkspace, GenerationItem, ImageReference } from "../types";
import { SmartImage } from "./SmartImage";
import { LazyImageWrapper, useIsScrolling } from "./LazyImageWrapper";
import RichPromptEditor from "./RichPromptEditor";
import { GenerationsList } from "./GenerationsList";
import { getIndexedDBItem } from "../utils/db";

// Export these local helpers if they are not already accessible from App.tsx
import {
  getAspectRatioParams,
  getAspectRatioValue,
  debouncedSetItem,
} from "../App";

// Global in-memory cache for track vertical scroll positions (0 latency restoration)
const trackScrollMemory = new Map<string, number>();

export interface TrackColumnProps {
  ws: ImageWorkspace;
  trIdx: number;
  theme: string;
  isViewportShowing: boolean;
  activeProjectId: string | null;

  // Track status states
  draggedTrackId: string | null;
  setDraggedTrackId: (id: string | null) => void;
  focusedTrackId: string | null;
  setFocusedTrackId: (id: string | null) => void;
  setDraggableId: (id: string | null) => void;

  // Renaming
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  renameValue: string;
  setRenameValue: (val: string) => void;
  triggerRenameMode: (trackId: string, currentName: string) => void;
  saveRenameAction: (trackId: string) => void;

  // Columns & track list actions
  updateTrackField: (
    trackId: string,
    field: keyof ImageWorkspace,
    value: any,
  ) => void;
  deleteTrack: (trackId: string) => void;
  confirmDeleteTrack: () => void;
  deleteConfirmTrackId: string | null;
  setDeleteConfirmTrackId: (id: string | null) => void;

  // Clear/Paste track overrides confirmation
  clearConfirmTrackId: string | null;
  setClearConfirmTrackId: (id: string | null) => void;
  handleClearTrackConfig: (trackId: string, force?: boolean) => void;

  pasteConfirmTrackId: string | null;
  setPasteConfirmTrackId: (id: string | null) => void;
  handlePasteConfig: (trackId: string, force?: boolean) => void;
  justCopiedColId: string | null;
  justPastedColId: string | null;
  handleCopyConfig: (ws: ImageWorkspace) => void;
  copiedConfig: any;

  // Restore rollback history states
  restoreConfirm: { trackId: string; historyItem: GenerationItem } | null;
  setRestoreConfirm: (
    val: { trackId: string; historyItem: GenerationItem } | null,
  ) => void;
  restoreRollbackParams: (
    trackId: string,
    historyItem: GenerationItem,
    force?: boolean,
  ) => void;

  // Upload actions
  handleTrackDropFile: (trackId: string, e: React.DragEvent) => void;
  uploadFilesToTrack: (trackId: string, files: FileList | File[]) => void;
  removeRefImage: (trackId: string, indexToRemove: number) => void;

  // Web Reference URLs popup
  trackUrlOpen: Record<string, boolean>;
  setTrackUrlOpen: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  trackUrlInput: Record<string, string>;
  setTrackUrlInput: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  addUrlReferenceToTrack: (trackId: string) => void;

  // Floating previews
  hoveredPreviewRefImg: { trackId: string; url: string | Blob } | null;
  setHoveredPreviewRefImg: (
    val: { trackId: string; url: string | Blob } | null,
  ) => void;

  // Holding run parameters
  holdingEnterTrackId: string | null;
  setHoldingEnterTrackId: (id: string | null) => void;
  enterHoldProgress: number;
  setEnterHoldProgress: (prog: number) => void;

  // Generation executions
  runTrackGeneration: (trackId: string, retryGenId?: string) => Promise<void>;
  setWorkspaces: React.Dispatch<React.SetStateAction<ImageWorkspace[]>>;
  columnVariants: any;

  // Filters
  trackFilters: Record<string, string>;
  setTrackFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;

  // Card sub-actions
  setCompareMode: (comp: any) => void;
  compareMode: any;
  setLightboxImage: (img: any) => void;
  lightboxImage: any;
  toggleStarGeneration: (trackId: string, genId: string) => void;
  handleDownloadImage: (
    url: string,
    prompt: string,
    trackId: string,
    genId: string,
  ) => void;
  handleCopyImageToClipboard: (url: string | Blob) => void;
  deleteConfirmGen: { trackId: string; genId: string } | null;
  setDeleteConfirmGen: (val: { trackId: string; genId: string } | null) => void;
  dragOverImageId: string | null;
  setDragOverImageId: (id: string | null) => void;
  draggedImageItem: any;
  setDraggedImageItem: (item: any) => void;
  hoveredImageItemRef: React.MutableRefObject<any>;
  draggedImageItemRef: React.MutableRefObject<any>;
  dragLeaveTimerRef: React.MutableRefObject<any>;
  handleCopyPromptToClipboard: (text: string) => void;
  hoveredGenRef: any;
  setHoveredGenRef: (val: any) => void;
  handleCopyGenConfig: (gen: GenerationItem, label: string) => void;
  justCopiedCardGenId: string | null;
  setToast: (val: string) => void;
}

// Preset constraints
const imageModelsPreset = [
  { value: "gpt-image-2-2in1", label: "gpt-image-2-2in1" },
  { value: "gpt-image-2-low", label: "gpt-image-2-low" },
  { value: "gpt-image-2-medium", label: "gpt-image-2-medium" },
  { value: "gpt-image-2-high", label: "gpt-image-2-high" },
  { value: "gpt-image-2-all", label: "gpt-image-2-all (中英双语高级强化)" },
  { value: "gpt-image-2.5-flare", label: "gpt-image-2.5-flare" },
  { value: "gpt-image-2.5-sunburst", label: "gpt-image-2.5-sunburst" },
  { value: "nano-banana-pro", label: "nano-banana-pro (极速多分辨率)" },
  { value: "gemini-3.1-flash-image-preview", label: "nano-banana-2" },
  {
    value: "doubao-seedream-4-0-250828",
    label: "doubao-seedream-4-0-250828 (即梦4)",
  },
  {
    value: "seedream5.0Pro",
    label: "seedream5.0Pro",
  },
  {
    value: "Qwen_Image_3.0Pro",
    label: "Qwen_Image_3.0Pro",
  },
  {
    value: "d_Qwen_Image_3.0Pro",
    label: "d_Qwen_Image_3.0Pro (直接扩写)",
  },
  {
    value: "a_Qwen_Image_3.0Pro",
    label: "a_Qwen_Image_3.0Pro (Agent深度扩写)",
  },
  {
    value: "qwen-image-2.1-pro",
    label: "qwen-image-2.1-pro",
  },
];

const aspectRatios = [
  { value: "Auto", label: "Auto" },
  { value: "1:1", label: "1:1" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "5:4", label: "5:4" },
  { value: "4:5", label: "4:5" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "2:1", label: "2:1" },
  { value: "1:2", label: "1:2" },
  { value: "21:9", label: "21:9" },
  { value: "9:21", label: "9:21" },
];

const TrackColumnComponent: React.FC<TrackColumnProps> = ({
  ws,
  trIdx,
  theme,
  isViewportShowing,
  activeProjectId,
  draggedTrackId,
  setDraggedTrackId,
  focusedTrackId,
  setFocusedTrackId,
  setDraggableId,
  renamingId,
  setRenamingId,
  renameValue,
  setRenameValue,
  triggerRenameMode,
  saveRenameAction,
  updateTrackField,
  deleteTrack,
  confirmDeleteTrack,
  deleteConfirmTrackId,
  setDeleteConfirmTrackId,
  clearConfirmTrackId,
  setClearConfirmTrackId,
  handleClearTrackConfig,
  pasteConfirmTrackId,
  setPasteConfirmTrackId,
  handlePasteConfig,
  justCopiedColId,
  justPastedColId,
  handleCopyConfig,
  copiedConfig,
  restoreConfirm,
  setRestoreConfirm,
  restoreRollbackParams,
  handleTrackDropFile,
  uploadFilesToTrack,
  removeRefImage,
  trackUrlOpen,
  setTrackUrlOpen,
  trackUrlInput,
  setTrackUrlInput,
  addUrlReferenceToTrack,
  hoveredPreviewRefImg,
  setHoveredPreviewRefImg,
  holdingEnterTrackId,
  setHoldingEnterTrackId,
  enterHoldProgress,
  setEnterHoldProgress,
  runTrackGeneration,
  setWorkspaces,
  columnVariants,
  trackFilters,
  setTrackFilters,
  setCompareMode,
  compareMode,
  setLightboxImage,
  lightboxImage,
  toggleStarGeneration,
  handleDownloadImage,
  handleCopyImageToClipboard,
  deleteConfirmGen,
  setDeleteConfirmGen,
  dragOverImageId,
  setDragOverImageId,
  draggedImageItem,
  setDraggedImageItem,
  hoveredImageItemRef,
  draggedImageItemRef,
  dragLeaveTimerRef,
  handleCopyPromptToClipboard,
  hoveredGenRef,
  setHoveredGenRef,
  handleCopyGenConfig,
  justCopiedCardGenId,
  setToast,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const scrollKey = `img_studio_track_scroll_${activeProjectId || "default"}_${ws.id}`;

  // ---------------------------------------------------------------------------
  // 1. 高频滚动监听：即时记录至内存 Map，同时防抖备份写入 IndexedDB
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isViewportShowing) return;

    const handleScrollNative = () => {
      const st = el.scrollTop;
      trackScrollMemory.set(scrollKey, st);
      debouncedSetItem(scrollKey, st.toString());
    };

    el.addEventListener("scroll", handleScrollNative, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScrollNative);
    };
  }, [scrollKey, isViewportShowing]);

  // ---------------------------------------------------------------------------
  // 2. 竖向滚动位置还原：列挂载或重新进入视口时自动恢复原有的 scrollTop
  // ---------------------------------------------------------------------------
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isViewportShowing) return;

    const applyScroll = (targetTop: number) => {
      if (el && targetTop > 0) {
        el.scrollTop = targetTop;
      }
    };

    // 1) 优先从内存 Map 毫秒级同步还原
    const cachedPos = trackScrollMemory.get(scrollKey);
    if (cachedPos !== undefined) {
      applyScroll(cachedPos);
    } else {
      // 2) 内存无记录时从 IndexedDB 异步读取
      getIndexedDBItem<string>(scrollKey).then((val) => {
        if (val) {
          const parsed = parseFloat(val);
          if (!isNaN(parsed) && parsed > 0) {
            trackScrollMemory.set(scrollKey, parsed);
            applyScroll(parsed);
          }
        }
      });
    }

    // 3) 防范动态内容加载导致的延迟，在后续微帧二次校验并对齐滚动位置
    const restoreTarget = cachedPos !== undefined ? cachedPos : 0;
    if (restoreTarget > 0) {
      const t1 = setTimeout(() => {
        if (el && Math.abs(el.scrollTop - restoreTarget) > 2) {
          el.scrollTop = restoreTarget;
        }
      }, 50);

      const t2 = setTimeout(() => {
        if (el && Math.abs(el.scrollTop - restoreTarget) > 2) {
          el.scrollTop = restoreTarget;
        }
      }, 150);

      const t3 = setTimeout(() => {
        if (el && Math.abs(el.scrollTop - restoreTarget) > 2) {
          el.scrollTop = restoreTarget;
        }
      }, 300);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [scrollKey, isViewportShowing]);

  const isCurrentTrackGenerating = ws.generations.some(
    (g) => g.status === "generating",
  );
  const hasHistory = ws.generations.length > 0;

  // ---------------------------------------------------------------------------
  // 方案 4：关键操作的任务切片 (Time Slicing via requestAnimationFrame)
  // ---------------------------------------------------------------------------
  const executeClearErrors = () => {
    requestAnimationFrame(() => {
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === ws.id) {
            return {
              ...w,
              generations: w.generations.filter((g) => g.status !== "error"),
            };
          }
          return w;
        }),
      );
    });
  };

  const handleApplyConfigSlices = (gen: GenerationItem) => {
    requestAnimationFrame(() => {
      restoreRollbackParams(ws.id, gen);
    });
  };

  const executeDeleteGenItem = (genId: string) => {
    requestAnimationFrame(() => {
      setWorkspaces((prev) =>
        prev.map((w) => {
          if (w.id === ws.id) {
            return {
              ...w,
              generations: w.generations.filter((g) => g.id !== genId),
            };
          }
          return w;
        }),
      );
      setDeleteConfirmGen(null);
    });
  };

  const executeClearTrackConfigAndReset = () => {
    requestAnimationFrame(() => {
      handleClearTrackConfig(clearConfirmTrackId || ws.id, true);
    });
  };

  const executePasteConfigAndReset = () => {
    requestAnimationFrame(() => {
      handlePasteConfig(pasteConfirmTrackId || ws.id, true);
    });
  };

  const executeRollbackParamsAndReset = () => {
    requestAnimationFrame(() => {
      if (restoreConfirm) {
        restoreRollbackParams(
          restoreConfirm.trackId,
          restoreConfirm.historyItem,
          true,
        );
      }
    });
  };

  const columnRootRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={columnRootRef}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ws.id);
        setDraggedTrackId(ws.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (draggedTrackId && draggedTrackId !== ws.id) {
          setWorkspaces((workspaces) => {
            const dragIdx = workspaces.findIndex(
              (w) => w.id === draggedTrackId,
            );
            const hoverIdx = workspaces.findIndex((w) => w.id === ws.id);
            if (dragIdx !== -1 && hoverIdx !== -1) {
              const newWorkspaces = [...workspaces];
              const [removed] = newWorkspaces.splice(dragIdx, 1);
              newWorkspaces.splice(hoverIdx, 0, removed);
              return newWorkspaces;
            }
            return workspaces;
          });
        }
      }}
      onDragEnd={() => {
        setDraggedTrackId(null);
        setDraggableId(null);
      }}
      id={`track-container-${ws.id}`}
      data-track-container={ws.id}
      data-is-generating={ws.generations.some((g) => g.status === "generating")}
      className={`w-[88vw] min-w-[325px] h-full min-h-0 flex-shrink-0 flex flex-col border transition-colors duration-200 rounded-2xl overflow-hidden shadow-xl relative ${
        theme === "light"
          ? "bg-white border-slate-200/90 text-slate-800 shadow-lg"
          : "bg-slate-900 border-slate-800 shadow-xl text-slate-100"
      } ${
        ws.columnWidth === "wide"
          ? "md:w-[840px] md:max-w-[840px]"
          : ws.columnWidth === "medium"
            ? "md:w-[650px] md:max-w-[650px]"
            : "md:w-[460px] md:max-w-[460px]"
      } ${
        draggedTrackId === ws.id
          ? "border-indigo-500 bg-slate-900/60 opacity-40 shadow-inner"
          : focusedTrackId === ws.id
            ? theme === "light"
              ? "border-indigo-600 z-10 shadow-[0_12px_36px_rgba(79,70,229,0.22)]"
              : "border-indigo-500 z-10 shadow-[0_12px_36px_rgba(99,102,241,0.28)]"
            : theme === "light"
              ? "border-slate-200"
              : "border-slate-800"
      }`}
      style={{
        outline:
          focusedTrackId === ws.id
            ? theme === "light"
              ? "3.5px solid #4f46e5"
              : "3.5px solid #6366f1"
            : "none",
        outlineOffset: focusedTrackId === ws.id ? "2px" : "0px",
      }}
      onMouseEnter={() => {
        setFocusedTrackId(ws.id);
        try {
          window.focus();
        } catch (err) {}
      }}
      onMouseMove={() => {
        if (focusedTrackId !== ws.id) {
          setFocusedTrackId(ws.id);
        }
        try {
          window.focus();
        } catch (err) {}
      }}
      onMouseLeave={() => setFocusedTrackId(null)}
    >
      {/* -----------------------------------------------------------------------
          方案 3：精简或推迟 Framer Motion 复杂的运动计算
          用简单的 class 淡入淡出动画或高度优化 layout 代替嵌套的 AnimatePresence 阻击卡顿
          ----------------------------------------------------------------------- */}
      {/* Deletion Confirm Overlay */}
      {deleteConfirmTrackId === ws.id && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-[290px] shadow-2xl relative animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-11 h-11 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-450">
                <Trash2 className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  确定删除该列？
                </h3>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  此操作将永久移除该生的图列 “
                  <span className="text-slate-200 font-semibold">
                    {ws.name}
                  </span>
                  ” 及其对应的所有历史绘图结果，该操作无法撤销。
                </p>
              </div>
              <div className="flex gap-3 w-full pt-1">
                <button
                  onClick={() => setDeleteConfirmTrackId(null)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    confirmDeleteTrack();
                  }}
                  className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  确认删除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Config Overlay */}
      {clearConfirmTrackId === ws.id && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-[290px] shadow-2xl relative animate-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-11 h-11 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                <Eraser className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  确定要清空配置吗？
                </h3>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  当前列 “
                  <span className="text-slate-200 font-semibold">
                    {ws.name}
                  </span>
                  ” 的提示词和参考图配置将被完全清除，此操作无法撤销。
                </p>
              </div>
              <div className="flex gap-3 w-full pt-1">
                <button
                  onClick={() => setClearConfirmTrackId(null)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={executeClearTrackConfigAndReset}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  确认清空
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paste Config Override Overlay */}
      {pasteConfirmTrackId === ws.id && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-[290px] shadow-2xl relative animate-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-11 h-11 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400">
                <ClipboardPaste className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  确定覆盖该列配置？
                </h3>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  当前列 “
                  <span className="text-slate-200 font-semibold">
                    {ws.name}
                  </span>
                  ”
                  已经编辑了提示词或参考图。粘贴操作将完全覆盖当前列的配置，此操作无法撤销。
                </p>
              </div>
              <div className="flex gap-3 w-full pt-1">
                <button
                  onClick={() => setPasteConfirmTrackId(null)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={executePasteConfigAndReset}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  确认覆盖
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore History Params Setup Confirmation Overlay */}
      {restoreConfirm && restoreConfirm.trackId === ws.id && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-[290px] shadow-2xl relative animate-in zoom-in-95 duration-150">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-11 h-11 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-400">
                <History className="w-5.5 h-5.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">
                  确定应用历史配置？
                </h3>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                  当前列 “
                  <span className="text-slate-200 font-semibold">
                    {ws.name}
                  </span>
                  ”
                  已经编辑了提示词或参考图。应用历史配置将完全覆盖当前列的配置，此操作无法撤销。
                </p>
              </div>
              <div className="flex gap-3 w-full pt-1">
                <button
                  onClick={() => setRestoreConfirm(null)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={executeRollbackParamsAndReset}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  确认覆盖
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- NATIVE SCROLL VIEWPORT INNER ----------------- */}
      <div
        id={`track-scroll-container-${ws.id}`}
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto scrollbar-thin flex flex-col min-h-0"
        onScroll={() => {
          window.dispatchEvent(new CustomEvent("check-offscreen"));
        }}
      >
        {/* 1. HEADER (TRACK NAME AND QUICK SETTINGS CONTROLS) */}
        <div className="sticky top-0 z-30 pt-4 px-4 pb-2.5 bg-slate-900 select-none flex-shrink-0 border-b border-slate-800/80 shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-1">
              {/* Grab Handle */}
              <div
                draggable={false}
                onMouseDown={() => setDraggableId(ws.id)}
                onMouseUp={() => setDraggableId(null)}
                onTouchStart={() => setDraggableId(ws.id)}
                onTouchEnd={() => setDraggableId(null)}
                className="p-1 text-slate-500 hover:text-slate-350 hover:bg-slate-800 rounded-lg transition-all cursor-grab active:cursor-grabbing flex items-center justify-center flex-shrink-0"
                title="按住拖动以重新排列表列"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>

              <div className="flex-1 min-w-0">
                {renamingId === ws.id ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => saveRenameAction(ws.id)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && saveRenameAction(ws.id)
                    }
                    autoFocus
                    className="w-full px-2 py-1 bg-slate-950 border border-indigo-500 rounded font-semibold text-xs text-white focus:outline-none"
                  />
                ) : (
                  <div
                    className="flex items-center gap-1.5 cursor-pointer group"
                    onClick={() => triggerRenameMode(ws.id, ws.name)}
                    title="点击修改此列名称"
                  >
                    <span className="font-bold text-base text-slate-350 truncate group-hover:text-indigo-400 transition-colors">
                      {ws.name}
                    </span>
                    <Edit3 className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </div>
                )}
              </div>
            </div>

            {/* Top control bar inside Track */}
            <div className="flex items-center gap-1.5">
              {/* Column Width S/M/L */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800/80 mr-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    updateTrackField(ws.id, "columnWidth", "narrow")
                  }
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${
                    !ws.columnWidth || ws.columnWidth === "narrow"
                      ? "bg-slate-800 text-indigo-400 font-extrabold"
                      : "text-slate-500 hover:text-slate-350"
                  }`}
                  title="窄列宽 (S) 460px"
                >
                  S
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateTrackField(ws.id, "columnWidth", "medium")
                  }
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${
                    ws.columnWidth === "medium"
                      ? "bg-slate-800 text-indigo-400 font-extrabold"
                      : "text-slate-500 hover:text-slate-350"
                  }`}
                  title="中列宽 (M) 650px"
                >
                  M
                </button>
                <button
                  type="button"
                  onClick={() => updateTrackField(ws.id, "columnWidth", "wide")}
                  className={`px-1.5 py-0.5 text-[9px] font-bold rounded transition-all cursor-pointer ${
                    ws.columnWidth === "wide"
                      ? "bg-slate-800 text-indigo-400 font-extrabold"
                      : "text-slate-500 hover:text-slate-350"
                  }`}
                  title="宽列宽 (L) 840px"
                >
                  L
                </button>
              </div>

              <div className="w-[1px] h-4 bg-slate-800 mx-1"></div>

              {/* Copy Config */}
              <button
                type="button"
                onClick={() => handleCopyConfig(ws)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center animate-fadeIn ${
                  justCopiedColId === ws.id
                    ? "text-emerald-400 bg-emerald-500/10"
                    : "text-slate-500 hover:text-indigo-400 hover:bg-slate-800"
                }`}
                title="复制配置 (模型、比例、参考图和提示词)"
              >
                {justCopiedColId === ws.id ? (
                  <Check className="w-3.5 h-3.5 animate-scaleUp" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Paste Config */}
              <button
                type="button"
                onClick={() => handlePasteConfig(ws.id)}
                disabled={!copiedConfig}
                className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${
                  justPastedColId === ws.id
                    ? "text-emerald-400 bg-emerald-500/10 cursor-default animate-pulse"
                    : copiedConfig
                      ? "text-slate-500 hover:text-emerald-400 hover:bg-slate-800 cursor-pointer"
                      : "text-slate-800 cursor-not-allowed opacity-30"
                }`}
                title={
                  justPastedColId === ws.id
                    ? "已成功粘贴配置！"
                    : copiedConfig
                      ? "粘贴已复制的配置到此列"
                      : "粘贴配置 (尚未复制任何配置)"
                }
              >
                {justPastedColId === ws.id ? (
                  <Check className="w-3.5 h-3.5 animate-scaleUp" />
                ) : (
                  <ClipboardPaste className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Clear Config */}
              <button
                type="button"
                onClick={() => handleClearTrackConfig(ws.id)}
                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-all cursor-pointer flex items-center justify-center"
                title="清空本列配置 (清除当前提示词和参考图)"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>

              {/* Delete Track */}
              <button
                type="button"
                onClick={() => deleteTrack(ws.id)}
                className="p-1.5 rounded-lg transition-all text-slate-500 hover:text-rose-400 hover:bg-slate-800 cursor-pointer flex items-center justify-center"
                title="删除本列"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. CONFIG FORM SETTINGS */}
        <div className="p-4 flex-shrink-0 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            {/* Model Select */}
            <div className="relative">
              <select
                value={ws.imageModel}
                onChange={(e) => {
                  const modelVal = e.target.value;
                  updateTrackField(ws.id, "imageModel", modelVal);
                  if (modelVal === "nano-banana-pro-2k") {
                    updateTrackField(ws.id, "imageResolution", "2k");
                  } else if (modelVal === "gpt-image-2-2in1") {
                    updateTrackField(ws.id, "imageResolution", "1k");
                  }
                }}
                className="w-full pl-2.5 pr-7 py-1.5 bg-slate-950 border border-slate-800 text-slate-350 hover:text-slate-200 font-semibold rounded-lg text-xs focus:outline-none focus:border-slate-700 appearance-none cursor-pointer transition-colors"
              >
                {imageModelsPreset.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label.split(" ")[0]}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute top-1/2 -translate-y-1/2 right-2 pointer-events-none" />
            </div>

            {/* Ratio aspect & Res */}
            <div className="grid grid-cols-2 gap-1.5">
              {/* Size Select */}
              <div className="relative">
                <select
                  value={ws.imageSize}
                  onChange={(e) =>
                    updateTrackField(ws.id, "imageSize", e.target.value)
                  }
                  className="w-full pl-2 pr-5 py-1.5 bg-slate-950 border border-slate-800 text-slate-350 hover:text-slate-200 font-semibold rounded-lg text-[10px] focus:outline-none focus:border-slate-700 appearance-none cursor-pointer transition-colors text-ellipsis overflow-hidden whitespace-nowrap"
                >
                  {aspectRatios.map((ar) => (
                    <option key={ar.value} value={ar.value}>
                      {ar.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 text-slate-500 absolute top-1/2 -translate-y-1/2 right-1.5 pointer-events-none" />
              </div>

              {/* Resolution Select */}
              <div className="relative">
                <select
                  value={ws.imageResolution || "1k"}
                  onChange={(e) =>
                    updateTrackField(ws.id, "imageResolution", e.target.value)
                  }
                  className="w-full pl-2 pr-5 py-1.5 bg-slate-950 border border-slate-800 text-slate-350 hover:text-slate-200 font-semibold rounded-lg text-[10px] focus:outline-none focus:border-slate-700 appearance-none cursor-pointer transition-colors"
                >
                  <option
                    value="1k"
                    disabled={ws.imageModel === "nano-banana-pro-2k"}
                  >
                    1K
                  </option>
                  {ws.imageModel !== "gpt-image-2-2in1" && (
                    <>
                      <option value="2k">2K</option>
                      <option value="4k">4K</option>
                    </>
                  )}
                </select>
                <ChevronDown className="w-3 text-slate-500 absolute top-1/2 -translate-y-1/2 right-1.5 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* 3. INPUT AREA & PREVIEW */}
        <div className="pb-1 px-4 pt-1.5 bg-slate-900 flex-shrink-0 space-y-3 z-10">
          <div
            className="border border-slate-800 bg-slate-950 rounded-xl p-2.5 transition-all relative group/ref hover:border-indigo-500/30 shadow-inner"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleTrackDropFile(ws.id, e);
            }}
          >
            <input
              id={`ref-file-input-${ws.id}`}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  uploadFilesToTrack(ws.id, e.target.files);
                }
              }}
            />

            {ws.refImages.length === 0 ? (
              <div
                className="flex items-center justify-center gap-2.5 py-2.5 cursor-pointer select-none"
                onClick={() => {
                  const inputEl = document.getElementById(
                    `ref-file-input-${ws.id}`,
                  );
                  if (inputEl) inputEl.click();
                }}
              >
                <div
                  className="p-2.5 bg-white text-slate-950 transition-colors flex items-center justify-center"
                  style={{
                    clipPath: "url(#squircle-clip)",
                    width: "38px",
                    height: "38px",
                  }}
                >
                  <ImagePlus className="w-4.5 h-4.5" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-300 group-hover/ref:text-slate-200 transition-colors">
                    拖拽图片到此，或点击/粘贴添加参考图
                  </p>
                  <p className="text-[10px] text-slate-500 font-medium mt-0.5 animate-pulse">
                    支持将生成的画面直接拖入此处
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 items-center">
                {ws.refImages.map((refImg, i_idx) => {
                  const cleanName = (
                    refImg.name || `参考图_${refImg.id}`
                  ).replace(/\.[^/.]+$/, "");
                  const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
                  let displayName = hasChinese
                    ? cleanName.length > 10
                      ? cleanName.slice(0, 10) + "..."
                      : cleanName
                    : `参考${i_idx + 1}`;

                  return (
                    <div
                      key={refImg.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.effectAllowed = "copy";
                        const urlStr = typeof refImg.url === "string" ? refImg.url : "";
                        e.dataTransfer.setData("image-url", urlStr);
                        e.dataTransfer.setData("text/plain", urlStr);

                        const itemData = {
                          url: refImg.url,
                          prompt: refImg.name || displayName,
                          gen: {} as any,
                          trackId: ws.id,
                          isFromRef: true,
                        };
                        if (setDraggedImageItem) {
                          setDraggedImageItem(itemData);
                        }
                        if (draggedImageItemRef) {
                          draggedImageItemRef.current = itemData;
                        }
                      }}
                      onDragEnd={() => {
                        if (setDraggedImageItem) {
                          setDraggedImageItem(null);
                        }
                        if (draggedImageItemRef) {
                          draggedImageItemRef.current = null;
                        }
                      }}
                      className="w-14 h-14 bg-slate-900 overflow-hidden relative group/item flex-shrink-0 animate-fadeIn cursor-grab active:cursor-grabbing transition-all select-none"
                      style={{
                        clipPath: "url(#squircle-clip)",
                      }}
                      onMouseEnter={() =>
                        setHoveredPreviewRefImg({
                          trackId: ws.id,
                          url: refImg.url,
                        })
                      }
                      onMouseLeave={() => setHoveredPreviewRefImg(null)}
                    >
                      <SmartImage
                        src={refImg.thumbnail || refImg.url}
                        alt={`reference ${refImg.id}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                      <div className="absolute top-1 left-1 max-w-[calc(111%-8px)] truncate bg-indigo-600/90 font-mono text-[9px] text-white font-extrabold px-1 rounded shadow-sm z-10 scale-90 origin-top-left flex items-center gap-0.5 pointer-events-none">
                        @{displayName}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRefImage(ws.id, i_idx);
                        }}
                        className="absolute top-1 right-1 w-3.5 h-3.5 p-0 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white flex items-center justify-center rounded-full opacity-0 group-hover/item:opacity-100 transition-all z-20 shadow-md border border-rose-500/20 cursor-pointer"
                        title="删除此参考图"
                      >
                        <X className="w-2 h-2 text-white stroke-[3]" />
                      </button>
                    </div>
                  );
                })}

                {ws.refImages.length < 16 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const inputEl = document.getElementById(
                        `ref-file-input-${ws.id}`,
                      );
                      if (inputEl) inputEl.click();
                    }}
                    className="w-14 h-14 bg-white hover:bg-slate-200 text-slate-950 flex items-center justify-center transition-all cursor-pointer"
                    style={{
                      clipPath: "url(#squircle-clip)",
                    }}
                    title="点击添加更多参考图"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}

                <div className="ml-auto pl-1">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    {ws.refImages.length}/16 个参考
                  </span>
                </div>
              </div>
            )}
          </div>

          {trackUrlOpen[ws.id] && (
            <div className="p-2 bg-slate-950 rounded-xl border border-slate-850 flex gap-1.5 items-center animate-slideUp">
              <input
                type="text"
                value={trackUrlInput[ws.id] || ""}
                onChange={(e) =>
                  setTrackUrlInput((prev) => ({
                    ...prev,
                    [ws.id]: e.target.value,
                  }))
                }
                onKeyDown={(e) =>
                  e.key === "Enter" && addUrlReferenceToTrack(ws.id)
                }
                placeholder="粘贴网络图片URL(可作垫图/风格迁徙)..."
                className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded outline-none text-slate-200"
              />
              <button
                type="button"
                onClick={() => addUrlReferenceToTrack(ws.id)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-550 font-bold text-white rounded text-xs animate-pulse"
              >
                确认
              </button>
              <button
                type="button"
                onClick={() =>
                  setTrackUrlOpen((prev) => ({
                    ...prev,
                    [ws.id]: false,
                  }))
                }
                className="p-1 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* SQUIRCLE VISUALIZER EMBEDDED UNDER EDITOR */}
          <div className="relative bg-slate-950 border border-slate-800 focus-within:border-indigo-500/50 rounded-2xl focus-within:ring-1 focus-within:ring-indigo-500/20 shadow-inner transition-all">
            <div
              style={{ containerType: "size" }}
              className="absolute inset-0 flex items-center justify-center select-none pointer-events-none z-0 overflow-hidden rounded-2xl"
            >
              {(() => {
                const ratioInfo = getAspectRatioValue(ws.imageSize);
                const parts = ratioInfo.ratio.split("/");
                const wRatio = parseFloat(parts[0]) || 1;
                const hRatio = parseFloat(parts[1]) || 1;
                const ratioFactor = wRatio / hRatio;
                const isLight = theme === "light";
                const isHolding =
                  holdingEnterTrackId === ws.id && enterHoldProgress > 0;

                return (
                  <div
                    style={{
                      width: `min(100cqw, calc(100cqh * ${ratioFactor}))`,
                      height: `min(100cqh, calc(100cqw / ${ratioFactor}))`,
                    }}
                    className={
                      isLight
                        ? `border-2 transition-all duration-300 rounded-none relative flex items-center justify-center ${
                            isHolding
                              ? "border-solid border-indigo-600/60 bg-indigo-600/[0.15] scale-[1.01] shadow-lg shadow-indigo-600/10"
                              : "border-dashed border-indigo-600/35 bg-indigo-600/[0.045]"
                          }`
                        : `border-2 transition-all duration-300 rounded-none relative flex items-center justify-center ${
                            isHolding
                              ? "border-solid border-indigo-500/70 bg-indigo-500/[0.25] scale-[1.01] shadow-lg shadow-indigo-500/20"
                              : "border-dashed border-indigo-500/45 bg-indigo-500/[0.085]"
                          }`
                    }
                  >
                    <div
                      className={`absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 transition-colors ${
                        isHolding
                          ? isLight
                            ? "border-indigo-600"
                            : "border-indigo-400"
                          : isLight
                            ? "border-indigo-600/55"
                            : "border-indigo-500/65"
                      }`}
                    ></div>
                    <div
                      className={`absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 transition-colors ${
                        isHolding
                          ? isLight
                            ? "border-indigo-600"
                            : "border-indigo-400"
                          : isLight
                            ? "border-indigo-600/55"
                            : "border-indigo-500/65"
                      }`}
                    ></div>
                    <div
                      className={`absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 transition-colors ${
                        isHolding
                          ? isLight
                            ? "border-indigo-600"
                            : "border-indigo-400"
                          : isLight
                            ? "border-indigo-600/55"
                            : "border-indigo-500/65"
                      }`}
                    ></div>
                    <div
                      className={`absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 transition-colors ${
                        isHolding
                          ? isLight
                            ? "border-indigo-600"
                            : "border-indigo-400"
                          : isLight
                            ? "border-indigo-600/55"
                            : "border-indigo-500/65"
                      }`}
                    ></div>

                    <span
                      className={`text-[42px] font-mono font-black tracking-[0.25em] select-none text-center pl-[0.25em] transition-colors ${
                        isHolding
                          ? isLight
                            ? "text-indigo-600/40"
                            : "text-indigo-400/50"
                          : isLight
                            ? "text-indigo-600/18"
                            : "text-indigo-400/22"
                      }`}
                    >
                      {ratioInfo.label}
                    </span>
                  </div>
                );
              })()}
            </div>

            <RichPromptEditor
              id={`prompt-input-${ws.id}`}
              theme={theme as any}
              value={ws.imagePrompt}
              onChange={(val) => updateTrackField(ws.id, "imagePrompt", val)}
              refImages={ws.refImages}
              onPasteImage={(file) => uploadFilesToTrack(ws.id, [file])}
              placeholder="描述画面中的主体、细节、色彩，在何处发生..."
              className="w-full h-[38vh] max-h-[49.4vh] min-h-[10vh] pl-4 pr-4 py-3.5 pb-14 !bg-transparent text-base font-bold text-slate-100 placeholder-slate-400 font-serif outline-none leading-relaxed relative z-10 whitespace-pre-wrap rich-prompt-input"
              onKeyDownEnter={() => runTrackGeneration(ws.id)}
              onEnterHoldChange={(progress) => {
                if (progress > 0) {
                  setHoldingEnterTrackId(ws.id);
                  setEnterHoldProgress(progress);
                } else {
                  setHoldingEnterTrackId(null);
                  setEnterHoldProgress(0);
                }
              }}
            />

            {hoveredPreviewRefImg?.trackId === ws.id && (
              <div className="absolute inset-0 z-20 pointer-events-none p-2 bg-slate-950/80 backdrop-blur-md flex items-center justify-center transition-all animate-in fade-in duration-200">
                <SmartImage
                  src={hoveredPreviewRefImg.url}
                  alt="reference preview"
                  className="w-full h-full object-contain drop-shadow-2xl rounded-xl"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            {/* Trigger Submit Play Button */}
            <div className="absolute bottom-3 right-3 z-20 w-9 h-9 flex items-center justify-center">
              <button
                type="button"
                id={`submit-btn-${ws.id}`}
                onClick={() => runTrackGeneration(ws.id)}
                disabled={isCurrentTrackGenerating || !ws.imagePrompt.trim()}
                className={`w-9 h-9 flex items-center justify-center transition-all relative z-10 ${
                  !ws.imagePrompt.trim()
                    ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                    : isCurrentTrackGenerating
                      ? theme === "light"
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-indigo-950 text-indigo-400"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md cursor-pointer"
                }`}
                style={{
                  clipPath: "url(#squircle-clip)",
                }}
                title="立即生成画面"
              >
                {isCurrentTrackGenerating ? (
                  <RefreshCw
                    className={`w-4.5 h-4.5 animate-spin ${theme === "light" ? "text-white" : ""}`}
                  />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 4. TRACK INLINE TABS */}
        {ws.generations && ws.generations.length > 0 && (
          <div className="px-4 pt-0 pb-1 bg-slate-900 flex items-center gap-1.5 font-sans shrink-0 sticky top-0 z-10 text-[10px] sm:text-xs">
            {(() => {
              const currentFilter = trackFilters[ws.id] || "all";
              const setFilter = (val: "all" | "starred" | "downloaded") =>
                setTrackFilters((prev) => ({
                  ...prev,
                  [ws.id]: val,
                }));

              const allCount = ws.generations.length;
              const starredCount = ws.generations.filter(
                (g) => g.isStarred,
              ).length;
              const downloadedCount = ws.generations.filter(
                (g) => g.downloadedUrls && g.downloadedUrls.length > 0,
              ).length;
              const errorCount = ws.generations.filter(
                (g) => g.status === "error",
              ).length;

              return (
                <>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                      currentFilter === "all"
                        ? "bg-slate-800 text-slate-200 shadow-sm"
                        : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
                    }`}
                  >
                    全部 ({allCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("starred")}
                    className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                      currentFilter === "starred"
                        ? "bg-yellow-500/10 text-yellow-500 shadow-sm border border-yellow-500/10"
                        : "text-slate-500 hover:text-yellow-500/80 hover:bg-slate-800/50"
                    }`}
                  >
                    <Star
                      className={`w-3 h-3 ${currentFilter === "starred" ? "fill-yellow-500" : ""}`}
                    />{" "}
                    备选 ({starredCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("downloaded")}
                    className={`px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 ${
                      currentFilter === "downloaded"
                        ? "bg-emerald-500/10 text-emerald-500 shadow-sm border border-emerald-500/10"
                        : "text-slate-500 hover:text-emerald-500/80 hover:bg-slate-800/50"
                    }`}
                  >
                    <Download className="w-3 h-3" /> 已下载 ({downloadedCount})
                  </button>

                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={executeClearErrors}
                      className="ml-auto px-2 py-1 rounded-md transition-all font-medium flex items-center gap-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80"
                      title="清除本列所有失败的任务"
                    >
                      <Trash2 className="w-3 h-3" /> 清理报错 ({errorCount})
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* 5. SCROLLABLE GENERATIONS HISTORY FLOW */}
        <div className="px-4 pb-4 pt-1 space-y-4 bg-slate-900 flex flex-col font-sans">
          <GenerationsList
            wsId={ws.id}
            generations={ws.generations}
            theme={theme}
            currentFilter={trackFilters[ws.id] || "all"}
            dragOverImageId={dragOverImageId}
            setDragOverImageId={setDragOverImageId}
            setDraggedImageItem={setDraggedImageItem}
            setCompareMode={setCompareMode}
            setLightboxImage={setLightboxImage}
            justCopiedCardGenId={justCopiedCardGenId}
            handleCopyGenConfig={handleCopyGenConfig}
            handleApplyConfigSlices={handleApplyConfigSlices}
            handleCopyPromptToClipboard={handleCopyPromptToClipboard}
            handleDownloadImage={handleDownloadImage}
            handleCopyImageToClipboard={handleCopyImageToClipboard}
            toggleStarGeneration={toggleStarGeneration}
            runTrackGeneration={runTrackGeneration}
            executeDeleteGenItem={executeDeleteGenItem}
            deleteConfirmGen={deleteConfirmGen}
            setDeleteConfirmGen={setDeleteConfirmGen}
            setWorkspaces={setWorkspaces}
            hoveredImageItemRef={hoveredImageItemRef}
            draggedImageItemRef={draggedImageItemRef}
            dragLeaveTimerRef={dragLeaveTimerRef}
            draggedImageItem={draggedImageItem}
            setToast={setToast}
            columnWidth={ws.columnWidth}
          />

          {/* Bottom spacer for list centering scroll fallback */}
          <div className="flex-shrink-0 pointer-events-none h-[50vh]" />
        </div>
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// React.memo logic bypassing global re-renders
// -----------------------------------------------------------------------------
const areEqual = (prevProps: TrackColumnProps, nextProps: TrackColumnProps) => {
  // 1. If workspace data is different, we definitely need to re-render
  if (prevProps.ws !== nextProps.ws) return false;

  // 2. If filtering changed for this track
  const prevFilter = prevProps.trackFilters[prevProps.ws.id] || "all";
  const nextFilter = nextProps.trackFilters[nextProps.ws.id] || "all";
  if (prevFilter !== nextFilter) return false;

  // 3. If focus state of this track or hover focus changed
  const prevIsFocused = prevProps.focusedTrackId === prevProps.ws.id;
  const nextIsFocused = nextProps.focusedTrackId === nextProps.ws.id;
  if (prevIsFocused !== nextIsFocused) return false;

  // 4. If drag state of this track or columns changed
  const prevIsDragged = prevProps.draggedTrackId === prevProps.ws.id;
  const nextIsDragged = nextProps.draggedTrackId === nextProps.ws.id;
  if (prevIsDragged !== nextIsDragged) return false;

  // 5. If renaming state or rename values changed
  const prevIsRenaming = prevProps.renamingId === prevProps.ws.id;
  const nextIsRenaming = nextProps.renamingId === nextProps.ws.id;
  if (prevIsRenaming !== nextIsRenaming) return false;
  if (nextIsRenaming && prevProps.renameValue !== nextProps.renameValue)
    return false;

  // 6. Project activation switches
  if (prevProps.activeProjectId !== nextProps.activeProjectId) return false;
  if (prevProps.isViewportShowing !== nextProps.isViewportShowing) return false;

  // 7. Dynamic confirms related to this track
  const prevTrackConfirmDelete =
    prevProps.deleteConfirmTrackId === prevProps.ws.id;
  const nextTrackConfirmDelete =
    nextProps.deleteConfirmTrackId === nextProps.ws.id;
  if (prevTrackConfirmDelete !== nextTrackConfirmDelete) return false;

  const prevTrackConfirmClear =
    prevProps.clearConfirmTrackId === prevProps.ws.id;
  const nextTrackConfirmClear =
    nextProps.clearConfirmTrackId === nextProps.ws.id;
  if (prevTrackConfirmClear !== nextTrackConfirmClear) return false;

  const prevTrackConfirmPaste =
    prevProps.pasteConfirmTrackId === prevProps.ws.id;
  const nextTrackConfirmPaste =
    nextProps.pasteConfirmTrackId === nextProps.ws.id;
  if (prevTrackConfirmPaste !== nextTrackConfirmPaste) return false;

  const prevHasRestore = prevProps.restoreConfirm?.trackId === prevProps.ws.id;
  const nextHasRestore = nextProps.restoreConfirm?.trackId === nextProps.ws.id;
  if (prevHasRestore !== nextHasRestore) return false;

  const prevHasDeleteGen =
    prevProps.deleteConfirmGen?.trackId === prevProps.ws.id;
  const nextHasDeleteGen =
    nextProps.deleteConfirmGen?.trackId === nextProps.ws.id;
  if (prevHasDeleteGen !== nextHasDeleteGen) return false;

  // 8. Image dragging and custom compare modes over images in this track
  if (prevProps.dragOverImageId !== nextProps.dragOverImageId) {
    const isPrevRelated = prevProps.dragOverImageId?.startsWith(
      `${prevProps.ws.id}-`,
    );
    const isNextRelated = nextProps.dragOverImageId?.startsWith(
      `${nextProps.ws.id}-`,
    );
    if (isPrevRelated || isNextRelated) return false;
  }

  // 9. Floating preview card references
  const prevPreviewActive =
    prevProps.hoveredPreviewRefImg?.trackId === prevProps.ws.id;
  const nextPreviewActive =
    nextProps.hoveredPreviewRefImg?.trackId === nextProps.ws.id;
  if (prevPreviewActive !== nextPreviewActive) return false;

  // 10. Copy-pasted highlights
  const prevIsJustCopied = prevProps.justCopiedColId === prevProps.ws.id;
  const nextIsJustCopied = nextProps.justCopiedColId === nextProps.ws.id;
  if (prevIsJustCopied !== nextIsJustCopied) return false;

  const prevIsJustPasted = prevProps.justPastedColId === prevProps.ws.id;
  const nextIsJustPasted = nextProps.justPastedColId === nextProps.ws.id;
  if (prevIsJustPasted !== nextIsJustPasted) return false;

  // 11. Custom models preset config - only re-render if the existence of copiedConfig changes
  if (!!prevProps.copiedConfig !== !!nextProps.copiedConfig) return false;

  // 12. Run hold triggers
  const prevIsHoldingEnter = prevProps.holdingEnterTrackId === prevProps.ws.id;
  const nextIsHoldingEnter = nextProps.holdingEnterTrackId === nextProps.ws.id;
  if (prevIsHoldingEnter !== nextIsHoldingEnter) return false;
  if (
    nextIsHoldingEnter &&
    prevProps.enterHoldProgress !== nextProps.enterHoldProgress
  )
    return false;

  // Theme support
  if (prevProps.theme !== nextProps.theme) return false;

  return true;
};

export const trackColumnAreEqual = areEqual;
export const TrackColumn = React.memo(TrackColumnComponent, areEqual);
