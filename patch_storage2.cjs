const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(
  `        await setIndexedDBItem("editor_initial", currentInitial);
        localStorage.setItem("editor_initial", currentInitial);`,
  `        await setIndexedDBItem("editor_initial", currentInitial);
        try { localStorage.setItem("editor_initial", currentInitial); } catch(e) {}`
);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
