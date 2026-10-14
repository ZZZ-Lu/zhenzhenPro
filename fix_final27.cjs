const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const oldStr = `            </div>
            </>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const newStr = `            </div>
            </div>
            </>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(oldStr, newStr);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
