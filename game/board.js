// game/board.js
// 8x8 game board: holds grid state, validates shape placement, commits a
// move, and clears fully-filled rows/columns.
// No DOM or Telegram knowledge here - pure logic only.

const SIZE = 8;

export class Board {
  constructor() {
    // grid[row][col] === true means the cell is occupied. Internal
    // representation is intentionally hidden - only the methods below are exposed.
    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  }

  /**
   * Checks whether a shape fits on the board with its anchor cell (0,0) at
   * (row, col). Rejects out-of-bounds positions and positions where any
   * shape cell is already occupied.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  canPlace(shape, row, col) {
    for (const [dr, dc] of shape.cells) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      if (this.grid[r][c]) return false;
    }
    return true;
  }

  /**
   * Commits a shape to the board and clears fully-filled rows/columns.
   * All lines cleared by this move are cleared as a single move result
   * (not one at a time), so the caller can correctly handle synchronized
   * animation and the combo-clear bonus.
   * Caller must check canPlace beforehand - on an invalid position this
   * method throws instead of silently corrupting state.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {{clearedRows: number[], clearedCols: number[]}}
   */
  place(shape, row, col) {
    if (!this.canPlace(shape, row, col)) {
      throw new Error('Invalid shape placement');
    }
    for (const [dr, dc] of shape.cells) {
      this.grid[row + dr][col + dc] = true;
    }

    const clearedRows = [];
    for (let r = 0; r < SIZE; r++) {
      if (this.grid[r].every(Boolean)) clearedRows.push(r);
    }

    const clearedCols = [];
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) {
        if (!this.grid[r][c]) {
          full = false;
          break;
        }
      }
      if (full) clearedCols.push(c);
    }

    for (const r of clearedRows) {
      this.grid[r].fill(false);
    }
    for (const c of clearedCols) {
      for (let r = 0; r < SIZE; r++) this.grid[r][c] = false;
    }

    return { clearedRows, clearedCols };
  }

  /**
   * Without touching real board state, determines which rows/columns would
   * be fully filled and which cells would disappear if the shape were
   * placed at (row, col) right now. Used for the drag combo preview
   * (R05.3) - caller shows highlighting from the result without actually
   * placing anything; only place() still commits a move. On an invalid
   * position returns an empty result instead of throwing (unlike place()) -
   * this is a pure information query, not a move attempt.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {{clearedRows: number[], clearedCols: number[], cells: {row:number, col:number}[]}}
   */
  previewClear(shape, row, col) {
    if (!this.canPlace(shape, row, col)) {
      return { clearedRows: [], clearedCols: [], cells: [] };
    }

    const willOccupy = (r, c) => {
      if (this.grid[r][c]) return true;
      for (const [dr, dc] of shape.cells) {
        if (row + dr === r && col + dc === c) return true;
      }
      return false;
    };

    const clearedRows = [];
    for (let r = 0; r < SIZE; r++) {
      let full = true;
      for (let c = 0; c < SIZE; c++) {
        if (!willOccupy(r, c)) {
          full = false;
          break;
        }
      }
      if (full) clearedRows.push(r);
    }

    const clearedCols = [];
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) {
        if (!willOccupy(r, c)) {
          full = false;
          break;
        }
      }
      if (full) clearedCols.push(c);
    }

    const cells = [];
    const seen = new Set();
    const addCell = (r, c) => {
      const key = `${r},${c}`;
      if (seen.has(key)) return;
      seen.add(key);
      cells.push({ row: r, col: c });
    };
    for (const r of clearedRows) {
      for (let c = 0; c < SIZE; c++) addCell(r, c);
    }
    for (const c of clearedCols) {
      for (let r = 0; r < SIZE; r++) addCell(r, c);
    }

    return { clearedRows, clearedCols, cells };
  }

  /**
   * Checks whether the board has at least one valid position for any of
   * the given shapes. Scans all 64 cells per shape (spec §3).
   * Delegates to hasAnyValidMove - same check as R05.5, exposed as a Board
   * method for caller backward compatibility.
   * @param {{cells: number[][]}[]} shapes
   * @returns {boolean}
   */
  canFitAnywhere(shapes) {
    return hasAnyValidMove(this, shapes);
  }

  /**
   * Flood-fills (4-connectivity) the isolated empty region of the board
   * containing the shape's cells at (row, col) - doesn't touch board state,
   * call before place(). Used by the gap-closing bonus: if this region's
   * size exactly equals the shape's cell count, the shape fully closed an
   * isolated gap (rather than just landing in open space - in that case the
   * region would capture far more empty cells around it). Starts from the
   * shape's first cell - canPlace already guarantees it's empty; returns an
   * empty array on an invalid position.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {{row:number, col:number}[]}
   */
  findEnclosedPocket(shape, row, col) {
    if (!this.canPlace(shape, row, col)) return [];

    const [seedDr, seedDc] = shape.cells[0];
    const stack = [[row + seedDr, col + seedDc]];
    const seen = new Set();
    const pocket = [];

    while (stack.length) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      const key = `${r},${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.grid[r][c]) continue; // occupied cell = gap boundary
      pocket.push({ row: r, col: c });
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    return pocket;
  }

  /** Whether the board is completely empty - used by the full-clear bonus. */
  isEmpty() {
    return this.grid.every((row) => row.every((cell) => !cell));
  }

  /**
   * All isolated empty regions of the board (4-connectivity), each as a
   * list of its cells. Unlike findEnclosedPocket (which checks one specific
   * region against a specific shape/position), this scans the WHOLE board
   * and finds all of them at once - used by the "smart" generation
   * (game/shapes.js) to spot a hole matching a specific shape even before
   * the player has dragged any shape near that region.
   * @returns {{row:number, col:number}[][]}
   */
  findAllEnclosedPockets() {
    const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const pockets = [];

    for (let startRow = 0; startRow < SIZE; startRow++) {
      for (let startCol = 0; startCol < SIZE; startCol++) {
        if (this.grid[startRow][startCol] || visited[startRow][startCol]) continue;

        const stack = [[startRow, startCol]];
        const region = [];
        while (stack.length) {
          const [r, c] = stack.pop();
          if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
          if (visited[r][c] || this.grid[r][c]) continue;
          visited[r][c] = true;
          region.push({ row: r, col: c });
          stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
        }
        pockets.push(region);
      }
    }

    return pockets;
  }
}

export const BOARD_SIZE = SIZE;

/**
 * Whether there is at least one valid position for the shape on this board
 * right now (R05.5) - used by the "smart" tray generation (game/shapes.js)
 * to avoid handing out shapes that have nowhere to go.
 * @param {{cells: number[][]}} piece
 * @param {Board} board
 * @returns {boolean}
 */
export function canPlacePiece(piece, board) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board.canPlace(piece, r, c)) return true;
    }
  }
  return false;
}

/**
 * All valid positions for the shape on this board right now (R05.5) -
 * scans all 64 cells. Used by "smart" tray generation to gauge how
 * "flexible" a shape is (many positions = safe pick, few = risky) and
 * whether any of its positions would trigger a combo clear.
 * @param {{cells: number[][]}} piece
 * @param {Board} board
 * @returns {{row:number, col:number}[]}
 */
export function findValidPlacements(piece, board) {
  const placements = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board.canPlace(piece, r, c)) placements.push({ row: r, col: c });
    }
  }
  return placements;
}

/**
 * Whether any of the tray's available shapes can still be placed
 * (R05.5/R21) - if none can, the game is over (Game Over). Empty tray
 * slots (null = shape already placed) are skipped.
 * @param {Board} board
 * @param {({cells: number[][]}|null)[]} availablePieces
 * @returns {boolean}
 */
export function hasAnyValidMove(board, availablePieces) {
  return availablePieces.some((piece) => piece && canPlacePiece(piece, board));
}
