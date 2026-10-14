const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(
  `  const saveCurrentCanvasState = () => {
    const bgCanvas = bgCanvasRef.current;
    const drawCanvas = drawCanvasRef.current;
    if (bgCanvas && drawCanvas) {
      setIndexedDBItem("editor_bg", bgCanvas.toDataURL()).catch(console.error);
      setIndexedDBItem("editor_layer", drawCanvas.toDataURL()).catch(console.error);
    }
  };`,
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
  };`
);

file = file.replace(
  `    const initData = async () => {
      const savedBg = await getIndexedDBItem<string>("editor_bg");
      const savedLayer = await getIndexedDBItem<string>("editor_layer");
      const savedInitial = await getIndexedDBItem<string>("editor_initial");`,
  `    const initData = async () => {
      let savedBg = await getIndexedDBItem<string>("editor_bg");
      let savedLayer = await getIndexedDBItem<string>("editor_layer");
      let savedInitial = await getIndexedDBItem<string>("editor_initial");
      
      // Apply fallbacks if IDB was blocked
      if (!savedBg) savedBg = localStorage.getItem("editor_bg_fallback");
      if (!savedLayer) savedLayer = localStorage.getItem("editor_layer_fallback");
      if (!savedInitial) savedInitial = localStorage.getItem("editor_initial") || "";`
);

file = file.replace(
  `        await setIndexedDBItem("editor_initial", currentInitial);`,
  `        await setIndexedDBItem("editor_initial", currentInitial);
        localStorage.setItem("editor_initial", currentInitial);`
);

file = file.replace(
  `    setIndexedDBItem("editor_initial", "").catch(console.error);`,
  `    setIndexedDBItem("editor_initial", "").catch(console.error);
    localStorage.setItem("editor_initial", "");
    localStorage.removeItem("editor_bg_fallback");
    localStorage.removeItem("editor_layer_fallback");`
);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
