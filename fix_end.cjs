const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

// The issue is that the opening tag `<motion.div>` at line 629 has multiple children.
// The structure is:
// <motion.div ...>
//   {view === "home" ? (
//      <DraftHome />
//   ) : (
//      <>
//         <div className="h-10...">...</div>
//         <div className="flex-1...">...</div>
//      </>
//   )}
// </motion.div>

const oldStr = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <>
            {/* Top Options Bar (PS Style) */}`;

const newStr = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <div className="w-full h-full flex flex-col relative">
            {/* Top Options Bar (PS Style) */}`;

const badEndStr = `            </div>
            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const goodEndStr = `            </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(oldStr, newStr);
file = file.replace(badEndStr, goodEndStr);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
