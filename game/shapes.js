// game/shapes.js
// Каталог фигур игры (spec §Решения 1): относительные координаты клеток от (0,0).
// Фигуры не вращаются (R10.1) — каждая ориентация внесена в каталог отдельной
// статической записью, в модуле нет функции поворота.
//
// Генерация лотка (R05.5) — не полностью случайная: анализирует текущее
// поле через game/board.js (findValidPlacements/canPlacePiece), чтобы не
// выдавать фигуры, которые вообще некуда поставить, пока на поле есть место.

import { BOARD_SIZE, findValidPlacements } from './board.js';

/**
 * @typedef {{ id: string, cells: number[][] }} Shape
 * cells — массив пар [row, col], относительные координаты занятых клеток фигуры.
 */

/** @type {Shape[]} */
const SHAPE_CATALOG = [
  // Точка (1 клетка)
  { id: 'dot', cells: [[0, 0]] },

  // Домино (2 клетки)
  { id: 'domino-h', cells: [[0, 0], [0, 1]] },
  { id: 'domino-v', cells: [[0, 0], [1, 0]] },

  // Тримино-линия (3 клетки)
  { id: 'tromino-h', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'tromino-v', cells: [[0, 0], [1, 0], [2, 0]] },

  // Уголок (3 клетки, 4 ориентации)
  { id: 'corner-1', cells: [[0, 0], [0, 1], [1, 0]] },
  { id: 'corner-2', cells: [[0, 0], [0, 1], [1, 1]] },
  { id: 'corner-3', cells: [[0, 1], [1, 0], [1, 1]] },
  { id: 'corner-4', cells: [[0, 0], [1, 0], [1, 1]] },

  // Квадрат 2×2 (4 клетки)
  { id: 'square', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },

  // Тетрамино-линия (4 клетки)
  { id: 'tetromino-i-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'tetromino-i-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },

  // Тетрамино L (4 клетки, 4 ориентации)
  { id: 'tetromino-l-1', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'tetromino-l-2', cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
  { id: 'tetromino-l-3', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { id: 'tetromino-l-4', cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },

  // Тетрамино T (4 клетки, 4 ориентации)
  { id: 'tetromino-t-1', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 'tetromino-t-2', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { id: 'tetromino-t-3', cells: [[1, 0], [1, 1], [1, 2], [0, 1]] },
  { id: 'tetromino-t-4', cells: [[0, 1], [1, 0], [1, 1], [2, 1]] },

  // Тетрамино S/Z (4 клетки, по 2 ориентации)
  { id: 'tetromino-s-h', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: 'tetromino-s-v', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { id: 'tetromino-z-h', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 'tetromino-z-v', cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },

  // Пентамино-линия (5 клеток)
  { id: 'pentomino-i-h', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'pentomino-i-v', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },

  // Пентамино-уголок (5 клеток, 4 ориентации)
  { id: 'pentomino-v-1', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
  { id: 'pentomino-v-2', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'pentomino-v-3', cells: [[0, 2], [1, 2], [2, 2], [2, 1], [2, 0]] },
  { id: 'pentomino-v-4', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },

  // Прямоугольник 2×3 (6 клеток, 2 ориентации)
  {
    id: 'rect-2x3-h',
    cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  },
  {
    id: 'rect-2x3-v',
    cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]],
  },

  // Квадрат 3×3 (9 клеток)
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

/** Случайный выбор одной фигуры каталога без учёта поля — прежнее чистое поведение. */
function pickPureRandom() {
  return cloneShape(SHAPE_CATALOG[Math.floor(Math.random() * SHAPE_CATALOG.length)]);
}

// Доля попыток, когда генератор намеренно предпочитает фигуру, у которой
// хотя бы одна позиция создаёт комбо-очистку (R05.5, «иногда отдавать
// фигуры для комбо») — не всегда, чтобы игра оставалась непредсказуемой.
const COMBO_BIAS_CHANCE = 0.25;

/** Взвешенный случайный выбор — chance каждого элемента пропорционален его весу. */
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
 * Выбирает одну фигуру каталога с учётом текущего поля (R05.5):
 * 1) сначала оставляет только фигуры, у которых есть хоть одна допустимая
 *    позиция на этом поле (canPlacePiece/findValidPlacements) — не выдаём
 *    заведомо непригодную фигуру, пока есть выбор;
 * 2) внутри этого набора вес фигуры растёт с числом её позиций («гибкие»
 *    фигуры, которые проще пристроить дальше, чуть более вероятны — «желательно
 *    отдавать фигуры, которые позволяют продолжать игру»), но каждая
 *    подходящая фигура всё равно имеет ненулевой шанс — генерация не должна
 *    становиться слишком предсказуемой или упрощать игру;
 * 3) иногда (COMBO_BIAS_CHANCE) сознательно сужает выбор до фигур, у которых
 *    хотя бы одна позиция немедленно очистила бы линию — «иногда отдавать
 *    фигуры для комбо», не каждый раз.
 * Если на поле физически не помещается ни одна фигура каталога (крайний
 * случай — доска уже фактически проиграна), возвращает чистый случайный
 * выбор: подбирать тут больше не из чего.
 * @param {import('./board.js').Board} board
 * @returns {Shape}
 */
function pickForBoard(board) {
  const evaluated = SHAPE_CATALOG.map((source) => {
    const placements = findValidPlacements(source, board);
    const comboCapable = placements.some((p) => board.previewClear(source, p.row, p.col).cells.length > 0);
    return { source, placements, comboCapable };
  });

  const placeable = evaluated.filter((e) => e.placements.length > 0);
  if (placeable.length === 0) return pickPureRandom();

  const comboCandidates = placeable.filter((e) => e.comboCapable);
  const pool = comboCandidates.length > 0 && Math.random() < COMBO_BIAS_CHANCE ? comboCandidates : placeable;

  const picked = weightedPick(pool, (e) => 1 + Math.min(e.placements.length, 10) * 0.5);
  return cloneShape(picked.source);
}

/**
 * Возвращает набор из 3 фигур каталога для лотка (могут повторяться — как
 * в оригинальной игре). Без board — прежнее чистое случайное поведение
 * (например, самый первый лоток партии, когда поле заведомо пустое, или
 * вызов без контекста поля). С board — «умная» генерация (R05.5): каждая
 * из 3 фигур подбирается через pickForBoard независимо, глядя на одно и то
 * же текущее состояние поля (все три ещё не размещены, поле одно и то же
 * для всех трёх).
 * @param {import('./board.js').Board} [board]
 * @returns {Shape[]}
 */
export function generateShapeSet(board) {
  const result = [];
  for (let i = 0; i < 3; i++) {
    result.push(board ? pickForBoard(board) : pickPureRandom());
  }
  return result;
}

export { SHAPE_CATALOG };
