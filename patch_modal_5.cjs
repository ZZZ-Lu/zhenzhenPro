const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const strToReplace = `  const handleNewCanvas = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    const drawCtx = drawCanvas?.getContext("2d");
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;

    bgCtx.fillStyle = "#FFFFFF";
    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    
    setHistory([drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height)]);
    setRedoHistory([]);
    setIsFileMenuOpen(false);
    
    // Clear fallback storage so we start entirely fresh
    try {
      localStorage.removeItem("editor_initial");
      localStorage.removeItem("editor_layer_fallback");
      localStorage.removeItem("editor_bg_fallback");
    } catch(e) {}
    
    setTimeout(saveCurrentCanvasState, 100);
  };`;

const newFuncs = `  const handleNewProject = async (w: number, h: number, initialBgSrc?: string) => {
    const newId = Date.now().toString();
    const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
    
    let finalW = w;
    let finalH = h;
    if (initialBgSrc) {
       finalW = 1024;
       finalH = 1024;
    }
    
    list.push({
      id: newId,
      name: \`画布 \${new Date().toLocaleTimeString()}\`,
      thumbnail: "",
      updatedAt: Date.now(),
      width: finalW,
      height: finalH
    });
    await setIndexedDBItem("editor_projects", list);
    
    if (initialBgSrc) {
       await setIndexedDBItem(\`editor_bg_\${newId}\`, initialBgSrc);
    } else {
       // Create blank background
       const blankCanvas = document.createElement("canvas");
       blankCanvas.width = finalW;
       blankCanvas.height = finalH;
       const blankCtx = blankCanvas.getContext("2d");
       if (blankCtx) {
         blankCtx.fillStyle = "#FFFFFF";
         blankCtx.fillRect(0, 0, finalW, finalH);
         await setIndexedDBItem(\`editor_bg_\${newId}\`, blankCanvas.toDataURL());
       }
    }
    
    setIsFileMenuOpen(false);
    setCurrentProjectId(newId);
    setView("editor");
  };

  const handleOpenProject = (id: string) => {
    setCurrentProjectId(id);
    setView("editor");
  };

  const handleCloseCanvas = () => {
    saveCurrentCanvasState();
    setCurrentProjectId(null);
    setIsFileMenuOpen(false);
    setView("home");
  };

  const handleNewCanvas = () => {
    // If we're already in editor, maybe just close it? Or go to home to create.
    // Let's just create a new project via Home's mechanism
    // But since File > New Canvas exists in Editor, we just switch to Home and open dialog?
    // Let's just create a default new project for now or better, switch to home.
    handleCloseCanvas();
  };`;

if(file.includes(strToReplace)) {
  file = file.replace(strToReplace, newFuncs);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("Functions replaced successfully");
} else {
  console.log("Could not find handleNewCanvas string");
}

