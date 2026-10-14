const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(
  'import { X, Check, Brush, Eraser, Trash2, Undo, Redo, ChevronDown, Crop, File, Download, Save, LayoutPanelTop, PanelLeft, FilePlus } from "lucide-react";',
  'import { X, Check, Brush, Eraser, Trash2, Undo, Redo, ChevronDown, Crop, File, Download, Save, LayoutPanelTop, PanelLeft, FilePlus } from "lucide-react";\nimport { setIndexedDBItem, getIndexedDBItem } from "../utils/db";'
);

file = file.replace(
  `  const saveCurrentCanvasState = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      localStorage.setItem("editor_bg", bgCanvas.toDataURL());
      localStorage.setItem("editor_layer", drawCanvas.toDataURL());
    }
  };`,
  `  const saveCurrentCanvasState = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      setIndexedDBItem("editor_bg", bgCanvas.toDataURL()).catch(console.error);
      setIndexedDBItem("editor_layer", drawCanvas.toDataURL()).catch(console.error);
    }
  };`
);

file = file.replace(
  `    const savedBg = localStorage.getItem("editor_bg");
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
    }`,
  `    const initData = async () => {
      const savedBg = await getIndexedDBItem<string>("editor_bg");
      const savedLayer = await getIndexedDBItem<string>("editor_layer");
      const savedInitial = await getIndexedDBItem<string>("editor_initial");

      if (savedBg && savedInitial === currentInitial) {
        // Resume from IDB
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          loadImages(savedBg, savedLayer, img.width, img.height);
        };
        img.src = savedBg;
      } else {
        // Start fresh
        await setIndexedDBItem("editor_initial", currentInitial);
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
    };
    initData();`
);

file = file.replace(
  `localStorage.setItem("editor_initial", "");`,
  `setIndexedDBItem("editor_initial", "").catch(console.error);`
);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
