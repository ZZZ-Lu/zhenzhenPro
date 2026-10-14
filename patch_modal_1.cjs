const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(
  'import { setIndexedDBItem, getIndexedDBItem } from "../utils/db";',
  'import { setIndexedDBItem, getIndexedDBItem } from "../utils/db";\nimport { DraftHome, DraftProject } from "./DraftHome";'
);

file = file.replace(
  'const [mode, setMode] = useState<"brush" | "eraser" | "crop">(',
  `const [view, setView] = useState<"home" | "editor">("home");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<"brush" | "eraser" | "crop">(`
);

// We need to modify initData and how it starts
file = file.replace(
  `  useEffect(() => {
    if (!isOpen) return;

    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d", { willReadFrequently: true });
    const drawCtx = drawCanvas?.getContext("2d", { willReadFrequently: true });
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;

    // Reset history
    setHistory([]);
    setRedoHistory([]);`,
  `  useEffect(() => {
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
    setRedoHistory([]);`
);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
