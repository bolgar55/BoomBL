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
// В «затянувшейся» ситуации (см. effectiveComboBiasChance) этот шанс скрыто
// растёт — игрок этого не видит, просто чаще получает шанс на комбо.
const COMBO_BIAS_CHANCE = 0.25;
const COMBO_BIAS_CHANCE_MAX = 0.75; // даже в самой сложной ситуации не 100% — не убирать элемент случайности

// Единичная фигура-«зонд»: findValidPlacements(DOT_PROBE, board).length —
// ровно число пустых клеток поля (dot помещается в любую пустую клетку и
// никакую другую) — дешёвый способ оценить «тесноту» поля без отдельного
// метода Board для подсчёта пустых клеток.
const DOT_PROBE = { cells: [[0, 0]] };

function boardOpenness(board) {
  return findValidPlacements(DOT_PROBE, board).length / (BOARD_SIZE * BOARD_SIZE);
}

/**
 * Скрытая вероятность сузить выбор до «спасительных» фигур (R05.5, «скрытая
 * система вероятностей»): базовая COMBO_BIAS_CHANCE растёт, если игрок давно
 * не чистил линию (movesSinceClear) или поле уже тесное (openness — доля
 * свободных клеток) — то есть именно тогда, когда объективно сложно. Игрок
 * не видит эту вероятность и не может её просчитать — просто замечает, что
 * подходящие фигуры «иногда» приходят чаще, когда приходится тяжело.
 * @param {number} movesSinceClear
 * @param {number} openness
 * @returns {number}
 */
function effectiveComboBiasChance(movesSinceClear, openness) {
  let chance = COMBO_BIAS_CHANCE;
  if (movesSinceClear >= 6) chance = Math.max(chance, 0.65);
  else if (movesSinceClear >= 3) chance = Math.max(chance, 0.45);
  if (openness < 0.2) chance = Math.max(chance, 0.65);
  else if (openness < 0.35) chance = Math.max(chance, 0.45);
  return Math.min(chance, COMBO_BIAS_CHANCE_MAX);
}

// Волновой ритм размера фигур (R05.9): без него крупные фигуры (2×3/3×3)
// иногда «кучкуются» просто по случайности — игроку это ощущается как
// нечестный всплеск сложности в начале партии, а не как продуманный ритм.
// Вместо этого ведём фазу «крупных» / «мелких» фигур, которая двигается на
// каждую реально выданную фигуру: внутри фазы выбор всё ещё случайный (это
// множитель веса, а не жёсткий фильтр), просто крупные фигуры заметно чаще
// в фазе «крупных» и заметно реже — в фазе «мелких». Длина фазы случайна
// (не фиксированный период), чтобы ритм не ощущался метрономом и его нельзя
// было просчитать. Состояние — на весь модуль (одна партия в один момент
// времени в этой вкладке), resetWaveRhythm() зовёт app.js на новую партию.
const LARGE_SHAPE_CELLS = 6; // от rect-2x3 (6 клеток) и крупнее — «крупная» фигура
const PHASE_LENGTH_MIN = 8;
const PHASE_LENGTH_MAX = 14;

function randomPhaseLength() {
  return PHASE_LENGTH_MIN + Math.floor(Math.random() * (PHASE_LENGTH_MAX - PHASE_LENGTH_MIN + 1));
}

function freshWaveState() {
  return {
    phase: Math.random() < 0.5 ? 'large' : 'small',
    shapesLeftInPhase: randomPhaseLength(),
  };
}

let waveState = freshWaveState();

/** Сбрасывает волновой ритм размеров — вызывать на старте новой партии. */
export function resetWaveRhythm() {
  waveState = freshWaveState();
}

// Крупных фигур в каталоге всего 3 из 33 (rect-2x3-h/v, square-3x3) — при
// слабом множителе волна тонет в шуме случайного выбора и её не заметно на
// глаз, поэтому множители подобраны так, чтобы в фазе «крупных» они
// попадались действительно заметно чаще (~40% отдельных фигур лотка), а в
// фазе «мелких» — почти не попадались (~5%). Сама волна трогает только
// крупные фигуры — мелкие/средние между собой распределяются как раньше.
const LARGE_PHASE_BOOST = 7;
const SMALL_PHASE_SUPPRESS = 0.5;

/** Множитель веса по текущей фазе волны — влияет только на крупные фигуры. */
function waveMultiplier(cellCount) {
  if (cellCount < LARGE_SHAPE_CELLS) return 1;
  return waveState.phase === 'large' ? LARGE_PHASE_BOOST : SMALL_PHASE_SUPPRESS;
}

/** Продвигает волну на одну реально выданную фигуру — переключает фазу, когда та кончается. */
function advanceWave() {
  waveState.shapesLeftInPhase -= 1;
  if (waveState.shapesLeftInPhase <= 0) {
    waveState.phase = waveState.phase === 'large' ? 'small' : 'large';
    waveState.shapesLeftInPhase = randomPhaseLength();
  }
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
 * Выбирает одну фигуру каталога с учётом текущего поля и того, насколько
 * игроку сейчас тяжело (R05.5):
 * 1) сначала оставляет только фигуры, у которых есть хоть одна допустимая
 *    позиция на этом поле (findValidPlacements) — не выдаём заведомо
 *    непригодную фигуру, пока есть выбор;
 * 2) внутри этого набора вес фигуры растёт с числом её позиций («гибкие»
 *    фигуры, которые проще пристроить дальше, чуть более вероятны —
 *    «желательно отдавать фигуры, которые позволяют продолжать игру»), но
 *    каждая подходящая фигура всё равно имеет ненулевой шанс;
 * 3) с вероятностью effectiveComboBiasChance (тем выше, чем дольше нет
 *    очистки и чем теснее поле — «скрытая система вероятностей») сужает
 *    выбор до фигур, у которых хотя бы одна позиция немедленно очистила бы
 *    линию — «иногда отдавать фигуры для комбо», по-настоящему чаще именно
 *    в сложной ситуации, а не всегда одинаково;
 * 4) в этой же сложной ситуации (см. struggling) дополнительно взвешивает
 *    внутри пула по тому, СКОЛЬКО клеток очистила бы лучшая позиция фигуры —
 *    не просто «может дать комбо», а «даёт заметно освободить поле»
 *    («помогают открыть новые свободные области»);
 * 5) сверху ещё домножает вес на текущую фазу волнового ритма размеров
 *    (R05.9, waveMultiplier) — крупные фигуры (2×3/3×3) заметно чаще в фазе
 *    «крупных» и заметно реже в фазе «мелких», фазы случайной длины сменяют
 *    друг друга, чтобы крупные фигуры не кучковались случайно, а шли
 *    предсказуемым для ощущений, но не для расчёта, ритмом.
 * Если на поле физически не помещается ни одна фигура каталога (крайний
 * случай — доска уже фактически проиграна), возвращает чистый случайный
 * выбор: подбирать тут больше не из чего.
 * @param {import('./board.js').Board} board
 * @param {{movesSinceClear?: number}} [context] - сколько ходов подряд без очистки линии (app.js ведёт счётчик)
 * @returns {Shape}
 */
function pickForBoard(board, context = {}) {
  const movesSinceClear = context.movesSinceClear ?? 0;

  const evaluated = SHAPE_CATALOG.map((source) => {
    const placements = findValidPlacements(source, board);
    let bestClearSize = 0;
    for (const p of placements) {
      const cleared = board.previewClear(source, p.row, p.col).cells.length;
      if (cleared > bestClearSize) bestClearSize = cleared;
    }
    return { source, placements, bestClearSize };
  });

  const placeable = evaluated.filter((e) => e.placements.length > 0);
  if (placeable.length === 0) return pickPureRandom();

  const openness = boardOpenness(board);
  const struggling = movesSinceClear >= 3 || openness < 0.35;

  const comboCandidates = placeable.filter((e) => e.bestClearSize > 0);
  const biasChance = effectiveComboBiasChance(movesSinceClear, openness);
  const pool = comboCandidates.length > 0 && Math.random() < biasChance ? comboCandidates : placeable;

  const picked = weightedPick(pool, (e) => {
    let weight = 1 + Math.min(e.placements.length, 10) * 0.5;
    if (struggling) weight += e.bestClearSize * 0.8;
    weight *= waveMultiplier(e.source.cells.length);
    return weight;
  });
  advanceWave();
  return cloneShape(picked.source);
}

/**
 * Возвращает набор из 3 фигур каталога для лотка (могут повторяться — как
 * в оригинальной игре). Без board — прежнее чистое случайное поведение
 * (например, самый первый лоток партии, когда поле заведомо пустое, или
 * вызов без контекста поля). С board — «умная» генерация (R05.5): каждая
 * из 3 фигур подбирается через pickForBoard независимо, глядя на одно и то
 * же текущее состояние поля (все три ещё не размещены, поле одно и то же
 * для всех трёх). context.movesSinceClear (от app.js) включает более
 * настойчивую помощь, когда игрок давно не чистил линию.
 * @param {import('./board.js').Board} [board]
 * @param {{movesSinceClear?: number}} [context]
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
