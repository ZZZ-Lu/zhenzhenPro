const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const regex = /               <\/div>\n            <\/div>\n            <\/>\n          \)}\n          <\/motion\.div>\n        <\/motion\.div>\n      \)}\n    <\/AnimatePresence>,/g;

file = file.replace(regex, `               </div>
            </div>
            </div>
            </>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`);

fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
