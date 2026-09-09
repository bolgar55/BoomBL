// game/shapes.js
// Каталог фигур игры (spec §Решения 1): относительные координаты клеток от (0,0).
// Фигуры не вращаются (R10.1) — каждая ориентация внесена в каталог отдельной
// статической записью, в модуле нет функции поворота.
//
// Генерация лотка (R05.5) — не полностью случайная: анализирует текущее
// поле через game/board.js (findValidPlacements/canPlacePiece), чтобы не
// выдавать фигуры, которые вообще некуда поставить, пока на поле есть место.

import { BOARD_SIZE, findValidPlacements } from './board.js?v=0.4.6';

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

// ---------- «умная» генерация (упрощённая версия) ----------
// Раньше здесь было четыре независимые системы (скрытый шанс комбо-подсказки,
// доп. вес за «спасительность» хода, волна крупных фигур по случайным фазам,
// подавление неровных фигур), которые перемножались друг на другом и было
// трудно предсказать итоговое поведение — игрок прямо попросил облегчить.
// Теперь их две:
// 1) «гибкость» — вес растёт с числом позиций фигуры на поле (как и раньше);
// 2) единая «сложность партии» (0 → 1, растёт по числу поставленных фигур) —
//    в начале партии щедро даёт крупные фигуры и сильно давит неровные
//    (легко, приятно собирать комбо), к середине-концу партии смягчает и то,
//    и другое (труднее, но не читерски — крупные/неровные не запрещены,
//    просто не так сильно продвигаются). Жёсткий фильтр «есть хоть одна
//    допустимая позиция» (findValidPlacements) остаётся первым и решающим —
//    ни один из этих двух механизмов его не обходит.

// Сколько фигур нужно поставить за партию, чтобы сложность дошла до максимума.
const DIFFICULTY_RAMP_SHAPES = 50;

function difficultyFor(shapesPlacedThisGame) {
  return Math.min(1, shapesPlacedThisGame / DIFFICULTY_RAMP_SHAPES);
}

const LARGE_SHAPE_CELLS = 6; // от rect-2x3 (6 клеток) и крупнее — «крупная» фигура
const LARGE_BOOST_EARLY = 3; // множитель веса крупных фигур в начале партии
const LARGE_BOOST_LATE = 0.6; // множитель веса крупных фигур к концу нарастания сложности

/**
 * Множитель веса для крупных фигур — линейно едет от LARGE_BOOST_EARLY (щедро,
 * старт партии) к LARGE_BOOST_LATE (реже, ближе к максимуму сложности).
 * bigShapeRainActive (ивент «дождь крупных фигур», game/events.js) всегда
 * форсирует ранний щедрый буст, независимо от текущей сложности партии.
 */
function largeShapeMultiplier(cellCount, difficulty, bigShapeRainActive) {
  if (cellCount < LARGE_SHAPE_CELLS) return 1;
  if (bigShapeRainActive) return LARGE_BOOST_EARLY;
  return LARGE_BOOST_EARLY + (LARGE_BOOST_LATE - LARGE_BOOST_EARLY) * difficulty;
}

// «Неровные» фигуры — маленькие уголки-тримино (corner-1..4), большие уголки
// (пентамино-V, pentomino-v-1..4), зигзаги (S/Z-тетромино), L- и Т-тетромино —
// тайлятся хуже прямых/прямоугольных фигур того же размера и чаще оставляют
// дыры в 1-2 клетки. Не убираем совсем — вес едет от HOLE_PRONE_SUPPRESS_EARLY
// (сильно подавлены, начало партии — легко) до HOLE_PRONE_SUPPRESS_LATE
// (почти не подавлены — ближе к максимуму сложности).
const HOLE_PRONE_SHAPE_IDS = new Set([
  'corner-1', 'corner-2', 'corner-3', 'corner-4',
  'pentomino-v-1', 'pentomino-v-2', 'pentomino-v-3', 'pentomino-v-4',
  'tetromino-s-h', 'tetromino-s-v', 'tetromino-z-h', 'tetromino-z-v',
  'tetromino-l-1', 'tetromino-l-2', 'tetromino-l-3', 'tetromino-l-4',
  'tetromino-t-1', 'tetromino-t-2', 'tetromino-t-3', 'tetromino-t-4',
]);
const HOLE_PRONE_SUPPRESS_EARLY = 0.15;
const HOLE_PRONE_SUPPRESS_LATE = 0.6;

/** Множитель веса для «неровных» фигур — 1 для всех остальных. */
function holeProneMultiplier(id, difficulty) {
  if (!HOLE_PRONE_SHAPE_IDS.has(id)) return 1;
  return HOLE_PRONE_SUPPRESS_EARLY + (HOLE_PRONE_SUPPRESS_LATE - HOLE_PRONE_SUPPRESS_EARLY) * difficulty;
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
 * 3) домножает на largeShapeMultiplier и holeProneMultiplier — оба зависят
 *    от текущей сложности партии (см. difficultyFor выше).
 * Если на поле физически не помещается ни одна фигура каталога (крайний
 * случай — доска уже фактически проиграна), возвращает чистый случайный
 * выбор: подбирать тут больше не из чего.
 * @param {import('./board.js').Board} board
 * @param {{shapesPlacedThisGame?: number, bigShapeRainActive?: boolean}} [context] - shapesPlacedThisGame: сколько фигур уже поставлено в этой партии (двигает сложность); bigShapeRainActive: активен ли ивент «дождь крупных фигур» (game/events.js)
 * @returns {Shape}
 */
function pickForBoard(board, context = {}) {
  const difficulty = difficultyFor(context.shapesPlacedThisGame ?? 0);
  const bigShapeRainActive = context.bigShapeRainActive ?? false;

  const evaluated = SHAPE_CATALOG.map((source) => ({
    source,
    placements: findValidPlacements(source, board),
  }));

  const placeable = evaluated.filter((e) => e.placements.length > 0);
  if (placeable.length === 0) return pickPureRandom();

  const picked = weightedPick(placeable, (e) => {
    let weight = 1 + Math.min(e.placements.length, 10) * 0.5;
    weight *= largeShapeMultiplier(e.source.cells.length, difficulty, bigShapeRainActive);
    weight *= holeProneMultiplier(e.source.id, difficulty);
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
 * для всех трёх).
 * @param {import('./board.js').Board} [board]
 * @param {{shapesPlacedThisGame?: number, bigShapeRainActive?: boolean}} [context]
 * @returns {Shape[]}
 */
export function generateShapeSet(board, context) {
  const result = [];
  for (let i = 0; i < 3; i++) {
    result.push(board ? pickForBoard(board, context) : pickPureRandom());
  }
  return result;
}

export { SHAPE_CATALOG };
