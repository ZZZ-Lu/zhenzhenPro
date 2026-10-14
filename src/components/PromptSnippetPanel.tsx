import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Plus, Edit2, Trash2, Pin } from "lucide-react";

export interface PromptSnippet {
  id: string;
  content: string;
  pinned?: boolean;
  lastUsedAt?: number;
  createdAt?: number;
}

interface PromptSnippetPanelProps {
  onClose: () => void;
  onSelect: (content: string) => void;
  theme?: "light" | "dark";
  initialText?: string;
  position?: { top: number; left: number; width: number } | null;
}

export function PromptSnippetPanel({
  onClose,
  onSelect,
  theme = "dark",
  initialText = "",
  position = null,
}: PromptSnippetPanelProps) {
  const [snippets, setSnippets] = useState<PromptSnippet[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const isLight = theme === "light";

  useEffect(() => {
    if (initialText) {
      setEditingId(crypto.randomUUID());
      setEditContent(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    const loaded = window.localStorage.getItem("img_studio_prompt_snippets_v2");
    if (loaded) {
      try {
        setSnippets(JSON.parse(loaded));
      } catch (e) {
        setSnippets([]);
      }
    } else {
      // Migration from old snippets
      const oldLoaded = window.localStorage.getItem(
        "img_studio_prompt_snippets",
      );
      if (oldLoaded) {
        try {
          const oldSnippets = JSON.parse(oldLoaded);
          const newSnippets = oldSnippets.map((s: any) => ({
            id: s.id,
            content: s.content,
            createdAt: s.createdAt || Date.now(),
            lastUsedAt: s.lastUsedAt || Date.now(),
            pinned: s.pinned || false,
          }));
          setSnippets(newSnippets);
          window.localStorage.setItem(
            "img_studio_prompt_snippets_v2",
            JSON.stringify(newSnippets),
          );
        } catch (e) {
          // Ignore
        }
      } else {
        // Initialize with default template snippet
        const defaultSnippets: PromptSnippet[] = [
          {
            id: "default-8k",
            content: "8k超清化，增强画面质感，细节丰富，清晰锐利",
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            pinned: true,
          }
        ];
        setSnippets(defaultSnippets);
        window.localStorage.setItem(
          "img_studio_prompt_snippets_v2",
          JSON.stringify(defaultSnippets),
        );
      }
    }
  }, []);

  const saveSnippets = (newSnippets: PromptSnippet[]) => {
    setSnippets(newSnippets);
    window.localStorage.setItem(
      "img_studio_prompt_snippets_v2",
      JSON.stringify(newSnippets),
    );
  };

  const handleAddNew = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = crypto.randomUUID();
    setEditingId(newId);
    setEditContent("");
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editContent.trim()) {
      return;
    }

    const existingIndex = snippets.findIndex((s) => s.id === editingId);
    let newSnippets = [...snippets];

    if (existingIndex >= 0) {
      newSnippets[existingIndex] = {
        ...newSnippets[existingIndex],
        content: editContent.trim(),
      };
    } else {
      newSnippets.push({
        id: editingId!,
        content: editContent.trim(),
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      });
    }

    saveSnippets(newSnippets);
    setEditingId(null);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSnippets = snippets.filter((s) => s.id !== id);
    saveSnippets(newSnippets);
  };

  const handleEditItem = (snippet: PromptSnippet, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(snippet.id);
    setEditContent(snippet.content);
  };

  const sortedSnippets = useMemo(() => {
    return [...snippets].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      const timeA = Math.max(a.lastUsedAt || 0, a.createdAt || 0);
      const timeB = Math.max(b.lastUsedAt || 0, b.createdAt || 0);

      // If both have 0 for time (e.g., migrated without timestamp), keep relative order by not swapping.
      // But stable sort behavior relies on returning 0, or we could fallback to comparing their index if we knew it.
      // Since new snippets have timestamps, this is fine.
      if (timeA !== timeB) return timeB - timeA;

      return 0;
    });
  }, [snippets]);

  const handleSelectSnippet = (
    snippet: PromptSnippet,
    e?: React.MouseEvent | KeyboardEvent,
  ) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const newSnippets = snippets.map((s) =>
      s.id === snippet.id ? { ...s, lastUsedAt: Date.now() } : s,
    );
    saveSnippets(newSnippets);
    onSelect(snippet.content);
  };

  const handleTogglePin = (snippetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSnippets = snippets.map((s) =>
      s.id === snippetId ? { ...s, pinned: !s.pinned } : s,
    );
    saveSnippets(newSnippets);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingId) {
        if (e.key === "Escape") {
          setEditingId(null);
        }
        if (e.key === "Tab") {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        if (sortedSnippets.length > 0) {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, sortedSnippets.length - 1),
          );
        }
      } else if (e.key === "ArrowUp") {
        if (sortedSnippets.length > 0) {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
        }
      } else if (e.key === "Enter") {
        if (sortedSnippets[selectedIndex]) {
          handleSelectSnippet(sortedSnippets[selectedIndex], e);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editingId, onClose, selectedIndex, sortedSnippets, handleSelectSnippet]);

  useEffect(() => {
    if (!editingId && sortedSnippets.length > 0) {
      const selectedEl = document.getElementById(
        `snippet-item-${selectedIndex}`,
      );
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, editingId, snippets.length]);

  // Click outside to close (if not editing)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use mousedown instead of click to prevent issues with focus
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const panelNode = (
    <div
      className={`fixed z-[9999] flex flex-col rounded-xl shadow-2xl overflow-hidden ${
        position === null ? "bottom-14 left-4 right-4 max-h-[70vh]" : ""
      } ${
        isLight
          ? "bg-white/95 backdrop-blur-md border border-slate-200"
          : "bg-slate-950/95 backdrop-blur-md border border-slate-850"
      }`}
      style={
        position !== null
          ? {
              top: position.top,
              left: position.left,
              width: position.width,
              maxHeight: `calc(100vh - ${position.top}px - 16px)`,
            }
          : {}
      }
      ref={panelRef}
      onMouseDown={(e) => e.stopPropagation()} // Prevent editor blur when clicking inside the panel
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <div
          className={`text-[10px] font-bold px-3 py-1.5 select-none flex items-center justify-between border-b ${
            isLight
              ? "text-slate-400 border-slate-100"
              : "text-slate-500 border-slate-800/60"
          }`}
        >
          <span>按 Enter 键或鼠标点击选择提示词</span>
          <button
            onClick={handleAddNew}
            className={`p-1 rounded transition-colors ${
              isLight
                ? "hover:bg-slate-200 text-slate-600"
                : "hover:bg-slate-700 text-slate-300"
            }`}
            title="新建片段"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5 space-y-1">
          {editingId ? (
            <div className="p-2 space-y-2">
              <textarea
                autoFocus
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="输入提示词内容..."
                rows={3}
                className={`w-full px-3 py-2 rounded-lg border outline-none transition-colors text-xs font-mono leading-relaxed resize-none ${
                  isLight
                    ? "bg-white border-slate-300 focus:border-indigo-500 text-slate-800"
                    : "bg-slate-900 border-slate-700/50 focus:border-indigo-500 text-slate-100"
                }`}
              />
              <div className="flex justify-end gap-2 text-[10px]">
                <button
                  onClick={handleCancelEdit}
                  className={`px-3 py-1 font-semibold rounded transition-colors ${
                    isLight
                      ? "text-slate-600 hover:bg-slate-100"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim()}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-semibold rounded transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          ) : sortedSnippets.length === 0 ? (
            <div
              className={`py-8 px-4 text-center text-xs ${
                isLight ? "text-slate-500" : "text-slate-400"
              }`}
            >
              暂无片段，点击 + 新建
            </div>
          ) : (
            sortedSnippets.map((snippet, idx) => (
              <div
                key={snippet.id}
                id={`snippet-item-${idx}`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={(e) => handleSelectSnippet(snippet, e)}
                className={`group relative cursor-pointer flex flex-col gap-1 px-3 py-2.5 rounded-lg transition-colors ${
                  idx === selectedIndex
                    ? isLight
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-slate-800 text-white"
                    : isLight
                      ? "text-slate-700 hover:bg-slate-50 hover:text-black"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {snippet.pinned && (
                    <Pin className="w-3 h-3 min-w-[12px] text-indigo-500 rotate-45 shrink-0" />
                  )}
                  <p className="text-xs line-clamp-3 leading-relaxed break-words">
                    {snippet.content}
                  </p>
                </div>
                <div
                  className={`absolute right-0 top-0 bottom-0 pl-12 pr-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity rounded-r-lg ${
                    idx === selectedIndex
                      ? isLight
                        ? "bg-gradient-to-l from-indigo-50 via-indigo-50 to-transparent"
                        : "bg-gradient-to-l from-slate-800 via-slate-800 to-transparent"
                      : isLight
                        ? "bg-gradient-to-l from-slate-50 via-slate-50 to-transparent"
                        : "bg-gradient-to-l from-[#1e293b] via-[#1e293b] to-transparent" // tailwind slate-800 / 0.8 blend is complicated, so just approximate by making it solid slate-800 on the right
                  }`}
                >
                  <button
                    onClick={(e) => handleTogglePin(snippet.id, e)}
                    className={`p-1.5 rounded transition-colors ${
                      isLight
                        ? snippet.pinned
                          ? "bg-indigo-100 text-indigo-600 hover:bg-slate-200"
                          : "hover:bg-slate-200 text-slate-500"
                        : snippet.pinned
                          ? "bg-indigo-500/30 text-indigo-400 hover:bg-slate-700/80"
                          : "hover:bg-slate-700/80 text-slate-400"
                    }`}
                    title={snippet.pinned ? "取消置顶" : "置顶片段"}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleEditItem(snippet, e)}
                    className={`p-1.5 rounded transition-colors ${
                      isLight
                        ? "hover:bg-slate-200 text-slate-500"
                        : "hover:bg-slate-700/80 text-slate-400"
                    }`}
                    title="编辑片段"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(snippet.id, e)}
                    className={`p-1.5 rounded transition-colors ${
                      isLight
                        ? "hover:bg-red-100 text-red-600"
                        : "hover:bg-red-500/30 text-red-400"
                    }`}
                    title="删除片段"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panelNode, document.body);
}
