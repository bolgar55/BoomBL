// Тесты для ui/input.js — только чистая логика (без DOM/touch): определение
// допустимости позиции при перетаскивании и поиск подсказки. Рендеринг и
// обработчики указателя не тестируются (см. interfaces.md, «Швы для тестов»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, BOARD_SIZE } from '../game/board.js';
import { isValidDrop, findHint } from './input.js';

test('isValidDrop: недопустимая позиция, если курсор ещё не над полем (row/col не заданы)', () => {
  const board = new Board();
  const shape = { cells: [[0, 0]] };
  assert.equal(isValidDrop(board, shape, null, null), false);
  assert.equal(isValidDrop(board, shape, undefined, undefined), false);
});

test('isValidDrop: делегирует проверку board.canPlace для реальных координат', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  board.place(dot, 2, 2); // клетка (2,2) занята

  const domino = { cells: [[0, 0], [0, 1]] };
  // (2,2) занято — недопустимо
  assert.equal(isValidDrop(board, domino, 2, 2), false);
  // (0,0)-(0,1) свободны — допустимо
  assert.equal(isValidDrop(board, domino, 0, 0), true);
});

test('findHint: null, если ни одна фигура ни в одной позиции не помещается', () => {
  // мок-доска — canPlace всегда false, не зависит от реализации game/board.js
  const board = { canPlace: () => false };
  const shapes = [{ cells: [[0, 0]] }, { cells: [[0, 0], [0, 1]] }];
  assert.equal(findHint(board, shapes), null);
});

test('findHint: возвращает первую валидную позицию в порядке фигура→строка→колонка', () => {
  // мок-доска: допустима ровно одна комбинация — 2-я фигура (индекс 1), (row=2, col=5).
  // Если бы findHint возвращал первое попавшееся вместо строгого порядка обхода,
  // тест бы это не заметил — поэтому комбинация далеко не первая по каждому измерению.
  const board = {
    canPlace: (shape, row, col) => shape.id === 'target' && row === 2 && col === 5,
  };
  const shapes = [
    { id: 'other' },
    { id: 'target' },
  ];
  assert.deepEqual(findHint(board, shapes), { shapeIndex: 1, row: 2, col: 5 });
});

test('findHint: пропускает пустые (уже поставленные) слоты лотка', () => {
  const board = { canPlace: () => true };
  const shapes = [null, { id: 'only' }];
  assert.deepEqual(findHint(board, shapes), { shapeIndex: 1, row: 0, col: 0 });
});

test('findHint: на реальной доске — доминошка не влезает в шахматный паттерн, а точка влезает', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  // занимаем клетки шахматным паттерном (row+col чётно) — ни одна строка и ни один
  // столбец при этом не заполняются целиком (по 4 занятых клетки из 8), очистки не будет.
  // На таком поле любые две соседние клетки — одна занята, другая свободна, поэтому
  // 2-клеточная доминошка не помещается в принципе ни в одну позицию.
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((r + c) % 2 === 0) board.place(dot, r, c);
    }
  }
  const dominoH = { cells: [[0, 0], [0, 1]] };
  assert.equal(findHint(board, [dominoH]), null);
  // первая свободная клетка при обходе сверху вниз, слева направо — (0,1)
  assert.deepEqual(findHint(board, [dominoH, dot]), { shapeIndex: 1, row: 0, col: 1 });
});
