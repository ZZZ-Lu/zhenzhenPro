const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const handleNewCanvas = `
  const handleNewCanvas = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    const drawCtx = drawCanvas?.getContext("2d");
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;

    bgCanvas.width = 1024;
    bgCanvas.height = 1024;
    drawCanvas.width = 1024;
    drawCanvas.height = 1024;

    bgCtx.fillStyle = "#FFFFFF";
    bgCtx.fillRect(0, 0, 1024, 1024);
    drawCtx.clearRect(0, 0, 1024, 1024);

    setHistory([drawCtx.getImageData(0, 0, 1024, 1024)]);
    setRedoHistory([]);
    setScale(1);
    setPan({ x: 0, y: 0 });

    localStorage.setItem("editor_initial", "");
    saveCurrentCanvasState();
    setIsFileMenuOpen(false);
  };

  const handleSaveToTopAction =`;

file = file.replace('const handleSaveToTopAction =', handleNewCanvas);

const newCanvasBtn = `
                      <button 
                        onClick={handleNewCanvas}
                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2 border-b border-[#222]"
                      >
                        <FilePlus className="w-3.5 h-3.5" />
                        <span>新建画布</span>
                      </button>
                      {onSaveToTop && (
`;
file = file.replace('{onSaveToTop && (', newCanvasBtn);

const iconsLine = 'import { X, Check, Brush, Eraser, Trash2, Undo, Redo, ChevronDown, Crop, File, Download, Save, LayoutPanelTop, PanelLeft, FilePlus } from "lucide-react";';
file = file.replace(/import \{ X, Check.*?\} from "lucide-react";/, iconsLine);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
