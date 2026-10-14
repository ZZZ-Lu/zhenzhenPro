const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const oldStr = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <div className="w-full h-full flex flex-col relative">`;

const oldEnd = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const newStr = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <>`;

const newEnd = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
            </div>
            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(oldStr, newStr);
file = file.replace(oldEnd, newEnd);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
