const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const lastPartStr = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
            </div>


              </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,`;

const newLastPart = `               {/* Zoom Indicator */}
               <div className="absolute bottom-2 left-2 text-[10px] text-[#888] font-mono pointer-events-none z-20">
                 {Math.round(scale * 100)}%
               </div>
            </div>


            </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,`;

file = file.replace(lastPartStr, newLastPart);
fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
