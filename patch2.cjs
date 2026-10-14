const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const rightTarget = `            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {mode === 'crop' ? (
                <>
                  <button
                    onClick={() => setMode("brush")}
                    className="px-3 py-1.5 rounded transition-colors hover:bg-[#555] text-[#CCC]"
                  >
                    取消
                  </button>
                  <div className="w-px h-4 bg-[#555] mx-1" />
                  <button
                    onClick={applyCrop}
                    className="px-4 py-1.5 rounded transition-colors bg-[#0058D1] hover:bg-[#0066FF] text-white flex items-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>裁剪</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleUndo}
                    disabled={history.length <= 1}
                    className={\`px-3 py-1.5 rounded transition-colors \${history.length <= 1 ? 'opacity-30 cursor-not-allowed text-[#888]' : 'hover:bg-[#555] hover:text-white text-[#CCC]'}\`}
                  >
                    撤销
                  </button>
                  <button
                    onClick={clearDrawLayer}
                    className="px-3 py-1.5 rounded transition-colors hover:bg-rose-900/50 hover:text-rose-400 text-[#CCC]"
                  >
                    清空
                  </button>
                  <div className="w-px h-4 bg-[#555] mx-1" />
                  <button
                    onClick={handleSave}
                    className="px-4 py-1.5 rounded transition-colors bg-[#0058D1] hover:bg-[#0066FF] text-white flex items-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>应用</span>
                  </button>
                </>
              )}
              <div className="w-px h-4 bg-[#555] mx-1" />
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-[#555] rounded text-[#A0A0A0] hover:text-white transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>`;

const rightReplacement = `            {/* Center: Undo/Redo Pill */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-[#2A2A2A] rounded-full shadow-inner border border-[#111] px-1 py-0.5 z-[60]">
              <button
                onClick={handleUndo}
                disabled={history.length <= 1}
                className={\`p-1.5 rounded-full transition-colors \${history.length <= 1 ? 'opacity-30 cursor-not-allowed text-[#888]' : 'hover:bg-[#444] text-[#CCC] hover:text-white'}\`}
                title="撤销"
              >
                <Undo className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-3 bg-[#111] mx-1" />
              <button
                onClick={handleRedo}
                disabled={redoHistory.length === 0}
                className={\`p-1.5 rounded-full transition-colors \${redoHistory.length === 0 ? 'opacity-30 cursor-not-allowed text-[#888]' : 'hover:bg-[#444] text-[#CCC] hover:text-white'}\`}
                title="重做"
              >
                <Redo className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 ml-auto z-[60]">
              {mode === 'crop' && (
                <>
                  <button 
                    onClick={() => setMode("brush")}
                    className="px-3 py-1.5 rounded transition-colors hover:bg-[#555] text-[#CCC]"
                  >
                    取消
                  </button>
                  <div className="w-px h-4 bg-[#555] mx-1" />
                  <button 
                    onClick={applyCrop}
                    className="px-4 py-1.5 rounded transition-colors bg-[#0058D1] hover:bg-[#0066FF] text-white flex items-center gap-2"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>裁剪</span>
                  </button>
                  <div className="w-px h-4 bg-[#555] mx-1" />
                </>
              )}
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-[#555] rounded text-[#A0A0A0] hover:text-white transition-colors"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>`;

// Use simple regular expression matching because of indentation variations
const rx = /\{\/\* Right: Actions \*\/\}.*?<\/X className="w-4 h-4" \/>\s*<\/button>\s*<\/div>/s;
file = file.replace(rx, rightReplacement);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
