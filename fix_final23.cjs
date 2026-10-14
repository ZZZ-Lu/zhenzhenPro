const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /               <\/div>\n            <\/div>\n          \)}\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;

const newStr = `               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(regex, newStr);

// `view === "home" ? ( <DraftHome /> ) : ( <> ... </> )`

// I will just replace the `view === "home"` completely to make sure it matches.

const fromHere = file.indexOf('{view === "home" ? (');
const toHere = file.indexOf('</AnimatePresence>,');

let block = file.substring(fromHere, toHere);

console.log("BLOCK START:");
console.log(block.substring(0, 100));

