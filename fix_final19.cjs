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

// Wait, looking at the error output... it still says `954|                </div>` with 16 spaces.
// Let's replace by finding the string.

const badStr = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,`;

const goodStr = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(badStr, goodStr);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
