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

if(file.includes(strToReplace)) {
  file = file.replace(strToReplace, newStr);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("Patched");
} else {
  console.log("Not found");
}

