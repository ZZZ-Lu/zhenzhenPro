import React, { useState, useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";
import {
  TrackColumnProps,
  TrackColumn,
  trackColumnAreEqual,
} from "./TrackColumn";

type ColumnCallback = (isIntersecting: boolean) => void;
const columnCallbacksMap = new WeakMap<Element, ColumnCallback>();
const columnObserversByRoot = new Map<
  Element | Document | null,
  IntersectionObserver
>();

function getSharedColumnObserver(
  root: Element | Document | null,
): IntersectionObserver {
  let obs = columnObserversByRoot.get(root);
  if (!obs) {
    obs = new IntersectionObserver(
      (entries) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const cb = columnCallbacksMap.get(entry.target);
          if (cb) cb(entry.isIntersecting);
        }
      },
      {
        root,
        rootMargin: "600px 900px 600px 900px",
      },
    );
    columnObserversByRoot.set(root, obs);
  }
  return obs;
}

export const VirtualTrackColumn = React.memo(function VirtualTrackColumn(
  props: TrackColumnProps,
) {
  const { ws, trIdx, theme } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInViewport, setIsInViewport] = useState<boolean>(trIdx < 4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scrollRoot =
      el.closest("#tracks-scroll-viewport") ||
      document.getElementById("tracks-scroll-viewport") ||
      null;

    const observer = getSharedColumnObserver(scrollRoot);
    columnCallbacksMap.set(el, (intersecting) => {
      setIsInViewport(intersecting);
    });
    observer.observe(el);

    return () => {
      columnCallbacksMap.delete(el);
      observer.unobserve(el);
    };
  }, []);

  const widthClass =
    ws.columnWidth === "wide"
      ? "w-[88vw] md:w-[840px] md:max-w-[840px]"
      : ws.columnWidth === "medium"
        ? "w-[88vw] md:w-[650px] md:max-w-[650px]"
        : "w-[88vw] md:w-[460px] md:max-w-[460px]";

  const isLight = theme === "light";

  if (!isInViewport) {
    return (
      <div
        ref={containerRef}
        id={`track-container-${ws.id}`}
        data-track-container={ws.id}
        className={`min-w-[325px] h-full min-h-0 flex-shrink-0 flex flex-col rounded-2xl overflow-hidden relative border shadow-sm transition-colors duration-200 ${widthClass} ${
          isLight
            ? "bg-white border-slate-200 text-slate-800"
            : "bg-slate-900 border-slate-800 text-slate-100"
        }`}
      >
        {/* 1. SKELETON HEADER: Title, Grab Handle, Item Count, Controls */}
        <div
          className={`pt-4 px-4 pb-2.5 flex items-center justify-between gap-2 border-b flex-shrink-0 ${
            isLight
              ? "bg-slate-50/90 border-slate-200"
              : "bg-slate-900 border-slate-800/80"
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Grab Handle Icon */}
            <div
              className={`w-3.5 h-4 rounded flex items-center justify-center ${
                isLight
                  ? "text-slate-400 bg-slate-200/80"
                  : "text-slate-600 bg-slate-800/60"
              }`}
            >
              <GripVertical className="w-3.5 h-3.5 opacity-50" />
            </div>
            {/* Track Name */}
            <span
              className={`font-bold text-base truncate max-w-[180px] ${
                isLight ? "text-slate-700" : "text-slate-300"
              }`}
            >
              {ws.name || `列_${trIdx + 1}`}
            </span>
            {/* Item Count Tag */}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                isLight
                  ? "bg-slate-200/80 text-slate-600"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {ws.generations?.length || 0}项
            </span>
          </div>

          {/* Header Action Buttons Skeleton */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* S / M / L Width Selector Placeholder */}
            <div
              className={`flex items-center p-0.5 rounded-lg border ${
                isLight
                  ? "bg-slate-100 border-slate-200"
                  : "bg-slate-950 border-slate-800"
              }`}
            >
              <div
                className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${
                  isLight
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "bg-slate-800 text-indigo-400"
                }`}
              >
                {ws.columnWidth === "wide"
                  ? "L"
                  : ws.columnWidth === "medium"
                    ? "M"
                    : "S"}
              </div>
            </div>
            <div
              className={`w-[1px] h-4 ${
                isLight ? "bg-slate-200" : "bg-slate-800"
              } mx-0.5`}
            />
            {/* Tool Buttons Placeholders */}
            <div
              className={`w-6 h-6 rounded-lg ${
                isLight ? "bg-slate-200/80" : "bg-slate-800"
              }`}
            />
            <div
              className={`w-6 h-6 rounded-lg ${
                isLight ? "bg-slate-200/80" : "bg-slate-800"
              }`}
            />
            <div
              className={`w-6 h-6 rounded-lg ${
                isLight ? "bg-slate-200/80" : "bg-slate-800"
              }`}
            />
          </div>
        </div>

        {/* 2. SKELETON CONFIG ROW */}
        <div className="p-4 flex-shrink-0 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 mt-0.5">
            <div
              className={`h-8 rounded-lg border ${
                isLight
                  ? "bg-slate-100 border-slate-200"
                  : "bg-slate-950 border-slate-800"
              }`}
            />
            <div className="grid grid-cols-2 gap-1.5">
              <div
                className={`h-8 rounded-lg border ${
                  isLight
                    ? "bg-slate-100 border-slate-200"
                    : "bg-slate-950 border-slate-800"
                }`}
              />
              <div
                className={`h-8 rounded-lg border ${
                  isLight
                    ? "bg-slate-100 border-slate-200"
                    : "bg-slate-950 border-slate-800"
                }`}
              />
            </div>
          </div>
        </div>

        {/* 3. SKELETON REFERENCE DROPZONE */}
        <div className="pb-1 px-4 pt-1 flex-shrink-0">
          <div
            className={`h-[52px] rounded-xl border border-dashed p-2.5 flex items-center justify-center gap-2.5 ${
              isLight
                ? "bg-slate-50 border-slate-300/80"
                : "bg-slate-950 border-slate-800"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-lg ${
                isLight ? "bg-slate-200" : "bg-slate-800"
              }`}
            />
            <div
              className={`w-44 h-3.5 rounded ${
                isLight ? "bg-slate-200" : "bg-slate-800"
              }`}
            />
          </div>
        </div>

        {/* 4. SKELETON PROMPT EDITOR & RUN BUTTON */}
        <div className="px-4 py-2 flex-shrink-0 space-y-2">
          <div
            className={`h-[72px] rounded-xl border p-2.5 flex flex-col justify-between ${
              isLight
                ? "bg-slate-50 border-slate-200"
                : "bg-slate-950 border-slate-800"
            }`}
          >
            <div
              className={`w-3/4 h-3 rounded ${
                isLight ? "bg-slate-200" : "bg-slate-800"
              }`}
            />
            <div
              className={`w-1/2 h-3 rounded ${
                isLight ? "bg-slate-200" : "bg-slate-800"
              }`}
            />
          </div>
          <div className="flex items-center justify-between pt-0.5">
            <div
              className={`w-20 h-6 rounded-lg ${
                isLight ? "bg-slate-200" : "bg-slate-800"
              }`}
            />
            <div
              className={`w-28 h-7 rounded-xl font-bold text-xs flex items-center justify-center text-white/80 ${
                isLight ? "bg-indigo-600" : "bg-indigo-600/80"
              }`}
            >
              生成图像
            </div>
          </div>
        </div>

        {/* 5. SKELETON FILTER TABS */}
        <div
          className={`px-4 py-2 border-t border-b flex items-center gap-2 flex-shrink-0 ${
            isLight
              ? "bg-slate-50/50 border-slate-200"
              : "bg-slate-900/50 border-slate-800/80"
          }`}
        >
          <div
            className={`w-12 h-5 rounded-md ${
              isLight ? "bg-slate-200" : "bg-slate-800"
            }`}
          />
          <div
            className={`w-14 h-5 rounded-md ${
              isLight ? "bg-slate-200" : "bg-slate-800"
            }`}
          />
          <div
            className={`w-10 h-5 rounded-md ${
              isLight ? "bg-slate-200" : "bg-slate-800"
            }`}
          />
        </div>

        {/* 6. SKELETON IMAGE CARDS LIST */}
        <div
          className={`flex-1 p-4 space-y-3 overflow-hidden flex flex-col justify-start ${
            isLight ? "bg-slate-100/40" : "bg-slate-950/30"
          }`}
        >
          <div
            className={`w-full rounded-2xl border p-2.5 space-y-2 ${
              isLight
                ? "bg-white border-slate-200 shadow-sm"
                : "bg-slate-900/80 border-slate-800"
            }`}
          >
            <div
              className={`w-full aspect-[4/3] rounded-xl ${
                isLight ? "bg-slate-200/80" : "bg-slate-800/60"
              }`}
            />
            <div className="flex items-center justify-between pt-1">
              <div
                className={`w-24 h-3 rounded ${
                  isLight ? "bg-slate-200" : "bg-slate-800"
                }`}
              />
              <div
                className={`w-12 h-3 rounded ${
                  isLight ? "bg-slate-200" : "bg-slate-800"
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full flex-shrink-0 flex items-stretch">
      <TrackColumn {...props} />
    </div>
  );
}, trackColumnAreEqual);
