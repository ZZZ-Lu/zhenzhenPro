const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /               <\/div>\n                <\/div>\n              \)}\n            <\/motion\.div>\n          <\/motion\.div>\n        \)}\n      <\/AnimatePresence>,/g;

file = file.replace(regex, `               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`);

// the error means the string didn't match.

const text = file.substring(file.indexOf("Math.round(scale * 100)}%"), file.indexOf("</AnimatePresence>,") + 19);
console.log("ACTUAL TEXT:\n" + text);
