sed -i '545,627c\
            {/* Left Toolbar */}\
            <div className="w-14 flex flex-col items-center py-2 gap-1 border-r border-[#282828] bg-[#424242] shrink-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">\
              <button\
                onClick={() => setMode("brush")}\
                className={`p-2 rounded ${mode === "brush" ? "bg-[#2A2A2A] text-white shadow-inner" : "hover:bg-[#555] text-[#AAA]"}`}\
                title="画笔工具 (B)"\
              >\
                <PenTool className="w-4 h-4" />\
              </button>\
              <button\
                onClick={() => setMode("eraser")}\
                className={`p-2 rounded ${mode === "eraser" ? "bg-[#2A2A2A] text-white shadow-inner" : "hover:bg-[#555] text-[#AAA]"}`}\
                title="橡皮擦工具 (E)"\
              >\
                <Eraser className="w-4 h-4" />\
              </button>\
              <button\
                onClick={() => setMode("crop")}\
                className={`p-2 rounded ${mode === "crop" ? "bg-[#2A2A2A] text-white shadow-inner" : "hover:bg-[#555] text-[#AAA]"}`}\
                title="裁剪"\
              >\
                <Crop className="w-4 h-4" />\
              </button>\
\
              <div className="w-8 h-px bg-[#555] my-2" />\
\
              {/* Color Picker Swatches (2x5 Grid) */}\
              <div className={`grid grid-cols-2 gap-1.5 px-1.5 transition-opacity ${mode === "eraser" || mode === "crop" ? "opacity-50 pointer-events-none" : "opacity-100"}`}>\
                {COLORS.map((c) => (\
                  <button\
                    key={c}\
                    onClick={() => setColor(c)}\
                    className={`w-4 h-4 rounded-full border ${color === c ? "border-white" : "border-[#222] hover:border-[#888]"}`}\
                    style={{ backgroundColor: c }}\
                    title={c}\
                  />\
                ))}\
              </div>\
\
              {/* Custom Color Picker */}\
              <div className={`mt-2 relative w-6 h-6 rounded border ${mode === "eraser" || mode === "crop" ? "opacity-50 pointer-events-none" : "opacity-100 border-[#222]"} shadow-sm overflow-hidden bg-white cursor-pointer`}>\
                <input\
                  type="color"\
                  value={color}\
                  onChange={(e) => setColor(e.target.value)}\
                  className="absolute inset-[-10px] w-[50px] h-[50px] cursor-pointer"\
                  title="自定义前景色"\
                />\
              </div>\
            </div>' src/components/ImageEditorModal.tsx
