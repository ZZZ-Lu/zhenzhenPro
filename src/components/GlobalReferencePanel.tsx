import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Plus,
  Trash2,
  Upload,
  X,
  Eye,
  PenTool,
  Edit2,
  Brush
} from "lucide-react";
import { ImageReference } from "../types";
import { createThumbnailToBase64, blobToBase64 } from "../utils/db";
import { ImageEditorModal } from "./ImageEditorModal";

interface GlobalReferencePanelProps {
  theme: "light" | "dark";
  images: ImageReference[];
  onImagesChange: (images: ImageReference[]) => void;
  onSaveToTopStaging?: (base64: string) => void;
  projectId?: string;
  isViewportShowing?: boolean;
}

export function GlobalReferencePanel({
  theme,
  images,
  onImagesChange,
  onSaveToTopStaging,
  projectId = "default",
  isViewportShowing = true,
}: GlobalReferencePanelProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    return localStorage.getItem(`global_ref_expanded_${projectId}`) === "true";
  });
  
  // When projectId changes, we load its specific expanded state
  useLayoutEffect(() => {
    const saved = localStorage.getItem(`global_ref_expanded_${projectId}`);
    if (saved !== null) {
      setIsExpanded(saved === "true");
    } else {
      setIsExpanded(false);
    }
  }, [projectId]);

  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenEditor = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string }>;
      if (customEvent.detail && customEvent.detail.url) {
        setEditingImageUrl(customEvent.detail.url);
        setIsEditorOpen(true);
      }
    };
    window.addEventListener("open-image-editor", handleOpenEditor);
    return () => {
      window.removeEventListener("open-image-editor", handleOpenEditor);
    };
  }, []);

  const handleSaveSketch = async (base64Str: string, keepOpen?: boolean) => {
    try {
      const thumb = await createThumbnailToBase64(base64Str, 256);
      const newImages = [{
        id: crypto.randomUUID(),
        url: base64Str,
        thumbnail: thumb,
        name: `Sketch_${new Date().getTime()}.png`,
      }, ...images];
      onImagesChange(newImages);
      if (!keepOpen) {
        setIsEditorOpen(false);
      }
    } catch (err) {
      console.error("Failed to save sketch:", err);
    }
  };
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isTransitioning = useRef(false);
  const canSaveScroll = useRef(false);

  const scrollPositions = useRef({
    expanded: parseInt(localStorage.getItem(`global_ref_scroll_expanded_${projectId}`) || "0", 10),
    collapsed: parseInt(localStorage.getItem(`global_ref_scroll_collapsed_${projectId}`) || "0", 10),
  });

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isTransitioning.current || !canSaveScroll.current) return;
    const scrollTop = e.currentTarget.scrollTop;
    if (isExpanded) {
      scrollPositions.current.expanded = scrollTop;
      localStorage.setItem(`global_ref_scroll_expanded_${projectId}`, scrollTop.toString());
    } else {
      scrollPositions.current.collapsed = scrollTop;
      localStorage.setItem(`global_ref_scroll_collapsed_${projectId}`, scrollTop.toString());
    }
  };

  useLayoutEffect(() => {
    isTransitioning.current = true;
    canSaveScroll.current = false;
    let timers: NodeJS.Timeout[] = [];
    
    // Always fetch latest positions for current project
    scrollPositions.current = {
      expanded: parseInt(localStorage.getItem(`global_ref_scroll_expanded_${projectId}`) || "0", 10),
      collapsed: parseInt(localStorage.getItem(`global_ref_scroll_collapsed_${projectId}`) || "0", 10),
    };
    
    if (scrollContainerRef.current) {
      const targetScroll = isExpanded 
        ? scrollPositions.current.expanded 
        : scrollPositions.current.collapsed;
        
      // Inner content now has fixed width (w-64 / w-12), so layout height is calculated instantly.
      // useLayoutEffect runs before paint, eliminating the jitter completely.
      scrollContainerRef.current.scrollTop = targetScroll;

      timers.push(setTimeout(() => {
        isTransitioning.current = false;
        canSaveScroll.current = true;
      }, 600)); // Allow CSS transition to finish (300ms) + buffer
    }
    return () => timers.forEach(clearTimeout);
  }, [isExpanded, projectId, images.length]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const addedImages: ImageReference[] = [];
    const files = Array.from(e.target.files) as File[];
    
    for (const file of files) {
      try {
        const base64Str = await blobToBase64(file);
        const thumb = await createThumbnailToBase64(base64Str, 256);
        addedImages.push({
          id: crypto.randomUUID(),
          url: base64Str,
          thumbnail: thumb,
          name: file.name,
        });
      } catch (err) {
        console.error("Failed to process global reference image:", err);
      }
    }
    
    onImagesChange([...addedImages, ...images]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const addedImages: ImageReference[] = [];
    let handled = false;

    const customImageUrl = e.dataTransfer.getData("image-url");
    const textData = e.dataTransfer.getData("text/plain");
    
    // Prioritize our custom image-url data type set by GenerationsList
    const targetUrl = customImageUrl || textData;

    if (targetUrl && typeof targetUrl === "string" && (customImageUrl || targetUrl.startsWith('http') || targetUrl.startsWith('data:image/') || targetUrl.startsWith('blob:'))) {
      try {
        let base64Url = targetUrl;
        let thumb = "";
        if (!targetUrl.startsWith('data:image/')) {
          try {
            const res = await fetch(targetUrl);
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.startsWith("image/")) {
              const blob = await res.blob();
              base64Url = await blobToBase64(blob);
              thumb = await createThumbnailToBase64(base64Url, 256);
            }
          } catch (fetchErr) {
            console.warn("Could not fetch image to convert to base64, using original URL:", fetchErr);
          }
        } else {
          thumb = await createThumbnailToBase64(base64Url, 256);
        }
        
        addedImages.push({
          id: crypto.randomUUID(),
          url: base64Url,
          thumbnail: thumb || base64Url,
          name: "Generated Image",
        });
        handled = true;
      } catch (err) {
        console.error("Failed to process dragged image URL:", err);
      }
    }

    if (!handled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        
        try {
          const base64Str = await blobToBase64(file);
          const thumb = await createThumbnailToBase64(base64Str, 256);
          addedImages.push({
            id: crypto.randomUUID(),
            url: base64Str,
            thumbnail: thumb,
            name: file.name,
          });
          handled = true;
        } catch (err) {
          console.error("Failed to process global reference image:", err);
        }
      }
    }
    
    if (handled) {
      onImagesChange([...addedImages, ...images]);
    }
  };

  const removeImage = (id: string) => {
    onImagesChange(images.filter((img) => img.id !== id));
  };

  return (
    <div
      id="left-staging-area"
      className={`absolute left-0 top-4 bottom-4 z-[90] flex flex-col transition-all duration-300 ease-in-out border-r border-y border-l-0 rounded-r-2xl rounded-l-none shadow-xl overflow-hidden ${isViewportShowing ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4 pointer-events-none"} ${
        isExpanded ? "w-64" : "w-14"
      } backdrop-blur-md ${
        theme === "light" ? "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50" : "bg-slate-900/90 border-slate-700 text-slate-100 shadow-black/50"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div
        className={`flex-none flex overflow-hidden ${
          isExpanded ? "flex-row items-center p-3 border-b justify-between" : "flex-col items-center pt-3 pb-0 justify-center gap-3"
        } ${theme === "light" ? "border-slate-200" : "border-slate-800"}`}
      >
        {isExpanded && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 whitespace-nowrap overflow-hidden ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span>图片暂存区</span>
          </motion.span>
        )}
        <div className={`flex shrink-0 ${isExpanded ? "flex-row items-center gap-2" : "flex-col items-center gap-3"}`}>
          {isExpanded && images.length > 0 && (
            <button
              onClick={() => setIsClearConfirmOpen(true)}
              className={`p-1.5 rounded-md transition-colors ${theme === "light" ? "text-slate-500 hover:text-rose-600 hover:bg-rose-50" : "text-slate-400 hover:text-rose-400 hover:bg-rose-950/30"}`}
              title="清空暂存区"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`p-1.5 rounded-md transition-colors ${theme === "light" ? "text-slate-500 hover:bg-slate-200" : "text-slate-400 hover:bg-slate-800"}`}
            title="上传参考图"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              isTransitioning.current = true;
              const nextExpanded = !isExpanded;
              setIsExpanded(nextExpanded);
              localStorage.setItem(`global_ref_expanded_${projectId}`, nextExpanded.toString());
            }}
            className={`p-1.5 rounded-md transition-colors ${theme === "light" ? "text-slate-500 hover:bg-slate-200" : "text-slate-400 hover:bg-slate-800"}`}
            title={isExpanded ? "收起面板" : "展开参考图池"}
          >
            {isExpanded ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />

        {/* Content */}
        <div className={`flex-1 p-3 space-y-4 relative w-64 shrink-0 ${isExpanded ? "block" : "hidden"}`}>
            <div className="flex gap-2 items-start">
              <div className="flex-1 flex flex-col gap-2">
                <AnimatePresence>
                  {images.filter((_, i) => i % 2 === 0).map((img) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="relative group rounded-md border border-slate-200 dark:border-slate-700"
                    >
                      <img
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", typeof img.url === "string" ? img.url : "");
                          e.dataTransfer.setData("image-url", typeof img.url === "string" ? img.url : "");
                        }}
                        src={
                          img.thumbnail ||
                          (typeof img.url === "string" && img.url.startsWith("data:")
                            ? img.url
                            : typeof img.url === "string"
                              ? img.url
                              : "")
                        }
                        alt={img.name || "Reference"}
                        className="w-full h-auto block rounded-md"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className={`absolute -top-1.5 -left-1.5 w-6 h-6 p-0 backdrop-blur-sm flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md border ${
                          theme === "light"
                            ? "bg-rose-500 hover:bg-rose-600 text-white border-rose-400/30"
                            : "bg-rose-600/80 hover:bg-rose-500 text-white border-white/10"
                        }`}
                        title="移除参考图"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingImageUrl(typeof img.url === "string" ? img.url : null); setIsEditorOpen(true); }}
                        className={`absolute -top-1.5 -right-1.5 w-6 h-6 p-0 backdrop-blur-sm flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md border ${
                          theme === "light"
                            ? "bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border-slate-300"
                            : "bg-black/60 hover:bg-black/80 text-white border-white/10"
                        }`}
                        title="编辑/涂鸦"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <div
                        className={`absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-zoom-in z-20 shadow-md border ${
                          theme === "light"
                            ? "bg-white/95 hover:bg-white text-slate-700 border-slate-300"
                            : "bg-black/50 hover:bg-black/70 text-white border-white/10"
                        }`}
                        onMouseEnter={() => {
                          setPreviewImage(typeof img.url === "string" ? img.url : "");
                        }}
                        onMouseLeave={() => {
                          setPreviewImage(null);
                        }}
                      >
                        <Eye className={`w-2 h-2 ${theme === "light" ? "text-slate-700" : "text-white"}`} />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <AnimatePresence>
                  {images.filter((_, i) => i % 2 === 1).map((img) => (
                    <motion.div
                      key={img.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="relative group rounded-md border border-slate-200 dark:border-slate-700"
                    >
                      <img
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", typeof img.url === "string" ? img.url : "");
                          e.dataTransfer.setData("image-url", typeof img.url === "string" ? img.url : "");
                        }}
                        src={
                          img.thumbnail ||
                          (typeof img.url === "string" && img.url.startsWith("data:")
                            ? img.url
                            : typeof img.url === "string"
                              ? img.url
                              : "")
                        }
                        alt={img.name || "Reference"}
                        className="w-full h-auto block rounded-md"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className={`absolute -top-1.5 -left-1.5 w-6 h-6 p-0 backdrop-blur-sm flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md border ${
                          theme === "light"
                            ? "bg-rose-500 hover:bg-rose-600 text-white border-rose-400/30"
                            : "bg-rose-600/80 hover:bg-rose-500 text-white border-white/10"
                        }`}
                        title="移除参考图"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingImageUrl(typeof img.url === "string" ? img.url : null); setIsEditorOpen(true); }}
                        className={`absolute -top-1.5 -right-1.5 w-6 h-6 p-0 backdrop-blur-sm flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md border ${
                          theme === "light"
                            ? "bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border-slate-300"
                            : "bg-black/60 hover:bg-black/80 text-white border-white/10"
                        }`}
                        title="编辑/涂鸦"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <div
                        className={`absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-zoom-in z-20 shadow-md border ${
                          theme === "light"
                            ? "bg-white/95 hover:bg-white text-slate-700 border-slate-300"
                            : "bg-black/50 hover:bg-black/70 text-white border-white/10"
                        }`}
                        onMouseEnter={() => {
                          setPreviewImage(typeof img.url === "string" ? img.url : "");
                        }}
                        onMouseLeave={() => {
                          setPreviewImage(null);
                        }}
                      >
                        <Eye className={`w-2 h-2 ${theme === "light" ? "text-slate-700" : "text-white"}`} />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
            {images.length === 0 && (
              <div className={`text-center py-8 text-xs ${theme === "light" ? "text-slate-400" : "text-slate-500"}`}>
                空空如也，请上传图片。
              </div>
            )}
          </div>

        {/* Collapsed Content */}
        <div className={`flex-1 pt-3 pb-4 flex flex-col items-center w-full shrink-0 ${!isExpanded ? "block" : "hidden"}`}>
          <div className="flex flex-col items-center gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  className={`relative group w-8 min-h-[2rem] flex flex-col items-center justify-center rounded-md border ${theme === "light" ? "border-slate-300 bg-slate-100/50" : "border-slate-700 bg-slate-800/50"}`}
                  title={img.name}
                >
                  <img
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", typeof img.url === "string" ? img.url : "");
                      e.dataTransfer.setData("image-url", typeof img.url === "string" ? img.url : "");
                    }}
                    src={
                      img.thumbnail ||
                      (typeof img.url === "string" && img.url.startsWith("data:")
                        ? img.url
                        : typeof img.url === "string"
                          ? img.url
                          : "")
                    }
                    alt={img.name || "Ref"}
                    className="w-full h-auto block rounded-[5px]"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingImageUrl(typeof img.url === "string" ? img.url : null); setIsEditorOpen(true); }}
                    className={`absolute -top-1 -right-1 w-4 h-4 p-0 backdrop-blur-sm flex items-center justify-center rounded-sm opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md border ${
                      theme === "light"
                        ? "bg-white/95 hover:bg-white text-slate-700 hover:text-slate-900 border-slate-300"
                        : "bg-black/60 hover:bg-black/80 text-white border-white/10"
                    }`}
                    title="编辑/涂鸦"
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => removeImage(img.id)}
                    className={`absolute -top-1 -left-1 w-4 h-4 p-0 backdrop-blur-sm flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all z-20 shadow-md border ${
                      theme === "light"
                        ? "bg-rose-500 hover:bg-rose-600 text-white border-rose-400/30"
                        : "bg-rose-600/80 hover:bg-rose-500 text-white border-white/10"
                    }`}
                    title="移除参考图"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <div
                    className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-zoom-in z-20 shadow-md border ${
                      theme === "light"
                        ? "bg-white/95 hover:bg-white text-slate-700 border-slate-300"
                        : "bg-black/50 hover:bg-black/70 text-white border-white/10"
                    }`}
                    onMouseEnter={() => {
                      setPreviewImage(typeof img.url === "string" ? img.url : "");
                    }}
                    onMouseLeave={() => {
                      setPreviewImage(null);
                    }}
                  >
                    <Eye className={`w-2 h-2 ${theme === "light" ? "text-slate-700" : "text-white"}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>

      {/* Global Drag Overlay */}
      {isDragging && (
        <div className={`absolute inset-0 z-50 flex items-center justify-center backdrop-blur-sm pointer-events-none ${
          theme === "light" 
            ? "bg-indigo-50/60 border-2 border-dashed border-indigo-400" 
            : "bg-slate-900/60 border-2 border-dashed border-indigo-500"
        }`}>
          <div className="text-center p-2">
            <Upload className="w-6 h-6 mx-auto text-indigo-500" />
            {isExpanded && (
              <span className={`text-sm font-medium mt-2 block ${theme === "light" ? "text-indigo-600" : "text-indigo-400"}`}>
                松开以上传参考图
              </span>
            )}
          </div>
        </div>
      )}

      {/* Large Image Preview Overlay */}
      {previewImage && createPortal(
        <div 
          className={`fixed inset-0 z-[80] pointer-events-none backdrop-blur-xl ${
            theme === "light" ? "bg-zinc-50/80" : "bg-neutral-950/80"
          }`}
        >
          <div
            className="absolute top-0 bottom-0 right-0 flex items-center justify-center p-8 transition-all duration-300 ease-in-out"
            style={{
              left: isExpanded ? '16rem' : '3.5rem'
            }}
          >
            <img
              src={previewImage}
              alt="Preview"
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Clear Confirm Dialog */}
      {isClearConfirmOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 p-3">
          <div className={`border rounded-2xl p-4 w-full shadow-2xl relative animate-in zoom-in-95 duration-200 ${
            theme === "light" ? "bg-white border-slate-200 text-slate-800" : "bg-slate-900 border-slate-800 text-slate-100"
          }`}>
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-10 h-10 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-500 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  确定清空暂存区？
                </h3>
                <p className={`text-xs mt-1.5 leading-relaxed ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                  此操作无法撤销。
                </p>
              </div>
              <div className="flex flex-col w-full gap-2 pt-2">
                <button
                  onClick={() => {
                    onImagesChange([]);
                    setIsClearConfirmOpen(false);
                  }}
                  className="w-full px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs rounded-lg font-medium transition-colors"
                >
                  确定清空
                </button>
                <button
                  onClick={() => setIsClearConfirmOpen(false)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    theme === "light" 
                      ? "bg-slate-100 hover:bg-slate-200 text-slate-700" 
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                  }`}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditorOpen && (
        <ImageEditorModal
          isOpen={true}
          theme={theme}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingImageUrl(null);
          }}
          onSave={handleSaveSketch}
          onSaveToTop={onSaveToTopStaging}
          initialImage={editingImageUrl}
        />
      )}

      {/* Floating Capsule Button for Sketch */}
      {createPortal(
        <div className="fixed right-4 sm:right-8 top-1/2 -translate-y-1/2 z-[60] flex flex-col gap-2">
          <button
            onClick={() => { setEditingImageUrl(null); setIsEditorOpen(true); }}
            className={`group flex flex-col items-center justify-center w-[34px] h-[45px] sm:w-[39px] sm:h-[56px] rounded-full shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95 border backdrop-blur-md ${
              theme === "light" 
                ? "bg-white/90 border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:border-neutral-300 shadow-neutral-200/50" 
                : "bg-neutral-800/90 border-neutral-700 text-neutral-400 hover:text-neutral-100 hover:border-neutral-500 hover:bg-neutral-700 shadow-black/50"
            }`}
            title="新建草图"
          >
            <Brush className="w-4 h-4 sm:w-4 sm:h-4" />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
