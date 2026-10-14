const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

file = file.replace(
  '<div className="h-10 flex items-center justify-between px-4 border-b border-[#282828] bg-[#424242] shrink-0 text-xs shadow-sm z-20">',
  '<div className="h-10 flex items-center px-4 border-b border-[#282828] bg-[#424242] shrink-0 text-xs shadow-sm z-50 relative">'
);

file = file.replace(
  'z-50 text-[#CCC]"',
  'z-[9999] text-[#CCC]"'
);

file = file.replace(
  '<Save className="w-3.5 h-3.5" />\n                        <span>保存至顶部/左侧暂存区</span>',
  '<PanelLeft className="w-3.5 h-3.5" />\n                        <span>保存至左侧暂存区</span>'
);

const topSaveBtn = `
                      {onSaveToTop && (
                        <button 
                          onClick={() => {
                            handleSaveToTopAction();
                            setIsFileMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2"
                        >
                          <LayoutPanelTop className="w-3.5 h-3.5" />
                          <span>保存至上方暂存区</span>
                        </button>
                      )}
`;

file = file.replace(
  '<button \n                        onClick={() => {\n                          handleSave();\n                          setIsFileMenuOpen(false);\n                        }}\n                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2"\n                      >',
  topSaveBtn + '<button \n                        onClick={() => {\n                          handleSave();\n                          setIsFileMenuOpen(false);\n                        }}\n                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2"\n                      >'
);

// Fallback replacement if space was an issue
file = file.replace(
  '<button\n                        onClick={() => {\n                          handleSave();\n                          setIsFileMenuOpen(false);\n                        }}\n                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2"\n                      >',
  topSaveBtn + '<button\n                        onClick={() => {\n                          handleSave();\n                          setIsFileMenuOpen(false);\n                        }}\n                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2"\n                      >'
);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
