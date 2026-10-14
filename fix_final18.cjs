const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /               <\/div>\n                <\/div>\n              \)}\n            <\/motion\.div>\n          <\/motion\.div>\n        \)}\n      <\/AnimatePresence>,/g;

const newStr = `               </div>
            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(regex, newStr);

// There is one missing closing tag at the end.
// At 629 we have: <motion.div ...>
// inside: {view === "home" ? (...) : ( <div ...> ... </div> )}
// So it should be `</div>)}` then `</motion.div>`

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
