const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(/setRedoHistory\(\[\]\);\n  };\n\n  const handleUndo/g, 'setRedoHistory([]);\n    saveCurrentCanvasState();\n  };\n\n  const handleUndo');
file = file.replace(/setHistory\(newHistory\);\n  };\n\n  const handleRedo/g, 'setHistory(newHistory);\n    saveCurrentCanvasState();\n  };\n\n  const handleRedo');
file = file.replace(/setRedoHistory\(newRedo\);\n  };\n  \n  const clearDrawLayer/g, 'setRedoHistory(newRedo);\n    saveCurrentCanvasState();\n  };\n  \n  const clearDrawLayer');
file = file.replace(/setRedoHistory\(\[\]\);\n  };\n  \n  const handleRatioChange/g, 'setRedoHistory([]);\n    saveCurrentCanvasState();\n  };\n  \n  const handleRatioChange');
file = file.replace(/setRedoHistory\(\[\]\);\n    setCropBox/g, 'setRedoHistory([]);\n    saveCurrentCanvasState();\n    setCropBox');

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
