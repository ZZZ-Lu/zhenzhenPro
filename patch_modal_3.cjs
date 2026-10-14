const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const oldInitDataStr = `    const currentInitial = initialImage || "";
    const initData = async () => {
      let savedBg = await getIndexedDBItem<string>("editor_bg");
      let savedLayer = await getIndexedDBItem<string>("editor_layer");
      let savedInitial = await getIndexedDBItem<string>("editor_initial");
      
      // Apply fallbacks if IDB was blocked
      if (!savedBg) savedBg = localStorage.getItem("editor_bg_fallback");
      if (!savedLayer) savedLayer = localStorage.getItem("editor_layer_fallback");
      if (!savedInitial) savedInitial = localStorage.getItem("editor_initial") || "";

      if (savedBg && savedInitial === currentInitial) {
        // Resume from IDB
        const img = new Image();
        
        img.onload = () => {
          loadImages(savedBg, savedLayer, img.width, img.height);
        };
        img.src = savedBg;
      } else {
        // Start fresh
        await setIndexedDBItem("editor_initial", currentInitial);
        try { localStorage.setItem("editor_initial", currentInitial); } catch(e) {}
        if (initialImage) {
          const img = new Image();
          
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
    initData();`;

const newInitDataStr = `
    const initData = async () => {
      let savedBg = await getIndexedDBItem<string>(\`editor_bg_\${currentProjectId}\`);
      let savedLayer = await getIndexedDBItem<string>(\`editor_layer_\${currentProjectId}\`);
      
      if (!savedBg) savedBg = localStorage.getItem(\`editor_bg_fb_\${currentProjectId}\`);
      if (!savedLayer) savedLayer = localStorage.getItem(\`editor_layer_fb_\${currentProjectId}\`);

      if (savedBg) {
        // Resume
        const img = new Image();
        img.onload = () => {
          loadImages(savedBg, savedLayer, img.width, img.height);
        };
        img.src = savedBg;
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
    initData();`;

if(file.includes(oldInitDataStr)) {
  file = file.replace(oldInitDataStr, newInitDataStr);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("initData patched successfully");
} else {
  console.log("Could not find old initData string.");
  // Let's fallback to regex
  const regex = /const currentInitial = initialImage \|\| "";[\s\S]*?initData\(\);/m;
  if(regex.test(file)) {
    file = file.replace(regex, newInitDataStr);
    fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
    console.log("initData patched via regex");
  } else {
    console.log("initData regex failed too");
  }
}

