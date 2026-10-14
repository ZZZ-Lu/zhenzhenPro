const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /               <\/div>\n            <\/>\n            \)}\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;

const newStr = `               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(regex, newStr);

// I should also check line 629 to see if the opening tag `view === "home" ? (...) : (`
// was an open `<>` or an open `<div ...>`.
const oldStart = `            ) : (
              <>
            {/* Top Options Bar (PS Style) */}`;
const newStart = `            ) : (
              <div className="w-full h-full flex flex-col relative">
            {/* Top Options Bar (PS Style) */}`;

if(file.includes(oldStart)) {
  file = file.replace(oldStart, newStart);
}

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
