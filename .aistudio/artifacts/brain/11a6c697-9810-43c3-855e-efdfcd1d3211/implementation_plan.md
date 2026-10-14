# Implementation Plan - Multi-Column Infinite Canvas High-Performance Rendering & Viewport Culling

This plan outlines the step-by-step implementation of the high-performance rendering and viewport culling architecture for the multi-column image generation canvas ("贞贞Pro"), designed to eliminate stuttering, memory bloat (OOM), and layout reflows when handling 100+ columns and thousands of high-res generated images.

---

## 1. Architecture & Core Components

### A. Data-DOM Decoupling Model (`types.ts` & state layer)
- Establish explicit `ColumnData` and `CardData` interfaces:
  - `ColumnData`: `id`, `title`, `xOffset`, `width`, `cardIds[]`
  - `CardData`: `id`, `columnId`, `yOffset`, `height`, `imageUrl`, `thumbnailUrl`, `originalFileData`, `status`, `isStarred`, etc.
- Canvas state will be driven purely by mathematical data models rather than relying on DOM `getBoundingClientRect()` queries during rendering loops.

### B. Two-Level Viewport Culling Engine
1. **Column X-Culling (`BufferX`)**:
   - Track container `scrollLeft` and `viewportWidth`.
   - Compute visible column index range `[startIndex, endIndex]` with horizontal buffer.
2. **Vertical Y-Culling (`BufferY`)**:
   - For each visible column, compute visible card range using binary search (`Binary Search`) over cumulative card heights (`yOffset` + `height`).
   - Filter out off-screen cards from React DOM mounting.

### C. Multi-Level LOD (Level of Detail) & DOM Mount Quota
- **LOD Tiers**:
  - `Nano-LOD`: Tiny view -> canvas placeholder (0 DOM nodes).
  - `Micro-LOD`: Far view -> lightweight container with 64px/128px thumbnail.
  - `Standard-LOD`: Normal interaction -> full interactive card, 2K proxy image.
  - `Macro-LOD`: Close-up -> 4K original image on idle/center focus.
- **Frame-Level DOM Mount Quota**:
  - Throttle DOM mounting during gestures/scrolling (e.g., max 1 new card DOM mount per 4 frames) to prevent synchronous reflow stutter.

### D. Intent-Driven Lazy Restoration (GPU & CSS Optimization)
- **Persistent Degradation**: Automatically strip heavy CSS effects (`backdrop-blur`, complex shadows, expensive transitions) during active scroll, pan, or drag.
- **Instant Restoration (0ms)**: Instantly restore full CSS fidelity upon user intent (mouse click, opening side panel, modal, or input focus).
- **Absolute Idle Fallback**: 2000ms idle timer to restore polish when user stops moving.

### E. Asset Management & LRU Texture Cache
- Maintain a bounded LRU cache for image textures and `ImageBitmap` objects.
- Explicitly invoke `URL.revokeObjectURL` on off-screen cards to prevent browser memory bloan (OOM).
- Ensure UI renders lightweight proxy images while AI generation requests feed uncompromised `originalFileData` blobs.

---

## 2. Step-by-Step Implementation Steps

### Step 1: Data Structure & Model Refactoring
- Enhance `src/types.ts` with structured `ColumnData` and `CardData` types supporting geometric positioning metadata (`xOffset`, `yOffset`, `width`, `height`).

### Step 2: Viewport Culling & Scroll Hook Implementation
- Create a dedicated high-performance viewport calculation hook (`useViewportCulling`) tracking container scroll and dimensions with passive event listeners and requestAnimationFrame.
- Implement column X-culling and column-internal binary search Y-culling.

### Step 3: DOM Mount Quota & Progressive LOD Integration
- Integrate throttled DOM insertion queue to prevent synchronous reflow bursts during fast scrolling.
- Apply `content-visibility: auto; contain-intrinsic-size` on column containers for native browser layout isolation.

### Step 4: Intent-Driven Lazy CSS & GPU Optimization
- Implement scroll/interaction state detector that toggles lightweight CSS classes during motion and restores high-fidelity styles on intent or idle timeout.

### Step 5: Memory LRU Cache & AI Data Pipeline
- Implement LRU cache cleanup and explicit Blob revocation for unmounted cards.
- Verify AI generation inputs correctly bind to uncompromised original file payloads.

---

## 3. Verification Plan
- **Performance Benchmarking**: Verify 60fps smooth scrolling with simulated 50+ columns and 1,000+ cards.
- **Memory Check**: Verify memory remains stable during rapid zooming and panning (no OOM leaks).
- **Functional Verification**: Run `compile_applet` and verify all generation, prompt editing, and image comparison features work flawlessly.
