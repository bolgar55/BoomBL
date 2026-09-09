// game/shapes.js
// Game shape catalog (spec §Decisions 1): cell coordinates relative to (0,0).
// Shapes don't rotate (R10.1) - every orientation is its own static catalog
// entry, there's no rotation function in this module.
//
// Tray generation (R05.5) is not fully random: it analyzes the current
// board via game/board.js (findValidPlacements/canPlacePiece) to avoid
// handing out shapes that have nowhere to go while space remains.

import { BOARD_SIZE, findValidPlacements } from './board.js?v=0.5.1';

/**
 * @typedef {{ id: string, cells: number[][] }} Shape
 * cells - array of [row, col] pairs, relative coordinates of the shape's occupied cells.
 */

/** @type {Shape[]} */
const SHAPE_CATALOG = [
  // Dot (1 cell)
  { id: 'dot', cells: [[0, 0]] },

  // Domino (2 cells)
  { id: 'domino-h', cells: [[0, 0], [0, 1]] },
  { id: 'domino-v', cells: [[0, 0], [1, 0]] },

  // Tromino line (3 cells)
  { id: 'tromino-h', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'tromino-v', cells: [[0, 0], [1, 0], [2, 0]] },

  // Corner (3 cells, 4 orientations)
  { id: 'corner-1', cells: [[0, 0], [0, 1], [1, 0]] },
  { id: 'corner-2', cells: [[0, 0], [0, 1], [1, 1]] },
  { id: 'corner-3', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'corner-4', cells: [[0, 0], [1, 0], [1, 1]] },

  // 2x2 square (4 cells)
  { id: 'square', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },

  // Tetromino line (4 cells)
  { id: 'tetromino-i-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'tetromino-i-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },

  // Tetromino L (4 cells, 4 orientations)
  { id: 'tetromino-l-1', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'tetromino-l-2', cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
  { id: 'tetromino-l-3', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { id: 'tetromino-l-4', cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },

  // Tetromino T (4 cells, 4 orientations)
  { id: 'tetromino-t-1', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 'tetromino-t-2', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: 'tetromino-t-3', cells: [[1, 0], [1, 1], [1, 2], [0, 1]] },
  { id: 'tetromino-t-4', cells: [[0, 1], [1, 0], [1, 1], [2, 1]] },

  // Tetromino S/Z (4 cells, 2 orientations each)
  { id: 'tetromino-s-h', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: 'tetromino-s-v', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { id: 'tetromino-z-h', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 'tetromino-z-v', cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },

  // Pentomino line (5 cells)
  { id: 'pentomino-i-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'pentomino-i-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },

  // Pentomino corner (5 cells, 4 orientations)
  { id: 'pentomino-v-1', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
  { id: 'pentomino-v-2', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'pentomino-v-3', cells: [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0]] },
  { id: 'pentomino-v-4', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },

  // 2x3 rectangle (6 cells, 2 orientations)
  {
    id: 'rect-2x3-h',
    cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  },
  {
    id: 'rect-2x3-v',
    cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]],
  },

  // 3x3 square (9 cells)
  {
    id: 'square-3x3',
    cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ],
  },
];

function cloneShape(source) {
  return { id: source.id, cells: source.cells.map(([r, c]) => [r, c]) };
}

/** Picks a random catalog shape ignoring the board - the original pure-random behavior. */
function pickPureRandom() {
  return cloneShape(SHAPE_CATALOG[Math.floor(Math.random() * SHAPE_CATALOG.length)]);
}

// Shifts cells so the minimum row/col become 0, then sorts - two cell sets
// with the same shape then compare simply element-by-element, regardless of
// original coordinates/order.
function normalizeCells(cells) {
  let minRow = Infinity;
  let minCol = Infinity;
  for (const [r, c] of cells) {
    if (r < minRow) minRow = r;
    if (c < minCol) minCol = c;
  }
  return cells
    .map(([r, c]) => [r - minRow, c - minCol])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function cellsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);
}

// Gaps larger than the biggest catalog shape (9 cells, square-3x3) can never
// exactly match a whole shape - skip comparing those.
const MAX_MATCHABLE_POCKET_SIZE = 9;

/**
 * Looks for an isolated gap on the board (Board.findAllEnclosedPockets)
 * whose shape EXACTLY matches a catalog shape (shapes don't rotate, R10.1 -
 * match only in original orientation) - player request: if there's a "hole"
 * shaped for a specific shape, that shape should appear in the tray soon,
 * not just whenever luck allows. Returns the first matching shape found, or
 * null if no gap matches.
 * @param {import('./board.js').Board} board
 * @returns {Shape | null}
 */
function findGapMatchingShape(board) {
  const pockets = board.findAllEnclosedPockets();
  for (const pocket of pockets) {
    if (pocket.length === 0 || pocket.length > MAX_MATCHABLE_POCKET_SIZE) continue;
    const normalizedPocket = normalizeCells(pocket.map((p) => [p.row, p.col]));
    for (const shape of SHAPE_CATALOG) {
      if (shape.cells.length !== normalizedPocket.length) continue;
      if (cellsEqual(normalizedPocket, normalizeCells(shape.cells))) {
        return shape;
      }
    }
  }
  return null;
}

// ---------- "smart" generation (simplified version) ----------
// This used to be four independent systems (hidden combo-hint chance, extra
// weight for "saving" moves, a large-shape wave on random phases, uneven-
// shape suppression) multiplied together, making the final behavior hard to
// predict - player asked to simplify. There was an intermediate version with
// "difficulty" growing over the game (0->1), but at max it got permanently
// stuck in hard mode for the rest of a long game - not viable either, also
// removed. Now there's just one system:
// "flexibility" - a shape's weight grows with its number of positions on
// the board, plus two constant multipliers (large shapes slightly more
// common, uneven ones noticeably rarer) with no progression over the game.
// The hard filter "has at least one valid position" (findValidPlacements)
// stays first and decisive.

const LARGE_SHAPE_CELLS = 6; // rect-2x3 (6 cells) and up counts as "large"
const LARGE_SHAPE_BOOST = 3; // constant weight multiplier for large shapes
const LARGE_SHAPE_BOOST_EVENT = 7; // multiplier during the "big shape rain" event

/**
 * Weight multiplier for large shapes - constant (no progression over the
 * game), but noticeably higher during the "big shape rain" event
 * (game/events.js), otherwise the event would be indistinguishable from
 * normal play.
 */
function largeShapeMultiplier(cellCount, bigShapeRainActive) {
  if (cellCount < LARGE_SHAPE_CELLS) return 1;
  return bigShapeRainActive ? LARGE_SHAPE_BOOST_EVENT : LARGE_SHAPE_BOOST;
}

// "Uneven" shapes - small tromino corners (corner-1..4), big corners
// (pentomino-V, pentomino-v-1..4), zigzags (S/Z tetrominoes), L and T
// tetrominoes - tile worse than straight/rectangular shapes of the same
// size and more often leave 1-2 cell holes. Not removed entirely - just
// permanently lowered selection weight, no progression over the game.
const HOLE_PRONE_SHAPE_IDS = new Set([
  'corner-1', 'corner-2', 'corner-3', 'corner-4',
  'pentomino-v-1', 'pentomino-v-2', 'pentomino-v-3', 'pentomino-v-4',
  'tetromino-s-h', 'tetromino-s-v', 'tetromino-z-h', 'tetromino-z-v',
  'tetromino-l-1', 'tetromino-l-2', 'tetromino-l-3', 'tetromino-l-4',
  'tetromino-t-1', 'tetromino-t-2', 'tetromino-t-3', 'tetromino-t-4',
]);
const HOLE_PRONE_SUPPRESS = 0.2;

/** Weight multiplier for "uneven" shapes - 1 for everything else. */
function holeProneMultiplier(id) {
  return HOLE_PRONE_SHAPE_IDS.has(id) ? HOLE_PRONE_SUPPRESS : 1;
}

/** Weighted random pick - each item's chance is proportional to its weight. */
function weightedPick(items, weightOf) {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Picks one catalog shape considering the current board (R05.5):
 * 1) first keeps only shapes with at least one valid position on this board
 *    (findValidPlacements) - don't hand out a guaranteed-unplayable shape
 *    while there's a choice;
 * 2) weight grows with the shape's number of positions ("flexible" shapes
 *    are slightly more likely);
 * 3) multiplies by largeShapeMultiplier and holeProneMultiplier - both
 *    constant for the whole game, no progression.
 * If no catalog shape physically fits the board at all (edge case - the
 * board is effectively already lost), falls back to pure random: there's
 * nothing meaningful left to pick from.
 * @param {import('./board.js').Board} board
 * @param {{bigShapeRainActive?: boolean}} [context] - bigShapeRainActive: whether the "big shape rain" event is active (game/events.js)
 * @returns {Shape}
 */
function pickForBoard(board, context = {}) {
  const bigShapeRainActive = context.bigShapeRainActive ?? false;

  const evaluated = SHAPE_CATALOG.map((source) => ({
    source,
    placements: findValidPlacements(source, board),
  }));

  const placeable = evaluated.filter((e) => e.placements.length > 0);
  if (placeable.length === 0) return pickPureRandom();

  const picked = weightedPick(placeable, (e) => {
    let weight = 1 + Math.min(e.placements.length, 10) * 0.5;
    weight *= largeShapeMultiplier(e.source.cells.length, bigShapeRainActive);
    weight *= holeProneMultiplier(e.source.id);
    return weight;
  });
  return cloneShape(picked.source);
}

/**
 * Returns a set of 3 catalog shapes for the tray (duplicates allowed - as
 * in the original game). Without board - the original pure-random behavior
 * (e.g. the very first tray of a game when the board is guaranteed empty,
 * or a call with no board context). With board - "smart" generation
 * (R05.5): each of the 3 shapes is picked independently via pickForBoard,
 * looking at the same current board state (none of the three is placed
 * yet, same board for all three). If the board currently has a gap whose
 * shape exactly matches a catalog shape (findGapMatchingShape), one of the
 * three tray shapes is guaranteed to be that shape: player request - such a
 * "shape-shaped hole" shouldn't be left to chance, it should be filled by
 * the very next tray set.
 * @param {import('./board.js').Board} [board]
 * @param {{bigShapeRainActive?: boolean}} [context]
 * @returns {Shape[]}
 */
export function generateShapeSet(board, context) {
  const gapMatch = board ? findGapMatchingShape(board) : null;
  const result = [];
  for (let i = 0; i < 3; i++) {
    if (i === 0 && gapMatch) {
      result.push(cloneShape(gapMatch));
    } else {
      result.push(board ? pickForBoard(board, context) : pickPureRandom());
    }
  }
  return result;
}

export { SHAPE_CATALOG };
