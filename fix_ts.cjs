const fs = require('fs');
let file = fs.readFileSync('src/components/GlobalReferencePanel.tsx', 'utf8');

file = file.replace(
  'const files = Array.from(e.target.files);',
  'const files = Array.from(e.target.files) as File[];'
);

file = file.replace(
  'const files = Array.from(e.dataTransfer.files);',
  'const files = Array.from(e.dataTransfer.files) as File[];'
);

fs.writeFileSync('src/components/GlobalReferencePanel.tsx', file);
