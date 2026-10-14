const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

// I need to find the final lines exactly.
const endOfFileMatch = file.match(/<\/motion\.div>\n\s*<\/motion\.div>\n\s*<\/AnimatePresence>,\n\s*document\.body\n\s*\);\n};/g);
console.log(endOfFileMatch ? "Match found for EOF" : "Match not found for EOF");

const fixEnd = `            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};`;

const badEnd = `            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};`;

// Wait, the error is at line 957:14 
// `              </>`
// Let's print out lines 950-965

