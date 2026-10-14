import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

const Test = () => {
  const [view, setView] = useState("home");
  return createPortal(
    <AnimatePresence>
      {true && (
        <motion.div>
          <motion.div>
            {view === "home" ? (
              <div>Home</div>
            ) : (
              <div className="w-full">
                <div className="child1">a</div>
                <div className="child2">b</div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
