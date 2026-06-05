// annotate.js - Chrome Extension Content Script (v1.0.0)
// Sharp, minimal, professional annotation tool with powerful red accent and dark-first design.
// Control panel implemented with intuitive, real-world Chrome extension responsive behavior for sidebars:
// - Sidebars (left/right dock): tools-scroll-container shrinks with page HEIGHT (min-height:0 + internal vertical scroll).
// - Progressive collapse (gaps → paddings → icon-only labels) using CSS classes + flex constraints.
// - Short labels + title tooltips, auto-minimize on tiny sidebars, live ResizeObserver updates.

(function() {
    // Prevent duplicate script loading - re-execution toggles mode
    if (window.annotationToolLoaded) {
        toggleAnnotationMode();
        return;
    }
    window.annotationToolLoaded = true;
  
    // ### Theme Configuration
    const theme = {
        colors: {
            primary: '#ff0000',
            secondary: '#1a1a1a',
            background: '#0a0a0a',
            defaultStroke: '#ff0000',
            eraserIndicator: 'rgba(255, 0, 0, 0.55)',
            eraserShadow: '#000000'
        },
        font: {
            family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
    };

    // ### Configuration Constants (no magic numbers/strings for maintainability)
    const CONFIG = {
        SIDEBAR_WIDTH_PX: 68,
        MINIMIZE_BUTTON_SIZE_PX: 44,
        MINIMIZE_OFFSET_PX: 72,
        SUBTOOLBAR_OFFSET_PX: 76,
        CONTROL_PANEL_PADDING_PX: 8,
        BUTTON_PADDING_SIDEBAR_PX: 7,
        Z_INDICES: {
            WHITEBOARD_BG_LAYER: 9998,
            CANVAS: 9999,
            CONTROL_PANEL: 10000,
            SUB_TOOLBAR: 10000,
            MINIMIZE_BUTTON: 10001,
            ERASER_INDICATOR: 10001,
            SHAPES_DROPDOWN: 10003,
            HELP_PANEL: 10002,
            SETTINGS_PANEL: 10002
        },
        DEFAULT_TOOLBAR_POSITION: 'left',
        SUPPORTED_POSITIONS: ['left', 'right'],
        RESPONSIVE_BREAKPOINTS: {
            ICON_ONLY_HEIGHT: 450,
            COMPACT_HEIGHT: 620,
            AUTO_MINIMIZE_HEIGHT: 300
        },
        DEFAULT_FONT_SCALE: 1,
        DEFAULT_STROKE_WIDTH: 4,
        DEFAULT_ERASER_SIZE: 10,
        DEFAULT_LASER_COLOR: '#ff0000'
    };

    // ### State Management
    const state = {
        currentTool: 'freehand',
        previousTool: 'freehand',
        strokeColor: theme.colors.defaultStroke,
        strokeWidth: CONFIG.DEFAULT_STROKE_WIDTH,
        eraserSize: CONFIG.DEFAULT_ERASER_SIZE,
        laserColor: CONFIG.DEFAULT_LASER_COLOR,
        whiteboardMode: 'off',
        toolbarPosition: CONFIG.DEFAULT_TOOLBAR_POSITION,
        fontScale: CONFIG.DEFAULT_FONT_SCALE,
        autoCollapseSmall: true,
        isDrawing: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        isLaserActive: false,
        laserX: 0,
        laserY: 0,
        annotations: { default: [] },
        currentContext: 'default',
        undoStack: [],
        redoStack: []
    };
  
    const shapeTools = ['line', 'circle', 'arrow', 'rectangle', 'ellipse', 'triangle', 'diamond', 'star'];
  
    // ### DOM Elements
    let canvas, ctx, controlPanel, subToolbar, eraserIndicator, minimizeButton, shapesDropdown, helpPanel;
    let resizeObserver = null;
  
    // ### Inject Professional Sharp Styles (enhanced with modern responsive collapse system)
    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'annotation-styles';
        style.textContent = `
            #annotation-control-panel, #sub-toolbar, #shapes-dropdown, #annotation-help-panel, #annotation-settings-panel {
                border-radius: 0 !important;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
            }
            #annotation-control-panel {
                border-bottom: 1px solid #333333;
                white-space: nowrap;
                transition: padding 0.1s ease, gap 0.1s ease;
                --font-scale: 1;
                font-size: calc(13px * var(--font-scale));
            }
            #annotation-control-panel button {
                border-radius: 0 !important;
                font-weight: 600;
                letter-spacing: 0.025em;
                transition: filter 0.1s ease, transform 0.05s ease, padding 0.1s ease, font-size 0.1s ease;
                border: none;
                cursor: pointer;
                flex-shrink: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: inherit;
            }
            #annotation-control-panel button .label {
                font-size: inherit;
                line-height: 1;
            }
            #annotation-control-panel button:hover {
                filter: brightness(1.2);
            }
            #annotation-control-panel button:active {
                transform: scale(0.985);
            }
            #annotation-control-panel button .icon {
                font-size: calc(15px * var(--font-scale));
                line-height: 1;
            }
            #annotation-control-panel button .label {
                font-size: inherit;
                line-height: 1;
            }
            #minimize-button {
                border-radius: 0 !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
                transition: transform 0.1s ease;
            }
            #minimize-button:hover {
                filter: brightness(1.2);
            }
            #sub-toolbar, #shapes-dropdown {
                border: 1px solid #333333;
                border-radius: 0 !important;
            }
            #sub-toolbar input[type="color"] {
                border-radius: 0 !important;
                border: 2px solid #333333;
                background: #1a1a1a;
                cursor: pointer;
                padding: 0;
                width: 36px;
                height: 32px;
            }
            #sub-toolbar select, #sub-toolbar input[type="range"] {
                border-radius: 0 !important;
                background: #1a1a1a;
                color: #ffffff;
                border: 1px solid #333333;
                font-family: inherit;
            }
            #sub-toolbar label {
                color: #ffffff;
                font-size: 12px;
            }
            .annotation-focus {
                outline: 2px solid #ff0000 !important;
                outline-offset: 1px;
            }
            .shape-btn:hover {
                background: #333333 !important;
                border-color: #ff0000 !important;
            }
            /* Sidebar mode (left/right dock) */
            #annotation-control-panel.sidebar-mode {
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: #ff0000 #222222;
            }
            #annotation-control-panel.sidebar-mode button {
                flex-direction: column !important;
                align-items: center;
                justify-content: center;
                padding: 8px 3px !important;
                min-height: 54px;
                width: 100%;
                gap: 3px;
            }
            #annotation-control-panel.sidebar-mode button .icon {
                font-size: calc(22px * var(--font-scale));
                margin-bottom: 2px;
            }
            #annotation-control-panel.sidebar-mode button .label {
                font-size: calc(9px * var(--font-scale));
                line-height: 1.05;
                white-space: nowrap;
                text-align: center;
            }
            /* Top mode icon sizing */
            #annotation-control-panel:not(.sidebar-mode) button .icon {
                font-size: calc(15px * var(--font-scale));
            }
            #tools-scroll-container {
                scrollbar-width: thin;
                scrollbar-color: #ff0000 #222222;
            }

            /* === Modern Responsive Collapse System (reimplemented control panel) === */
            /* Compact mode: reduced padding, fonts, gaps for medium viewports */
            #annotation-control-panel.responsive-compact {
                padding: 5px 6px !important;
            }
            #annotation-control-panel.responsive-compact button {
                padding: 5px 8px !important;
                font-size: calc(11px * var(--font-scale)) !important;
                gap: 4px !important;
            }
            #annotation-control-panel.responsive-compact button .icon {
                font-size: calc(13px * var(--font-scale)) !important;
            }
            #annotation-control-panel.responsive-compact.sidebar-mode button {
                padding: 5px 2px !important;
                min-height: 42px !important;
            }
            #annotation-control-panel.responsive-compact.sidebar-mode button .icon {
                font-size: calc(18px * var(--font-scale)) !important;
            }
            #annotation-control-panel.responsive-compact.sidebar-mode button .label {
                font-size: calc(8px * var(--font-scale)) !important;
            }
            /* Icon-only collapse (modern, clean, decisive): hides labels, keeps icons + titles for UX */
            #annotation-control-panel.responsive-icon-only button .label {
                display: none !important;
            }
            #annotation-control-panel.responsive-icon-only button {
                padding: 6px 7px !important;
                gap: 0 !important;
                min-width: 32px;
            }
            #annotation-control-panel.responsive-icon-only button .icon {
                font-size: calc(18px * var(--font-scale)) !important;
            }
            #annotation-control-panel.responsive-icon-only.sidebar-mode button {
                padding: 6px 4px !important;
                min-height: 38px !important;
                width: 100%;
            }
            #annotation-control-panel.responsive-icon-only.sidebar-mode button .icon {
                font-size: calc(20px * var(--font-scale)) !important;
                margin-bottom: 0;
            }
            /* Container tightening in collapsed states */
            #annotation-control-panel.responsive-icon-only #tools-scroll-container,
            #annotation-control-panel.responsive-icon-only #global-actions {
                gap: 4px !important;
            }
            #annotation-control-panel.responsive-compact #tools-scroll-container,
            #annotation-control-panel.responsive-compact #global-actions {
                gap: 5px !important;
            }
            #annotation-control-panel.responsive-icon-only.responsive-compact button {
                padding: 4px 5px !important;
                min-width: 28px;
            }
        `;
        document.head.appendChild(style);
    }
  
    // ### Canvas Setup
    function setupCanvas() {
        canvas = document.createElement('canvas');
        canvas.id = 'annotation-canvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.zIndex = CONFIG.Z_INDICES.CANVAS;
        canvas.style.pointerEvents = 'auto';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d', { alpha: true });
        resizeCanvas();
    }
  
    function resizeCanvas() {
        if (!canvas) return;
        // Defensive sizing: never allow 0 dimensions (prevents random getImageData failures on some pages/timings)
        const newWidth = Math.max(window.innerWidth || 320, 1);
        const newHeight = Math.max(window.innerHeight || 240, 1);
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
            canvas.width = newWidth;
            canvas.height = newHeight;
        }
        restoreAnnotations();
    }
  
    // ### Eraser Indicator Setup
    function setupEraserIndicator() {
        eraserIndicator = document.createElement('div');
        eraserIndicator.style.position = 'absolute';
        eraserIndicator.style.zIndex = CONFIG.Z_INDICES.ERASER_INDICATOR;
        eraserIndicator.style.backgroundColor = theme.colors.eraserIndicator;
        eraserIndicator.style.boxShadow = `0 0 4px 2px ${theme.colors.eraserShadow}`;
        eraserIndicator.style.border = '1px solid rgba(255,255,255,0.3)';
        eraserIndicator.style.borderRadius = '50%';
        eraserIndicator.style.pointerEvents = 'none';
        eraserIndicator.style.display = 'none';
        eraserIndicator.style.boxSizing = 'border-box';
        document.body.appendChild(eraserIndicator);
    }
  
    // ### Minimize Button Setup
    function setupMinimizeButton() {
        minimizeButton = document.createElement('button');
        minimizeButton.id = 'minimize-button';
        minimizeButton.innerHTML = '<span style="font-size:26px; line-height:1;">+</span>';
        minimizeButton.style.position = 'fixed';
        minimizeButton.style.top = '0';
        minimizeButton.style.left = '0';
        minimizeButton.style.width = `${CONFIG.MINIMIZE_BUTTON_SIZE_PX}px`;
        minimizeButton.style.height = `${CONFIG.MINIMIZE_BUTTON_SIZE_PX}px`;
        minimizeButton.style.background = theme.colors.primary;
        minimizeButton.style.color = '#ffffff';
        minimizeButton.style.borderRadius = '0';
        minimizeButton.style.border = 'none';
        minimizeButton.style.zIndex = CONFIG.Z_INDICES.MINIMIZE_BUTTON;
        minimizeButton.style.display = 'none';
        minimizeButton.style.fontSize = '26px';
        minimizeButton.style.fontWeight = '700';
        minimizeButton.style.cursor = 'pointer';
        minimizeButton.style.lineHeight = '44px';
        minimizeButton.style.textAlign = 'center';
        minimizeButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.6)';
        document.body.appendChild(minimizeButton);
    }
  
    // ### Control Panel Setup (structure with icons + global actions remains excellent)
    function setupControlPanel() {
        controlPanel = document.createElement('div');
        controlPanel.id = 'annotation-control-panel';
        controlPanel.style.position = 'fixed';
        controlPanel.style.top = '0';
        controlPanel.style.left = '0';
        controlPanel.style.width = '100%';
        controlPanel.style.background = theme.colors.background;
        controlPanel.style.padding = '8px 10px';
        controlPanel.style.zIndex = CONFIG.Z_INDICES.CONTROL_PANEL;
        controlPanel.style.display = 'flex';
        controlPanel.style.gap = '8px';
        controlPanel.style.alignItems = 'center';
        controlPanel.style.fontFamily = theme.font.family;
        controlPanel.innerHTML = `
            <button id="toggle-annotate" title="Toggle annotation mode (P key)" style="background: ${theme.colors.primary}; color: white; padding: 8px 14px;">
                <span class="icon">🖍️</span><span class="label">Stop Annotating</span>
            </button>
            <button id="minimize-ui" title="Minimize toolbar (restore with + button)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 12px;">
                <span class="icon">−</span><span class="label">Minimize</span>
            </button>
            <button id="close-annotation" title="Close annotation tool completely (unload from this page)" style="background: #2a0a0a; color: #ff6666; padding: 8px 11px; border:1px solid #440000;">
                <span class="icon" style="font-size:18px; line-height:1; font-weight:700;">×</span><span class="label">Close</span>
            </button>
            <div style="width:1px; height:26px; background:#333; margin:0 3px; flex-shrink:0;"></div>
            
            <div id="tools-scroll-container" style="flex: 1 1 auto; display: flex; align-items: center; gap: 8px; overflow-x: auto; white-space: nowrap; padding: 0 2px; min-width: 140px; scrollbar-width: thin; scrollbar-color: #ff0000 #222222;">
                <button id="tool-freehand" title="Freehand drawing tool" style="background: ${theme.colors.primary}; color: white; padding: 8px 12px;">
                    <span class="icon">✏️</span><span class="label">Freehand</span>
                </button>
                <button id="tool-shapes" title="Open shapes menu (Line, Circle, Arrow, Rectangle, Ellipse, Triangle, Diamond, Star)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 12px;">
                    <span class="icon">🔷</span><span class="label">Shapes ▼</span>
                </button>
                <button id="tool-laser" title="Laser pointer (pulsing, great for presentations)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 12px;">
                    <span class="icon">🔴</span><span class="label">Laser</span>
                </button>
                <button id="tool-eraser" title="Eraser tool (adjust size in sub-toolbar)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 12px;">
                    <span class="icon">🧽</span><span class="label">Eraser</span>
                </button>
                <div style="width:1px; height:26px; background:#333; margin:0 4px; flex-shrink:0;"></div>
            </div>
            
            <div id="global-actions" style="display:flex; align-items:center; gap:8px; flex-shrink:0; padding-left:8px; border-left:1px solid #333;">
                <button id="undo" title="Undo last annotation step" style="background: ${theme.colors.secondary}; color: white; padding: 8px 11px;">
                    <span class="icon">↩️</span><span class="label">Undo</span>
                </button>
                <button id="redo" title="Redo last undone annotation" style="background: ${theme.colors.secondary}; color: white; padding: 8px 11px;">
                    <span class="icon">↪️</span><span class="label">Redo</span>
                </button>
                <button id="clear-all" title="Clear ALL annotations on current page" style="background: ${theme.colors.secondary}; color: white; padding: 8px 11px;">
                    <span class="icon">🗑️</span><span class="label">Clear All</span>
                </button>
            </div>
            
            <div style="width:1px; height:26px; background:#333; margin:0 3px; flex-shrink:0;"></div>
            
            <button id="whiteboard" title="Cycle Whiteboard / Darkboard / Off (solid background layer)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 10px;">
                <span class="icon">🖼️</span><span class="label">Board</span>
            </button>
            <button id="screenshot" title="Capture screenshot with annotations (auto-downloads PNG)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 10px; line-height:1;">
                <span class="icon">📷</span>
            </button>
            <button id="help" title="Quick help &amp; shortcuts" style="background: ${theme.colors.secondary}; color: white; padding: 8px 11px; font-weight: 700;">
                <span class="icon">❓</span>
            </button>
            <button id="settings" title="Annotation settings &amp; preferences (position, colors, sizes)" style="background: ${theme.colors.secondary}; color: white; padding: 8px 11px;">
                <span class="icon">⚙️</span><span class="label">Settings</span>
            </button>
        `;
        document.body.appendChild(controlPanel);
    }
  
    // ### Sub-Toolbar Setup
    function setupSubToolbar() {
        subToolbar = document.createElement('div');
        subToolbar.id = 'sub-toolbar';
        subToolbar.style.position = 'fixed';
        subToolbar.style.top = '48px';
        subToolbar.style.left = '12px';
        subToolbar.style.background = theme.colors.background;
        subToolbar.style.padding = '10px 12px';
        subToolbar.style.zIndex = CONFIG.Z_INDICES.SUB_TOOLBAR;
        subToolbar.style.display = 'none';
        subToolbar.style.fontFamily = theme.font.family;
        subToolbar.style.alignItems = 'center';
        subToolbar.style.gap = '10px';
        document.body.appendChild(subToolbar);
    }
  
    // ### Update Sub-Toolbar
    function updateSubToolbar(tool) {
        if (!subToolbar) return;
        subToolbar.innerHTML = '';
        subToolbar.style.display = 'flex';
        
        if (['freehand', 'line', 'circle', 'arrow', 'rectangle', 'ellipse', 'triangle', 'diamond', 'star'].includes(tool)) {
            const presetColors = ['#ff0000', '#ff8800', '#ffff00', '#00cc00', '#00aaff', '#0066ff', '#aa00ff', '#000000', '#ffffff'];
            
            subToolbar.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <input type="color" id="color-picker" value="${state.strokeColor}" style="margin-right:6px; width:34px; height:30px;">
                    
                    <div id="color-swatches" style="display:flex; gap:4px; margin-right:8px;">
                        ${presetColors.map(c => `
                            <button class="color-swatch" data-color="${c}" 
                                    style="width:22px; height:22px; background:${c}; border:2px solid #444; border-radius:0; padding:0; cursor:pointer; box-shadow: inset 0 0 0 1px #222;"
                                    title="${c}"></button>
                        `).join('')}
                    </div>
                    
                    <select id="stroke-width" style="padding: 6px 10px; font-size:12px; border-radius:0;">
                        <option value="2">2px</option>
                        <option value="4" selected>4px</option>
                        <option value="6">6px</option>
                        <option value="8">8px</option>
                        <option value="10">10px</option>
                        <option value="14">14px</option>
                    </select>
                </div>
            `;
            
            const colorPicker = subToolbar.querySelector('#color-picker');
            const strokeWidthSelect = subToolbar.querySelector('#stroke-width');
            const swatchesContainer = subToolbar.querySelector('#color-swatches');
            
            if (swatchesContainer) {
                swatchesContainer.querySelectorAll('.color-swatch').forEach(swatch => {
                    swatch.addEventListener('click', () => {
                        const newColor = swatch.dataset.color;
                        state.strokeColor = newColor;
                        if (colorPicker) colorPicker.value = newColor;
                        swatchesContainer.querySelectorAll('.color-swatch').forEach(s => s.style.border = '2px solid #444');
                        swatch.style.border = '2px solid #ff0000';
                    });
                });
            }
            
            if (colorPicker) {
                colorPicker.addEventListener('input', (e) => {
                    state.strokeColor = e.target.value;
                    if (swatchesContainer) {
                        swatchesContainer.querySelectorAll('.color-swatch').forEach(s => s.style.border = '2px solid #444');
                    }
                });
                colorPicker.addEventListener('focus', () => colorPicker.classList.add('annotation-focus'));
                colorPicker.addEventListener('blur', () => colorPicker.classList.remove('annotation-focus'));
            }
            if (strokeWidthSelect) {
                strokeWidthSelect.value = state.strokeWidth;
                strokeWidthSelect.addEventListener('change', (e) => {
                    state.strokeWidth = parseInt(e.target.value);
                });
            }
        } else if (tool === 'laser') {
            const presetLaserColors = ['#ff0000', '#ff8800', '#ffff00', '#00cc00', '#00aaff', '#ff00ff', '#ffffff'];
            
            subToolbar.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; color:#fff; font-size:12px;">
                    <span style="margin-right:6px; color:#ff0000; font-weight:600;">LASER COLOR</span>
                    <input type="color" id="laser-color-picker" value="${state.laserColor}" style="margin-right:6px; width:34px; height:30px;">
                    
                    <div id="laser-swatches" style="display:flex; gap:4px; margin-right:8px;">
                        ${presetLaserColors.map(c => `
                            <button class="laser-swatch" data-color="${c}" 
                                    style="width:22px; height:22px; background:${c}; border:2px solid #444; border-radius:0; padding:0; cursor:pointer; box-shadow: inset 0 0 0 1px #222;"
                                    title="${c}"></button>
                        `).join('')}
                    </div>
                </div>
            `;
            
            const laserPicker = subToolbar.querySelector('#laser-color-picker');
            const laserSwatches = subToolbar.querySelector('#laser-swatches');
            
            if (laserSwatches) {
                laserSwatches.querySelectorAll('.laser-swatch').forEach(swatch => {
                    swatch.addEventListener('click', () => {
                        state.laserColor = swatch.dataset.color;
                        if (laserPicker) laserPicker.value = state.laserColor;
                        laserSwatches.querySelectorAll('.laser-swatch').forEach(s => s.style.border = '2px solid #444');
                        swatch.style.border = '2px solid #ff0000';
                    });
                });
            }
            
            if (laserPicker) {
                laserPicker.addEventListener('input', (e) => {
                    state.laserColor = e.target.value;
                    if (laserSwatches) {
                        laserSwatches.querySelectorAll('.laser-swatch').forEach(s => s.style.border = '2px solid #444');
                    }
                });
            }
        } else if (tool === 'eraser') {
            subToolbar.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; color:white; font-size:12px;">
                    <label for="eraser-size" style="margin-right:4px; white-space:nowrap;">ERASER SIZE</label>
                    <input type="range" id="eraser-size" min="5" max="60" value="${state.eraserSize}" style="width:140px; accent-color: #ff0000;">
                    <span id="eraser-value" style="min-width:32px; text-align:right; font-variant-numeric: tabular-nums;">${state.eraserSize}</span>
                </div>
            `;
            const eraserSizeSlider = subToolbar.querySelector('#eraser-size');
            const valueSpan = subToolbar.querySelector('#eraser-value');
            if (eraserSizeSlider) {
                eraserSizeSlider.addEventListener('input', (e) => {
                    state.eraserSize = parseInt(e.target.value);
                    if (valueSpan) valueSpan.textContent = state.eraserSize;
                    const size = state.eraserSize;
                    eraserIndicator.style.width = `${size}px`;
                    eraserIndicator.style.height = `${size}px`;
                });
            }
        } else {
            subToolbar.style.display = 'none';
        }
    }
  
    // ### Render Laser Pointer
    function renderLaser() {
        if (!state.isLaserActive || !canvas || canvas.style.pointerEvents !== 'auto') return;
  
        const element = document.elementFromPoint(state.laserX, state.laserY);
        if (element && (element.closest('#annotation-control-panel') || element.closest('#sub-toolbar') || element.closest('#shapes-dropdown') || element.closest('#annotation-settings-panel'))) {
            requestAnimationFrame(renderLaser);
            return;
        }
  
        const now = Date.now();
        restoreAnnotations();
  
        const pulse = Math.sin(now / 480) * 5 + 18;
        ctx.beginPath();
        ctx.arc(state.laserX, state.laserY, pulse / 2, 0, 2 * Math.PI);
        ctx.fillStyle = state.laserColor;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(state.laserX, state.laserY, pulse / 2 + 7, 0, 2 * Math.PI);
        ctx.fillStyle = state.laserColor.replace(/#([0-9a-fA-F]{6})/, (m, hex) => {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, 0.45)`;
        });
        ctx.fill();
  
        requestAnimationFrame(renderLaser);
    }
  
    // ### Laser helpers
    function activateLaser() {
        if (!canvas || canvas.style.pointerEvents !== 'auto') return;
        state.isLaserActive = true;
        if (!state.laserX || state.laserX < 20 || state.laserY < 20) {
            state.laserX = Math.max(120, Math.floor(window.innerWidth * 0.5));
            state.laserY = Math.max(120, Math.floor(window.innerHeight * 0.45));
        }
        canvas.style.cursor = 'none';
        restoreAnnotations();
        requestAnimationFrame(renderLaser);
    }
    
    function deactivateLaser() {
        state.isLaserActive = false;
        if (canvas) {
            canvas.style.cursor = 'auto';
        }
        restoreAnnotations();
    }
  
    // ### Toggle Annotation Mode
    function toggleAnnotationMode() {
        const wasActive = canvas.style.pointerEvents === 'auto';
        const nowActive = !wasActive;
        
        canvas.style.pointerEvents = nowActive ? 'auto' : 'none';
        
        if (!nowActive) {
            eraserIndicator.style.display = 'none';
            deactivateLaser();
            subToolbar.style.display = 'none';
            if (shapesDropdown) shapesDropdown.style.display = 'none';
            canvas.style.cursor = 'auto';
        } else {
            updateSubToolbar(state.currentTool);
            if (state.currentTool === 'laser') {
                activateLaser();
            } else if (state.currentTool === 'eraser') {
                eraserIndicator.style.display = 'block';
            } else {
                canvas.style.cursor = 'auto';
            }
        }
        
        setToggleButtonText(nowActive);
        // Re-apply responsive classes after state change
        setTimeout(updateResponsiveLayout, 10);
    }
  
    // ### Set toggle button text (supports short labels for narrow / sidebar / icon-only)
    function setToggleButtonText(isAnnotating) {
        const btn = document.getElementById('toggle-annotate');
        if (!btn) return;
        const lbl = btn.querySelector('.label');
        const useShort = controlPanel && (
            controlPanel.classList.contains('responsive-icon-only') ||
            controlPanel.classList.contains('sidebar-mode') ||
            window.innerWidth < 620
        );
        
        if (isAnnotating) {
            if (lbl) lbl.textContent = useShort ? 'Stop' : 'Stop Annotating';
            btn.style.background = theme.colors.primary;
        } else {
            if (lbl) lbl.textContent = useShort ? 'Start' : 'Start Annotating';
            btn.style.background = theme.colors.secondary;
        }
    }
  
    // ### Minimize / Restore UI
    function minimizeUI() {
        controlPanel.style.display = 'none';
        subToolbar.style.display = 'none';
        if (shapesDropdown) shapesDropdown.style.display = 'none';
        if (settingsPanelRef) settingsPanelRef.style.display = 'none';
        if (helpPanel) helpPanel.style.display = 'none';

        // Position restore (+) button at top of the current sidebar side (left or right)
        const isRight = state.toolbarPosition === 'right';
        minimizeButton.style.top = '0';
        minimizeButton.style.bottom = '';
        minimizeButton.style.left = isRight ? 'auto' : '0';
        minimizeButton.style.right = isRight ? '0' : 'auto';
        minimizeButton.style.display = 'block';
    }
  
    function restoreUI() {
        controlPanel.style.display = 'flex';
        minimizeButton.style.display = 'none';
        updateSubToolbar(state.currentTool);
        if (state.currentTool === 'laser' && canvas.style.pointerEvents === 'auto') {
            activateLaser();
        }
        updateResponsiveLayout();
    }

    // ### Full Close / Unload (true "end" option)
    function closeAnnotationTool() {
        // Remove all created DOM elements
        const elementsToRemove = [
            canvas,
            controlPanel,
            subToolbar,
            minimizeButton,
            eraserIndicator,
            shapesDropdown,
            settingsPanelRef,
            helpPanel,
            document.getElementById('whiteboard-bg-layer'),
            document.getElementById('annotation-styles')
        ];

        elementsToRemove.forEach(el => {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });

        // Disconnect observer if active
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }

        // Reset the duplicate-load guard so the extension can be freshly injected again
        window.annotationToolLoaded = false;

        // Optional: clear any lingering references (helps GC)
        canvas = ctx = controlPanel = subToolbar = eraserIndicator = minimizeButton =
            shapesDropdown = settingsPanelRef = helpPanel = null;

        console.log('%c[Annotate Pro] Annotation tool fully closed and unloaded from page.', 'color:#ff6666');
    }
  
    // ### Modern Responsive Layout Engine — reimplemented for intuitive Chrome-extension-style behavior
    //
    // Design principles (based on real extensions: Loom, Grammarly, Notion Clipper, uBlock, DevTools panels, Figma):
    // • Top bar (horizontal): Fixed primary actions on left/right. The tools-scroll-container is the FLEXIBLE, scrollable middle that shrinks with available WIDTH.
    //   Progressive collapse: reduce gaps/padding first → hide labels (icon-only) → allow tools group to shrink to near-zero min-width so internal horizontal scroll handles overflow gracefully.
    // • Left/Right sidebars (vertical): Full-height column. The tools-scroll-container MUST shrink with available HEIGHT (min-height:0 is essential in flex column).
    //   Internal vertical scroll + auto-minimize on extreme short viewports. Never let the panel fight the viewport.
    // • Always keep toggle, minimize, screenshot, settings, and global undo/redo visible. Only the tools group compresses.
    // • Uses CSS classes for visual changes + minimal inline overrides for flex constraints. Live updates via ResizeObserver + resize.
    function updateResponsiveLayout() {
        if (!controlPanel) return;

        const h = window.innerHeight;

        // Reset responsive classes (sidebar-mode is permanent now)
        controlPanel.classList.remove('responsive-compact', 'responsive-icon-only');

        const toolsCont = document.getElementById('tools-scroll-container');
        const globAct = document.getElementById('global-actions');

        let iconOnly = false;
        let compact = false;

        // === SIDEBAR (LEFT/RIGHT) — vertical collapse based on viewport HEIGHT only ===
        if (h < CONFIG.RESPONSIVE_BREAKPOINTS.ICON_ONLY_HEIGHT) {
            iconOnly = true;
            compact = true;
        } else if (h < CONFIG.RESPONSIVE_BREAKPOINTS.COMPACT_HEIGHT) {
            compact = true;
        }

        // Enforce column layout for sidebar tools
        if (toolsCont) {
            toolsCont.style.flexDirection = 'column';
            toolsCont.style.overflowY = 'auto';
            toolsCont.style.overflowX = 'hidden';
            toolsCont.style.minHeight = '0';
        }
        if (globAct) {
            globAct.style.flexDirection = 'column';
            globAct.style.borderLeft = 'none';
            globAct.style.borderTop = '1px solid #333';
            globAct.style.paddingLeft = '0';
            globAct.style.minHeight = 'auto';
        }

        if (iconOnly) {
            controlPanel.classList.add('responsive-icon-only', 'responsive-compact');
            if (toolsCont) {
                toolsCont.style.gap = '2px';
                toolsCont.style.padding = '2px 0';
            }
            if (globAct) {
                globAct.style.gap = '2px';
                globAct.style.paddingTop = '3px';
            }
        } else if (compact) {
            controlPanel.classList.add('responsive-compact');
            if (toolsCont) {
                toolsCont.style.gap = '4px';
                toolsCont.style.padding = '4px 0';
            }
            if (globAct) {
                globAct.style.gap = '4px';
                globAct.style.paddingTop = '4px';
            }
        } else {
            if (toolsCont) {
                toolsCont.style.gap = '6px';
                toolsCont.style.padding = '4px 0';
            }
            if (globAct) {
                globAct.style.gap = '6px';
                globAct.style.paddingTop = '8px';
            }
        }

        // Auto-minimize on extremely short sidebars (graceful degradation)
        if (h < CONFIG.RESPONSIVE_BREAKPOINTS.AUTO_MINIMIZE_HEIGHT &&
            controlPanel.style.display === 'flex' &&
            state.autoCollapseSmall) {
            setTimeout(() => {
                if (controlPanel && controlPanel.style.display === 'flex' &&
                    window.innerHeight < CONFIG.RESPONSIVE_BREAKPOINTS.AUTO_MINIMIZE_HEIGHT) {
                    minimizeUI();
                }
            }, 250);
        }

        // Update toggle button text for current collapse state
        const isActive = canvas && canvas.style.pointerEvents === 'auto';
        setToggleButtonText(isActive);

        // Re-apply active tool styling
        document.querySelectorAll('#annotation-control-panel button[id^="tool-"]').forEach(btn => {
            const btnId = btn.id;
            let isActiveBtn = btnId === `tool-${state.currentTool}`;
            if (btnId === 'tool-shapes' && shapeTools.includes(state.currentTool)) isActiveBtn = true;
            btn.style.background = isActiveBtn ? theme.colors.primary : theme.colors.secondary;
        });
    }
  
    // ### Set Toolbar Position (now calls the new responsive engine)
    function setToolbarPosition(position) {
        // Validate and normalize position (only left/right supported)
        if (!CONFIG.SUPPORTED_POSITIONS.includes(position)) {
            position = CONFIG.DEFAULT_TOOLBAR_POSITION;
        }
        state.toolbarPosition = position;

        // Reset all positioning styles for clean state
        const resetStyles = {
            top: '', left: '', right: '', bottom: '',
            width: '', height: '',
            flexDirection: 'row', alignItems: 'center',
            padding: '8px 10px',
            overflowX: 'visible', overflowY: 'visible',
            whiteSpace: 'nowrap'
        };
        Object.assign(controlPanel.style, resetStyles);
        controlPanel.classList.remove('sidebar-mode', 'responsive-compact', 'responsive-icon-only');

        // Reset helpers to defaults
        minimizeButton.style.top = '0';
        minimizeButton.style.left = '0';
        minimizeButton.style.right = '';

        subToolbar.style.top = '48px';
        subToolbar.style.left = '12px';
        subToolbar.style.right = '';

        const toolsCont = document.getElementById('tools-scroll-container');
        const globAct = document.getElementById('global-actions');

        // Default tools/global to horizontal (will be overridden for sidebar)
        if (toolsCont) {
            Object.assign(toolsCont.style, {
                flexDirection: 'row', overflowX: 'auto', overflowY: 'visible',
                flex: '1 1 auto', minWidth: '140px', minHeight: 'auto',
                padding: '0 2px', gap: '8px'
            });
        }
        if (globAct) {
            Object.assign(globAct.style, {
                flexDirection: 'row', borderLeft: '1px solid #333', borderTop: 'none',
                paddingLeft: '8px', paddingTop: '0', gap: '8px'
            });
        }

        const buttons = controlPanel.querySelectorAll('button');
        const isLeft = position === 'left';

        // === Sidebar setup (common for left + right) ===
        controlPanel.classList.add('sidebar-mode');
        controlPanel.style.top = '0';
        controlPanel.style.width = `${CONFIG.SIDEBAR_WIDTH_PX}px`;
        controlPanel.style.height = '100vh';
        controlPanel.style.flexDirection = 'column';
        controlPanel.style.alignItems = 'stretch';
        controlPanel.style.padding = '8px 4px';
        controlPanel.style.overflowY = 'auto';
        controlPanel.style.overflowX = 'hidden';
        controlPanel.style.whiteSpace = 'normal';

        // Side-specific positioning
        if (isLeft) {
            controlPanel.style.left = '0';
            controlPanel.style.right = 'auto';
            minimizeButton.style.left = `${CONFIG.MINIMIZE_OFFSET_PX}px`;
            minimizeButton.style.right = 'auto';
            subToolbar.style.left = `${CONFIG.SUBTOOLBAR_OFFSET_PX}px`;
            subToolbar.style.right = 'auto';
        } else {
            controlPanel.style.left = 'auto';
            controlPanel.style.right = '0';
            minimizeButton.style.left = 'auto';
            minimizeButton.style.right = `${CONFIG.MINIMIZE_OFFSET_PX}px`;
            subToolbar.style.left = 'auto';
            subToolbar.style.right = `${CONFIG.SUBTOOLBAR_OFFSET_PX}px`;
        }
        minimizeButton.style.top = '8px';
        subToolbar.style.top = '8px';

        // Tools and global actions: vertical column layout
        if (toolsCont) {
            Object.assign(toolsCont.style, {
                flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden',
                flex: '1 1 auto', width: '100%', minWidth: 'auto', minHeight: '0',
                padding: '4px 0', gap: '6px'
            });
        }
        if (globAct) {
            Object.assign(globAct.style, {
                flexDirection: 'column', width: '100%',
                borderLeft: 'none', borderTop: '1px solid #333',
                paddingLeft: '0', paddingTop: '8px', gap: '6px'
            });
        }

        // Uniform button styling for sidebar
        buttons.forEach(btn => {
            btn.style.padding = `${CONFIG.BUTTON_PADDING_SIDEBAR_PX}px 4px`;
            btn.style.width = '100%';
            btn.style.textAlign = 'center';
        });

        // Re-apply active tool highlight
        document.querySelectorAll('#annotation-control-panel button[id^="tool-"]').forEach(btn => {
            const btnId = btn.id;
            let isActiveBtn = btnId === `tool-${state.currentTool}`;
            if (btnId === 'tool-shapes' && shapeTools.includes(state.currentTool)) isActiveBtn = true;
            btn.style.background = isActiveBtn ? theme.colors.primary : theme.colors.secondary;
        });

        updateResponsiveLayout();
    }
  
    // ### Tool Selection
    function handleToolChange(tool) {
        const wasLaser = state.currentTool === 'laser';
        
        if (tool === 'laser' && state.currentTool === 'laser') {
            state.currentTool = state.previousTool || 'freehand';
            deactivateLaser();
        } else {
            if (state.currentTool !== 'laser') state.previousTool = state.currentTool;
            state.currentTool = tool;
            
            if (tool === 'laser') {
                activateLaser();
            } else if (wasLaser) {
                deactivateLaser();
            }
        }
        
        document.querySelectorAll('#annotation-control-panel button[id^="tool-"]').forEach(btn => {
            const btnId = btn.id;
            let isActive = btnId === `tool-${state.currentTool}`;
            if (btnId === 'tool-shapes' && shapeTools.includes(state.currentTool)) isActive = true;
            btn.style.background = isActive ? theme.colors.primary : theme.colors.secondary;
        });
        
        updateSubToolbar(state.currentTool);
        
        const showEraser = (state.currentTool === 'eraser' && canvas.style.pointerEvents === 'auto');
        eraserIndicator.style.display = showEraser ? 'block' : 'none';
        
        if (state.currentTool === 'laser' && canvas.style.pointerEvents === 'auto') {
            canvas.style.cursor = 'none';
        } else if (state.currentTool === 'eraser' && canvas.style.pointerEvents === 'auto') {
            canvas.style.cursor = 'auto';
        } else {
            canvas.style.cursor = 'auto';
        }
        
        if (shapesDropdown) shapesDropdown.style.display = 'none';
        
        // Responsive may need refresh if icon-only changed visibility
        setTimeout(updateResponsiveLayout, 5);
    }
  
    // ### Drawing Logic (unchanged core)
    function startDrawing(e) {
        if (state.currentTool === 'laser') return;
        state.isDrawing = true;
        state.startX = e.clientX;
        state.startY = e.clientY;
        if (state.currentTool === 'freehand' || state.currentTool === 'eraser') {
            ctx.beginPath();
            ctx.moveTo(state.startX, state.startY);
        }
    }
  
    function draw(e) {
        if (state.currentTool === 'laser') {
            state.laserX = e.clientX;
            state.laserY = e.clientY;
            return;
        }
  
        if (!state.isDrawing) return;
        state.endX = e.clientX;
        state.endY = e.clientY;
  
        if (state.currentTool === 'eraser') {
            const size = state.eraserSize;
            eraserIndicator.style.width = `${size}px`;
            eraserIndicator.style.height = `${size}px`;
            eraserIndicator.style.left = `${e.clientX - size / 2}px`;
            eraserIndicator.style.top = `${e.clientY - size / 2}px`;
        }
  
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = state.currentTool === 'eraser' ? state.eraserSize : state.strokeWidth;
  
        if (state.currentTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.strokeStyle = state.strokeColor;
            ctx.globalCompositeOperation = 'source-over';
        }
  
        if (state.currentTool === 'freehand' || state.currentTool === 'eraser') {
            ctx.lineTo(state.endX, state.endY);
            ctx.stroke();
            state.startX = state.endX;
            state.startY = state.endY;
        } else {
            restoreAnnotations();
            drawCurrentShape();
        }
    }
  
    function stopDrawing() {
        if (!state.isDrawing) return;
        state.isDrawing = false;
        if (state.currentTool !== 'freehand' && state.currentTool !== 'eraser') {
            drawCurrentShape();
        }
        saveAnnotation();
    }
  
    function drawArrow(fromX, fromY, toX, toY) {
        const headLength = state.strokeWidth * 2.8;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    }
  
    function drawCurrentShape() {
        if (!ctx) return;
        const sx = state.startX, sy = state.startY, ex = state.endX, ey = state.endY;
        
        ctx.beginPath();
        
        if (state.currentTool === 'line') {
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
        } else if (state.currentTool === 'circle') {
            const radius = Math.hypot(ex - sx, ey - sy);
            ctx.arc(sx, sy, radius, 0, 2 * Math.PI);
        } else if (state.currentTool === 'arrow') {
            drawArrow(sx, sy, ex, ey);
        } else if (state.currentTool === 'rectangle') {
            ctx.rect(sx, sy, ex - sx, ey - sy);
        } else if (state.currentTool === 'ellipse') {
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const rx = Math.abs(ex - sx) / 2;
            const ry = Math.abs(ey - sy) / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
        } else if (state.currentTool === 'triangle') {
            const midX = (sx + ex) / 2;
            const midY = (sy + ey) / 2;
            const dx = ex - sx;
            const dy = ey - sy;
            const len = Math.hypot(dx, dy) || 1;
            const h = len * 0.866;
            const px = -dy / len * h;
            const py = dx / len * h;
            ctx.moveTo(sx, sy);
            ctx.lineTo(ex, ey);
            ctx.lineTo(midX + px, midY + py);
            ctx.closePath();
        } else if (state.currentTool === 'diamond') {
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const hw = Math.abs(ex - sx) / 2;
            const hh = Math.abs(ey - sy) / 2;
            ctx.moveTo(cx, cy - hh);
            ctx.lineTo(cx + hw, cy);
            ctx.lineTo(cx, cy + hh);
            ctx.lineTo(cx - hw, cy);
            ctx.closePath();
        } else if (state.currentTool === 'star') {
            const cx = (sx + ex) / 2;
            const cy = (sy + ey) / 2;
            const r = Math.hypot(ex - sx, ey - sy) / 2;
            if (r < 3) return;
            const points = 5;
            const innerR = r * 0.38;
            for (let i = 0; i < points * 2; i++) {
                const angle = (i * Math.PI / points) - Math.PI / 2;
                const rad = (i % 2 === 0) ? r : innerR;
                const x = cx + rad * Math.cos(angle);
                const y = cy + rad * Math.sin(angle);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        
        ctx.stroke();
    }
  
    // ### Annotation Persistence (unchanged)
    function saveAnnotation() {
        // Guard against invalid canvas state (zero size, missing ctx) — fixes random getImageData errors
        if (!ctx || !canvas || canvas.width <= 0 || canvas.height <= 0) {
            console.warn('[Annotate Pro] saveAnnotation skipped — invalid canvas dimensions', {
                width: canvas?.width,
                height: canvas?.height
            });
            return;
        }
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!state.annotations[state.currentContext]) state.annotations[state.currentContext] = [];
        state.annotations[state.currentContext].push(imageData);
        state.undoStack.push(imageData);
        state.redoStack = [];
    }
  
    function restoreAnnotations() {
        if (!ctx || !canvas || canvas.width <= 0 || canvas.height <= 0) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.annotations[state.currentContext]) {
            state.annotations[state.currentContext].forEach(imageData => ctx.putImageData(imageData, 0, 0));
        }
    }
  
    function undo() {
        if (state.undoStack.length > 0) {
            const lastAction = state.undoStack.pop();
            state.redoStack.push(lastAction);
            state.annotations[state.currentContext].pop();
            restoreAnnotations();
        }
    }
  
    function redo() {
        if (state.redoStack.length > 0) {
            const nextAction = state.redoStack.pop();
            state.undoStack.push(nextAction);
            state.annotations[state.currentContext].push(nextAction);
            restoreAnnotations();
        }
    }
  
    function clearAll() {
        state.annotations[state.currentContext] = [];
        state.undoStack = [];
        state.redoStack = [];
        restoreAnnotations();
    }
  
    // ### Whiteboard / Darkboard Mode
    function applyWhiteboardMode() {
        let bgLayer = document.getElementById('whiteboard-bg-layer');
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.id = 'whiteboard-bg-layer';
            bgLayer.style.position = 'fixed';
            bgLayer.style.top = '0';
            bgLayer.style.left = '0';
            bgLayer.style.width = '100%';
            bgLayer.style.height = '100%';
            bgLayer.style.zIndex = CONFIG.Z_INDICES.WHITEBOARD_BG_LAYER;
            bgLayer.style.pointerEvents = 'none';
            bgLayer.style.transition = 'background-color 0.15s ease';
            document.body.appendChild(bgLayer);
        }
        
        if (state.whiteboardMode === 'white') {
            bgLayer.style.backgroundColor = '#ffffff';
            bgLayer.style.display = 'block';
        } else if (state.whiteboardMode === 'dark') {
            bgLayer.style.backgroundColor = '#0a0a0a';
            bgLayer.style.display = 'block';
        } else {
            bgLayer.style.display = 'none';
        }
    }
    
    function toggleWhiteboardMode() {
        const modes = ['off', 'white', 'dark'];
        let idx = modes.indexOf(state.whiteboardMode);
        idx = (idx + 1) % modes.length;
        state.whiteboardMode = modes[idx];
        
        const btn = document.getElementById('whiteboard');
        if (btn) {
            if (state.whiteboardMode === 'off') {
                btn.style.background = theme.colors.secondary;
                const lbl = btn.querySelector('.label');
                if (lbl) lbl.textContent = 'Board';
            } else {
                btn.style.background = theme.colors.primary;
                const lbl = btn.querySelector('.label');
                if (lbl) lbl.textContent = `Board:${state.whiteboardMode === 'white' ? 'W' : 'D'}`;
            }
        }
        applyWhiteboardMode();
    }
  
    // ### Shapes Dropdown
    function setupShapesDropdown() {
        if (shapesDropdown) return;
        shapesDropdown = document.createElement('div');
        shapesDropdown.id = 'shapes-dropdown';
        shapesDropdown.style.cssText = `position:fixed; background:#0a0a0a; border:1px solid #333; z-index:${CONFIG.Z_INDICES.SHAPES_DROPDOWN}; padding:10px; display:none; box-shadow:0 8px 30px rgba(0,0,0,0.85); min-width:260px;`;
        
        const shapeList = [
            {tool:'line', label:'Line'},
            {tool:'circle', label:'Circle'},
            {tool:'arrow', label:'Arrow'},
            {tool:'rectangle', label:'Rectangle'},
            {tool:'ellipse', label:'Ellipse'},
            {tool:'triangle', label:'Triangle'},
            {tool:'diamond', label:'Diamond'},
            {tool:'star', label:'Star'}
        ];
        
        let html = `<div style="color:#ff0000; font-size:11px; font-weight:700; margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid #333;">SHAPES</div>`;
        html += `<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">`;
        shapeList.forEach(s => {
            html += `<button class="shape-btn" data-tool="${s.tool}" style="background:#1a1a1a; color:#fff; border:1px solid #444; padding:9px 4px; font-size:11px; cursor:pointer; border-radius:0; text-align:center; transition: all 0.1s;">${s.label}</button>`;
        });
        html += `</div>`;
        shapesDropdown.innerHTML = html;
        document.body.appendChild(shapesDropdown);
        
        shapesDropdown.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                handleToolChange(btn.dataset.tool);
                shapesDropdown.style.display = 'none';
            });
        });
    }
    
    function toggleShapesDropdown() {
        if (!shapesDropdown) setupShapesDropdown();
        
        if (shapesDropdown.style.display === 'block') {
            shapesDropdown.style.display = 'none';
            return;
        }
        
        const rect = controlPanel.getBoundingClientRect();
        shapesDropdown.style.top = `${rect.top + 80}px`;
        
        if (state.toolbarPosition === 'right') {
            shapesDropdown.style.left = `${rect.left - 280}px`;
        } else {
            shapesDropdown.style.left = `${rect.right + 6}px`;
        }
        
        shapesDropdown.style.display = 'block';
        
        const current = state.currentTool;
        shapesDropdown.querySelectorAll('.shape-btn').forEach(b => {
            const isCurrent = b.dataset.tool === current;
            b.style.border = isCurrent ? '2px solid #ff0000' : '1px solid #444';
            b.style.background = isCurrent ? '#2a2a2a' : '#1a1a1a';
        });
    }
  
    // ### Event Listeners (now includes ResizeObserver for modern responsiveness)
    function setupEventListeners() {
        if (canvas) {
            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', (e) => {
                draw(e);
                if (state.currentTool === 'eraser' && canvas.style.pointerEvents === 'auto') {
                    const size = state.eraserSize;
                    eraserIndicator.style.width = `${size}px`;
                    eraserIndicator.style.height = `${size}px`;
                    eraserIndicator.style.left = `${e.clientX - size / 2}px`;
                    eraserIndicator.style.top = `${e.clientY - size / 2}px`;
                    eraserIndicator.style.display = 'block';
                } else if (state.currentTool !== 'eraser') {
                    eraserIndicator.style.display = 'none';
                }
                if (state.currentTool === 'laser' && canvas.style.pointerEvents === 'auto') {
                    state.laserX = e.clientX;
                    state.laserY = e.clientY;
                    if (!state.isLaserActive) {
                        activateLaser();
                    }
                }
            });
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseout', stopDrawing);
        }
  
        // Modern: ResizeObserver on control panel + window fallback
        if (typeof ResizeObserver !== 'undefined' && controlPanel) {
            resizeObserver = new ResizeObserver(() => {
                updateResponsiveLayout();
            });
            resizeObserver.observe(controlPanel);
        }
        
        window.addEventListener('resize', () => {
            resizeCanvas();
            updateResponsiveLayout();
            if (state.autoCollapseSmall && (window.innerHeight < 400 && (state.toolbarPosition === 'left' || state.toolbarPosition === 'right'))) {
                if (controlPanel.style.display === 'flex') {
                    minimizeUI();
                }
            }
        });
  
        // Button listeners
        const toggleBtn = document.getElementById('toggle-annotate');
        const minimizeBtn = document.getElementById('minimize-ui');
        const closeBtn = document.getElementById('close-annotation');
        const freehandBtn = document.getElementById('tool-freehand');
        const shapesBtn = document.getElementById('tool-shapes');
        const laserBtn = document.getElementById('tool-laser');
        const eraserBtn = document.getElementById('tool-eraser');
        const undoBtn = document.getElementById('undo');
        const redoBtn = document.getElementById('redo');
        const clearAllBtn = document.getElementById('clear-all');
        const whiteboardBtn = document.getElementById('whiteboard');
        const screenshotBtn = document.getElementById('screenshot');
        const helpBtn = document.getElementById('help');
        const settingsBtn = document.getElementById('settings');
  
        if (toggleBtn) toggleBtn.addEventListener('click', toggleAnnotationMode);
        if (minimizeBtn) minimizeBtn.addEventListener('click', minimizeUI);
        if (closeBtn) closeBtn.addEventListener('click', closeAnnotationTool);
        if (freehandBtn) freehandBtn.addEventListener('click', () => handleToolChange('freehand'));
        if (shapesBtn) shapesBtn.addEventListener('click', toggleShapesDropdown);
        if (laserBtn) laserBtn.addEventListener('click', () => handleToolChange('laser'));
        if (eraserBtn) eraserBtn.addEventListener('click', () => handleToolChange('eraser'));
        if (undoBtn) undoBtn.addEventListener('click', undo);
        if (redoBtn) redoBtn.addEventListener('click', redo);
        if (clearAllBtn) clearAllBtn.addEventListener('click', clearAll);
        if (whiteboardBtn) whiteboardBtn.addEventListener('click', toggleWhiteboardMode);
        if (screenshotBtn) screenshotBtn.addEventListener('click', captureScreenshot);
        if (helpBtn) helpBtn.addEventListener('click', showHelp);
        if (settingsBtn) settingsBtn.addEventListener('click', toggleSettingsPanel);
        if (minimizeButton) minimizeButton.addEventListener('click', restoreUI);
  
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'p' || e.key === 'P') && canvas) {
                e.preventDefault();
                toggleAnnotationMode();
            }
            if (e.key === 'ArrowLeft') undo();
            if (e.key === 'ArrowRight') redo();
            if (e.key.toLowerCase() === 'escape') {
                if (controlPanel.style.display !== 'none') {
                    minimizeUI();
                } else if (shapesDropdown && shapesDropdown.style.display === 'block') {
                    shapesDropdown.style.display = 'none';
                }
            }
        });
        
        document.addEventListener('click', (e) => {
            if (shapesDropdown && shapesDropdown.style.display === 'block' && 
                !shapesDropdown.contains(e.target) && !e.target.closest('#tool-shapes')) {
                shapesDropdown.style.display = 'none';
            }
            if (settingsPanelRef && settingsPanelRef.style.display === 'block' && 
                !settingsPanelRef.contains(e.target) && !e.target.closest('#settings')) {
                settingsPanelRef.style.display = 'none';
            }
        });
    }
  
    // ### Message Listener
    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'toggle') {
                toggleAnnotationMode();
                sendResponse({ success: true, active: canvas.style.pointerEvents === 'auto' });
            }
            if (message.action === 'getStatus') {
                sendResponse({ 
                    active: !!canvas && canvas.style.pointerEvents === 'auto',
                    currentTool: state.currentTool,
                    loaded: true 
                });
            }
            if (message.action === 'clearAll') {
                clearAll();
                sendResponse({ success: true });
            }
            return true;
        });
    }
  
    // ### Screenshot
    function captureScreenshot() {
        const elementsToHide = [
            controlPanel,
            subToolbar,
            minimizeButton,
            eraserIndicator,
            shapesDropdown,
            document.getElementById('annotation-help-panel'),
            document.getElementById('annotation-settings-panel')
        ].filter(Boolean);

        const originalDisplays = elementsToHide.map(el => el.style.display || '');
        
        elementsToHide.forEach(el => { if (el) el.style.display = 'none'; });
        
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'capture-screenshot' }, (response) => {
                elementsToHide.forEach((el, i) => {
                    if (el) el.style.display = originalDisplays[i];
                });
                
                const btn = document.getElementById('screenshot');
                if (btn) {
                    const iconSpan = btn.querySelector('.icon');
                    if (iconSpan) {
                        const old = iconSpan.textContent;
                        iconSpan.textContent = (response && response.success) ? '✓' : '✕';
                        setTimeout(() => {
                            if (iconSpan) iconSpan.textContent = old || '📷';
                        }, 1200);
                    }
                }
            });
        }, 60);
    }
  
    // ### Help Panel
    function showHelp() {
        helpPanel = document.getElementById('annotation-help-panel');
        if (helpPanel) {
            helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
            return;
        }
        helpPanel = document.createElement('div');
        helpPanel.id = 'annotation-help-panel';
        helpPanel.style.cssText = `position:fixed;top:58px;right:10px;width:360px;max-height:72vh;overflow:auto;background:#0a0a0a;border:1px solid #333;color:#fff;font-family:${theme.font.family};z-index:${CONFIG.Z_INDICES.HELP_PANEL};padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,0.75);`;
        helpPanel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #333;padding-bottom:8px;">
                <span style="color:#ff0000;font-weight:700;font-size:15px;">ANNOTATE PRO v1.0.0 — HELP</span>
                <button id="close-help" style="background:#222;color:#fff;border:none;padding:2px 9px;font-size:18px;cursor:pointer;border-radius:0;line-height:1;">×</button>
            </div>
            <div style="font-size:12.5px;line-height:1.6;color:#ddd;">
                <b>Tools</b><br>
                ✏️ Freehand • 🔷 <b>Shapes ▼</b> • 🔴 Laser • 🧽 Eraser<br><br>
                <b>Responsive Toolbar</b><br>
                Auto icon-only collapse on short sidebars (height-based). Clean, decisive, always usable.<br><br>
                <b>Essential Shortcuts</b><br>
                <b>P</b> toggle &nbsp;&nbsp; <b>← →</b> Undo/Redo &nbsp;&nbsp; <b>Esc</b> minimize<br>
                Global: <b>Ctrl+Shift+A</b><br><br>
                <b>Undo/Redo/Clear</b> always visible in global actions group.<br>
                <b>Screenshot</b> 📷 • <b>Board</b> 🖼️ cycles whiteboard modes • <b>Settings</b> ⚙️ dock position etc.
            </div>

            <div style="margin-top:12px;padding-top:8px;border-top:1px solid #333;font-size:11px;color:#888;text-align:center;">
                made with ❤️ by <strong>Jamal Yusuf LLC</strong> &nbsp;•&nbsp; <a href="https://github.com/JamalYusuf/Annotate-Pro" target="_blank" style="color:#ff6666;text-decoration:none;">View on GitHub</a>
            </div>
        `;
        document.body.appendChild(helpPanel);
        document.getElementById('close-help').onclick = () => { helpPanel.remove(); helpPanel = null; };
    }
  
    // ### Settings Panel
    let settingsPanelRef = null;
    
    function toggleSettingsPanel() {
        if (!settingsPanelRef) {
            createSettingsPanel();
        }
        settingsPanelRef.style.display = settingsPanelRef.style.display === 'none' ? 'block' : 'none';
    }
    
    function createSettingsPanel() {
        settingsPanelRef = document.createElement('div');
        settingsPanelRef.id = 'annotation-settings-panel';
        settingsPanelRef.style.cssText = `position:fixed; top:58px; right:10px; width:320px; background:#0a0a0a; border:1px solid #333; color:#fff; font-family:${theme.font.family}; z-index:${CONFIG.Z_INDICES.SETTINGS_PANEL}; padding:16px; box-shadow:0 10px 40px rgba(0,0,0,0.75); max-height:80vh; overflow:auto;`;
        
        settingsPanelRef.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; border-bottom:1px solid #333; padding-bottom:8px;">
                <span style="color:#ff0000; font-weight:700; font-size:15px;">SETTINGS</span>
                <button id="close-settings" style="background:#222; color:#fff; border:none; padding:2px 9px; font-size:18px; cursor:pointer; border-radius:0; line-height:1;">×</button>
            </div>
            
            <div style="margin-bottom:16px; border-bottom:1px solid #333; padding-bottom:12px;">
                <label style="display:block; font-size:12px; margin-bottom:6px; color:#ff0000; font-weight:600;">TOOLBAR POSITION</label>
                <select id="settings-pos" style="width:100%; padding:8px 10px; background:#1a1a1a; color:#fff; border:1px solid #333; border-radius:0; font-size:13px;">
                    <option value="left">Left sidebar</option>
                    <option value="right">Right sidebar</option>
                </select>
                <div style="font-size:11px; color:#888; margin-top:4px;">Dockable to left or right. Auto icon-only collapse on short viewports. Changes apply live. Top bar removed for simplicity.</div>
            </div>
            
            <div style="margin-bottom:16px; border-bottom:1px solid #333; padding-bottom:12px;">
                <label style="display:block; font-size:12px; margin-bottom:6px; color:#ff0000; font-weight:600;">DEFAULT STROKE</label>
                <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
                    <input type="color" id="settings-color" value="${state.strokeColor}" style="width:42px; height:32px; border:none; padding:0; background:#1a1a1a;">
                    <div id="settings-swatches" style="display:flex; gap:4px; flex-wrap:wrap;"></div>
                </div>
                <label style="display:block; font-size:11px; margin-bottom:4px; color:#aaa;">Width</label>
                <select id="settings-width" style="width:100%; padding:7px 10px; background:#1a1a1a; color:#fff; border:1px solid #333; border-radius:0; font-size:13px; margin-bottom:8px;">
                    <option value="2">2px</option>
                    <option value="4">4px</option>
                    <option value="6">6px</option>
                    <option value="8">8px</option>
                    <option value="10">10px</option>
                    <option value="14">14px</option>
                </select>
            </div>
            
            <div style="margin-bottom:16px; border-bottom:1px solid #333; padding-bottom:12px;">
                <label style="display:block; font-size:12px; margin-bottom:6px; color:#ff0000; font-weight:600;">LASER POINTER (independent)</label>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="color" id="settings-laser-color" value="${state.laserColor}" style="width:42px; height:32px; border:none; padding:0; background:#1a1a1a;">
                    <div id="settings-laser-swatches" style="display:flex; gap:4px; flex-wrap:wrap;"></div>
                </div>
            </div>
            
            <div style="margin-bottom:18px; border-bottom:1px solid #333; padding-bottom:12px;">
                <label style="display:block; font-size:12px; margin-bottom:4px; color:#ff0000; font-weight:600;">ERASER</label>
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="range" id="settings-eraser" min="5" max="60" value="${state.eraserSize}" style="flex:1; accent-color:#ff0000;">
                    <span id="settings-eraser-val" style="width:32px; text-align:right; font-size:13px;">${state.eraserSize}</span>
                </div>
            </div>
            
            <div style="margin-bottom:16px; border-bottom:1px solid #333; padding-bottom:12px;">
                <label style="display:block; font-size:12px; margin-bottom:6px; color:#ff0000; font-weight:600;">FONT SCALE</label>
                <select id="settings-font-scale" style="width:100%; padding:7px 10px; background:#1a1a1a; color:#fff; border:1px solid #333; border-radius:0; font-size:13px;">
                    <option value="0.8">Small (0.8×)</option>
                    <option value="1" selected>Normal (1×)</option>
                    <option value="1.2">Large (1.2×)</option>
                    <option value="1.5">Extra Large (1.5×)</option>
                </select>
                <div style="font-size:11px; color:#888; margin-top:4px;">Scales all toolbar text, labels and icons for readability on high-DPI or large screens.</div>
            </div>
            
            <div style="display:flex; gap:8px; margin-top:4px;">
                <button id="save-prefs" style="flex:1; background:#ff0000; color:white; padding:10px 0; border:none; border-radius:0; font-weight:600; cursor:pointer; font-size:13px;">SAVE &amp; APPLY</button>
                <button id="reset-prefs" style="flex:1; background:#1a1a1a; color:#ccc; padding:10px 0; border:1px solid #333; border-radius:0; cursor:pointer; font-size:13px;">RESET ALL</button>
            </div>
            <div style="font-size:10px; color:#666; text-align:center; margin-top:10px;">Preferences persist. Responsive layout updates automatically.</div>
        `;
        
        document.body.appendChild(settingsPanelRef);
        
        const swatchesDiv = settingsPanelRef.querySelector('#settings-swatches');
        const presetColors = ['#ff0000', '#ff8800', '#ffff00', '#00cc00', '#00aaff', '#0066ff', '#aa00ff', '#000000', '#ffffff'];
        presetColors.forEach(c => {
            const sw = document.createElement('button');
            sw.style.cssText = `width:18px;height:18px;background:${c};border:2px solid #444;border-radius:0;padding:0;cursor:pointer;`;
            sw.onclick = () => {
                settingsPanelRef.querySelector('#settings-color').value = c;
                swatchesDiv.querySelectorAll('button').forEach(b => b.style.border = '2px solid #444');
                sw.style.border = '2px solid #ff0000';
            };
            swatchesDiv.appendChild(sw);
        });
        
        const laserSwatchesDiv = settingsPanelRef.querySelector('#settings-laser-swatches');
        const presetLaser = ['#ff0000', '#ff8800', '#ffff00', '#00cc00', '#00aaff', '#ff00ff', '#ffffff'];
        presetLaser.forEach(c => {
            const sw = document.createElement('button');
            sw.style.cssText = `width:18px;height:18px;background:${c};border:2px solid #444;border-radius:0;padding:0;cursor:pointer;`;
            sw.onclick = () => {
                settingsPanelRef.querySelector('#settings-laser-color').value = c;
                laserSwatchesDiv.querySelectorAll('button').forEach(b => b.style.border = '2px solid #444');
                sw.style.border = '2px solid #ff0000';
            };
            laserSwatchesDiv.appendChild(sw);
        });
        
        const colorInput = settingsPanelRef.querySelector('#settings-color');
        const widthSelect = settingsPanelRef.querySelector('#settings-width');
        const eraserRange = settingsPanelRef.querySelector('#settings-eraser');
        const eraserVal = settingsPanelRef.querySelector('#settings-eraser-val');
        const posSelect = settingsPanelRef.querySelector('#settings-pos');
        const laserColorInput = settingsPanelRef.querySelector('#settings-laser-color');
        const fontScaleSelect = settingsPanelRef.querySelector('#settings-font-scale');
        
        colorInput.value = state.strokeColor;
        widthSelect.value = state.strokeWidth;
        eraserRange.value = state.eraserSize;
        eraserVal.textContent = state.eraserSize;
        posSelect.value = state.toolbarPosition;
        laserColorInput.value = state.laserColor;
        if (fontScaleSelect) fontScaleSelect.value = String(state.fontScale || 1);
        
        eraserRange.oninput = () => eraserVal.textContent = eraserRange.value;
        
        settingsPanelRef.querySelector('#save-prefs').onclick = () => {
            const prefs = {
                defaultColor: colorInput.value,
                defaultWidth: parseInt(widthSelect.value),
                defaultEraser: parseInt(eraserRange.value),
                defaultLaserColor: laserColorInput.value,
                toolbarPosition: posSelect.value,
                defaultFontScale: parseFloat(fontScaleSelect ? fontScaleSelect.value : 1)
            };
            chrome.storage.local.set({ annotatePrefs: prefs }, () => {
                state.strokeColor = prefs.defaultColor;
                state.strokeWidth = prefs.defaultWidth;
                state.eraserSize = prefs.defaultEraser;
                state.laserColor = prefs.defaultLaserColor;
                state.fontScale = prefs.defaultFontScale || 1;
                
                if (prefs.toolbarPosition !== state.toolbarPosition) {
                    setToolbarPosition(prefs.toolbarPosition);
                }
                
                if (controlPanel) {
                    controlPanel.style.setProperty('--font-scale', state.fontScale);
                }
                
                const picker = document.querySelector('#color-picker');
                if (picker) picker.value = prefs.defaultColor;
                const laserP = document.querySelector('#laser-color-picker');
                if (laserP) laserP.value = prefs.defaultLaserColor;
                
                const sw = document.getElementById('screenshot');
                if (sw) {
                    const icon = sw.querySelector('.icon');
                    if (icon) {
                        const old = icon.textContent;
                        icon.textContent = 'SAVED';
                        setTimeout(() => { if (icon) icon.textContent = old || '📷'; }, 900);
                    }
                }
                settingsPanelRef.style.display = 'none';
                updateResponsiveLayout();
            });
        };
        
        settingsPanelRef.querySelector('#reset-prefs').onclick = () => {
            chrome.storage.local.remove('annotatePrefs', () => {
                state.strokeColor = theme.colors.defaultStroke;
                state.strokeWidth = 4;
                state.eraserSize = 10;
                state.laserColor = '#ff0000';
                state.toolbarPosition = CONFIG.DEFAULT_TOOLBAR_POSITION;
                state.fontScale = 1;
                
                colorInput.value = state.strokeColor;
                widthSelect.value = state.strokeWidth;
                eraserRange.value = state.eraserSize;
                eraserVal.textContent = state.eraserSize;
                posSelect.value = state.toolbarPosition;
                laserColorInput.value = state.laserColor;
                if (fontScaleSelect) fontScaleSelect.value = '1';
                
                if (controlPanel) controlPanel.style.setProperty('--font-scale', 1);
                setToolbarPosition(CONFIG.DEFAULT_TOOLBAR_POSITION);
                updateResponsiveLayout();
            });
        };
        
        settingsPanelRef.querySelector('#close-settings').onclick = () => settingsPanelRef.style.display = 'none';
    }
  
    // ### Initialize Application
    function initialize() {
        injectStyles();
        setupCanvas();
        setupEraserIndicator();
        setupMinimizeButton();
        setupControlPanel();
        setupSubToolbar();
        setupEventListeners();
        setupMessageListener();
        
        chrome.storage.local.get('annotatePrefs', (result) => {
            if (result.annotatePrefs) {
                const p = result.annotatePrefs;
                if (p.defaultColor) state.strokeColor = p.defaultColor;
                if (p.defaultWidth) state.strokeWidth = p.defaultWidth;
                if (p.defaultEraser) state.eraserSize = p.defaultEraser;
                if (p.defaultLaserColor) state.laserColor = p.defaultLaserColor;
                if (p.toolbarPosition) state.toolbarPosition = p.toolbarPosition;
                if (p.defaultFontScale) state.fontScale = p.defaultFontScale;
            }
            setToolbarPosition(state.toolbarPosition);
            if (controlPanel) controlPanel.style.setProperty('--font-scale', state.fontScale || 1);
            updateResponsiveLayout();
        });
        
        handleToolChange('freehand');
        updateSubToolbar('freehand');
        applyWhiteboardMode();
        
        setTimeout(() => {
            setToggleButtonText(true);
            updateResponsiveLayout();
        }, 60);
        
        console.log('%c[Annotate Pro v1.0.0] Modern responsive sidebar control panel ready. Auto icon-only collapse on short viewports. Short labels + titles. Press P or Ctrl+Shift+A.', 'color:#ff0000');
    }
  
    initialize();
  })();
