const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const oldEnd = `                 {Math.round(scale * 100)}%
               </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const newEnd = `                 {Math.round(scale * 100)}%
               </div>
            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(oldEnd, newEnd);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
