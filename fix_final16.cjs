const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /               <\/div>\n              <\/div>\n              \)}\n            <\/motion\.div>\n          <\/motion\.div>\n        \)}\n      <\/AnimatePresence>,/g;

file = file.replace(regex, `               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`);

// Wait, the error is at 955:13 `)}`
// Is it possible that the conditional ternary expression has not been correctly closed?
// Let's check where the conditional expression `{view === "home" ? (...) : (...)` starts.

const conditionalStart = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <div className="w-full h-full flex flex-col relative">`;

console.log(file.includes(conditionalStart));

// Wait, let's print lines 940 to 970
