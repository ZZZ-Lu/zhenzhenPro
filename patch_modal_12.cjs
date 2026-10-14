const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const strToReplace = `          </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const newStr = `            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(strToReplace, newStr);

// Let's actually count the brackets.
// We added `{view === "home" ? (...) : (<>`
// We need to close it with `</>)}`. 
// But earlier it was inside motion.div.

