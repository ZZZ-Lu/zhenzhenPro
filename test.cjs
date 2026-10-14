const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');
const lines = file.split('\n');
let level = 0;

for(let i=620; i<970; i++) {
  const line = lines[i];
  if(line) {
    if(line.includes('<motion.div')) level++;
    if(line.includes('</motion.div>')) level--;
    if(line.includes('<AnimatePresence')) level++;
    if(line.includes('</AnimatePresence>')) level--;
    if(line.includes('<div') && !line.includes('/>')) level++;
    if(line.includes('</div>')) level--;
    if(line.includes('<>')) level++;
    if(line.includes('</>')) level--;
    if(line.includes('{')) level++;
    if(line.includes('}')) level--;
    console.log(`[${level}] ${i+1}: ${line}`);
  }
}
