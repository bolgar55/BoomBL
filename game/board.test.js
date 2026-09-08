// Тесты для game/board.js — проверка размещения фигур и очистки линий на поле 8×8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, BOARD_SIZE } from './board.js';

test('canPlace: успешная постановка в свободную позицию', () => {
  const board = new Board();
  const shape = { cells: [[0, 0], [0, 1]] }; // домино 1×2
  assert.equal(board.canPlace(shape, 0, 0), true);
});

test('canPlace: отказ при выходе за границу поля', () => {
  const board = new Board();
  const shape = { cells: [[0, 0], [0, 1], [0, 2]] }; // тримино в ряд, 3 клетки
  // последняя клетка попала бы в колонку 9 — за пределами сетки 8×8 (индексы 0..7)
  assert.equal(board.canPlace(shape, 0, 7), false);
});

test('canPlace: отказ при занятой клетке', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  board.place(dot, 3, 3);
  const domino = { cells: [[0, 0], [0, 1]] };
  // клетка (3,3) уже занята точкой выше
  assert.equal(board.canPlace(domino, 3, 3), false);
});

test('place: очистка одной полностью заполненной строки', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  // заполняем всю строку 0, кроме последней клетки (0,7)
  for (let c = 0; c < BOARD_SIZE - 1; c++) {
    board.place(dot, 0, c);
  }
  const result = board.place(dot, 0, BOARD_SIZE - 1);
  assert.deepEqual(result.clearedRows, [0]);
  assert.deepEqual(result.clearedCols, []);
  // после очистки клетка вновь свободна
  assert.equal(board.canPlace(dot, 0, 0), true);
});

test('place: одновременная очистка строки и столбца одним ходом даёт один результат', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  // заполняем строку 0 полностью, кроме клетки (0,0)
  for (let c = 1; c < BOARD_SIZE; c++) {
    board.place(dot, 0, c);
  }
  // заполняем столбец 0 полностью, кроме клетки (0,0)
  for (let r = 1; r < BOARD_SIZE; r++) {
    board.place(dot, r, 0);
  }
  // последний ход в (0,0) закрывает и строку 0, и столбец 0 одновременно
  const result = board.place(dot, 0, 0);
  assert.deepEqual(result.clearedRows, [0]);
  assert.deepEqual(result.clearedCols, [0]);
});

test('canFitAnywhere: false, когда ни одна из фигур не помещается никуда', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  // заполняем всё поле точками, кроме диагонали (r === c): по одной свободной
  // клетке в каждой строке и в каждом столбце — ни одна строка/столбец не
  // достигает полного заполнения по ходу расстановки, поэтому place() ничего
  // не очищает и итоговое состояние предсказуемо (иначе очистка линии сама
  // освободила бы клетки прямо во время заполнения).
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (r === c) continue;
      board.place(dot, r, c);
    }
  }
  // свободны только 8 изолированных клеток по диагонали — ни одна фигура
  // крупнее точки не найдёт двух свободных клеток в одной строке/столбце
  const domino = { cells: [[0, 0], [0, 1]] };
  const dominoV = { cells: [[0, 0], [1, 0]] };
  const square = { cells: [[0, 0], [0, 1], [1, 0], [1, 1]] };
  assert.equal(board.canFitAnywhere([domino, dominoV, square]), false);
});

test('canFitAnywhere: true, когда есть хотя бы одна валидная позиция', () => {
  const board = new Board();
  const dot = { cells: [[0, 0]] };
  // то же поле с диагональю свободных клеток: крупные фигуры не помещаются,
  // но точка (1 клетка) помещается в любую из 8 свободных клеток диагонали
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (r === c) continue;
      board.place(dot, r, c);
    }
  }
  const domino = { cells: [[0, 0], [0, 1]] };
  assert.equal(board.canFitAnywhere([domino, domino, dot]), true);
});
