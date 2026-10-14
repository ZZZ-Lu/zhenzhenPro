const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const strToReplace = `<button 
                        onClick={handleNewCanvas}
                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2 border-b border-[#222]"
                      >
                        <FilePlus className="w-3.5 h-3.5" />
                        <span>新建画布</span>
                      </button>`;

const newStr = `<button 
                        onClick={handleCloseCanvas}
                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2 border-b border-[#222]"
                      >
                        <PanelLeft className="w-3.5 h-3.5" />
                        <span>关闭画布并返回主页</span>
                      </button>
                      <button 
                        onClick={handleNewCanvas}
                        className="w-full text-left px-3 py-2 hover:bg-[#383838] hover:text-white transition-colors flex items-center gap-2 border-b border-[#222]"
                      >
                        <FilePlus className="w-3.5 h-3.5" />
                        <span>新建画布</span>
                      </button>`;

if(file.includes(strToReplace)) {
  file = file.replace(strToReplace, newStr);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("Menu patched successfully");
} else {
  console.log("Could not find Menu string");
}
