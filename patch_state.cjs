const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const targetRegex = /const \[mode, setMode\] = useState<"brush" \| "eraser" \| "crop">\("brush"\);[\s\S]*?}, \[isOpen, initialImage\]\);/;

const replacement = `const [mode, setMode] = useState<"brush" | "eraser" | "crop">(
    () => (localStorage.getItem("editor_mode") as any) || "brush"
  );
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [color, setColor] = useState(() => localStorage.getItem("editor_color") || COLORS[0]);
  const [penSize, setPenSize] = useState(() => Number(localStorage.getItem("editor_penSize")) || 10);
  const [eraserSize, setEraserSize] = useState(() => Number(localStorage.getItem("editor_eraserSize")) || 20);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const [cropBox, setCropBox] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [cropRatio, setCropRatio] = useState<number | null>(null);
  
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

  const saveCurrentCanvasState = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      localStorage.setItem("editor_bg", bgCanvas.toDataURL());
      localStorage.setItem("editor_layer", drawCanvas.toDataURL());
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
  
  const activeSize = mode === 'brush' ? penSize : eraserSize;
  
  const cursorStyle = useMemo(() => {
    const size = Math.max(activeSize * scale, 1);
        
    const radius = size / 2;
    const svgSize = Math.ceil(size + 4);
    const center = Math.round(svgSize / 2);
        
    const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${svgSize}" height="\${svgSize}" viewBox="0 0 \${svgSize} \${svgSize}">
      <circle cx="\${center}" cy="\${center}" r="\${radius}" fill="none" stroke="white" stroke-width="2" />
      <circle cx="\${center}" cy="\${center}" r="\${radius}" fill="none" stroke="black" stroke-width="1" />
    </svg>\`;
        
    return \`url('data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}') \${center} \${center}, auto\`;
  }, [activeSize, scale]);

  useEffect(() => {
    if (!isOpen) return;

    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d", { willReadFrequently: true });
    const drawCtx = drawCanvas?.getContext("2d", { willReadFrequently: true });
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;

    // Reset history
    setHistory([]);
    setRedoHistory([]);

    const loadImages = (bgSrc: string | null, layerSrc: string | null, w: number, h: number) => {
      setAspectRatio(w / h);
      bgCanvas.width = w; bgCanvas.height = h;
      drawCanvas.width = w; drawCanvas.height = h;
      bgCtx.fillStyle = "#FFFFFF"; bgCtx.fillRect(0, 0, w, h);
      drawCtx.lineCap = "round"; drawCtx.lineJoin = "round";

      let loadedCount = 0;
      const totalToLoad = (bgSrc ? 1 : 0) + (layerSrc ? 1 : 0);
      
      if (totalToLoad === 0) {
        setHistory([drawCtx.getImageData(0, 0, w, h)]);
        setRedoHistory([]);
        return;
      }

      const checkDone = () => {
        loadedCount++;
        if (loadedCount === totalToLoad) {
          setHistory([drawCtx.getImageData(0, 0, w, h)]);
          setRedoHistory([]);
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

    const currentInitial = initialImage || "";
    const savedBg = localStorage.getItem("editor_bg");
    const savedLayer = localStorage.getItem("editor_layer");
    const savedInitial = localStorage.getItem("editor_initial");

    if (savedBg && savedInitial === currentInitial) {
      // Resume from localStorage
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        loadImages(savedBg, savedLayer, img.width, img.height);
      };
      img.src = savedBg;
    } else {
      // Start fresh
      localStorage.setItem("editor_initial", currentInitial);
      if (initialImage) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          let w = img.width;
          let h = img.height;
          const MAX_DIM = 1536;
          if (w > MAX_DIM || h > MAX_DIM) {
            const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          loadImages(initialImage, null, w, h);
          setTimeout(saveCurrentCanvasState, 100);
        };
        img.src = initialImage;
      } else {
        loadImages(null, null, 1024, 1024);
        setTimeout(saveCurrentCanvasState, 100);
      }
    }
  }, [isOpen, initialImage]
);`;

if (targetRegex.test(file)) {
  file = file.replace(targetRegex, replacement);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("Successfully patched state and initCanvas!");
} else {
  console.log("Regex did not match!");
}
