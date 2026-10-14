const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /            <\/div>\n          \)}\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;

const newStr = `            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(regex, newStr);

// Let's also check the start of the conditionally rendered div.
// It is at line 635:
// {view === "home" ? ( <DraftHome /> ) : ( <div ...>

// So we just need one closing `</div>)}`
const secondRegex = /            <\/div>\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;
const correctStr = `            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;
file = file.replace(secondRegex, correctStr);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
