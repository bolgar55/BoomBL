// Тесты для game/score.js — формула очков и серия комбо (spec §Решения 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Score } from './score.js';

test('постановка фигуры без очистки линий: +1 очко за клетку, серия не растёт', () => {
  const score = new Score();
  const result = score.addMove({ cellsPlaced: 4, linesCleared: 0 });
  // 4 клетки × 1 очко, множитель серии 1 (серия = 0)
  assert.deepEqual(result, { points: 4, comboStreak: 0 });
});

test('очистка одной линии: 10×1² очков, серия становится 1, множитель ×1.1', () => {
  const score = new Score();
  const result = score.addMove({ cellsPlaced: 3, linesCleared: 1 });
  // (3 + 10×1) × 1.1 = 13 × 1.1 = 14.3 → floor 14
  assert.deepEqual(result, { points: 14, comboStreak: 1 });
});

test('очистка нескольких линий одним ходом: 10×N², N=2', () => {
  const score = new Score();
  const result = score.addMove({ cellsPlaced: 2, linesCleared: 2 });
  // (2 + 10×4) × 1.1 = 42 × 1.1 = 46.2 → floor 46 (это первый очищающий ход, серия = 1)
  assert.deepEqual(result, { points: 46, comboStreak: 1 });
});

test('серия растёт при подряд идущих очищающих ходах и увеличивает множитель', () => {
  const score = new Score();
  score.addMove({ cellsPlaced: 3, linesCleared: 1 }); // серия → 1
  const second = score.addMove({ cellsPlaced: 2, linesCleared: 1 });
  // серия → 2, множитель 1.2: (2 + 10) × 1.2 = 14.4 → floor 14
  assert.deepEqual(second, { points: 14, comboStreak: 2 });
});

test('ход без очистки сбрасывает серию в 0', () => {
  const score = new Score();
  score.addMove({ cellsPlaced: 3, linesCleared: 1 }); // серия → 1
  score.addMove({ cellsPlaced: 2, linesCleared: 1 }); // серия → 2
  const third = score.addMove({ cellsPlaced: 5, linesCleared: 0 }); // сброс серии
  assert.deepEqual(third, { points: 5, comboStreak: 0 });
});

test('reset() сбрасывает серию комбо', () => {
  const score = new Score();
  score.addMove({ cellsPlaced: 3, linesCleared: 1 }); // серия → 1
  score.reset();
  const afterReset = score.addMove({ cellsPlaced: 1, linesCleared: 1 });
  // после reset серия начинается заново: → 1, множитель 1.1
  assert.deepEqual(afterReset, { points: 12, comboStreak: 1 });
});
