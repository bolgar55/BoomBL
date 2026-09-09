// ui/input.js
// Player input: dragging a shape onto the board with mouse or finger via the
// unified Pointer Events API (it abstracts mouse/touch/pen into one event
// set, so no separate touch handling is needed), plus the hint logic.
// Stateless — works on top of the board/shapes passed in by the caller
// (index.html).
//
// Pure logic (position validity check, hint search) lives in separate
// exported functions covered by tests in input.test.js. The DOM wiring
// (attachDragAndDrop) isn't unit-tested — see interfaces.md, "Test seams":
// UI is checked manually during review.

import { BOARD_SIZE } from '../game/board.js?v=0.5.1';
import { computeCellSize, pixelToCell, drawShapeGhost } from './render.js?v=0.5.1';

/**
 * Determines whether a position is valid for the shape right now. This is
 * the seam for "detecting an invalid position during drag": while dragging,
 * the cursor/finger may still be off the board (row/col undefined) — that
 * position is always invalid; otherwise the decision is delegated to board.canPlace.
 * @param {{canPlace(shape:object, row:number, col:number): boolean}} board
 * @param {{cells:number[][]}} shape
 * @param {number|null|undefined} row
 * @param {number|null|undefined} col
 * @returns {boolean}
 */
export function isValidDrop(board, shape, row, col) {
  if (row === null || row === undefined || col === null || col === undefined) {
    return false;
  }
  return board.canPlace(shape, row, col);
}

/**
 * Finds the first valid position for one of the tray shapes — used by the
 * "Hint" button (R15). Traversal order is fixed and deterministic: shapes in
 * tray order, and for each, board cells top-to-bottom, left-to-right. Empty
 * tray slots (null — shape already placed) are skipped.
 * @param {{canPlace(shape:object, row:number, col:number): boolean}} board
 * @param {({cells:number[][]}|null)[]} shapes
 * @returns {{shapeIndex:number, row:number, col:number}|null}
 */
export function findHint(board, shapes) {
  for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
    const shape = shapes[shapeIndex];
    if (!shape) continue;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board.canPlace(shape, row, col)) {
          return { shapeIndex, row, col };
        }
      }
    }
  }
  return null;
}

/** Board cells the shape would occupy if placed at (row, col). */
export function shapeCells(shape, row, col) {
  return shape.cells.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
}

/** Shape bounds in cells (width/height of its bounding box). */
export function shapeBounds(shape) {
  let maxRow = 0;
  let maxCol = 0;
  for (const [r, c] of shape.cells) {
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  return { width: maxCol + 1, height: maxRow + 1 };
}

/** How many cells the shape is lifted above the finger/cursor, so the player can see the whole shape. */
const LIFT_CELLS = 1.2;
// Smoothing factor for following the cursor (0..1 per frame) — higher is
// "snappier"; 0.32 gives smooth but not "rubbery" tracking.
const FOLLOW_EASE = 0.32;
const LAND_MS = 140; // animation for landing in a valid position
const RETURN_MS = 200; // animation for returning to the tray on an invalid position

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Whether the shape's bounding box at (row, col) overlaps the board grid at all. */
function overlapsBoard(row, col, bounds) {
  return (
    row + bounds.height > 0 &&
    row < BOARD_SIZE &&
    col + bounds.width > 0 &&
    col < BOARD_SIZE
  );
}

/**
 * Wires up drag-and-drop for tray slots and the board via Pointer Events.
 * The dragged shape is drawn once into an overlay canvas (dragCanvas,
 * position:fixed — see style.css) and then just moved via transform: it
 * smoothly follows the cursor/finger across the whole screen (not just over
 * the board), and on release either "lands" nicely into a board cell or
 * returns to the tray — both animated via requestAnimationFrame with ease-out.
 * DOM wiring — checked manually during review, not unit-tested.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.boardCanvas - board canvas (for coordinates and size)
 * @param {HTMLCanvasElement} opts.dragCanvas - fixed-overlay canvas for the dragged shape
 * @param {HTMLElement[]} opts.trayEls - tray slot canvases (data-index = shape index)
 * @param {() => object} opts.getBoard - current Board
 * @param {() => (object|null)[]} opts.getShapes - current tray shapes (with colors via getShapeColor)
 * @param {(index:number) => string} opts.getShapeColor - shape color by tray index
 * @param {() => number} opts.getCellSize - current board cell size in pixels
 * @param {() => boolean} opts.isLocked - input lock (e.g. game over)
 * @param {(info: {highlight: {row:number, col:number, valid:boolean}[], comboCells: {row:number, col:number}[], color: string}) => void} opts.onHover -
 *   highlight — cells under the shape itself (green/red validity overlay);
 *   comboCells — cells that would disappear if the shape were placed right now
 *   (R05.3, empty = no combo); color — dragged shape's color for the comboCells overlay
 * @param {() => void} opts.onHoverEnd
 * @param {(shapeIndex:number, row:number, col:number) => void} opts.onDrop
 * @param {(shapeIndex:number) => void} opts.onInvalidDrop
 */
export function attachDragAndDrop({
  boardCanvas,
  dragCanvas,
  trayEls,
  getBoard,
  getShapes,
  getShapeColor,
  getCellSize,
  isLocked,
  onHover,
  onHoverEnd,
  onDrop,
  onInvalidDrop,
}) {
  const floatCanvas = dragCanvas;
  const floatCtx = floatCanvas.getContext('2d');
  let dragging = null;

  function sizeFloatCanvas(cssWidth, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    floatCanvas.width = Math.max(1, Math.round(cssWidth * dpr));
    floatCanvas.height = Math.max(1, Math.round(cssHeight * dpr));
    floatCanvas.style.width = `${cssWidth}px`;
    floatCanvas.style.height = `${cssHeight}px`;
    floatCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setFloatTransform(x, y, scale = 1) {
    floatCanvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }

  function followTick() {
    if (!dragging) return;
    dragging.current.x += (dragging.target.x - dragging.current.x) * FOLLOW_EASE;
    dragging.current.y += (dragging.target.y - dragging.current.y) * FOLLOW_EASE;
    setFloatTransform(dragging.current.x, dragging.current.y);
    dragging.rafId = requestAnimationFrame(followTick);
  }

  function updateDrag(event) {
    if (!dragging) return;
    const cellSize = getCellSize();
    const bounds = dragging.bounds;
    const boardRect = boardCanvas.getBoundingClientRect();

    // shape anchor — under the touch point, lifted and centered by width, so
    // the finger/cursor doesn't cover the target cell and the whole shape is visible
    const x = event.clientX - boardRect.left;
    const y = event.clientY - boardRect.top;
    const anchorX = x - (bounds.width / 2) * cellSize;
    const anchorY = y - (bounds.height / 2 + LIFT_CELLS) * cellSize;
    const { row, col } = pixelToCell(anchorX, anchorY, cellSize);
    dragging.row = row;
    dragging.col = col;

    const board = getBoard();
    const valid = isValidDrop(board, dragging.shape, row, col);
    dragging.valid = valid;
    const overBoard = overlapsBoard(row, col, bounds);

    // the shape always follows the cursor/finger freely — grid snapping is
    // only visible via the cell highlight (onHover below) and the landing
    // animation on release (landFloat); a magnetic "jump" of the shape itself
    // when crossing cell boundaries felt jarring, so it's not done here
    dragging.target.x = event.clientX - (bounds.width / 2) * cellSize;
    dragging.target.y = event.clientY - (bounds.height / 2 + LIFT_CELLS) * cellSize;

    if (dragging.first) {
      dragging.current.x = dragging.target.x;
      dragging.current.y = dragging.target.y;
      setFloatTransform(dragging.current.x, dragging.current.y);
      dragging.first = false;
    }

    floatCanvas.classList.toggle('drag-float--invalid', overBoard && !valid);

    // combo preview (R05.3): what would disappear if the shape were placed
    // right now — computed only for a valid position, doesn't touch the real board
    const comboCells = valid ? board.previewClear(dragging.shape, row, col).cells : [];

    onHover({
      highlight: shapeCells(dragging.shape, row, col).map((c) => ({ ...c, valid })),
      comboCells,
      color: dragging.color,
    });
  }

  // Single reset point — hides the overlay canvas and clears the tray
  // slot's dimmed state. Both places that end a drag (landFloat/returnFloat)
  // go through it, so a slot can never accidentally stay dimmed forever.
  function resetFloat(el) {
    floatCanvas.classList.remove('drag-float--invalid');
    floatCanvas.style.display = 'none';
    floatCanvas.style.transform = '';
    if (el) el.classList.remove('tray-slot--dragging');
  }

  function animateFloat(from, to, duration, onDone) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setFloatTransform(
        from.x + (to.x - from.x) * eased,
        from.y + (to.y - from.y) * eased,
        from.scale + (to.scale - from.scale) * eased
      );
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onDone();
      }
    }
    requestAnimationFrame(step);
  }

  // Valid position: the shape smoothly "lands" and aligns with the board
  // cell; only then do we commit the actual placement (onDrop) — no jump
  // between the animation and rendering the already-placed block on the board.
  function landFloat(state) {
    const cellSize = getCellSize();
    const boardRect = boardCanvas.getBoundingClientRect();
    const to = {
      x: boardRect.left + state.col * cellSize,
      y: boardRect.top + state.row * cellSize,
      scale: 1,
    };
    floatCanvas.classList.remove('drag-float--invalid');
    animateFloat({ ...state.current, scale: 1 }, to, LAND_MS, () => {
      resetFloat(state.el);
      onDrop(state.shapeIndex, state.row, state.col);
    });
  }

  // Invalid position (or cancelled drag): the shape smoothly returns and
  // shrinks to its tray slot size; the slot regains full opacity exactly as
  // the shape "settles" into place.
  function returnFloat(state) {
    const slotRect = state.el.getBoundingClientRect();
    const cellSize = getCellSize();
    const shapePxW = state.bounds.width * cellSize;
    const shapePxH = state.bounds.height * cellSize;
    const fitSize = Math.min(slotRect.width, slotRect.height) * 0.72;
    const scale = fitSize / Math.max(shapePxW, shapePxH, 1);
    const to = {
      x: slotRect.left + slotRect.width / 2 - (shapePxW * scale) / 2,
      y: slotRect.top + slotRect.height / 2 - (shapePxH * scale) / 2,
      scale,
    };
    animateFloat({ ...state.current, scale: 1 }, to, RETURN_MS, () => {
      resetFloat(state.el);
    });
  }

  function finishDrag(commit) {
    if (!dragging) return;
    const state = dragging;
    dragging = null;
    cancelAnimationFrame(state.rafId);
    onHoverEnd();

    const board = getBoard();
    const valid = commit && isValidDrop(board, state.shape, state.row, state.col);

    if (valid) {
      landFloat(state);
    } else {
      returnFloat(state);
      if (commit) onInvalidDrop(state.shapeIndex);
    }
  }

  trayEls.forEach((el) => {
    el.addEventListener('pointerdown', (event) => {
      if (isLocked && isLocked()) return;
      const shapeIndex = Number(el.dataset.index);
      const shapes = getShapes();
      const shape = shapes[shapeIndex];
      if (!shape) return;
      el.setPointerCapture(event.pointerId);

      // defensive reset: if a previous return/land animation was interrupted
      // (e.g. app was backgrounded mid-rAF) and the class got stuck on some
      // slot, a new drag shouldn't carry that state forward
      trayEls.forEach((slot) => slot.classList.remove('tray-slot--dragging'));

      const cellSize = getCellSize();
      const bounds = shapeBounds(shape);
      const color = getShapeColor(shapeIndex);

      sizeFloatCanvas(bounds.width * cellSize, bounds.height * cellSize);
      drawShapeGhost(floatCtx, shape, 0, 0, cellSize, color);
      floatCanvas.style.display = 'block';

      dragging = {
        pointerId: event.pointerId,
        shapeIndex,
        shape,
        color,
        bounds,
        el,
        row: null,
        col: null,
        valid: false,
        target: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        rafId: null,
        first: true,
      };
      el.classList.add('tray-slot--dragging');
      updateDrag(event);
      dragging.rafId = requestAnimationFrame(followTick);
      event.preventDefault();
    });
  });

  document.addEventListener('pointermove', (event) => {
    if (dragging && event.pointerId === dragging.pointerId) updateDrag(event);
  });
  document.addEventListener('pointerup', (event) => {
    if (dragging && event.pointerId === dragging.pointerId) finishDrag(true);
  });
  document.addEventListener('pointercancel', (event) => {
    if (dragging && event.pointerId === dragging.pointerId) finishDrag(false);
  });
}

// exported in case the caller needs the same cell-size calculation
export { computeCellSize };
