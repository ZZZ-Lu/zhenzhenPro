const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const targetStr = `  const clearDraft = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    const drawCtx = drawCanvas?.getContext("2d");
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;`;

const newFunctionsStr = `  const handleNewProject = async (w: number, h: number, initialBgSrc?: string) => {
    const newId = Date.now().toString();
    const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
    
    // Calculate aspect ratio bounded w,h if initialBgSrc is provided
    let finalW = w;
    let finalH = h;
    if (initialBgSrc) {
       // We'll update the dimensions after image loads in initData, but for now just use a default
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
       // We need to fetch and set it to editor_bg_newId
       await setIndexedDBItem(\`editor_bg_\${newId}\`, initialBgSrc);
    }
    
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
    setView("home");
  };

  const clearDraft = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    const bgCtx = bgCanvas?.getContext("2d");
    const drawCtx = drawCanvas?.getContext("2d");
    if (!bgCanvas || !drawCanvas || !bgCtx || !drawCtx) return;`;

if(file.includes(targetStr)) {
  file = file.replace(targetStr, newFunctionsStr);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("Functions added successfully");
} else {
  console.log("Could not find clearDraft string");
}
