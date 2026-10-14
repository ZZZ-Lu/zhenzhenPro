const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const oldEnd = `             </div>
           )}
           </motion.div>
         </motion.div>
       )}
     </AnimatePresence>,`;

const newEnd = `             </div>
           </div>
           )}
         </motion.div>
       </motion.div>
     )}
   </AnimatePresence>,`;

file = file.replace(/             <\/div>\n           \)}\n           <\/motion\.div>\n         <\/motion\.div>\n       \)}\n     <\/AnimatePresence>,/g, newEnd);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
