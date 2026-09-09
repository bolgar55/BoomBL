// game/shapes.js
// Каталог фигур игры (spec §Решения 1): относительные координаты клеток от (0,0).
// Фигуры не вращаются (R10.1) — каждая ориентация внесена в каталог отдельной
// статической записью, в модуле нет функции поворота.
//
// Генерация лотка (R05.5) — не полностью случайная: анализирует текущее
// поле через game/board.js (findValidPlacements/canPlacePiece), чтобы не
// выдавать фигуры, которые вообще некуда поставить, пока на поле есть место.

import { BOARD_SIZE, findValidPlacements } from './board.js?v=0.4.9';

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

// Сдвигает клетки так, чтобы минимальные row/col стали 0, и сортирует —
// два одинаковых по форме набора клеток после этого сравниваются просто
// поэлементно, независимо от исходных координат/порядка.
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

// Пробелы крупнее самой большой фигуры каталога (9 клеток, square-3x3) точно
// не могут совпасть ни с одной фигурой целиком — не тратим на них сравнение.
const MAX_MATCHABLE_POCKET_SIZE = 9;

/**
 * Ищет на поле изолированный пробел (Board.findAllEnclosedPockets), форма
 * которого В ТОЧНОСТИ совпадает с какой-то фигурой каталога (фигуры не
 * вращаются, R10.1 — совпадение только в исходной ориентации) — игрок
 * попросил: если есть «дыра» под конкретную фигуру, эта фигура должна скоро
 * появиться в лотке, а не просто когда-нибудь повезёт. Возвращает первую
 * найденную такую фигуру или null, если подходящих пробелов нет.
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

// ---------- «умная» генерация (упрощённая версия) ----------
// Раньше здесь было четыре независимые системы (скрытый шанс комбо-подсказки,
// доп. вес за «спасительность» хода, волна крупных фигур по случайным фазам,
// подавление неровных фигур), которые перемножались друг на другом и было
// трудно предсказать итоговое поведение — игрок попросил облегчить. Была
// промежуточная версия с растущей по ходу партии «сложностью» (0→1), но она
// на максимуме навсегда застревала в тяжёлом режиме до конца длинной партии —
// тоже не вариант, убрали и её. Теперь всего одна система:
// «гибкость» — вес фигуры растёт с числом её позиций на поле, плюс два
// постоянных множителя (крупные фигуры чуть чаще, неровные — заметно реже)
// без всякой прогрессии по ходу партии. Жёсткий фильтр «есть хоть одна
// допустимая позиция» (findValidPlacements) остаётся первым и решающим.

const LARGE_SHAPE_CELLS = 6; // от rect-2x3 (6 клеток) и крупнее — «крупная» фигура
const LARGE_SHAPE_BOOST = 3; // постоянный множитель веса крупных фигур
const LARGE_SHAPE_BOOST_EVENT = 7; // множитель во время ивента «дождь крупных фигур»

/**
 * Множитель веса для крупных фигур — постоянный (без прогрессии по партии),
 * но ощутимо выше во время ивента «дождь крупных фигур» (game/events.js), иначе
 * сам ивент был бы неотличим от обычной игры.
 */
function largeShapeMultiplier(cellCount, bigShapeRainActive) {
  if (cellCount < LARGE_SHAPE_CELLS) return 1;
  return bigShapeRainActive ? LARGE_SHAPE_BOOST_EVENT : LARGE_SHAPE_BOOST;
}

// «Неровные» фигуры — маленькие уголки-тримино (corner-1..4), большие уголки
// (пентамино-V, pentomino-v-1..4), зигзаги (S/Z-тетромино), L- и Т-тетромино —
// тайлятся хуже прямых/прямоугольных фигур того же размера и чаще оставляют
// дыры в 1-2 клетки. Не убираем совсем — просто постоянно снижаем вес выбора,
// без прогрессии по ходу партии.
const HOLE_PRONE_SHAPE_IDS = new Set([
  'corner-1', 'corner-2', 'corner-3', 'corner-4',
  'pentomino-v-1', 'pentomino-v-2', 'pentomino-v-3', 'pentomino-v-4',
  'tetromino-s-h', 'tetromino-s-v', 'tetromino-z-h', 'tetromino-z-v',
  'tetromino-l-1', 'tetromino-l-2', 'tetromino-l-3', 'tetromino-l-4',
  'tetromino-t-1', 'tetromino-t-2', 'tetromino-t-3', 'tetromino-t-4',
]);
const HOLE_PRONE_SUPPRESS = 0.2;

/** Множитель веса для «неровных» фигур — 1 для всех остальных. */
function holeProneMultiplier(id) {
  return HOLE_PRONE_SHAPE_IDS.has(id) ? HOLE_PRONE_SUPPRESS : 1;
}

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
 *    позиция на этом поле (findValidPlacements) — не выдаём заведомо
 *    непригодную фигуру, пока есть выбор;
 * 2) вес растёт с числом позиций фигуры («гибкие» фигуры чуть вероятнее);
 * 3) домножает на largeShapeMultiplier и holeProneMultiplier — оба постоянны
 *    весь ход партии, без прогрессии.
 * Если на поле физически не помещается ни одна фигура каталога (крайний
 * случай — доска уже фактически проиграна), возвращает чистый случайный
 * выбор: подбирать тут больше не из чего.
 * @param {import('./board.js').Board} board
 * @param {{bigShapeRainActive?: boolean}} [context] - bigShapeRainActive: активен ли ивент «дождь крупных фигур» (game/events.js)
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
 * Возвращает набор из 3 фигур каталога для лотка (могут повторяться — как
 * в оригинальной игре). Без board — прежнее чистое случайное поведение
 * (например, самый первый лоток партии, когда поле заведомо пустое, или
 * вызов без контекста поля). С board — «умная» генерация (R05.5): каждая
 * из 3 фигур подбирается через pickForBoard независимо, глядя на одно и то
 * же текущее состояние поля (все три ещё не размещены, поле одно и то же
 * для всех трёх). Если на поле прямо сейчас есть пробел, форма которого
 * точно совпадает с какой-то фигурой каталога (findGapMatchingShape), одна
 * из трёх фигур лотка гарантированно — именно она: игрок попросил, чтобы
 * такая «дыра под фигуру» не оставалась на волю случая, а закрывалась уже
 * следующим набором лотка.
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
