const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /            <\/div>\n\n\n              <\/>\n              \)}\n            <\/motion\.div>\n          <\/motion\.div>\n        \)}\n      <\/AnimatePresence>,/g;

file = file.replace(regex, 
`            </div>
          </>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`);

// Let's just fix it using string replace for the end
const index = file.lastIndexOf('</motion.div>');
const toEnd = file.substring(index - 50, index + 200);
console.log(toEnd);
