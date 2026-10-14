import React, { useState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { TrackColumn } from "./TrackColumn";
import { ImageWorkspace } from "../types";

export const VirtualizedTrackColumn: React.FC<any> = (props) => {
  const {
    ws,
    trIdx,
    focusedTrackId,
    renamingId,
    deleteConfirmTrackId,
    clearConfirmTrackId,
    pasteConfirmTrackId,
    draggedTrackId,
    setWorkspaces,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  const isGenerating = ws?.generations?.some((g: any) => g.status === "generating");
  const isImportantState =
    trIdx < 2 || // Always keep first 2 columns rendered for instant startup
    focusedTrackId === ws?.id ||
    renamingId === ws?.id ||
    deleteConfirmTrackId === ws?.id ||
    clearConfirmTrackId === ws?.id ||
    pasteConfirmTrackId === ws?.id ||
    isGenerating;

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      setIsIntersecting(true);
      return;
    }

    const scrollRoot = document.getElementById("tracks-scroll-viewport");
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          // Defer update using requestAnimationFrame to keep scroll smooth
          requestAnimationFrame(() => {
            setIsIntersecting(entry.isIntersecting);
          });
        }
      },
      {
        root: scrollRoot || null,
        // 150% horizontal buffer on left & right: pre-load 2-3 neighbor columns
        rootMargin: "0px 150% 0px 150%",
        threshold: 0.01,
      }
    );

    observer.observe(el);
    return () => {
      observer.unobserve(el);
    };
  }, []);

  const shouldRenderContent = isImportantState || isIntersecting;

  if (!shouldRenderContent) {
    return (
      <div
        ref={containerRef}
        id={`track-container-${ws.id}`}
        data-track-container={ws.id}
        data-culling-placeholder="true"
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedTrackId && draggedTrackId !== ws.id) {
            setWorkspaces((workspaces: ImageWorkspace[]) => {
              const dragIdx = workspaces.findIndex((w) => w.id === draggedTrackId);
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
        className={`w-[88vw] min-w-[325px] h-full min-h-0 flex-shrink-0 flex flex-col bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden shadow-md relative transition-all duration-200 select-none ${
          ws.columnWidth === "wide"
            ? "md:w-[840px] md:max-w-[840px]"
            : ws.columnWidth === "medium"
              ? "md:w-[650px] md:max-w-[650px]"
              : "md:w-[460px] md:max-w-[460px]"
        }`}
      >
        {/* Placeholder Column Header */}
        <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2 truncate">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500/60 animate-pulse" />
            <span className="text-xs font-semibold text-slate-300 truncate max-w-[200px]">
              {ws.name || `创意列 #${trIdx + 1}`}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/40">
            视口剔除中
          </span>
        </div>

        {/* Placeholder Column Content Shell */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-10 h-10 rounded-xl bg-slate-800/50 border border-slate-700/30 flex items-center justify-center text-slate-500">
            <Sparkles className="w-5 h-5 opacity-60" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-medium">离屏保护（DOM 节点已挂起）</p>
            <p className="text-[10px] text-slate-500">向两侧横向滚动时自动秒级恢复装载</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full min-h-0 flex-shrink-0 flex items-stretch">
      <TrackColumn {...props} />
    </div>
  );
};
