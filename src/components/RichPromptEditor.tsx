import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageReference } from "../types";
import { Image as ImageIcon } from "lucide-react";
import { SmartImage } from "./SmartImage";
import { PromptSnippetPanel } from "./PromptSnippetPanel";

interface RichPromptEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  refImages: ImageReference[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onKeyDownEnter: () => void;
  onEnterHoldChange?: (progress: number) => void;
  theme?: "light" | "dark";
  onPasteImage?: (file: File) => void;
}

// Inline converter helper for a single line of prompt text
export function lineToHtmlInline(
  line: string,
  refImages: ImageReference[],
): string {
  // Escape HTML before inserting tag templates
  const escaped = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Replace references like @1, @2, etc. with a styled inline span element
  return escaped.replace(/@(\d+)/g, (match, idStr) => {
    let ref = refImages.find((r) => r.id === idStr);
    // Robust fallback: if not matched directly by ID, check if idStr can be interpreted as a 1-based index (e.g. @1 -> first image in list)
    if (!ref) {
      const parsedIdx = parseInt(idStr, 10);
      if (
        !isNaN(parsedIdx) &&
        parsedIdx >= 1 &&
        parsedIdx <= refImages.length
      ) {
        ref = refImages[parsedIdx - 1];
      }
    }

    if (ref) {
      const fileName = ref.name || `参考图_${ref.id}.png`;
      const cleanName = fileName.replace(/\.[^/.]+$/, "");
      const displayName =
        cleanName.length > 15 ? cleanName.slice(0, 15) + "..." : cleanName;
      return `<span data-ref-id="${ref!.id}" contenteditable="false" class="text-indigo-400 font-serif font-bold px-1 bg-indigo-500/10 rounded cursor-pointer select-all pointer-events-none mx-0.5">@${displayName}</span>`;
    }
    return match;
  });
}

// Convert model prompt string (with @1, @2) into rich HTML elements with filenames
export function promptToHtml(
  prompt: string,
  refImages: ImageReference[],
): string {
  if (!prompt) return "<div><br></div>";

  // Use a consistent div-per-line structure to avoid browser normalization issues
  return prompt
    .split("\n")
    .map((line) => {
      const withTags = lineToHtmlInline(line, refImages);
      return `<div>${withTags || "<br>"}</div>`;
    })
    .join("");
}

function hasSubsequentContent(node: Node): boolean {
  let next = node.nextSibling;
  while (next) {
    if (next.nodeType === Node.ELEMENT_NODE) {
      return true;
    }
    if (next.nodeType === Node.TEXT_NODE) {
      if ((next.nodeValue || "").trim() !== "") {
        return true;
      }
    }
    next = next.nextSibling;
  }
  return false;
}

function hasPrecedingContent(node: Node): boolean {
  let prev = node.previousSibling;
  while (prev) {
    if (prev.nodeType === Node.ELEMENT_NODE) {
      return true;
    }
    if (prev.nodeType === Node.TEXT_NODE) {
      if ((prev.nodeValue || "").trim() !== "") {
        return true;
      }
    }
    prev = prev.previousSibling;
  }
  return false;
}

// Traverse children to extract plain text, mapping reference image spans back to @ID
export function htmlToPrompt(element: HTMLElement | DocumentFragment): string {
  let lines: string[] = [""];
  const childNodes = Array.from(element.childNodes);

  for (const node of childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      lines[lines.length - 1] += node.nodeValue || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.tagName === "SPAN" && el.getAttribute("data-ref-id")) {
        const refId = el.getAttribute("data-ref-id");
        lines[lines.length - 1] += `@${refId}`;
      } else if (el.tagName === "BR") {
        // Standard placeholder check: skip if it's a trailing BR in a block
        const isTrailingPlaceholder =
          !node.nextSibling && lines[lines.length - 1] !== "";
        if (!isTrailingPlaceholder) {
          lines.push("");
        }
      } else if (el.tagName === "DIV" || el.tagName === "P") {
        const inner = htmlToPrompt(el);
        // If we have content in current line, start a new one for the block
        if (lines[lines.length - 1] !== "") {
          lines.push(inner);
        } else {
          lines[lines.length - 1] = inner;
        }
        // Always ensure a new line starts after a block
        lines.push("");
      } else {
        lines[lines.length - 1] += el.textContent || "";
      }
    }
  }

  // Filter out trailing empty line caused by the "push('')" at the end of blocks
  let result = lines.join("\n");
  return result.replace(/\n+$/, (match) => {
    // If the original had many newlines, keep them, but remove one if it was just a block terminator
    return match.slice(0, -1);
  });
}

export default function RichPromptEditor({
  id = "",
  value,
  onChange,
  refImages,
  placeholder = "",
  className = "",
  style = {},
  onKeyDownEnter,
  onEnterHoldChange,
  theme = "dark",
  onPasteImage,
}: RichPromptEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);

  // Enter hold-down states
  const enterHoldingRef = useRef<boolean>(false);
  const enterStartTimeRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const cancelEnterHold = () => {
    if (enterHoldingRef.current) {
      enterHoldingRef.current = false;
      enterStartTimeRef.current = null;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (onEnterHoldChange) {
        onEnterHoldChange(0);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  // Suggestions state
  const [menuState, setMenuState] = useState<{
    show: boolean;
    search: string;
    node: Node | null;
    offset: number;
  }>({
    show: false,
    search: "",
    node: null,
    offset: 0,
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [isEmpty, setIsEmpty] = useState(!value || value.trim() === "");

  // Snippet Panel State
  const [isSnippetPanelOpen, setIsSnippetPanelOpen] = useState(false);
  const [snippetPanelInitialText, setSnippetPanelInitialText] = useState("");
  const [snippetPanelPosition, setSnippetPanelPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const snippetPanelSelectionRangeRef = useRef<Range | null>(null);

  // Helper to dynamically enable/disable and restyle the sibling generate button without full app re-renders while typing
  const updateSubmitButtonState = (isEmptyVal: boolean) => {
    if (!id) return;
    const trackId = id.replace("prompt-input-", "");
    const btn = document.getElementById(
      `submit-btn-${trackId}`,
    ) as HTMLButtonElement | null;
    if (btn) {
      const isGenerating =
        btn.querySelector(".animate-spin") !== null ||
        btn.classList.contains("bg-indigo-950");
      if (isGenerating) {
        return; // Let React's rendering manage the generating state completely
      }
      btn.disabled = isEmptyVal;
      if (isEmptyVal) {
        btn.className =
          "w-9 h-9 flex items-center justify-center transition-all relative z-10 bg-slate-800 text-slate-600 cursor-not-allowed";
      } else {
        btn.className =
          "w-9 h-9 flex items-center justify-center transition-all relative z-10 bg-indigo-600 hover:bg-indigo-500 text-white shadow-md cursor-pointer";
      }
    }
  };

  // Initialize and keep HTML in sync with changes from outside (e.g. clicking thumbnail to insert)
  useEffect(() => {
    if (value !== valueRef.current && editorRef.current) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      valueRef.current = value;
      editorRef.current.innerHTML = promptToHtml(value, refImages);
      updateSubmitButtonState(!value.trim());
      setIsEmpty(!value.trim());
    }
  }, [value, refImages]);

  // Initial render set content and button state
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = promptToHtml(value, refImages);
      updateSubmitButtonState(!value.trim());
      setIsEmpty(!value.trim());
    }
  }, []);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isComposingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    handleContentChange();
  };

  // Sync content editable changes back to model (debounced to fix typing lag)
  const handleContentChange = () => {
    if (!editorRef.current) return;

    // Fast path: Update empty state instantly without heavy DOM parsing
    const textWithoutZeroWidthSpaces = (
      editorRef.current.textContent || ""
    ).replace(/\u200B/g, "");
    updateSubmitButtonState(!textWithoutZeroWidthSpaces.trim());
    setIsEmpty(!textWithoutZeroWidthSpaces.trim());

    if (isComposingRef.current) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (editorRef.current) {
        // Full serialization for rich elements (references, etc.)
        const rawText = htmlToPrompt(editorRef.current);
        checkTrigger();

        // Double-check the state in case HTML structure differs from innerText
        updateSubmitButtonState(!rawText.trim());
        setIsEmpty(!rawText.trim());

        // Under Uncontrolled Ref Mode, we DO NOT trigger onChange on keydown/input at all.
        // This completely avoids any intermediate React render of the App during typing!
      }
    }, 150);
  };

  const handleBlur = (e: React.FocusEvent) => {
    cancelEnterHold();
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    if (editorRef.current) {
      const rawText = htmlToPrompt(editorRef.current);
      if (rawText !== valueRef.current) {
        valueRef.current = rawText;
        onChangeRef.current(rawText);
      }
    }
  };

  // Inspect selection/caret position to handle autocomplete popups dynamically
  const checkTrigger = () => {
    const selection = window.getSelection();
    if (!selection || !selection.focusNode || !selection.isCollapsed) {
      setMenuState((prev) => (prev.show ? { ...prev, show: false } : prev));
      return;
    }

    const { focusNode, focusOffset } = selection;

    if (focusNode.nodeType === Node.TEXT_NODE) {
      const text = focusNode.nodeValue || "";
      const textBeforeCursor = text.substring(0, focusOffset);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        if (!/\s/.test(textAfterAt)) {
          // If suggestion isn't active, or query has changed, open or update menu
          setMenuState({
            show: true,
            search: textAfterAt,
            node: focusNode,
            offset: lastAtIndex,
          });
          return;
        }
      }
    }
    setMenuState((prev) => (prev.show ? { ...prev, show: false } : prev));
  };

  // Helper: locate a reference tag immediately to the left of the caret
  const getPreviousRefSpan = (): HTMLSpanElement | null => {
    const selection = window.getSelection();
    if (!selection) return null;

    const { focusNode, focusOffset } = selection;
    if (!focusNode) return null;

    // Pattern 1: Cursor is in text node right after the reference span, offset is 0
    if (focusNode.nodeType === Node.TEXT_NODE && focusOffset === 0) {
      const prev = focusNode.previousSibling;
      if (prev instanceof HTMLSpanElement && prev.hasAttribute("data-ref-id")) {
        return prev;
      }
    }

    // Pattern 2: Cursor is in parent container, offset holds the child index immediately after reference span
    if (focusNode.nodeType === Node.ELEMENT_NODE) {
      if (focusOffset > 0) {
        const child = focusNode.childNodes[focusOffset - 1];
        if (
          child instanceof HTMLSpanElement &&
          child.hasAttribute("data-ref-id")
        ) {
          return child;
        }
      }
    }

    return null;
  };

  // Autocomplete selection handler
  const selectRefImage = (ref: ImageReference) => {
    const selection = window.getSelection();
    if (!selection) return;

    const { node, offset } = menuState;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || "";
      const queryLength = menuState.search.length;
      const endOffset = offset + 1 + queryLength;

      const beforeAt = text.substring(0, offset);
      const afterCaret = text.substring(endOffset);

      // Truncate the original text node to before the "@" character
      node.nodeValue = beforeAt;

      const span = document.createElement("span");
      span.setAttribute("data-ref-id", ref.id);
      span.setAttribute("contenteditable", "false");
      span.className =
        "text-indigo-400 font-serif font-bold px-1.5 py-0.5 bg-indigo-500/10 rounded cursor-pointer select-all pointer-events-none mx-0.5";
      const cleanName = (ref.name || `参考图_${ref.id}`).replace(
        /\.[^/.]+$/,
        "",
      );
      const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
      let displayName = "";
      if (hasChinese) {
        displayName =
          cleanName.length > 10 ? cleanName.slice(0, 10) + "..." : cleanName;
      } else {
        const refIdx = refImages.findIndex((r) => r.id === ref.id);
        displayName = `参考${refIdx !== -1 ? refIdx + 1 : ref.id}`;
      }
      span.innerText = `@${displayName}`;

      const spacer = document.createTextNode(" ");
      const afterNode = document.createTextNode(afterCaret);

      // Safely insert elements one after another into the DOM tree
      const parent = node.parentNode;
      if (parent) {
        const nextSibling = node.nextSibling;
        parent.insertBefore(span, nextSibling);
        parent.insertBefore(spacer, nextSibling);
        parent.insertBefore(afterNode, nextSibling);

        // Put the cursor caret comfortably at the beginning of the trailing text node
        const targetCaretRange = document.createRange();
        targetCaretRange.setStart(afterNode, 0);
        targetCaretRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(targetCaretRange);
      }

      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      const rawText = htmlToPrompt(editorRef.current!);
      valueRef.current = rawText;
      updateSubmitButtonState(!rawText.trim());
      setIsEmpty(!rawText.trim());
      onChangeRef.current(rawText);
      setMenuState({ show: false, search: "", node: null, offset: 0 });
    }
  };

  // Keyboard navigation & key intercepts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Prompt snippets Tab trigger
    if (e.key === "Tab" && !menuState.show) {
      e.preventDefault();
      const selection = window.getSelection();
      let selectedText = "";
      let calculatedPos: { top: number; left: number; width: number } | null =
        null;
      if (
        selection &&
        selection.rangeCount > 0 &&
        editorRef.current?.contains(selection.anchorNode)
      ) {
        selectedText = selection.toString();
        const range = selection.getRangeAt(0);
        snippetPanelSelectionRangeRef.current = range.cloneRange();

        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          let bottom = rect.bottom;
          if (rect.height === 0 && rect.bottom === 0) {
            const dummy = document.createElement("span");
            dummy.innerHTML = "&#8203;"; // Zero-width space
            range.insertNode(dummy);
            bottom = dummy.getBoundingClientRect().bottom;
            dummy.parentNode?.removeChild(dummy);
          }
          calculatedPos = {
            top: bottom + 8,
            left: containerRect.left + 16, // left-4 equivalent (16px) inside container
            width: containerRect.width - 32, // right-4 left-4 equivalent
          };
        }
      } else {
        snippetPanelSelectionRangeRef.current = null;

        // If not focused on text but tab pressed, we still want to show the menu in editor context.
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          calculatedPos = {
            top: containerRect.bottom - 56, // rough position near bottom
            left: containerRect.left + 16,
            width: containerRect.width - 32,
          };
        }
      }
      setSnippetPanelPosition(calculatedPos);
      setSnippetPanelInitialText(selectedText);
      setIsSnippetPanelOpen((prev) => !prev);
      return;
    }

    // Intercept Backspace directly before reference span
    if (e.key === "Backspace") {
      const prevSpan = getPreviousRefSpan();
      if (prevSpan) {
        e.preventDefault();
        const parent = prevSpan.parentNode;
        if (parent) {
          // Replace reference span with plain text "@"
          const atTextNode = document.createTextNode("@");
          parent.replaceChild(atTextNode, prevSpan);

          // Place selection right after the newly inserted @
          const range = document.createRange();
          range.setStart(atTextNode, 1);
          range.setEnd(atTextNode, 1);

          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }

          // Force state update and pop menu open immediately
          const rawText = htmlToPrompt(editorRef.current!);
          if (debounceTimeoutRef.current)
            clearTimeout(debounceTimeoutRef.current);
          valueRef.current = rawText;
          updateSubmitButtonState(!rawText.trim());
          setIsEmpty(!rawText.trim());
          onChangeRef.current(rawText);

          setMenuState({
            show: true,
            search: "",
            node: atTextNode,
            offset: 0,
          });
          setActiveIndex(0);
        }
        return;
      }
    }

    // Suggested menu open keys navigation
    if (menuState.show && filteredRefs.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filteredRefs.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (prev) => (prev - 1 + filteredRefs.length) % filteredRefs.length,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectRefImage(filteredRefs[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuState({ show: false, search: "", node: null, offset: 0 });
        return;
      }
    }

    // Intercept normal Return or handle Ctrl+Return long-press
    if (e.key === "Enter") {
      if (e.isComposing) {
        return;
      }

      // 1. Ctrl+Enter handles the holding generator mechanism (holding for 1.5s)
      if (e.ctrlKey || e.metaKey) {
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        e.preventDefault();

        // If suggestions menu is showing and has options, do not trigger hold
        if (menuState.show && filteredRefs.length > 0) {
          return;
        }

        if (!enterHoldingRef.current) {
          enterHoldingRef.current = true;
          const startTime = Date.now();
          enterStartTimeRef.current = startTime;
          const duration = 1500; // 1500 ms

          const tick = () => {
            if (!enterHoldingRef.current) return;
            const now = Date.now();
            const elapsed = now - startTime;

            // Only report progress after 100ms of active hold-down to prevent flashing on single-click taps
            if (elapsed >= 100) {
              const progress = Math.min(
                100,
                ((elapsed - 100) / (duration - 100)) * 100,
              );
              if (onEnterHoldChange) {
                onEnterHoldChange(progress);
              }
            }

            if (elapsed >= duration) {
              enterHoldingRef.current = false;
              enterStartTimeRef.current = null;
              if (onEnterHoldChange) {
                onEnterHoldChange(0);
              }
              if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
                debounceTimeoutRef.current = null;
                if (editorRef.current) {
                  const rawText = htmlToPrompt(editorRef.current);
                  valueRef.current = rawText;
                  onChangeRef.current(rawText);
                }
              }
              onKeyDownEnter();
            } else {
              rafIdRef.current = requestAnimationFrame(tick);
            }
          };
          rafIdRef.current = requestAnimationFrame(tick);
        }
      } else {
        // 2. Normal Enter (without Ctrl/Cmd): insert a standard newline instantly with zero tracking overhead
        if (!e.shiftKey) {
          e.preventDefault();
          document.execCommand("insertText", false, "\n");
          handleContentChange();
        }
        cancelEnterHold();
      }
    } else {
      cancelEnterHold();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter") {
      if (e.isComposing) {
        return;
      }
      cancelEnterHold();
    }
    checkTrigger();
  };

  // Support rich copy of reference image spans as model-standard @ID strings
  const handleCopy = (e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;

    e.preventDefault();
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Convert selection fragment to our prompt format with @1, @2 references
    const plainText = htmlToPrompt(fragment);

    e.clipboardData.setData("text/plain", plainText);
  };

  // Support rich cut of reference image spans
  const handleCut = (e: React.ClipboardEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;

    e.preventDefault();
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Convert selection fragment to our prompt format
    const plainText = htmlToPrompt(fragment);

    e.clipboardData.setData("text/plain", plainText);

    // Delete the selected content
    range.deleteContents();
    handleContentChange();
  };

  // Plain-text pasting that parses @ID annotations into styled pills dynamically
  const handlePaste = (e: React.ClipboardEvent) => {
    if (
      onPasteImage &&
      e.clipboardData.files &&
      e.clipboardData.files.length > 0
    ) {
      const items = Array.from(e.clipboardData.files) as File[];
      const imageFile = items.find((file) => file.type.startsWith("image/"));
      if (imageFile) {
        e.preventDefault();
        onPasteImage(imageFile);
        return;
      }
    }

    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();

      // Convert plain text with potential @1 references to HTML (inline for single line, block for multiline)
      let htmlContent = "";
      if (text.includes("\n")) {
        htmlContent = promptToHtml(text, refImages);
      } else {
        htmlContent = lineToHtmlInline(text, refImages);
      }

      // Parse HTML to DOM nodes via a template
      const template = document.createElement("template");
      template.innerHTML = htmlContent;
      const fragment = template.content;

      const lastChild = fragment.lastChild;
      range.insertNode(fragment);

      // Advance cursor
      if (lastChild) {
        const targetCaretRange = document.createRange();
        targetCaretRange.setStartAfter(lastChild);
        targetCaretRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(targetCaretRange);
      }

      handleContentChange();
    }
  };

  // Close suggestions if clicked outside
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setMenuState((prev) => (prev.show ? { ...prev, show: false } : prev));
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  // Filter references matching current query
  const query = menuState.search.toLowerCase();
  const filteredRefs = refImages.filter((ref) => {
    if (!query) return true;
    const nameMatch = (ref.name || "").toLowerCase().includes(query);
    const idMatch = ref.id.includes(query);
    return nameMatch || idMatch;
  });

  // Keep index clamp
  useEffect(() => {
    if (activeIndex >= filteredRefs.length) {
      setActiveIndex(Math.max(0, filteredRefs.length - 1));
    }
  }, [filteredRefs.length]);

  // Dynamically update autocomplete menu position below the text caret
  useEffect(() => {
    if (!menuState.show || !containerRef.current) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();

      if (containerRect) {
        let caretBottom = rect.bottom;
        let caretLeft = rect.left;

        if (rect.height === 0 || rect.bottom === 0) {
          const dummy = document.createElement("span");
          dummy.innerHTML = "&#8203;";
          try {
            const tempRange = range.cloneRange();
            tempRange.insertNode(dummy);
            const dummyRect = dummy.getBoundingClientRect();
            caretBottom = dummyRect.bottom;
            caretLeft = dummyRect.left;
            dummy.parentNode?.removeChild(dummy);
          } catch (err) {
            caretBottom = containerRect.top + 40;
            caretLeft = containerRect.left + 16;
          }
        }

        // Calculate fixed viewport coordinates (matching PromptSnippetPanel's width mechanism)
        const top = caretBottom + 6; // Comfort gap of 6px below cursor
        const menuWidth = containerRect.width - 32;
        const left = containerRect.left + 16;

        setMenuPosition({
          top,
          left,
          width: menuWidth,
        });
      }
    };

    updatePosition();

    const handleEvent = () => {
      requestAnimationFrame(updatePosition);
    };

    document.addEventListener("selectionchange", handleEvent);
    window.addEventListener("resize", handleEvent);
    return () => {
      document.removeEventListener("selectionchange", handleEvent);
      window.removeEventListener("resize", handleEvent);
    };
  }, [menuState.show, menuState.search, menuState.node, menuState.offset]);

  // Scroll autocomplete active item into view
  useEffect(() => {
    if (menuState.show && menuPosition !== null && filteredRefs.length > 0) {
      const selectedEl = document.getElementById(`ref-item-${activeIndex}`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [activeIndex, menuState.show, menuPosition, filteredRefs.length]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      {/* Absolute styled placeholder behind the transarent text editor */}
      {isEmpty && (
        <div className="absolute top-3.5 left-4 pointer-events-none select-none text-slate-400 font-serif font-bold text-base leading-relaxed z-0">
          {placeholder}
        </div>
      )}

      {isSnippetPanelOpen && (
        <PromptSnippetPanel
          theme={theme as any}
          initialText={snippetPanelInitialText}
          position={snippetPanelPosition}
          onClose={() => {
            setIsSnippetPanelOpen(false);
            setSnippetPanelInitialText("");
            if (editorRef.current) {
              editorRef.current.focus();
              try {
                if (snippetPanelSelectionRangeRef.current) {
                  const sel = window.getSelection();
                  if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(snippetPanelSelectionRangeRef.current);
                  }
                }
              } catch (e) {}
            }
          }}
          onSelect={(content: string) => {
            if (editorRef.current) {
              editorRef.current.focus();
              const sel = window.getSelection();
              if (sel && snippetPanelSelectionRangeRef.current) {
                sel.removeAllRanges();
                sel.addRange(snippetPanelSelectionRangeRef.current);
                document.execCommand("insertText", false, content);
                handleContentChange();
              } else {
                document.execCommand("insertText", false, content);
                handleContentChange();
              }
            }
            setIsSnippetPanelOpen(false);
            setSnippetPanelInitialText("");
          }}
        />
      )}

      {/* Styled rich input box matching standard layout */}
      <div
        id={id}
        ref={editorRef}
        contentEditable
        spellCheck={false}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onInput={handleContentChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onMouseUp={checkTrigger}
        onFocus={checkTrigger}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onCut={handleCut}
        className={`${className} rich-prompt-input whitespace-pre-wrap overflow-y-auto scrollbar-thin outline-none focus:outline-none`}
        style={style}
      />

      {/* Suggestion overlay menu holding reference images list */}
      {menuState.show &&
        menuPosition !== null &&
        filteredRefs.length > 0 &&
        createPortal(
          <div
            className={`fixed rounded-xl shadow-2xl z-[9999] flex flex-col overflow-hidden border ${
              theme === "light"
                ? "bg-white/95 backdrop-blur-md border border-slate-200 text-slate-850 shadow-slate-200/50"
                : "bg-slate-950/95 backdrop-blur-md border border-slate-850 text-slate-100 shadow-black/80"
            }`}
            style={{
              top: menuPosition.top,
              left: menuPosition.left,
              width: menuPosition.width,
              maxHeight: `calc(100vh - ${menuPosition.top}px - 16px)`, // Align height mechanism with prompt options panel
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`text-[10px] font-bold px-3 py-1.5 select-none flex items-center justify-between border-b ${
                theme === "light"
                  ? "text-slate-400 border-slate-100"
                  : "text-slate-500 border-slate-800/60"
              }`}
            >
              <span>选择要加入的参考图</span>
              <span>回车/点击选择</span>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin p-1.5 space-y-1">
              {filteredRefs.map((ref, idx) => {
                const isSelected = idx === activeIndex;
                const isLight = theme === "light";

                const btnBg = isSelected
                  ? isLight
                    ? "bg-slate-100 text-black"
                    : "bg-slate-800 text-white"
                  : isLight
                    ? "text-slate-700 hover:bg-slate-50 hover:text-black"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white";

                const badgeStyle = isSelected
                  ? isLight
                    ? "bg-slate-200 text-slate-800"
                    : "bg-white/10 text-white"
                  : isLight
                    ? "bg-slate-100 text-slate-500"
                    : "bg-slate-850/60 text-slate-400";

                const thumbBorder = isLight
                  ? isSelected
                    ? "border-slate-300 bg-slate-200"
                    : "border-slate-200 bg-slate-50"
                  : isSelected
                    ? "border-slate-700 bg-slate-850"
                    : "border-slate-880 bg-slate-950";

                return (
                  <button
                    key={ref.id}
                    id={`ref-item-${idx}`}
                    type="button"
                    onClick={() => selectRefImage(ref)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors ${btnBg}`}
                  >
                    {/* Image thumb */}
                    <div
                      className={`w-6 h-6 rounded overflow-hidden relative flex-shrink-0 border ${thumbBorder}`}
                    >
                      {ref.url ? (
                        <SmartImage
                          src={ref.url}
                          alt={ref.id}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover select-none pointer-events-none"
                        />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-slate-500 absolute inset-0 m-auto" />
                      )}
                    </div>

                    {/* Name / Info */}
                    <span
                      className={`flex-1 truncate ${
                        isSelected
                          ? isLight
                            ? "text-black font-semibold"
                            : "text-white font-semibold"
                          : isLight
                            ? "text-slate-600"
                            : "text-slate-400"
                      }`}
                    >
                      {(() => {
                        const cleanName = (
                          ref.name || `参考图_${ref.id}`
                        ).replace(/\.[^/.]+$/, "");
                        const hasChinese = /[\u4e00-\u9fa5]/.test(cleanName);
                        if (hasChinese) {
                          return cleanName.length > 10
                            ? cleanName.slice(0, 10) + "..."
                            : cleanName;
                        } else {
                          const refIdx = refImages.findIndex(
                            (r) => r.id === ref.id,
                          );
                          return `参考${refIdx !== -1 ? refIdx + 1 : ref.id}`;
                        }
                      })()}
                    </span>

                    {/* Handle tagging identifier overlay */}
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-extrabold ${badgeStyle}`}
                    >
                      @{ref.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
