const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const errStr = `            </div>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const goodStr = `            </div>
            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(errStr, goodStr);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
