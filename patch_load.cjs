const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(/if \(bgSrc && !bgSrc\.startsWith\("data:"\)\) img\.crossOrigin = "anonymous";/g, '');

file = file.replace(/const img = new Image\(\);\n        img\.onload = \(\) => { bgCtx\.drawImage/g, 
  'const img = new Image();\n        if (!bgSrc.startsWith("data:")) img.crossOrigin = "anonymous";\n        img.onload = () => { bgCtx.drawImage');

file = file.replace(/const img = new Image\(\);\n        img\.onload = \(\) => { drawCtx\.drawImage/g, 
  'const img = new Image();\n        if (!layerSrc.startsWith("data:")) img.crossOrigin = "anonymous";\n        img.onload = () => { drawCtx.drawImage');

file = file.replace(/const img = new Image\(\);\n        img\.onload = \(\) => {\n          loadImages/g, 
  'const img = new Image();\n        if (!savedBg.startsWith("data:")) img.crossOrigin = "anonymous";\n        img.onload = () => {\n          loadImages');

file = file.replace(/const img = new Image\(\);\n          img\.onload = \(\) => {\n            let w = img\.width;/g, 
  'const img = new Image();\n          if (!initialImage.startsWith("data:")) img.crossOrigin = "anonymous";\n          img.onload = () => {\n            let w = img.width;');

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
