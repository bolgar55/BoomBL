// ui/render.js
// Renders the game board and shapes on Canvas 2D. Stateless — only draws
// what it's given via parameters, and holds the pure geometry (pixel <->
// cell conversion) reused by ui/input.js for drag-and-drop.
//
// Palette is copied verbatim from reference.md (spec §5), the single source
// of color for the game (Telegram only signals dark/light theme, see spec
// §Decisions 6 — the caller switches themes via the data-theme attribute on
// <html>; this module just reads the theme name it's given).

import { BOARD_SIZE } from '../game/board.js?v=0.5.1';

export const THEME = {
  dark: {
    background: '#1A1A2E',
    cell: '#2C2C44',
  },
  light: {
    background: '#F0F0F5',
    cell: '#E8E8F0',
  },
};

// Bright block colors — a shape gets a random one assigned on spawn (reference.md).
export const BLOCK_COLORS = [
  '#FF4757', // red
  '#FFA502', // orange
  '#FFD32A', // yellow
  '#2ED573', // green
  '#1E90FF', // blue
  '#A55EEA', // purple
  '#FF6B9D', // pink/crimson
  '#00D2D3', // turquoise
];

export const LINE_CLEAR_FLASH_COLOR = '#FFFFFF';

/** Random block color from the palette — used when a new shape spawns. */
export function randomBlockColor() {
  return BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
}

const GAP = 3; // visual gap between cells in pixels, doesn't affect logic
const RADIUS = 4; // block corner radius

/** Computes the cell size so a BOARD_SIZE×BOARD_SIZE grid fits the square canvasSize. */
export function computeCellSize(canvasSize, boardSize = BOARD_SIZE) {
  return canvasSize / boardSize;
}

/** Pixel rect for cell (row, col), accounting for the gap between cells. */
export function cellRect(row, col, cellSize) {
  return {
    x: col * cellSize + GAP / 2,
    y: row * cellSize + GAP / 2,
    size: cellSize - GAP,
  };
}

/**
 * Converts pixel coordinates (relative to the board canvas) into cell
 * coordinates. May return an out-of-bounds index (negative or >= BOARD_SIZE) —
 * the caller (isValidDrop) decides whether the position is valid.
 */
export function pixelToCell(x, y, cellSize) {
  return {
    row: Math.floor(y / cellSize),
    col: Math.floor(x / cellSize),
  };
}

// A single-cell shape — a trick to check cell occupancy via the public
// board.canPlace, without touching the grid's hidden internal representation.
const UNIT_CELL = { cells: [[0, 0]] };

/** Whether cell (row, col) is occupied — determined only via the public canPlace. */
export function isOccupied(board, row, col) {
  return !board.canPlace(UNIT_CELL, row, col);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Subtle top-to-bottom gradient for depth — "blocks look glossy, like in
// the original game" (reference.md, design principle).
function drawGloss(ctx, x, y, size) {
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.03)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, x, y, size, size, RADIUS);
  ctx.fill();
}

function drawBlock(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  drawRoundedRect(ctx, x, y, size, size, RADIUS);
  ctx.fill();
  drawGloss(ctx, x, y, size);
}

/**
 * Draws the board: background, cells (empty/occupied with colorGrid color),
 * and, if highlight is passed, a translucent overlay showing whether the
 * drag position is valid (green = can place, red = can't, R05.1).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} board - object with canPlace (see game/board.js)
 * @param {(string|null)[][]} colorGrid - color of each occupied cell, owned by the caller
 * @param {number} cellSize
 * @param {'dark'|'light'} theme
 * @param {{row:number, col:number, valid:boolean}[]} [highlight]
 */
export function drawBoard(ctx, board, colorGrid, cellSize, theme, highlight) {
  const palette = THEME[theme] || THEME.dark;
  const size = cellSize * BOARD_SIZE;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const { x, y, size: s } = cellRect(row, col, cellSize);
      const occupied = isOccupied(board, row, col);
      if (occupied) {
        drawBlock(ctx, x, y, s, colorGrid?.[row]?.[col] || BLOCK_COLORS[0]);
      } else {
        ctx.fillStyle = palette.cell;
        drawRoundedRect(ctx, x, y, s, s, RADIUS);
        ctx.fill();
      }
    }
  }

  if (highlight) {
    for (const { row, col, valid } of highlight) {
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
      const { x, y, size: s } = cellRect(row, col, cellSize);
      ctx.fillStyle = valid ? 'rgba(46, 213, 115, 0.5)' : 'rgba(255, 71, 87, 0.65)';
      drawRoundedRect(ctx, x, y, s, s, RADIUS);
      ctx.fill();
    }
  }
}

/** Shape bounds (width/height of its bounding box, in cells). */
function boundsOf(shape) {
  let maxRow = 0;
  let maxCol = 0;
  for (const [r, c] of shape.cells) {
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  return { width: maxCol + 1, height: maxRow + 1 };
}

/** Draws a shape preview, scaled to fit and centered in the square tray canvas. */
export function drawShapePreview(ctx, shape, color, canvasSize) {
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  const { width, height } = boundsOf(shape);
  const padding = canvasSize * 0.14;
  const available = canvasSize - padding * 2;
  const cell = available / Math.max(width, height);
  const offsetX = (canvasSize - width * cell) / 2;
  const offsetY = (canvasSize - height * cell) / 2;
  const s = Math.max(cell - 3, 1);

  for (const [r, c] of shape.cells) {
    drawBlock(ctx, offsetX + c * cell, offsetY + r * cell, s, color);
  }
}

/** Draws a "ghost" of the dragged shape over the board at (row, col). */
export function drawShapeGhost(ctx, shape, row, col, cellSize, color) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const [dr, dc] of shape.cells) {
    const { x, y, size } = cellRect(row + dr, col + dc, cellSize);
    drawBlock(ctx, x, y, size, color);
  }
  ctx.restore();
}

/** Mixes a hex color with white by amount (0..1) — lighter than the original, for the pulsing outline. */
function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * Preview of a potential combo clear while dragging (R05.3): cells that
 * would disappear after placing the shape are highlighted in its color —
 * a soft glow (shadowBlur) plus a pulsing lightened outline, both driven by
 * phase pulse (0..1, usually a sine wave) for a "breathing" effect.
 * Pure single-frame function; the breathing loop itself lives in
 * ui/animations.js (createComboPreview). Not unit-tested (visual effect).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{row:number, col:number}[]} cells
 * @param {number} cellSize
 * @param {string} color
 * @param {number} pulse
 */
export function drawComboPreview(ctx, cells, cellSize, color, pulse) {
  if (!cells.length) return;
  ctx.save();

  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + pulse * 14;
  ctx.globalAlpha = 0.3 + pulse * 0.25;
  ctx.fillStyle = color;
  for (const { row, col } of cells) {
    const { x, y, size } = cellRect(row, col, cellSize);
    drawRoundedRect(ctx, x, y, size, size, RADIUS);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.lineWidth = 2;
  ctx.strokeStyle = lightenColor(color, 0.35 + pulse * 0.3);
  for (const { row, col } of cells) {
    const { x, y, size } = cellRect(row, col, cellSize);
    drawRoundedRect(ctx, x + 1, y + 1, size - 2, size - 2, RADIUS);
    ctx.stroke();
  }

  ctx.restore();
}
