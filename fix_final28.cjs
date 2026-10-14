const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const oldStart = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <>`;

const newStart = `            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <div className="w-full h-full flex flex-col relative">`;

file = file.replace(oldStart, newStart);

const oldEnd = `            </div>
            </div>
            </>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

const newEnd = `            </div>
            </div>
          )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(oldEnd, newEnd);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
