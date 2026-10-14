const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /            <\/div>\n\n\n            <\/>\n            \)}\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;

const newStr = `            </div>
            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(regex, newStr);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
