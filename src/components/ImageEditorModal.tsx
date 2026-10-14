import React, { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Check, Brush, Eraser, Trash2, Undo, Redo, ChevronDown, Crop, File, Download, Save, LayoutPanelTop, PanelLeft, FilePlus, SquareX, Home, Sparkles, Edit3, Palette, Sliders, MessageSquarePlus, ArrowUpRight, Circle, Droplet, ClipboardPaste } from "lucide-react";
import { setIndexedDBItem, getIndexedDBItem } from "../utils/db";
import { DraftHome, DraftProject } from "./DraftHome";

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialImage?: string | null;
  onSave: (base64: string, keepOpen?: boolean) => void;
  onSaveToTop?: (base64: string) => void;
  theme: "light" | "dark";
}

const COLORS = [
  "#000000", "#FFFFFF", "#EF4444", "#F97316", "#EAB308",
  "#22C55E", "#3B82F6", "#A855F7", "#EC4899", "#737373"
];
const BRUSH_SIZES = [2, 5, 10, 20, 40];
const ASPECT_RATIOS = [
  { label: "自由", w: 0, h: 0 },
  { label: "1:1", w: 1, h: 1 },
  { label: "3:2", w: 3, h: 2 },
  { label: "2:3", w: 2, h: 3 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 }
];

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen, onClose, initialImage, onSave, onSaveToTop, theme
}) => {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const workspaceContainerRef = useRef<HTMLDivElement>(null);
  const pendingGenieCallbackRef = useRef<{ callback: (base64: string) => void, base64: string } | null>(null);

  const [workspaceBounds, setWorkspaceBounds] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  
  const [genieAnim, setGenieAnim] = useState<{
    src: string;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    endX: number;
    endY: number;
    endWidth: number;
    endHeight: number;
  } | null>(null);
  
  const [view, setView] = useState<"home" | "editor">("home");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>("未命名-1.psd");
  const [projectDimensions, setProjectDimensions] = useState<{ width: number; height: number }>({ width: 1024, height: 1024 });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [mode, setMode] = useState<"brush" | "eraser" | "crop" | "annotate" | "blur">(
    () => (localStorage.getItem("editor_mode") as any) || "brush"
  );
  const [blurRadius, setBlurRadius] = useState<number>(0);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [color, setColor] = useState(() => localStorage.getItem("editor_color") || COLORS[0]);
  const [penSize, setPenSize] = useState(() => Number(localStorage.getItem("editor_penSize")) || 10);
  const [eraserSize, setEraserSize] = useState(() => Number(localStorage.getItem("editor_eraserSize")) || 20);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pasteToast, setPasteToast] = useState<string | null>(null);
  
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [cropRatio, setCropRatio] = useState<number | null>(null);

  const [annotateType, setAnnotateType] = useState<"arrow" | "circle">("arrow");
  const [activeAnnotation, setActiveAnnotation] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    text: string;
    typing: boolean;
  } | null>(null);
  const annotateStartImgRef = useRef<ImageData | null>(null);
  const [annotationInputText, setAnnotationInputText] = useState("");
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  
  // Zoom and Pan
  const [scale, setScale] = useState(() => Number(localStorage.getItem("editor_scale")) || 1);
  const [pan, setPan] = useState(() => {
    try {
      const stored = localStorage.getItem("editor_pan");
      return stored ? JSON.parse(stored) : { x: 0, y: 0 };
    } catch (e) {
      return { x: 0, y: 0 };
    }
  });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  
  // History stack for undo
  const [history, setHistory] = useState<ImageData[]>([]);
  const [redoHistory, setRedoHistory] = useState<ImageData[]>([]);
  const [bgHistory, setBgHistory] = useState<ImageData[]>([]);
  const [bgRedoHistory, setBgRedoHistory] = useState<ImageData[]>([]);
  
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; }
  }, [isOpen]);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem("editor_mode", mode);
    localStorage.setItem("editor_color", color);
    localStorage.setItem("editor_penSize", penSize.toString());
    localStorage.setItem("editor_eraserSize", eraserSize.toString());
    localStorage.setItem("editor_scale", scale.toString());
    localStorage.setItem("editor_pan", JSON.stringify(pan));
  }, [mode, color, penSize, eraserSize, scale, pan]);

  const updateProjectThumbnail = async (projectId: string, dataUrl: string) => {
    const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
    const idx = list.findIndex(p => p.id === projectId);
    if (idx >= 0) {
      list[idx].thumbnail = dataUrl;
      list[idx].updatedAt = Date.now();
      await setIndexedDBItem("editor_projects", list);
    }
  };

  const saveCurrentCanvasState = async () => {
    if (!currentProjectId) return;
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      const bgData = bgCanvas.toDataURL();
      const layerData = drawCanvas.toDataURL("image/png");
      
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 256;
      thumbCanvas.height = Math.max(32, Math.round(256 * (bgCanvas.height / bgCanvas.width)));
      const thumbCtx = thumbCanvas.getContext("2d");
      if (thumbCtx) {
        thumbCtx.fillStyle = "#FFF";
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(bgCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(drawCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        await updateProjectThumbnail(currentProjectId, thumbCanvas.toDataURL("image/jpeg", 0.85));
      }

      await setIndexedDBItem(`editor_bg_${currentProjectId}`, bgData).catch(console.error);
      await setIndexedDBItem(`editor_layer_${currentProjectId}`, layerData).catch(console.error);
      
      try {
        localStorage.setItem(`editor_layer_fb_${currentProjectId}`, layerData);
      } catch(e) {}
      try {
        if (bgData.length < 2_000_000) {
           localStorage.setItem(`editor_bg_fb_${currentProjectId}`, bgData);
        }
      } catch(e) {}
    }
  };
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsSettingsOpen(false);
      }
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setIsFileMenuOpen(false);
      }
    };
    if (isSettingsOpen || isFileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSettingsOpen, isFileMenuOpen]);
  
  const activeSize = mode === 'eraser' ? eraserSize : penSize;

  const [canvasDisplayRatio, setCanvasDisplayRatio] = useState(1);

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;

    const updateRatio = () => {
      if (canvas.width > 0) {
        setCanvasDisplayRatio(canvas.clientWidth / canvas.width);
      }
    };

    updateRatio();

    // Trigger update slightly after load or scale to ensure DOM styles have computed
    const timer = setTimeout(updateRatio, 50);

    const observer = new ResizeObserver(() => {
      updateRatio();
    });
    observer.observe(canvas);

    window.addEventListener("resize", updateRatio);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("resize", updateRatio);
    };
  }, [isOpen, view, currentProjectId, scale]);

  useEffect(() => {
    const el = workspaceContainerRef.current;
    if (!el) return;

    const updateBounds = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setWorkspaceBounds({ width: rect.width, height: rect.height });
      }
    };

    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(el);
    window.addEventListener("resize", updateBounds);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, [isOpen, view]);

  const canvasPaperSize = useMemo(() => {
    const pad = 48; // 24px padding on each side so canvas paper breathes nicely
    const availW = Math.max(100, workspaceBounds.width - pad);
    const availH = Math.max(100, workspaceBounds.height - pad);

    if (!aspectRatio || aspectRatio <= 0) {
      return { width: availW, height: availH };
    }

    let width = availW;
    let height = availW / aspectRatio;

    if (height > availH) {
      height = availH;
      width = availH * aspectRatio;
    }

    return { width, height };
  }, [workspaceBounds, aspectRatio]);
  
  const cursorStyle = useMemo(() => {
    if (mode === 'annotate') return 'crosshair';
    const size = mode === 'eraser'
      ? Math.max(eraserSize, 1)
      : Math.max(activeSize * scale * canvasDisplayRatio, 1);
    
    // Browser engines (like Chromium/WebKit) limit custom cursor image sizes to 128x128.
    // Exceeding this limit causes the browser to ignore the custom cursor and fall back to default.
    // We cap the cursor representation at 120px to guarantee it remains perfectly visible at high zoom.
    const cursorSize = Math.min(size, 120);
        
    const radius = cursorSize / 2;
    const svgSize = Math.ceil(cursorSize + 4);
    const center = Math.round(svgSize / 2);
        
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">
      <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="white" stroke-width="2" />
      <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="black" stroke-width="1" />
    </svg>`;
        
    return `url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}') ${center} ${center}, auto`;
  }, [activeSize, eraserSize, mode, scale, canvasDisplayRatio]);

  useEffect(() => {
    if (!isOpen) return;
    
    // When opened from outside with an initial image, auto-create a project
    if (initialImage) {
      handleNewProject(1024, 1024, initialImage);
    } else {
      setView("home");
    }
  }, [isOpen, initialImage]);

  useEffect(() => {
    if (view !== "editor" || !currentProjectId) return;

    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d", { willReadFrequently: true });
    const drawCtx = drawCanvas?.getContext("2d", { willReadFrequently: true });
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;

    // Reset history
    setHistory([]);
    setRedoHistory([]);
    setBgHistory([]);
    setBgRedoHistory([]);

    const loadImages = (bgSrc: string | null, layerSrc: string | null, w: number, h: number) => {
      setAspectRatio(w / h);
      bgCanvas.width = w; bgCanvas.height = h;
      drawCanvas.width = w; drawCanvas.height = h;
      bgCtx.fillStyle = "#FFFFFF"; bgCtx.fillRect(0, 0, w, h);
      drawCtx.lineCap = "round"; drawCtx.lineJoin = "round";

      // Adaptive initial brush/annotate stroke thickness: 
      // 1024px image -> 16px thickness
      // 2752px image -> 24px thickness
      // Linear interpolation: size = 16 + (maxDim - 1024) / 216
      const maxDim = Math.max(w, h);
      const calculatedPenSize = Math.max(2, Math.round(16 + (maxDim - 1024) / 216));
      setPenSize(calculatedPenSize);

      let loadedCount = 0;
      const totalToLoad = (bgSrc ? 1 : 0) + (layerSrc ? 1 : 0);
      
      if (totalToLoad === 0) {
        setHistory([drawCtx.getImageData(0, 0, w, h)]);
        setRedoHistory([]);
        setBgHistory([bgCtx.getImageData(0, 0, w, h)]);
        setBgRedoHistory([]);
        return;
      }

      const checkDone = () => {
        loadedCount++;
        if (loadedCount === totalToLoad) {
          setHistory([drawCtx.getImageData(0, 0, w, h)]);
          setRedoHistory([]);
          setBgHistory([bgCtx.getImageData(0, 0, w, h)]);
          setBgRedoHistory([]);
        }
      };

      if (bgSrc) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { bgCtx.drawImage(img, 0, 0, w, h); checkDone(); };
        img.onerror = checkDone;
        img.src = bgSrc;
      }
      if (layerSrc) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { drawCtx.drawImage(img, 0, 0, w, h); checkDone(); };
        img.onerror = checkDone;
        img.src = layerSrc;
      }
    };


    const initData = async () => {
      let savedBg = await getIndexedDBItem<any>(`editor_bg_${currentProjectId}`);
      let savedLayer = await getIndexedDBItem<any>(`editor_layer_${currentProjectId}`);
      
      if (!savedBg) savedBg = localStorage.getItem(`editor_bg_fb_${currentProjectId}`);
      if (!savedLayer) savedLayer = localStorage.getItem(`editor_layer_fb_${currentProjectId}`);

      if (savedBg) {
        const bgUrl = await resolveImageSource(savedBg);
        const layerUrl = savedLayer ? await resolveImageSource(savedLayer) : null;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          loadImages(bgUrl, layerUrl, img.width, img.height);
        };
        img.onerror = () => {
          loadImages(bgUrl, layerUrl, 1024, 1024);
        };
        img.src = bgUrl;
      } else {
        // New blank or imported
        const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
        const proj = list.find(p => p.id === currentProjectId);
        if (proj) {
          loadImages(null, null, proj.width, proj.height);
          setTimeout(saveCurrentCanvasState, 100);
        }
      }
    };
    initData();
  }, [isOpen, view, currentProjectId]
);
  
  const handleRatioChange = (ratioStr: string) => {
    const ratioObj = ASPECT_RATIOS.find(r => r.label === ratioStr);
    if (!ratioObj) return;

    if (ratioObj.w === 0) {
      setCropRatio(null);
      return;
    }

    const r = ratioObj.w / ratioObj.h;
    setCropRatio(r);
    
    // We want physical aspect ratio of the crop selection to be 'r'.
    // Physical aspect ratio = (w / h) * aspectRatio = r.
    // Therefore, relative ratio of w/h = r / aspectRatio.
    const relativeR = r / aspectRatio;
    
    let newW = 1;
    let newH = 1 / relativeR;
    
    if (newH > 1) {
      newH = 1;
      newW = relativeR;
    }
    
    if (newW > 1) {
      newW = 1;
      newH = 1 / relativeR;
    }
    
    setCropBox({
       x: (1 - newW) / 2,
       y: (1 - newH) / 2,
       w: newW,
       h: newH
    });
  };

  const applyCrop = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (!bgCanvas || !drawCanvas) return;

    const bgCtx = bgCanvas.getContext("2d", { willReadFrequently: true });
    const drawCtx = drawCanvas.getContext("2d", { willReadFrequently: true });
    if (!bgCtx || !drawCtx) return;

    const cropX = Math.round(cropBox.x * bgCanvas.width);
    const cropY = Math.round(cropBox.y * bgCanvas.height);
    const cropW = Math.round(cropBox.w * bgCanvas.width);
    const cropH = Math.round(cropBox.h * bgCanvas.height);

    if (cropW <= 0 || cropH <= 0) {
      setMode("brush");
      return;
    }

    const tempBg = document.createElement('canvas');
    tempBg.width = cropW;
    tempBg.height = cropH;
    const tempBgCtx = tempBg.getContext('2d');
    if (tempBgCtx) {
      tempBgCtx.fillStyle = "#FFFFFF";
      tempBgCtx.fillRect(0, 0, cropW, cropH);
      
      const destX = Math.max(0, -cropX);
      const destY = Math.max(0, -cropY);
      const srcX = Math.max(0, cropX);
      const srcY = Math.max(0, cropY);
      const srcW = Math.min(bgCanvas.width, cropX + cropW) - srcX;
      const srcH = Math.min(bgCanvas.height, cropY + cropH) - srcY;
      
      if (srcW > 0 && srcH > 0) {
        tempBgCtx.drawImage(bgCanvas, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH);
      }
    }

    const tempDraw = document.createElement('canvas');
    tempDraw.width = cropW;
    tempDraw.height = cropH;
    const tempDrawCtx = tempDraw.getContext('2d');
    if (tempDrawCtx) {
      const destX = Math.max(0, -cropX);
      const destY = Math.max(0, -cropY);
      const srcX = Math.max(0, cropX);
      const srcY = Math.max(0, cropY);
      const srcW = Math.min(drawCanvas.width, cropX + cropW) - srcX;
      const srcH = Math.min(drawCanvas.height, cropY + cropH) - srcY;
      
      if (srcW > 0 && srcH > 0) {
        tempDrawCtx.drawImage(drawCanvas, srcX, srcY, srcW, srcH, destX, destY, srcW, srcH);
      }
    }

    setAspectRatio(cropW / cropH);

    bgCanvas.width = cropW;
    bgCanvas.height = cropH;
    drawCanvas.width = cropW;
    drawCanvas.height = cropH;

    bgCtx.drawImage(tempBg, 0, 0);
    drawCtx.drawImage(tempDraw, 0, 0);

    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    setHistory([drawCtx.getImageData(0, 0, cropW, cropH)]);
    setRedoHistory([]);
    saveCurrentCanvasState();
    setCropBox({ x: 0, y: 0, w: 1, h: 1 });
    setMode("brush");
  };

  const saveHistory = () => {
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    if (!drawCanvas || !drawCtx || !bgCanvas || !bgCtx) return;
    
    const drawData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
    const bgData = bgCtx.getImageData(0, 0, bgCanvas.width, bgCanvas.height);

    setHistory(prev => {
      const next = [...prev, drawData];
      if (next.length > 20) next.shift(); // limit history
      return next;
    });
    setBgHistory(prev => {
      const next = [...prev, bgData];
      if (next.length > 20) next.shift();
      return next;
    });

    setRedoHistory([]);
    setBgRedoHistory([]);
    saveCurrentCanvasState();
  };

  const handleUndo = () => {
    if (history.length <= 1) return;
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    if (!drawCanvas || !drawCtx || !bgCanvas || !bgCtx) return;
    
    const newHistory = [...history];
    const currentState = newHistory.pop(); // remove current state
    if (currentState) {
      setRedoHistory(prev => [currentState, ...prev]);
    }
    const previousState = newHistory[newHistory.length - 1];
    drawCtx.putImageData(previousState, 0, 0);
    setHistory(newHistory);

    if (bgHistory.length > 1) {
      const newBgHistory = [...bgHistory];
      const currentBgState = newBgHistory.pop();
      if (currentBgState) {
        setBgRedoHistory(prev => [currentBgState, ...prev]);
      }
      const previousBgState = newBgHistory[newBgHistory.length - 1];
      bgCtx.putImageData(previousBgState, 0, 0);
      setBgHistory(newBgHistory);
    }
    
    saveCurrentCanvasState();
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    if (!drawCanvas || !drawCtx || !bgCanvas || !bgCtx) return;
    
    const nextState = redoHistory[0];
    const newRedo = [...redoHistory];
    newRedo.shift();
    drawCtx.putImageData(nextState, 0, 0);
    setHistory(prev => [...prev, nextState]);
    setRedoHistory(newRedo);

    if (bgRedoHistory.length > 0) {
      const nextBgState = bgRedoHistory[0];
      const newBgRedo = [...bgRedoHistory];
      newBgRedo.shift();
      bgCtx.putImageData(nextBgState, 0, 0);
      setBgHistory(prev => [...prev, nextBgState]);
      setBgRedoHistory(newBgRedo);
    }
    
    saveCurrentCanvasState();
  };

  const applyGaussianBlur = () => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas || blurRadius <= 0) {
      setMode("brush");
      return;
    }
    
    // Save history before baking the blur filter
    saveHistory();

    const bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = bgCanvas.width;
      tempCanvas.height = bgCanvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(bgCanvas, 0, 0);
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.filter = `blur(${blurRadius}px)`;
        bgCtx.drawImage(tempCanvas, 0, 0);
        bgCtx.filter = 'none'; // reset filter for standard drawing
      }
    }
    
    setBlurRadius(0);
    setMode("brush");
    saveCurrentCanvasState();
  };

  useEffect(() => {
    if (!isOpen || view !== "editor") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input, textarea or contenteditable element
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === "INPUT" || 
        activeEl.tagName === "TEXTAREA" || 
        (activeEl as HTMLElement).isContentEditable
      )) {
        return;
      }

      const isZ = e.key.toLowerCase() === "z";
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, view, history, redoHistory]);

  const pasteImageToCanvas = (dataUrl: string) => {
    const bgCanvas = bgCanvasRef.current;
    if (!bgCanvas) return;
    const bgCtx = bgCanvas.getContext("2d");
    if (!bgCtx) return;

    saveHistory();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = bgCanvas.width;
      const H = bgCanvas.height;
      if (W === 0 || H === 0) return;

      const scaleRatio = Math.min(W / img.width, H / img.height);
      const dw = img.width * scaleRatio;
      const dh = img.height * scaleRatio;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;

      bgCtx.drawImage(img, dx, dy, dw, dh);
      saveCurrentCanvasState();

      setPasteToast("已从剪贴板粘贴图片到画布");
      setTimeout(() => setPasteToast(null), 2500);
    };
    img.src = dataUrl;
  };

  const handlePasteFromClipboard = async () => {
    setIsFileMenuOpen(false);
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        setPasteToast("请直接使用 Ctrl+V 快捷键粘贴剪贴板图片");
        setTimeout(() => setPasteToast(null), 2500);
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      let imageBlob: Blob | null = null;
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            imageBlob = await item.getType(type);
            break;
          }
        }
        if (imageBlob) break;
      }
      if (!imageBlob) {
        setPasteToast("剪贴板中未找到有效的图片");
        setTimeout(() => setPasteToast(null), 2500);
        return;
      }
      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        if (!dataUrl) return;
        if (view === "home") {
          const img = new Image();
          img.onload = () => {
            handleNewProject(
              img.width || 1024,
              img.height || 1024,
              dataUrl,
              `剪贴板图片-${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
            );
          };
          img.src = dataUrl;
        } else {
          pasteImageToCanvas(dataUrl);
        }
      };
      reader.readAsDataURL(imageBlob);
    } catch (err: any) {
      console.warn("Clipboard read error:", err);
      setPasteToast("获取剪贴板失败，请使用 Ctrl+V 快捷键粘贴");
      setTimeout(() => setPasteToast(null), 2500);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement).isContentEditable
      );

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      let imageFile: File | null = null;

      if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          if (clipboardData.files[i].type.startsWith("image/")) {
            imageFile = clipboardData.files[i];
            break;
          }
        }
      }

      if (!imageFile && clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          if (clipboardData.items[i].type.startsWith("image/")) {
            imageFile = clipboardData.items[i].getAsFile();
            if (imageFile) break;
          }
        }
      }

      if (!imageFile) return;

      e.preventDefault();
      e.stopPropagation();

      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        if (!dataUrl) return;

        if (view === "home") {
          const img = new Image();
          img.onload = () => {
            handleNewProject(
              img.width || 1024,
              img.height || 1024,
              dataUrl,
              `剪贴板图片-${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
            );
          };
          img.src = dataUrl;
        } else if (view === "editor") {
          pasteImageToCanvas(dataUrl);
        }
      };
      reader.readAsDataURL(imageFile);
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [isOpen, view, currentProjectId, history]);
  
  const clearDrawLayer = () => {
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    if (!drawCanvas || !drawCtx) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    saveHistory();
  };

  const getPointerPos = (e: React.PointerEvent) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode === 'crop' || mode === 'blur') return;
    if (e.button === 1 || e.altKey) return; // Let parent handle panning
    if (e.button === 2) return; // Ignore right click
    if (activeAnnotation?.typing) return; // Disallow starting a new annotation while typing
    e.stopPropagation();

    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    if (!drawCtx) return;
    
    const { x, y } = getPointerPos(e);

    if (mode === 'annotate') {
      if (drawCanvas) {
        annotateStartImgRef.current = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
      }
      setActiveAnnotation({
        startX: x,
        startY: y,
        endX: x,
        endY: y,
        text: "",
        typing: false
      });
      setAnnotationInputText("");
      return;
    }
    
    drawCtx.globalCompositeOperation = mode === "eraser" ? "destination-out" : "source-over";
    drawCtx.strokeStyle = mode === "eraser" ? "rgba(0,0,0,1)" : color;
    drawCtx.lineWidth = mode === "eraser" ? eraserSize / (scale * canvasDisplayRatio) : penSize;
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
    // Draw a dot just in case they click without dragging
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    if (!drawCtx) return;
    
    const { x, y } = getPointerPos(e);

    if (mode === 'annotate') {
      if (!activeAnnotation || !annotateStartImgRef.current) return;
      setActiveAnnotation(prev => prev ? { ...prev, endX: x, endY: y } : null);
      
      drawCtx.putImageData(annotateStartImgRef.current, 0, 0);
      if (annotateType === "arrow") {
        drawArrow(drawCtx, activeAnnotation.startX, activeAnnotation.startY, x, y, color, activeSize);
      } else {
        drawCircle(drawCtx, activeAnnotation.startX, activeAnnotation.startY, x, y, color, activeSize);
      }
      return;
    }

    drawCtx.lineTo(x, y);
    drawCtx.stroke();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDrawing(false);
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    if (!drawCtx) return;

    if (mode === 'annotate') {
      if (!activeAnnotation || !annotateStartImgRef.current) return;
      const { x, y } = getPointerPos(e);
      const dist = Math.hypot(x - activeAnnotation.startX, y - activeAnnotation.startY);
      
      let finalEndX = x;
      let finalEndY = y;
      
      if (dist < 5) {
        finalEndX = activeAnnotation.startX + 40;
        drawCtx.putImageData(annotateStartImgRef.current, 0, 0);
        if (annotateType === "arrow") {
          drawArrow(drawCtx, activeAnnotation.startX, activeAnnotation.startY, finalEndX, finalEndY, color, activeSize);
        } else {
          drawCircle(drawCtx, activeAnnotation.startX, activeAnnotation.startY, finalEndX, finalEndY, color, activeSize);
        }
      }
      
      setActiveAnnotation({
        startX: activeAnnotation.startX,
        startY: activeAnnotation.startY,
        endX: finalEndX,
        endY: finalEndY,
        text: "",
        typing: true
      });
      setAnnotationInputText("");
      return;
    }

    drawCtx.closePath();
    saveHistory();
  };

  const handleLiveUpdateText = (val: string) => {
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    if (!drawCanvas || !drawCtx || !activeAnnotation || !annotateStartImgRef.current) return;

    // Restore base image state
    drawCtx.putImageData(annotateStartImgRef.current, 0, 0);

    const canvasWidth = drawCanvas.width || 1000;
    const resolutionScale = Math.max(0.1, canvasWidth / 1000);

    // Redraw shape
    if (annotateType === "arrow") {
      drawArrow(drawCtx, activeAnnotation.startX, activeAnnotation.startY, activeAnnotation.endX, activeAnnotation.endY, color, activeSize);
      // Draw text with adaptive offset
      const angle = Math.atan2(activeAnnotation.endY - activeAnnotation.startY, activeAnnotation.endX - activeAnnotation.startX);
      const textOffset = Math.max(16, 24 * resolutionScale);
      const textX = activeAnnotation.endX + textOffset * Math.cos(angle);
      const textY = activeAnnotation.endY + textOffset * Math.sin(angle);
      drawAnnotationText(drawCtx, val, textX, textY, color, activeSize);
    } else {
      drawCircle(drawCtx, activeAnnotation.startX, activeAnnotation.startY, activeAnnotation.endX, activeAnnotation.endY, color, activeSize);
      // Draw text with adaptive offset
      const textOffset = Math.max(10, 12 * resolutionScale);
      const textX = Math.max(activeAnnotation.startX, activeAnnotation.endX) + textOffset;
      const textY = (activeAnnotation.startY + activeAnnotation.endY) / 2;
      drawAnnotationText(drawCtx, val, textX, textY, color, activeSize);
    }
  };

  const handleCommitAnnotation = () => {
    if (!activeAnnotation) return;
    saveHistory();
    setActiveAnnotation(null);
    setAnnotationInputText("");
    annotateStartImgRef.current = null;
  };

  const handleCancelAnnotation = () => {
    const drawCanvas = drawCanvasRef.current;
    const drawCtx = drawCanvas?.getContext("2d");
    if (drawCanvas && drawCtx && annotateStartImgRef.current) {
      drawCtx.putImageData(annotateStartImgRef.current, 0, 0);
    }
    setActiveAnnotation(null);
    setAnnotationInputText("");
    annotateStartImgRef.current = null;
  };

  const triggerGenieAnimation = (targetId: string, callback: (base64: string) => void) => {
    const bg = bgCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!bg || !draw) return;

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = bg.width;
    finalCanvas.height = bg.height;
    const finalCtx = finalCanvas.getContext("2d");
    if (!finalCtx) return;

    finalCtx.drawImage(bg, 0, 0);
    finalCtx.drawImage(draw, 0, 0);
    const base64 = finalCanvas.toDataURL("image/png");

    const container = canvasContainerRef.current;
    const targetElement = document.getElementById(targetId);

    if (container && targetElement) {
      const startRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();

      // Store callback and base64 string to execute once animation finishes
      pendingGenieCallbackRef.current = { callback, base64 };

      setGenieAnim({
        src: base64,
        startX: startRect.left,
        startY: startRect.top,
        startWidth: startRect.width,
        startHeight: startRect.height,
        endX: targetRect.left,
        endY: targetRect.top,
        endWidth: targetRect.width,
        endHeight: targetRect.height,
      });
    } else {
      // Fallback: execute immediately if elements cannot be animated
      callback(base64);
    }
  };

  const handleSave = () => {
    triggerGenieAnimation("left-staging-area", (base64) => {
      onSave(base64, true);
    });
  };

  
  const resolveImageSource = async (src: any): Promise<string> => {
    if (!src) return "";
    
    console.log("[ImageEditorModal] resolveImageSource received src:", typeof src, src);
    
    const isBlobLike = src instanceof Blob || (src && typeof src === "object" && typeof src.size === "number" && typeof src.type === "string");
    
    if (isBlobLike) {
      console.log("[ImageEditorModal] src is identified as Blob-like");
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve((reader.result as string) || "");
        };
        reader.onerror = () => {
          try {
            resolve(URL.createObjectURL(src));
          } catch {
            resolve("");
          }
        };
        reader.readAsDataURL(src);
      });
    }
    
    if (typeof src !== "string") {
      console.warn("[ImageEditorModal] src is not a string and not a Blob-like object", src);
      return "";
    }
    
    if (src.startsWith("http")) {
      console.log("[ImageEditorModal] src is an HTTP URL, using proxy");
      try {
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(src)}`;
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const blob = await response.blob();
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve((reader.result as string) || src);
            };
            reader.onerror = () => {
              resolve(src);
            };
            reader.readAsDataURL(blob);
          });
        }
      } catch (err) {
        console.warn("[ImageEditorModal] Failed to proxy/convert image URL:", err);
      }
    }
    
    console.log("[ImageEditorModal] returning src directly as string");
    return src;
  };

  const handleNewProject = async (w: number, h: number, initialBgSrc?: any, name?: string, bgColor?: string) => {
    const newId = Date.now().toString();
    const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
    
    let finalW = w;
    let finalH = h;
    const projName = name || `未命名-${list.length + 1}.psd`;
    
    let initialBg = "";
    if (initialBgSrc) {
      initialBg = await resolveImageSource(initialBgSrc);
    }

    if (initialBg) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (img.width > 0 && img.height > 0) {
            finalW = img.width;
            finalH = img.height;
          }
          resolve();
        };
        img.onerror = () => {
          resolve();
        };
        img.src = initialBg;
      });
    }
    
    if (!initialBg) {
      const blankCanvas = document.createElement("canvas");
      blankCanvas.width = finalW;
      blankCanvas.height = finalH;
      const blankCtx = blankCanvas.getContext("2d");
      if (blankCtx) {
        if (bgColor && bgColor !== "transparent") {
          blankCtx.fillStyle = bgColor;
          blankCtx.fillRect(0, 0, finalW, finalH);
        } else if (bgColor === "transparent") {
          blankCtx.clearRect(0, 0, finalW, finalH);
        } else {
          blankCtx.fillStyle = "#FFFFFF";
          blankCtx.fillRect(0, 0, finalW, finalH);
        }
        initialBg = blankCanvas.toDataURL();
      }
    }

    let initialThumb = "";
    if (initialBg) {
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 256;
      thumbCanvas.height = Math.max(32, Math.round(256 * (finalH / finalW)));
      const thumbCtx = thumbCanvas.getContext("2d");
      if (thumbCtx) {
        thumbCtx.fillStyle = bgColor === "transparent" ? "#FFF" : (bgColor || "#FFF");
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = initialBg;
        let isLoaded = false;
        await new Promise((res) => {
          img.onload = () => { isLoaded = true; res(null); };
          img.onerror = () => { isLoaded = false; res(null); };
        });
        if (isLoaded) {
          thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
        }
        initialThumb = thumbCanvas.toDataURL("image/jpeg", 0.85);
      }
    }

    list.unshift({
      id: newId,
      name: projName,
      thumbnail: initialThumb,
      updatedAt: Date.now(),
      width: finalW,
      height: finalH,
      bgColor
    });
    await setIndexedDBItem("editor_projects", list);
    
    if (initialBg) {
      await setIndexedDBItem(`editor_bg_${newId}`, initialBg);
    }
    
    setIsFileMenuOpen(false);
    setIsNewDialogOpen(false);
    setCurrentProjectId(newId);
    setCurrentProjectName(projName);
    setView("editor");
  };

  const handleOpenProject = async (id: string) => {
    const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
    const proj = list.find(p => p.id === id);
    if (proj) {
      setCurrentProjectName(proj.name);
    }
    setCurrentProjectId(id);
    setView("editor");
  };

  const handleCloseCanvas = async () => {
    await saveCurrentCanvasState();
    setCurrentProjectId(null);
    setIsFileMenuOpen(false);
    setView("home");
  };

  const handleNewCanvas = () => {
    setIsFileMenuOpen(false);
    setIsNewDialogOpen(true);
  };

  const handleSaveToTopAction = () => {
    if (!onSaveToTop) return;
    triggerGenieAnimation("top-staging-area", onSaveToTop);
  };

  const handleDownload = () => {
    const bg = bgCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!bg || !draw) return;
    
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = bg.width;
    finalCanvas.height = bg.height;
    const finalCtx = finalCanvas.getContext("2d");
    if (!finalCtx) return;
    
    finalCtx.fillStyle = "#FFFFFF";
    finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    finalCtx.drawImage(bg, 0, 0);
    finalCtx.drawImage(draw, 0, 0);
    
    const dataUrl = finalCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `edited-image-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setIsFileMenuOpen(false);
  };

  if (typeof window === "undefined") return null;

  const handleWheel = (e: React.WheelEvent) => {
    const zoomSensitivity = 0.001;
    let delta = -e.deltaY * zoomSensitivity;
    if (e.ctrlKey) delta *= 5;
    
    const newScale = Math.max(0.1, Math.min(scale * (1 + delta), 20));
    
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    
    const newPanX = dx - (newScale * (dx - pan.x)) / scale;
    const newPanY = dy - (newScale * (dy - pan.y)) / scale;

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey) || e.button === 2) {
      e.preventDefault();
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[999] flex items-center justify-center p-2 md:p-5 lg:p-8 backdrop-blur-md ${theme === 'light' ? 'bg-neutral-900/40' : 'bg-neutral-950/80'}`}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 10 }}
            className={`w-full h-full max-w-7xl relative flex flex-col ${theme === 'light' ? 'bg-white text-neutral-850' : 'bg-neutral-900 text-neutral-100'} select-none font-sans rounded-2xl overflow-hidden shadow-2xl border ${theme === 'light' ? 'border-neutral-200' : 'border-neutral-800'}`}
          >
            <AnimatePresence>
              {pasteToast && (
                <motion.div
                  initial={{ opacity: 0, y: -20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.95 }}
                  className="absolute top-16 left-1/2 -translate-x-1/2 z-[999999] bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 border border-blue-400/40 pointer-events-none"
                >
                  <ClipboardPaste className="w-4 h-4 text-white" />
                  <span>{pasteToast}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
                onCloseModal={onClose}
              />
            ) : (
              <>
            {/* Top Options Bar (Matching App.tsx Style) */}
            <div className={`h-14 flex items-center px-4 border-b shrink-0 text-xs shadow-sm z-50 relative backdrop-blur-md justify-between ${
              theme === 'light' ? 'bg-white/95 border-neutral-200' : 'bg-neutral-900/95 border-neutral-800'
            }`}>
              {/* Left: Brand Icon, Home & Tools */}
              <div className="flex items-center gap-2.5">
                {/* Brand Squircle */}
                <div
                  className="bg-blue-600 w-8 h-8 rounded-xl shadow-md text-white flex items-center justify-center flex-shrink-0"
                  style={{ clipPath: "url(#squircle-clip)" }}
                >
                  <Sparkles className="w-4 h-4 text-white animate-pulse" />
                </div>

                {/* Draft Library Button */}
                <button
                  onClick={handleCloseCanvas}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-sm ${
                    theme === "light"
                      ? "bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200"
                      : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-750 hover:text-white"
                  }`}
                  title="关闭当前画布并返回草稿库"
                >
                  <Home className="w-3.5 h-3.5 text-neutral-400" />
                  <span>草稿库</span>
                </button>

                {/* File Dropdown Menu */}
                <div className="relative" ref={fileMenuRef}>
                  <button
                    onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border shadow-sm ${
                      isFileMenuOpen
                        ? "bg-blue-600 border-neutral-500 text-white"
                        : theme === "light"
                          ? "bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200"
                          : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-750 hover:text-white"
                    }`}
                  >
                    <File className="w-3.5 h-3.5 text-neutral-400" />
                    <span>文件</span>
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                  <AnimatePresence>
                    {isFileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.96 }}
                        className={`absolute top-full left-0 mt-2 w-56 rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,1)] border p-1.5 z-[99999] overflow-hidden ${
                          theme === "light"
                            ? "bg-white border-neutral-200 text-neutral-800"
                            : "bg-neutral-900 border-neutral-700 text-neutral-200"
                        }`}
                      >
                        <button 
                          onClick={handleCloseCanvas}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-500/15 hover:text-neutral-300 text-neutral-400 transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <SquareX className="w-4 h-4 text-neutral-400" />
                            <span className="font-bold text-xs">关闭画布</span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono">返回草稿库</span>
                        </button>
                        <button 
                          onClick={handleNewCanvas}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-500/15 hover:text-neutral-400 transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <FilePlus className="w-4 h-4 text-neutral-400" />
                            <span className="font-bold text-xs">新建画布...</span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono">比例设置</span>
                        </button>
                        <button 
                          onClick={handlePasteFromClipboard}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-500/15 hover:text-neutral-300 text-neutral-300 transition-colors flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <ClipboardPaste className="w-4 h-4 text-blue-400" />
                            <span className="font-bold text-xs">从剪贴板粘贴图片</span>
                          </div>
                          <span className="text-[10px] text-neutral-400 font-mono">Ctrl+V</span>
                        </button>
                        <div className={`h-px my-1 ${theme === 'light' ? 'bg-neutral-100' : 'bg-neutral-750'}`} />
                        {onSaveToTop && (
                          <button 
                            onClick={() => {
                              handleSaveToTopAction();
                              setIsFileMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-500/15 hover:text-neutral-400 transition-colors flex items-center gap-2 cursor-pointer text-xs font-semibold"
                          >
                            <LayoutPanelTop className="w-3.5 h-3.5 text-neutral-400" />
                            <span>保存至上方暂存区</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            handleSave();
                            setIsFileMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-500/15 hover:text-neutral-400 transition-colors flex items-center gap-2 cursor-pointer text-xs font-semibold"
                        >
                          <PanelLeft className="w-3.5 h-3.5 text-neutral-400" />
                          <span>保存至左侧暂存区</span>
                        </button>
                        <button
                          onClick={handleDownload}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-500/15 hover:text-neutral-400 transition-colors flex items-center gap-2 cursor-pointer text-xs font-semibold"
                        >
                          <Download className="w-3.5 h-3.5 text-neutral-400" />
                          <span>下载图像到本地</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className={`w-px h-5 mx-0.5 ${theme === 'light' ? 'bg-neutral-100' : 'bg-neutral-800'}`} />

                {/* Brush / Eraser Size Popover */}
                {mode === 'annotate' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400 font-bold">样式:</span>
                    <div className={`flex items-center rounded-xl p-0.5 border shadow-inner ${
                      theme === 'light' ? 'bg-neutral-100 border-neutral-300' : 'bg-neutral-850 border-neutral-750'
                    }`}>
                      <button
                        onClick={() => setAnnotateType("arrow")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          annotateType === "arrow"
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                            : theme === "light"
                              ? "text-neutral-600 hover:bg-neutral-250"
                              : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                        }`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>箭头</span>
                      </button>
                      <button
                        onClick={() => setAnnotateType("circle")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          annotateType === "circle"
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                            : theme === "light"
                              ? "text-neutral-600 hover:bg-neutral-250"
                              : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                        }`}
                      >
                        <Circle className="w-3.5 h-3.5" />
                        <span>圆圈</span>
                      </button>
                    </div>

                    <div className={`w-px h-5 mx-1.5 ${theme === 'light' ? 'bg-neutral-200' : 'bg-neutral-800'}`} />

                    <span className="text-neutral-400 font-bold">粗细:</span>
                    <select 
                      className={`px-2 py-1 rounded-xl border text-xs font-bold outline-none cursor-pointer ${
                        theme === 'light' ? 'bg-neutral-100 border-neutral-300 text-neutral-800' : 'bg-neutral-800 border-neutral-700 text-neutral-200'
                      }`}
                      value={activeSize}
                      onChange={(e) => setPenSize(Number(e.target.value))}
                    >
                      {Array.from(new Set([4, 8, 12, 16, 24, 32, activeSize])).sort((a, b) => a - b).map(sz => (
                        <option key={sz} value={sz}>{sz}px</option>
                      ))}
                    </select>
                  </div>
                ) : mode === 'crop' ? (
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-400 font-bold">裁剪比例:</span>
                    <select 
                      className={`px-2.5 py-1 rounded-xl border text-xs font-bold outline-none cursor-pointer ${
                        theme === 'light' ? 'bg-neutral-100 border-neutral-300 text-neutral-800' : 'bg-neutral-800 border-neutral-700 text-neutral-200'
                      }`}
                      value={cropRatio === null ? "自由" : ASPECT_RATIOS.find(r => r.w > 0 && Math.abs((r.w/r.h) - cropRatio) < 0.01)?.label || "自由"}
                      onChange={(e) => handleRatioChange(e.target.value)}
                    >
                      {ASPECT_RATIOS.map(r => (
                        <option key={r.label} value={r.label}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                ) : mode === 'blur' ? (
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-xs ${theme === 'light' ? 'text-neutral-600' : 'text-neutral-400'}`}>模糊程度:</span>
                    <input 
                      type="range"
                      min="0"
                      max="40"
                      value={blurRadius}
                      onChange={(e) => setBlurRadius(Number(e.target.value))}
                      className={`w-32 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                        theme === 'light' ? 'bg-neutral-200' : 'bg-neutral-800'
                      }`}
                    />
                    <span className={`font-mono text-xs font-bold w-8 ${theme === 'light' ? 'text-neutral-700' : 'text-neutral-300'}`}>{blurRadius}px</span>
                  </div>
                ) : (
                  <div className="relative" ref={popoverRef}>
                    <button 
                      onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border shadow-sm ${
                        isSettingsOpen
                          ? theme === "light"
                            ? "bg-blue-50 border-blue-500 text-blue-600"
                            : "bg-neutral-800 border-blue-500 text-blue-300"
                          : theme === "light"
                            ? "bg-neutral-100 border-neutral-300 text-neutral-800 hover:bg-neutral-200"
                            : "bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-750 hover:text-white"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center shadow-sm ${
                        theme === 'light' ? 'bg-neutral-200' : 'bg-white'
                      }`}>
                        <div
                          className="rounded-full bg-blue-600"
                          style={{ width: Math.max(3, Math.min(activeSize / 3, 12)), height: Math.max(3, Math.min(activeSize / 3, 12)) }}
                        />
                      </div>
                      <span className="font-mono text-xs">{activeSize}px</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </button>
                    
                    <AnimatePresence>
                      {isSettingsOpen && (
                        <motion.div 
                          initial={{ opacity: 0, y: -5, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -5, scale: 0.95 }}
                          className={`absolute top-full left-0 mt-2 w-72 rounded-2xl shadow-2xl border p-4 z-50 text-xs ${
                            theme === "light"
                              ? "bg-white border-neutral-200 text-neutral-800"
                              : "bg-neutral-900 border-neutral-800 text-neutral-100"
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center shrink-0 shadow-inner relative ${
                              theme === "light"
                                ? "bg-neutral-100 border-neutral-200"
                                : "bg-neutral-950 border-neutral-800"
                            }`}>
                              <div
                                className={`rounded-full transition-all duration-75 ${
                                  theme === "light" ? "bg-neutral-700 shadow-sm" : "bg-neutral-500 shadow-md"
                                }`}
                                style={{
                                  width: Math.max(4, Math.min(activeSize, 48)),
                                  height: Math.max(4, Math.min(activeSize, 48))
                                }}
                              />
                            </div>
                            <div className="flex-1 flex flex-col gap-2.5">
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold text-xs ${
                                  theme === 'light' ? 'text-neutral-600' : 'text-neutral-400'
                                }`}>{mode === 'brush' ? '画笔粗细' : '橡皮大小'}</span>
                                <div className={`flex items-center gap-1 font-mono font-bold ${
                                  theme === 'light' ? 'text-neutral-700' : 'text-neutral-400'
                                }`}>
                                  <span>{activeSize}</span>
                                  <span className={`text-[10px] font-normal ${
                                    theme === 'light' ? 'text-neutral-500' : 'text-neutral-500'
                                  }`}>px</span>
                                </div>
                              </div>
                              <input 
                                type="range" 
                                min="1" 
                                max={mode === 'eraser' ? 300 : 100} 
                                value={activeSize} 
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  mode === 'brush' ? setPenSize(val) : setEraserSize(val);
                                }}
                                className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                                  theme === 'light' ? 'bg-neutral-200' : 'bg-neutral-800'
                                }`}
                              />
                              <div className="flex items-center justify-between gap-1 mt-0.5">
                                {(mode === 'eraser' ? [10, 30, 50, 100, 200, 300] : [2, 5, 10, 20, 40, 80]).map((sz) => (
                                  <button
                                    key={sz}
                                    onClick={() => mode === 'brush' ? setPenSize(sz) : setEraserSize(sz)}
                                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono transition-all cursor-pointer ${
                                      activeSize === sz
                                        ? 'bg-blue-600 text-white font-bold'
                                        : theme === 'light'
                                          ? 'bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200'
                                          : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750'
                                    }`}
                                  >
                                    {sz}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Center: Undo/Redo & Document Info */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 z-10">
                {/* Undo / Redo Capsule */}
                <div className={`flex items-center rounded-full p-1 border shadow-inner ${
                  theme === 'light' ? 'bg-neutral-100 border-neutral-300' : 'bg-neutral-800/90 border-neutral-700'
                }`}>
                  <button
                    onClick={handleUndo}
                    disabled={history.length <= 1}
                    className={`p-1.5 rounded-full transition-all ${
                      history.length <= 1 
                        ? 'opacity-30 cursor-not-allowed text-neutral-500' 
                        : theme === 'light'
                          ? 'hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 cursor-pointer'
                          : 'hover:bg-neutral-700 text-neutral-300 hover:text-white cursor-pointer'
                    }`}
                    title="撤销 (Ctrl+Z)"
                  >
                    <Undo className="w-3.5 h-3.5" />
                  </button>
                  <div className={`w-px h-3.5 mx-1 ${theme === 'light' ? 'bg-neutral-300' : 'bg-neutral-700'}`} />
                  <button
                    onClick={handleRedo}
                    disabled={redoHistory.length === 0}
                    className={`p-1.5 rounded-full transition-all ${
                      redoHistory.length === 0 
                        ? 'opacity-30 cursor-not-allowed text-neutral-500' 
                        : theme === 'light'
                          ? 'hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900 cursor-pointer'
                          : 'hover:bg-neutral-700 text-neutral-300 hover:text-white cursor-pointer'
                    }`}
                    title="重做 (Ctrl+Y)"
                  >
                    <Redo className="w-3.5 h-3.5" />
                  </button>
                </div>


              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {mode === 'crop' && (
                  <>
                    <button 
                      onClick={() => setMode("brush")}
                      className="px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      取消
                    </button>
                    <button 
                      onClick={applyCrop}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>确认裁剪</span>
                    </button>
                    <div className="w-px h-4 bg-neutral-700 mx-1" />
                  </>
                )}

                {mode === 'blur' && (
                  <>
                    <button 
                      onClick={() => {
                        setBlurRadius(0);
                        setMode("brush");
                      }}
                      className={`px-3 py-1.5 rounded-xl border font-bold text-xs transition-colors cursor-pointer ${
                        theme === 'light'
                          ? 'border-neutral-300 bg-neutral-100 hover:bg-neutral-200 text-neutral-600'
                          : 'border-neutral-700 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 hover:text-white'
                      }`}
                    >
                      取消
                    </button>
                    <button 
                      onClick={applyGaussianBlur}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>确认应用</span>
                    </button>
                    <div className={`w-px h-4 mx-1 ${theme === 'light' ? 'bg-neutral-200' : 'bg-neutral-800'}`} />
                  </>
                )}



                {/* Modal Close button */}
                <button 
                  onClick={onClose}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                    theme === 'light'
                      ? 'border-neutral-300 bg-neutral-100 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-750'
                  }`}
                  title="关闭窗口"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Workspace Area: Left Toolbar + Canvas Area */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Toolbar */}
              <div className={`w-16 flex flex-col items-center py-3 gap-2 border-r shrink-0 z-30 shadow-md ${
                theme === 'light' ? 'bg-neutral-100 border-neutral-200' : 'bg-neutral-900/90 border-neutral-800 backdrop-blur-md'
              }`}>
                <button
                  onClick={() => setMode("brush")}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    mode === "brush" 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400" 
                      : theme === 'light'
                        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="画笔工具 (B)"
                >
                  <Brush className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMode("eraser")}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    mode === "eraser" 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400" 
                      : theme === 'light'
                        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="橡皮擦工具 (E)"
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMode("crop")}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    mode === "crop" 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400" 
                      : theme === 'light'
                        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="裁剪工具 (C)"
                >
                  <Crop className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMode("annotate")}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    mode === "annotate" 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400" 
                      : theme === 'light'
                        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="标注工具 (A)"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMode("blur")}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    mode === "blur" 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400" 
                      : theme === 'light'
                        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"
                        : "hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  }`}
                  title="高斯模糊工具 (B)"
                >
                  <Droplet className="w-4 h-4" />
                </button>

                <div className={`w-8 h-px my-1.5 ${theme === 'light' ? 'bg-neutral-100' : 'bg-neutral-800'}`} />

                {/* Color Swatches (2 Columns) */}
                <div className={`grid grid-cols-2 gap-2 px-2 transition-opacity ${
                  mode === "eraser" || mode === "crop" || mode === "blur" ? "opacity-30 pointer-events-none" : "opacity-100"
                }`}>
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-4 h-4 rounded-full transition-transform cursor-pointer border ${
                        color === c 
                          ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-900 scale-110 border-white shadow-md" 
                          : "border-neutral-700/80 hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>

                {/* Custom Color Picker Swatch */}
                <div 
                  className={`mt-1 relative w-6 h-6 rounded-full border transition-all ${
                    mode === "eraser" || mode === "crop" || mode === "blur"
                      ? "opacity-30 pointer-events-none" 
                      : "opacity-100 hover:scale-105 border-neutral-400 shadow-md cursor-pointer"
                  } overflow-hidden shadow-sm`}
                  style={{ backgroundColor: color }}
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-[-10px] w-[50px] h-[50px] cursor-pointer opacity-0"
                    title="自定义前景色"
                  />
                </div>
              </div>

              {/* Canvas Area (Workspace) */}
              <div 
                ref={workspaceContainerRef}
                className={`flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing ${theme === 'light' ? 'bg-neutral-100' : 'bg-neutral-950'}`}
                style={{
                  backgroundImage: theme === 'light'
                    ? 'conic-gradient(#e2e8f0 25%, #ffffff 0 50%, #e2e8f0 0 75%, #ffffff 0)'
                    : 'conic-gradient(#26262a 25%, #18181c 0 50%, #26262a 0 75%, #18181c 0)',
                  backgroundSize: '20px 20px'
                }}
                onWheel={handleWheel}
                onPointerDown={handleContainerPointerDown}
                onPointerMove={handleContainerPointerMove}
                onPointerUp={handleContainerPointerUp}
                onPointerCancel={handleContainerPointerUp}
                onPointerLeave={handleContainerPointerUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                {/* Top Floating Button (Matching User's Top Red Oval) */}
                {onSaveToTop && (
                  <button
                    id="top-stage-btn"
                    onClick={handleSaveToTopAction}
                    className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition-all hover:scale-[1.03] cursor-pointer"
                    title="发送当前画布到顶部参考暂存区"
                  >
                    <LayoutPanelTop className="w-3.5 h-3.5" />
                    <span>发送到顶部暂存区</span>
                  </button>
                )}

                {/* Left Floating Button (Matching User's Left Red Oval - Floating OUTSIDE Sidebar) */}
                <button
                  id="left-stage-btn"
                  onClick={handleSave}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-40 px-3 py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl flex flex-col items-center gap-2 cursor-pointer transition-all hover:scale-105 active:scale-95 border border-emerald-500/50"
                  title="发送当前画布到左侧暂存区"
                >
                  <PanelLeft className="w-4 h-4 animate-bounce" />
                  <span className="[writing-mode:vertical-lr] tracking-widest text-[11px] font-extrabold text-white/90">发送到左侧暂存区</span>
                </button>
                {/* Aspect Ratio Container (The Canvas Paper) */}
                <div 
                  ref={canvasContainerRef}
                  className={`relative rounded-sm touch-none ${(mode === 'crop' || mode === 'annotate') ? '' : 'overflow-hidden'} ${theme === 'light' ? 'shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-neutral-200' : 'shadow-[0_25px_60px_rgba(0,0,0,0.7)] ring-1 ring-neutral-800/80'}`}
                  style={{
                    width: `${canvasPaperSize.width}px`,
                    height: `${canvasPaperSize.height}px`,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: 'center'
                  }}
                >
                  <canvas 
                    ref={bgCanvasRef}
                    className="block bg-white w-full h-full"
                    style={{
                      filter: mode === 'blur' && blurRadius > 0 ? `blur(${blurRadius * scale * canvasDisplayRatio}px)` : 'none',
                      transition: 'filter 0.05s ease-out'
                    }}
                  />
                  <canvas 
                    ref={drawCanvasRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ 
                      cursor: cursorStyle 
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onPointerLeave={onPointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  {mode === 'crop' && (
                    <CropOverlay cropBox={cropBox} setCropBox={setCropBox} cropRatio={cropRatio} canvasRatio={aspectRatio} />
                  )}
                  {activeAnnotation?.typing && (
                    <div 
                      className="absolute z-[100] flex flex-col gap-2 p-2.5 rounded-2xl bg-neutral-900/95 border border-neutral-700/80 text-white shadow-2xl backdrop-blur-md"
                      style={{
                        left: `${(activeAnnotation.endX / (drawCanvasRef.current?.width || 1)) * 100}%`,
                        top: `${(activeAnnotation.endY / (drawCanvasRef.current?.height || 1)) * 100}%`,
                        transform: `translate(${
                          (activeAnnotation.endX / (drawCanvasRef.current?.width || 1)) > 0.75 ? '-250px' : '10px'
                        }, ${
                          (activeAnnotation.endY / (drawCanvasRef.current?.height || 1)) > 0.75 ? '-150px' : '10px'
                        }) scale(${1 / scale})`,
                        transformOrigin: 'top left',
                        width: '240px',
                      }}
                      onClick={e => e.stopPropagation()}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between text-[10px] text-neutral-400 font-bold mb-0.5 select-none">
                        <span>输入标注文字</span>
                        <span className="font-mono bg-neutral-800 px-1.5 py-0.5 rounded text-[9px]">Enter确认</span>
                      </div>
                      <input
                        type="text"
                        autoFocus
                        value={annotationInputText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAnnotationInputText(val);
                          handleLiveUpdateText(val);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCommitAnnotation();
                          } else if (e.key === 'Escape') {
                            handleCancelAnnotation();
                          }
                        }}
                        className="w-full bg-neutral-800/80 border border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/35"
                        placeholder="在草稿图上打字标注..."
                      />
                      <div className="flex justify-end gap-1.5 mt-1">
                        <button
                          onClick={handleCancelAnnotation}
                          className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleCommitAnnotation}
                          className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 transition-colors cursor-pointer"
                        >
                          确认
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                

              </div>
            </div>
            </>
          )}
          
          {/* Apple Dock-style Genie Flyaway Animation Overlay */}
          <AnimatePresence>
            {genieAnim && (
              <motion.img
                key="genie-fly"
                src={genieAnim.src}
                className="fixed pointer-events-none z-[999999] border-2 border-white/90 shadow-2xl object-contain bg-transparent"
                initial={{
                  left: genieAnim.startX,
                  top: genieAnim.startY,
                  width: genieAnim.startWidth,
                  height: genieAnim.startHeight,
                  opacity: 0.95,
                  borderRadius: "0px",
                  filter: "blur(0px)",
                  transformOrigin: "center"
                }}
                animate={{
                  left: genieAnim.endX + genieAnim.endWidth / 2 - 20,
                  top: genieAnim.endY + genieAnim.endHeight / 2 - 20,
                  width: 40,
                  height: 40,
                  opacity: 0.15,
                  borderRadius: "0px",
                  filter: "blur(2px)"
                }}
                exit={{
                  opacity: 0,
                  scale: 0.1
                }}
                transition={{
                  duration: 0.65,
                  ease: [0.25, 0.46, 0.45, 0.94], // Smooth Apple-style glide
                }}
                onAnimationComplete={() => {
                  setGenieAnim(null);
                  if (pendingGenieCallbackRef.current) {
                    const { callback, base64 } = pendingGenieCallbackRef.current;
                    pendingGenieCallbackRef.current = null;
                    callback(base64);
                  }
                }}
              />
            )}
          </AnimatePresence>

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

const CropOverlay = ({ cropBox, setCropBox, cropRatio, canvasRatio }: any) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const startDragRef = useRef<{ x: number, y: number, box: any } | null>(null);

  const relativeCropRatio = cropRatio ? (cropRatio / canvasRatio) : null;

  useEffect(() => {
    if (!activeHandle) return;
    
    const handleMove = (e: PointerEvent) => {
      const container = containerRef.current;
      const start = startDragRef.current;
      if (!container || !start) return;
      
      const rect = container.getBoundingClientRect();
      const dx = (e.clientX - start.x) / rect.width;
      const dy = (e.clientY - start.y) / rect.height;
      
      let newBox = { ...start.box };
      
      if (activeHandle === 'move') {
        newBox.x += dx;
        newBox.y += dy;

        // Snapping while dragging: original boundaries snap at 1.5% threshold
        const SNAP = 0.015;
        if (Math.abs(newBox.x) < SNAP) newBox.x = 0;
        if (Math.abs(newBox.y) < SNAP) newBox.y = 0;
        if (Math.abs(newBox.x + newBox.w - 1) < SNAP) newBox.x = 1 - newBox.w;
        if (Math.abs(newBox.y + newBox.h - 1) < SNAP) newBox.y = 1 - newBox.h;
      } else {
        const oldX = newBox.x;
        const oldY = newBox.y;
        const oldW = newBox.w;
        const oldH = newBox.h;

        if (activeHandle.includes('n')) {
          newBox.y += dy;
          newBox.h -= dy;
        }
        if (activeHandle.includes('s')) {
          newBox.h += dy;
        }
        if (activeHandle.includes('w')) {
          newBox.x += dx;
          newBox.w -= dx;
        }
        if (activeHandle.includes('e')) {
          newBox.w += dx;
        }

        // Snapping during single-direction resizes (only when aspect ratio is not locked)
        const SNAP = 0.015;
        if (!relativeCropRatio) {
          if (activeHandle.includes('n')) {
            if (Math.abs(newBox.y) < SNAP) {
              const diff = -newBox.y;
              newBox.y = 0;
              newBox.h += diff;
            }
          }
          if (activeHandle.includes('s')) {
            if (Math.abs(newBox.y + newBox.h - 1) < SNAP) {
              newBox.h = 1 - newBox.y;
            }
          }
          if (activeHandle.includes('w')) {
            if (Math.abs(newBox.x) < SNAP) {
              const diff = -newBox.x;
              newBox.x = 0;
              newBox.w += diff;
            }
          }
          if (activeHandle.includes('e')) {
            if (Math.abs(newBox.x + newBox.w - 1) < SNAP) {
              newBox.w = 1 - newBox.x;
            }
          }
        }

        // Constrained ratio resizing
        if (relativeCropRatio) {
          if (activeHandle === 'e' || activeHandle === 'w') {
            newBox.h = newBox.w / relativeCropRatio;
            newBox.y = oldY + (oldH - newBox.h) / 2;
          } else if (activeHandle === 'n' || activeHandle === 's') {
            newBox.w = newBox.h * relativeCropRatio;
            newBox.x = oldX + (oldW - newBox.w) / 2;
          } else {
            // Corner handles (nw, ne, sw, se)
            const currentRatio = newBox.w / newBox.h;
            if (currentRatio > relativeCropRatio) {
              newBox.w = newBox.h * relativeCropRatio;
              if (activeHandle.includes('w')) {
                newBox.x = (oldX + oldW) - newBox.w;
              }
            } else {
              newBox.h = newBox.w / relativeCropRatio;
              if (activeHandle.includes('n')) {
                newBox.y = (oldY + oldH) - newBox.h;
              }
            }
          }
        }
      }
      
      // Limit minimum sizes
      if (newBox.w < 0.05) {
        newBox.w = 0.05;
        if (activeHandle.includes('w')) {
          newBox.x = (start.box.x + start.box.w) - 0.05;
        }
      }
      if (newBox.h < 0.05) {
        newBox.h = 0.05;
        if (activeHandle.includes('n')) {
          newBox.y = (start.box.y + start.box.h) - 0.05;
        }
      }

      // Outer safety bounds to prevent completely dragging the crop box off the workspace
      if (newBox.x < -2) newBox.x = -2;
      if (newBox.y < -2) newBox.y = -2;
      if (newBox.x > 3) newBox.x = 3;
      if (newBox.y > 3) newBox.y = 3;
      if (newBox.w > 5) newBox.w = 5;
      if (newBox.h > 5) newBox.h = 5;

      setCropBox(newBox);
    };
    
    const handleUp = () => setActiveHandle(null);
    
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [activeHandle, relativeCropRatio, setCropBox]);

  const handlePointerDown = (e: React.PointerEvent, handle: string) => {
    e.stopPropagation();
    setActiveHandle(handle);
    startDragRef.current = { x: e.clientX, y: e.clientY, box: { ...cropBox } };
  };

  return (
    <div ref={containerRef} className="absolute inset-0 z-50 pointer-events-none">
      {/* Top, Bottom, Left, Right dark backdrop overlays safely drawn */}
      <div className="absolute top-0 left-0 right-0 bg-black/60 pointer-events-auto" style={{ height: `${Math.max(0, cropBox.y) * 100}%` }} />
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 pointer-events-auto" style={{ height: `${Math.max(0, 1 - (cropBox.y + cropBox.h)) * 100}%` }} />
      <div className="absolute bg-black/60 pointer-events-auto" style={{ top: `${Math.max(0, cropBox.y) * 100}%`, bottom: `${Math.max(0, 1 - (cropBox.y + cropBox.h)) * 100}%`, left: 0, width: `${Math.max(0, cropBox.x) * 100}%` }} />
      <div className="absolute bg-black/60 pointer-events-auto" style={{ top: `${Math.max(0, cropBox.y) * 100}%`, bottom: `${Math.max(0, 1 - (cropBox.y + cropBox.h)) * 100}%`, right: 0, width: `${Math.max(0, 1 - (cropBox.x + cropBox.w)) * 100}%` }} />
      
      <div 
        className="absolute border-2 border-neutral-400 cursor-move pointer-events-auto shadow-[0_0_0_1px_rgba(255,255,255,0.5),_0_4px_20px_rgba(0,0,0,0.25)]"
        style={{
          left: `${cropBox.x * 100}%`,
          top: `${cropBox.y * 100}%`,
          width: `${cropBox.w * 100}%`,
          height: `${cropBox.h * 100}%`,
        }}
        onPointerDown={(e) => handlePointerDown(e, 'move')}
      >
        {/* Grid lines inside */}
        <div className="absolute left-1/3 top-0 bottom-0 w-px bg-neutral-500/70 pointer-events-none" />
        <div className="absolute left-2/3 top-0 bottom-0 w-px bg-neutral-500/70 pointer-events-none" />
        <div className="absolute top-1/3 left-0 right-0 h-px bg-neutral-500/70 pointer-events-none" />
        <div className="absolute top-2/3 left-0 right-0 h-px bg-neutral-500/70 pointer-events-none" />

        {/* Premium Figma-style controls: w-3 h-3 adaptive grey (neutral-500) rounded-sm with border-2 border-white */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-500 border border-white rounded-sm shadow-md cursor-ns-resize" onPointerDown={e => handlePointerDown(e, 'n')} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-neutral-500 border border-white rounded-sm shadow-md cursor-ns-resize" onPointerDown={e => handlePointerDown(e, 's')} />
        <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-500 border border-white rounded-sm shadow-md cursor-ew-resize" onPointerDown={e => handlePointerDown(e, 'w')} />
        <div className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-500 border border-white rounded-sm shadow-md cursor-ew-resize" onPointerDown={e => handlePointerDown(e, 'e')} />
        
        <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-neutral-500 border border-white rounded-sm shadow-md cursor-nwse-resize" onPointerDown={e => handlePointerDown(e, 'nw')} />
        <div className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-neutral-500 border border-white rounded-sm shadow-md cursor-nesw-resize" onPointerDown={e => handlePointerDown(e, 'ne')} />
        <div className="absolute bottom-0 left-0 -translate-x-1/2 translate-y-1/2 w-3.5 h-3.5 bg-neutral-500 border border-white rounded-sm shadow-md cursor-nesw-resize" onPointerDown={e => handlePointerDown(e, 'sw')} />
        <div className="absolute bottom-0 right-0 translate-x-1/2 translate-y-1/2 w-3.5 h-3.5 bg-neutral-500 border border-white rounded-sm shadow-md cursor-nwse-resize" onPointerDown={e => handlePointerDown(e, 'se')} />
      </div>
    </div>
  );
};

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string,
  width: number
) => {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  
  const canvasWidth = ctx.canvas?.width || 1000;
  const resolutionScale = Math.max(0.1, canvasWidth / 1000);
  const actualLineWidth = Math.max(1.5, (width / 2) * resolutionScale);
  ctx.lineWidth = actualLineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw arrow shaft
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Draw arrowhead at the start point (fromX, fromY) pointing away from the end point (toX, toY)
  const angle = Math.atan2(fromY - toY, fromX - toX);
  const headLength = Math.max(10, width * 1.5 * resolutionScale);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(
    fromX - headLength * Math.cos(angle - Math.PI / 6),
    fromY - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    fromX - headLength * Math.cos(angle + Math.PI / 6),
    fromY - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawCircle = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string,
  width: number
) => {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.strokeStyle = color;
  
  const canvasWidth = ctx.canvas?.width || 1000;
  const resolutionScale = Math.max(0.1, canvasWidth / 1000);
  ctx.lineWidth = Math.max(1.5, (width / 2) * resolutionScale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const rx = Math.abs(endX - startX) / 2;
  const ry = Math.abs(endY - startY) / 2;
  const cx = Math.min(startX, endX) + rx;
  const cy = Math.min(startY, endY) + ry;

  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
};

const drawAnnotationText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  width: number
) => {
  if (!text.trim()) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  
  const canvasWidth = ctx.canvas?.width || 1000;
  const resolutionScale = Math.max(0.1, canvasWidth / 1000);
  const fontSize = Math.max(12, width * 1.5 * resolutionScale);
  
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = color;
  
  // High contrast readability outline:
  // Default to white shadow stroke, but switch to black if the text color itself is white.
  const isWhite = color.toUpperCase() === '#FFFFFF' || color.toLowerCase() === 'white' || color.replace(/\s+/g, '') === 'rgb(255,255,255)' || color.replace(/\s+/g, '') === 'rgba(255,255,255,1)';
  ctx.strokeStyle = isWhite ? "black" : "white";
  ctx.lineWidth = Math.max(2.5, fontSize / 5);
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
};
