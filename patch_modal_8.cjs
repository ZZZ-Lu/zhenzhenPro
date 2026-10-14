const fs = require('fs');
let file = fs.readFileSync('src/components/ImageEditorModal.tsx', 'utf8');

const strToReplace = `  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={\`fixed inset-0 z-[999] flex items-center justify-center p-2 md:p-6 lg:p-12 backdrop-blur-sm \${theme === 'light' ? 'bg-white/80' : 'bg-black/80'}\`}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 10 }}
            className="w-full h-full max-w-7xl flex flex-col bg-[#383838] text-[#E0E0E0] select-none font-sans rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-[#555]"
          >
            {/* Top Options Bar (PS Style) */}`;

const newStr = `  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={\`fixed inset-0 z-[999] flex items-center justify-center p-2 md:p-6 lg:p-12 backdrop-blur-sm \${theme === 'light' ? 'bg-white/80' : 'bg-black/80'}\`}
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 10 }}
            className="w-full h-full max-w-7xl flex flex-col bg-[#383838] text-[#E0E0E0] select-none font-sans rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-[#555]"
          >
            {view === "home" ? (
              <DraftHome 
                theme={theme}
                onOpenProject={handleOpenProject}
                onNewProject={handleNewProject}
              />
            ) : (
              <>
            {/* Top Options Bar (PS Style) */}`;

if(file.includes(strToReplace)) {
  file = file.replace(strToReplace, newStr);
  fs.writeFileSync('src/components/ImageEditorModal.tsx', file);
  console.log("View render patched successfully");
} else {
  console.log("Could not find View render string");
}

