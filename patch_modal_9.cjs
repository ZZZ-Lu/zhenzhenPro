const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const strToReplace = `      </div>
    </div>
  );
};`;

const newStr = `      </div>
    </div>
  );
};

// Add ending tags for the conditional view render
file = file.replace(
  '              </div>\\n            </div>\\n          </motion.div>\\n        </motion.div>\\n      )}',
  '              </div>\\n            </div>\\n            </>\\n            )}\\n          </motion.div>\\n        </motion.div>\\n      )}'
);`;

// Wait, I should patch the actual closing tags. Let's see the end of the file.
