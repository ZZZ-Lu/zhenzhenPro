const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');
const oldLine = `import { useState, useRef, useEffect, MouseEvent } from 'react';`;
const newLine = `import { useState, useRef, useEffect, MouseEvent } from 'react';\nimport DraftHome from './DraftHome';`;
if(!file.includes("import DraftHome")) {
  file = file.replace(oldLine, newLine);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
}
