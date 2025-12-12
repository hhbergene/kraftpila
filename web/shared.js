/**
 * shared.js - Shared constants and utilities for main.js and editor.js
 * Allows both modes to use identical configuration without duplication
 */

// ===== UI Constants =====
window.WIDTH = 1000;
window.HEIGHT = 640;
window.GRID_STEP = 20;
window.TOP_BAR_HEIGHT = 80;  // Height of the top navigation panel
window.FORCE_HEADER_HEIGHT = 16;  // Height of "Krefter" title: 12px font + 2px padding top + 2px padding bottom with line-height:1
window.DRAW_CENTER = [500, 320 + 20];  // [WIDTH/2, HEIGHT/2 + GRID_STEP]
window.BG_COLOR = '#f0f0f0'; // (240,240,240)
window.GRID_COLOR = '#dcdcdc'; // (220,220,220)

// ===== Canvas Dimensions =====
// Grid area is 1000x640, with 200px margin on each side (offsets)
// Canvas extends from -200,-200 to 1000,640 = total 1400x1040
window.CANVAS_WIDTH = window.WIDTH + 2 * 200;     // 1000 + 400 = 1400px
window.CANVAS_HEIGHT = window.HEIGHT + 2 * 200;   // 640 + 400 = 1040px

// ===== Canvas Offset (for rendering translation) =====
// Grid area (0,0 to WIDTH,HEIGHT) is translated by these offsets
window.offsetX = 200;         // Left/right margin (canvas extends from -200 to 1000)
window.offsetY = 200;         // Top/bottom margin (canvas extends from -200 to 640)

// ===== Scene Element Highlighting Constants =====
window.HIGHLIGHT_SCENE_POINT_DIM_COLOR = '#aaaaaa';      // Dim color for selected element points
window.HIGHLIGHT_SCENE_POINT_DIM_RADIUS = 6;
window.HIGHLIGHT_SCENE_POINT_BRIGHT_COLOR = '#ffff00';   // Bright yellow for hovered element points
window.HIGHLIGHT_SCENE_POINT_BRIGHT_RADIUS = 8;
window.HIGHLIGHT_SCENE_LINE_DIM_COLOR = '#4488ff';       // Blue for segment lines (selected, dim)
window.HIGHLIGHT_SCENE_LINE_DIM_WIDTH = 4;
window.HIGHLIGHT_SCENE_LINE_BRIGHT_COLOR = '#66bbff';    // Bright cyan for segment lines (hovered)
window.HIGHLIGHT_SCENE_LINE_BRIGHT_WIDTH = 6;

// ===== Scene Element Handles Constants =====
window.SCENE_HANDLE_RADIUS = 5;
window.SCENE_HANDLE_COLOR = '#ff9800';     // Orange
window.SCENE_HANDLE_STROKE_COLOR = '#ffffff';
window.SCENE_HANDLE_STROKE_WIDTH = 1;
window.SCENE_HANDLE_TEXT_COLOR = '#000';
window.SCENE_HANDLE_TEXT_SIZE = 12;

// ===== Scene Element Hover Detection Constants =====
window.HOVER_THRESHOLD = 20;               // pixels, same as SNAP_THRESHOLD
window.PREFER_SELECTED_DIST = 20;          // Prefer selected element within this distance (GRID_STEP)

// ===== Feedback Panel Configuration =====
window.FEEDBACK_PANEL_MAX_WIDTH = 400;     // Maximum width in pixels
window.FEEDBACK_PANEL_MAX_HEIGHT = 300;    // Maximum height in pixels
window.FEEDBACK_PANEL_CHAR_WIDTH = 8.5;    // Estimated pixels per character (monospace ~8.5px)
window.FEEDBACK_PANEL_LINE_HEIGHT = 24;    // Height per line in pixels

// ===== Force Aliases =====
window.FORCE_ALIASES = {
  G: ['g','ga','tyngde','fg','G'],
  N: ['n','na','normalkraft','r','fn','N'],
  F: ['f','fa','kraft','applied','F'],
  R: ['r','ra','friksjon','fr','R'],
  N_B: ['nb*','n*','nb\'','n\'','b','nba','nab','N_B']
};

// ===== Icon Symbols =====
window.ICONS = {
  snap: '🧲',
  guidelines: '📐',
  grid_off: '⊞',
  grid_on: '◻',
  prev: '⬅',
  next: '➡',
  help: '❓',
  check: '✅',
  reset: '🔄',
  settings: '⚙'
};

/**
 * Calculate dynamic width and height for feedback panel based on content
 * @param {Array<Object>} lines - Feedback lines with text property
 * @returns {Object} { width, height } in pixels
 */
window.calculateFeedbackPanelSize = function(lines) {
  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    return { width: 240, height: 100 };
  }

  // Find the longest segment and count total rendered lines
  let maxLength = 0;
  let totalRenderedLines = 0;
  
  lines.forEach(line => {
    if (line.text) {
      // Count actual lines (newline-separated segments) in this text
      const textLines = line.text.split('\n');
      totalRenderedLines += textLines.length;
      
      // Find longest segment
      textLines.forEach(segment => {
        maxLength = Math.max(maxLength, segment.length);
      });
    }
  });

  // Calculate width based on longest line segment
  let width = Math.ceil(maxLength * window.FEEDBACK_PANEL_CHAR_WIDTH) + 24; // 24px padding
  width = Math.min(width, window.FEEDBACK_PANEL_MAX_WIDTH);
  width = Math.max(width, 240); // Minimum 240px

  // Calculate height based on total rendered lines (including multi-line text) plus header/nav
  const headerHeight = 40; // Score area
  const navHeight = 28;    // Navigation buttons
  const padding = 24;      // Top/bottom padding
  const contentHeight = totalRenderedLines * window.FEEDBACK_PANEL_LINE_HEIGHT;

  let height = headerHeight + contentHeight + navHeight + padding;
  height = Math.min(height, window.FEEDBACK_PANEL_MAX_HEIGHT);
  height = Math.max(height, 100); // Minimum 100px

  return { width, height };
};

/**
 * Highlight forces based on feedback line indices
 * @param {Array<number>} indices - Array of force indices to highlight
 */
window.applyHighlightsFor = function(indices) {
  if (window.fm) {
    window.fm.forces.forEach(f => f.checkHighlight = false);
  }
  if (!indices) return;
  indices.forEach(idx => {
    const f = window.fm?.forces?.[idx];
    if (f) f.checkHighlight = true;
  });
};

/**
 * Clear all force highlights
 */
window.clearHighlights = function() {
  if (window.fm) {
    window.fm.forces.forEach(f => f.checkHighlight = false);
  }
};

/**
 * Get mouse position relative to canvas, accounting for scroll offset and rendering translation.
 * Canvas dimensions are CANVAS_WIDTH x CANVAS_HEIGHT with rendering translated by (offsetX, offsetY).
 * @param {MouseEvent} evt - The mouse event
 * @returns {Array<number>} [x, y] position in canvas coordinates
 */
window.getMousePos = function(evt) {
  const canvas = document.getElementById('app-canvas');
  const container = document.getElementById('canvas-container');
  if (!canvas || !container) return [0, 0];
  
  // Get container viewport bounds
  const containerRect = container.getBoundingClientRect();
  
  // Calculate mouse position relative to container viewport
  const mouseX = evt.clientX - containerRect.left;
  const mouseY = evt.clientY - containerRect.top;
  
  // Add scroll offset to get position relative to canvas element
  // Subtract the translation offset applied in frame() rendering
  const x = mouseX + container.scrollLeft - window.offsetX;
  const y = mouseY + container.scrollTop - window.offsetY;
  return [x, y];
};

/**
 * Clear canvas: fill entire canvas with grey background, then fill grid area with white.
 * This function requires a canvas context to be passed.
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 */
window.clearCanvas = function(ctx) {
  if (!ctx) return;
  
  // Fill entire canvas with grey (background outside grid area)
  ctx.fillStyle = window.BG_COLOR;  // '#f0f0f0' - light grey
  ctx.fillRect(0, 0, window.CANVAS_WIDTH, window.CANVAS_HEIGHT);
  
  // Fill grid area with white, offset by (offsetX, offsetY)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(window.offsetX, window.offsetY, window.WIDTH, window.HEIGHT);
};

/**
 * Initialize scroll position to show grid area at top-left of viewport.
 * Scrolls container so (offsetX, offsetY) appears at the top-left of the viewport.
 */
window.initializeScroll = function() {
  const container = document.getElementById('canvas-container');
  if (container) {
    container.scrollLeft = window.offsetX;
    container.scrollTop = window.offsetY;
  }
};

/**
 * Clamp a position to stay within canvas bounds (including grey margins).
 * Canvas coordinate system is 0 to CANVAS_WIDTH horizontally, 0 to CANVAS_HEIGHT vertically.
 * Allows positions anywhere in the full canvas including grey areas.
 * @param {Array<number>} pos - Position [x, y] to clamp
 * @returns {Array<number>} Clamped position [x, y]
 */
window.clampToCanvas = function(pos) {
  if (!pos || pos.length < 2) return [0, 0];
  
  // Full canvas extends from -offsetX to (WIDTH - offsetX) when in grid coords
  // But positions are stored in canvas coords: 0 to CANVAS_WIDTH, 0 to CANVAS_HEIGHT
  // Clamp to negative values (left/top margins) and positive (right/bottom margins)
  const minX = -window.offsetX;
  const maxX = window.WIDTH + window.offsetX;
  const minY = -window.offsetY;
  const maxY = window.HEIGHT + window.offsetY;
  
  const x = Math.max(minX, Math.min(pos[0], maxX));
  const y = Math.max(minY, Math.min(pos[1], maxY));
  
  return [x, y];
};
