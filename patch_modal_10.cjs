const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const endOfComponentRegex = /(<\/div>\s*<\/div>\s*<\/div>\s*<\/motion\.div>\s*<\/motion\.div>\s*<\/AnimatePresence>\s*\);\s*};)/s;

if (endOfComponentRegex.test(file)) {
    console.log("Regex matches end of component");
} else {
    // Maybe let's just find the last </div> tags in the file and replace them.
    const lastPart = `          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};`;
    
    if(file.includes(lastPart)) {
      file = file.replace(lastPart, `          </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};`);
      fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
      console.log("End tags patched successfully");
    } else {
      console.log("Could not find the last part.");
    }
}
