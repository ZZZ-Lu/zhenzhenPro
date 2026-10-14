const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(
  `  const saveCurrentCanvasState = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      const bgData = bgCanvas.toDataURL();
      const layerData = drawCanvas.toDataURL("image/png");
      setIndexedDBItem("editor_bg", bgData).catch(console.error);
      setIndexedDBItem("editor_layer", layerData).catch(console.error);
      
      // Fallback: save strokes to localStorage since IDB might be blocked in iframe
      try {
        localStorage.setItem("editor_layer_fallback", layerData);
      } catch(e) { console.warn("localStorage full for layer"); }
      try {
        // Only save bg if it's reasonably small to avoid quota errors
        if (bgData.length < 2_000_000) {
           localStorage.setItem("editor_bg_fallback", bgData);
        }
      } catch(e) { console.warn("localStorage full for bg"); }
    }
  };`,
  `  const updateProjectThumbnail = async (projectId: string, dataUrl: string) => {
    const list = await getIndexedDBItem<DraftProject[]>("editor_projects") || [];
    const idx = list.findIndex(p => p.id === projectId);
    if (idx >= 0) {
      list[idx].thumbnail = dataUrl;
      list[idx].updatedAt = Date.now();
      await setIndexedDBItem("editor_projects", list);
    }
  };

  const saveCurrentCanvasState = () => {
    if (!currentProjectId) return;
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      const bgData = bgCanvas.toDataURL();
      const layerData = drawCanvas.toDataURL("image/png");
      
      // Optional: draw them together for thumbnail
      const thumbCanvas = document.createElement("canvas");
      thumbCanvas.width = 256;
      thumbCanvas.height = 256 * (bgCanvas.height / bgCanvas.width);
      const thumbCtx = thumbCanvas.getContext("2d");
      if (thumbCtx) {
        thumbCtx.fillStyle = "#FFF";
        thumbCtx.fillRect(0,0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(bgCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbCtx.drawImage(drawCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        updateProjectThumbnail(currentProjectId, thumbCanvas.toDataURL("image/jpeg", 0.8));
      }

      setIndexedDBItem(\`editor_bg_\${currentProjectId}\`, bgData).catch(console.error);
      setIndexedDBItem(\`editor_layer_\${currentProjectId}\`, layerData).catch(console.error);
      
      // Fallback: save strokes to localStorage
      try {
        localStorage.setItem(\`editor_layer_fb_\${currentProjectId}\`, layerData);
      } catch(e) {}
      try {
        if (bgData.length < 2_000_000) {
           localStorage.setItem(\`editor_bg_fb_\${currentProjectId}\`, bgData);
        }
      } catch(e) {}
    }
  };`
);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
