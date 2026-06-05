# Annotate Pro — Sharp Chrome Extension (v1.0.0)

**Powerful, minimal, decisive annotation tool for any webpage.**

![Demo of Annotate Pro](/screenshots/demo.gif) 

Annotate Pro injects a clean, sharp, professional dark toolbar directly into any webpage you're viewing. It provides precise freehand drawing, a full shapes palette, a pulsing laser pointer ideal for presentations or screen sharing, an adjustable eraser, undo/redo, clear, whiteboard/darkboard solid background layers, one-click annotated screenshot capture, and fully persistent annotations (until you reload or clear). 

Everything stays local, self-contained, and extremely lightweight. The UI is deliberately sharp (zero border-radius), uses a confident red (#ff0000) accent sparingly on a true dark professional palette (#0a0a0a surfaces), and features modern responsive behavior that intelligently collapses for narrow or short viewports — exactly like high-quality Chrome extension side panels.

**No external dependencies. Production-ready. Keyboard-first. Settings persist across sessions.**

![UI on WIKI with annotations](/screenshots/UI%20with%20annotations%20on%20wiki.png)
 
---

## What It Does (In Detail)

- **Overlay Canvas Drawing**: Creates a fixed full-viewport `<canvas>` (z-index managed) that captures mouse input only when annotation mode is active. Drawing is vector-like for shapes (live preview on drag) and immediate pixel for freehand/eraser. All strokes use `round` line caps/joins for clean results.
- **Tools**:
  - Freehand pencil with live color/width picker + preset swatches
  - Shapes dropdown: Line, Circle, Arrow (with head), Rectangle, Ellipse, Triangle, Diamond, Star — all preview while dragging, committed on mouseup
  - Laser pointer: pulsing animated dot (independent color), great for highlighting during demos; hides cursor on canvas
  - Eraser: circular with live size slider + visual indicator; uses canvas `destination-out` composite
- **Whiteboard / Darkboard**: Optional solid background layer behind the annotation canvas (white or near-black). Perfect for annotating over blank or to increase contrast. Cycles with one button; state remembered per session.
- **Screenshot**: Hides toolbar/subpanels momentarily, captures the full visible tab (including your annotations + laser if active), auto-downloads as dated PNG via Chrome downloads API. Restores UI instantly.
- **Persistence & Undo**: Every committed stroke (or shape) saves a full `ImageData` snapshot. Undo/Redo stacks allow non-destructive editing. Annotations survive page JavaScript interactions, scrolling, dynamic content — until full page reload (by design: keeps memory footprint tiny and simple).
- **Responsive Sidebar Toolbar**: Docks to **left or right** edge (configurable in Settings). Fixed 68px wide, full viewport height, internal vertical scroll when needed. 
  - On short viewports (< ~450px height): auto icon-only + tighter spacing
  - On very short (< ~300px): auto-minimizes to floating `+` restore button
  - Always keeps critical actions (toggle, undo/redo/clear, screenshot, settings) accessible
  - Uses `ResizeObserver` + window resize for live updates. No fighting the viewport.
- **Settings Panel**: Persistent preferences (chrome.storage.local):
  - Dock position (left/right)
  - Default stroke color + width
  - Separate laser color
  - Eraser default size
  - Font scale (for high-DPI/large screens)
- **Global + In-Page Shortcuts**:
  - `Ctrl+Shift+A` / `Cmd+Shift+A`: toggle annotation from anywhere (even without popup)
  - `P`: toggle drawing mode while toolbar visible
  - `←` / `→`: undo / redo
  - `Esc`: minimize toolbar
- **Self-Healing UX**: Click outside dropdowns/settings closes them. Toolbar highlights active tool. Sub-toolbar appears contextually for color/width/size pickers. Laser/eraser special cursor handling.

Annotations are **per-page / per-load**. They do **not** survive full navigation or reload — intentional to avoid bloat and keep the extension snappy for power users who annotate many tabs.

---

## Technical Architecture (For Developers)

This is a **Manifest V3** Chrome extension. Everything is client-side, no network calls ever.

### Core Flow
1. User clicks extension icon → `popup.html` + `popup.js` opens (320px clean card).
2. Popup checks current tab status via `chrome.tabs.sendMessage` (if annotate.js already injected).
3. On "TOGGLE ANNOTATION" click (or global command): `chrome.scripting.executeScript` dynamically injects `annotate.js` into the active tab.
4. `annotate.js` is an IIFE that:
   - Guards against duplicate injection (`window.annotationToolLoaded`): re-inject = toggle mode.
   - Sets up canvas, control panel (sharp dark sidebar), sub-toolbar, minimize button, eraser indicator, shapes dropdown, help/settings panels.
   - Injects all CSS (enforces `border-radius:0`, dark theme, responsive classes, scrollbar styling).
   - Wires mouse events on canvas for drawing, keyboard global listener, button handlers, ResizeObserver.
   - On first load: applies saved prefs from `chrome.storage.local`, positions toolbar (default left), starts in active drawing mode.
5. Background service worker (`background.js`):
   - Listens to `chrome.commands` for global `toggle-annotation` shortcut → injects script.
   - Handles `capture-screenshot` message from content script → `chrome.tabs.captureVisibleTab` (PNG) → `chrome.downloads.download` with timestamped filename. Restores any hidden UI.
6. All drawing state lives in JS memory (`state.annotations` map of context → ImageData[], undo/redo stacks). No serialization to disk except user prefs.

### Key Implementation Highlights
- **Canvas Management**: `resizeCanvas()` defensively clamps to ≥1px, restores prior annotations via `putImageData`. Called on window resize + init.
- **Shape Drawing**: `drawCurrentShape()` uses canvas path API for all 8 shapes (including math for triangle/diamond/star). Preview mode restores base layer then draws transient stroke; commit on `mouseup` calls `saveAnnotation()`.
- **Laser**: `requestAnimationFrame` loop draws pulsing concentric circles (sin-based radius + alpha glow). Skips draw if mouse over toolbar elements. Independent color from stroke.
- **Responsive Engine** (`updateResponsiveLayout`): Pure height-based for sidebars. Adds `responsive-compact` / `responsive-icon-only` classes that tighten padding/gaps/fonts via CSS `calc( Npx * var(--font-scale))`. Auto-minimize grace period on tiny heights.
- **Settings Persistence**: On save, writes object to `chrome.storage.local.annotatePrefs`. On init, reads and applies to `state` + live UI (color pickers, position via `setToolbarPosition`).
- **Close / Unload**: "Close" button fully tears down DOM elements, disconnects observers, resets guard flag so extension can be re-injected cleanly later.
- **No Top Bar**: Top horizontal mode was removed for code clarity/maintainability. Only robust left/right sidebars remain (vertical flex column with `min-height:0` for proper internal scroll).

### Permissions Explained
- `activeTab` + `scripting`: inject on current page on demand (no broad host perms needed beyond `<all_urls>` for canvas overlay on any site).
- `storage`: persist user prefs (colors, sizes, dock side, font scale).
- `downloads`: auto-save screenshots without "Save As" dialog.

### Limitations (Honest)
- Cannot annotate internal Chrome pages (`chrome://`, `chrome-extension://`, some Web Store, etc.) — Chrome blocks scripting.
- Annotations are **ephemeral per page load** (resets on reload/F5 or navigation). If you need permanent marks, take screenshots.
- Memory: each undo step stores full `ImageData` (width × height × 4 bytes). Fine for typical use; very long sessions with thousands of strokes on huge viewports could grow large (but practical limit is high).
- Laser pointer is visual-only (not a real DOM element); it appears in screenshots if timing aligns with capture.
- Works best on desktop Chrome. Mobile/touch not primary target (mouse events).
- Some pages with heavy canvas/WebGL or pointer-events manipulation may conflict (rare).

---

## How to Install (Developer / Sideloading)

1. Download or clone this folder (`annotate-extension/`).
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked**.
5. Select the `annotate-extension` folder.
6. (Optional but recommended) Click the pin icon to keep it in your toolbar.
7. Navigate to any normal webpage and click the extension icon or press `Ctrl+Shift+A`.

To **update** after editing code: go to `chrome://extensions/`, find Annotate Pro, click the reload icon (circular arrow).

No build step, no webpack, no dependencies. Pure static files + modern ES2020+.

---

## Usage Walkthrough

1. Go to any webpage (docs, articles, designs, slides, code, etc.).
2. Click extension icon in toolbar → big red **TOGGLE ANNOTATION** (or global shortcut).
3. Sharp dark sidebar appears docked left (or right via Settings).
4. Pick tool:
   - Freehand or Shapes → draw directly (live preview for shapes).
   - Laser → move mouse; pulsing red (or chosen color) dot follows. Click laser button again to exit.
   - Eraser → drag to remove; slider in sub-toolbar adjusts size live.
5. Use Undo/Redo/Clear All (always visible in global actions).
6. Toggle Whiteboard/Darkboard for solid bg layer.
7. Click camera icon for instant annotated PNG download.
8. Press `P` or **Stop Annotating** to disable input (canvas stays visible with marks).
9. Minimize toolbar with `−` button (floating `+` appears to restore).
10. Open Settings (gear) to change dock side, defaults, etc. — changes apply live and persist.

Press `Esc` to minimize, arrow keys for undo/redo.

Annotations stay until you reload the page or click Clear All / Close.

---

## Keyboard Shortcuts

| Shortcut              | Action                              | Context          |
|-----------------------|-------------------------------------|------------------|
| `Ctrl+Shift+A` / `Cmd+Shift+A` | Toggle annotation mode globally    | Anywhere         |
| `P`                   | Toggle drawing input on/off         | When toolbar visible |
| `←`                   | Undo last stroke                    | When active      |
| `→`                   | Redo last undone stroke             | When active      |
| `Esc`                 | Minimize toolbar                    | When visible     |

---

## Design Philosophy (Strictly Enforced)

- **Sharp everywhere**: `border-radius: 0 !important` on all UI elements. Decisive, modern, no softness.
- **Red as accent only**: #ff0000 used for primary actions, active states, laser, swatch highlights. Never overwhelming.
- **Dark-first professional**: True black (#0a0a0a) surfaces, high contrast text, subtle borders (#333).
- **Excellent spacing & hierarchy**: Generous but tight padding, strong visual groups, icon + short label pattern.
- **Responsive by default**: Never fights viewport. Collapses gracefully. Internal scroll only when needed.
- **Self-contained & predictable**: One file does almost everything. No frameworks. Easy to audit/modify.
- **Power-user focused**: Shortcuts, persistence of prefs, non-destructive undo, presentation tools (laser + board), instant export.

---

## File Structure

```
annotate-extension/
├── manifest.json          # MV3 config, name, version 1.0.0, permissions, keyboard command
├── popup.html             # Polished 320px dark launcher UI (status-aware button)
├── popup.js               # Handles inject, status sync with content script, error UX
├── background.js          # Service worker: global shortcut handler + screenshot capture/download
├── annotate.js            # ~1600 LOC self-contained annotation engine (IIFE)
│   ├── Theme + CONFIG + state
│   ├── Style injection (sharp + responsive CSS)
│   ├── Canvas + all UI element setup (panel, subtoolbar, dropdowns, indicators)
│   ├── Drawing engine (freehand, 8 shapes w/ preview, eraser, laser raf loop)
│   ├── Persistence (ImageData snapshots, undo/redo stacks)
│   ├── Responsive layout engine (height-based collapse, ResizeObserver)
│   ├── Settings/Help panels + persistence
│   └── Event wiring + message listener
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon.svg           # Source sharp red accent icon
└── README.md              # This file
```

`annotate.js` is the heart — fully commented, production hardened (defensive sizing, guards against 0-dim canvas, etc.).

---

## Development & Contribution Notes

- **Modifying**: Edit `annotate.js` for logic/UI, `popup.*` for launcher, `background.js` for service bits. Reload extension in chrome://extensions after changes. Test on real pages (not internal Chrome pages).
- **Debugging**: Open DevTools on the target webpage (F12) — console logs from annotate.js appear there (prefixed `[Annotate Pro]`). Canvas is `#annotation-canvas`.
- **Testing responsive**: Resize browser window vertically for sidebar collapse behavior. Use device toolbar for narrow simulations (though primarily desktop).
- **Versioning**: Semantic. v1.0.0 is the polished, bug-fixed, production-ready release (legacy top-bar code removed, settings dismiss fixed, responsive comments cleaned, all versions unified).
- **Known Polish Items** (future if desired): Touch support, annotation export/import (JSON + replay), multi-page sessions, SVG export of strokes instead of raster.
- **Why this approach?** Dynamic injection keeps permissions minimal and works on any site without prior "install on all sites". Self-contained script means zero runtime deps and easy auditing.

---

## Credits & Philosophy

Built with precision and respect for power users who need decisive tools without bloat or rounded corners. Red means business.

Enjoy annotating with intent.

**Red means business.**
