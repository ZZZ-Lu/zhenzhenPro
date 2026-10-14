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

// Looking at `954|              </div>`
// `955|              )}` 
// Let's replace the whole end precisely.

const searchRegex = /               \{\/\* Zoom Indicator \*\/\}\n               <div className="absolute bottom-2 left-2 text-\[10px\] text-\[\#888\] font-mono pointer-events-none z-20">\n                 \{Math\.round\(scale \* 100\)\}\%\n               <\/div>\n              <\/div>\n              \)}\n            <\/motion\.div>\n          <\/motion\.div>\n        \)}\n      <\/AnimatePresence>,/g;

const replStr = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(searchRegex, replStr);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
