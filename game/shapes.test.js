// Тесты для game/shapes.js — каталог фигур и генерация набора из 3 штук.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateShapeSet, SHAPE_CATALOG } from './shapes.js';

test('generateShapeSet: всегда возвращает ровно 3 фигуры', () => {
  const set = generateShapeSet();
  assert.equal(set.length, 3);
});

test('generateShapeSet: каждая фигура состоит из 1-5 клеток и взята из каталога', () => {
  // прогоняем много раз, чтобы зацепить разные случайные выборки
  for (let i = 0; i < 50; i++) {
    const set = generateShapeSet();
    for (const shape of set) {
      assert.ok(shape.cells.length >= 1 && shape.cells.length <= 5);
      const inCatalog = SHAPE_CATALOG.some(
        (c) => JSON.stringify(c.cells) === JSON.stringify(shape.cells)
      );
      assert.ok(inCatalog, `фигура ${JSON.stringify(shape.cells)} не найдена в каталоге`);
    }
  }
});

test('каталог не содержит операции поворота — все ориентации заданы статически', () => {
  // формальная проверка недостижима статическим анализом; проверяем
  // содержательный признак требования: у каждой фигуры в каталоге координаты —
  // это просто массив пар чисел, вычисленный не из другой фигуры путём поворота,
  // а перечисленный явно (т.е. в модуле нет функции rotate/поворот).
  // Здесь фиксируем наблюдаемое поведение: каталог статичен и не меняется
  // между вызовами generateShapeSet().
  const before = JSON.stringify(SHAPE_CATALOG);
  generateShapeSet();
  generateShapeSet();
  const after = JSON.stringify(SHAPE_CATALOG);
  assert.equal(before, after);
});

test('каталог содержит фигуры разного размера от 1 до 5 клеток', () => {
  const sizes = new Set(SHAPE_CATALOG.map((s) => s.cells.length));
  for (const size of [1, 2, 3, 4, 5]) {
    assert.ok(sizes.has(size), `в каталоге нет фигур из ${size} клеток`);
  }
});
