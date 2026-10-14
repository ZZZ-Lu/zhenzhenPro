const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

// The issue is that the opening tag `<motion.div>` at line 629 has multiple children.
// {view === "home" ? ( <DraftHome /> ) : ( <div className="w-full h-full flex flex-col relative"> ... </div> )}

// We need exactly one closing div before the ).

const badRegex = /            <\/div>\n            <\/div>\n            \)}\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;

const goodStr = `            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(badRegex, goodStr);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
