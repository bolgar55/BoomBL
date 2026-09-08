// ui/input.js
// Ввод игрока: перетаскивание фигуры на поле мышью и пальцем через единый
// Pointer Events API (он абстрагирует mouse/touch/pen одним набором событий,
// поэтому отдельная touch-обвязка не нужна), плюс логика подсказки.
// Модуль не хранит состояние партии — работает поверх board/shapes,
// которые ему передаёт вызывающий код (index.html).
//
// Чистая логика (проверка допустимости позиции, поиск подсказки) вынесена в
// отдельные экспортируемые функции и покрыта тестами в input.test.js.
// DOM-обвязка (attachDragAndDrop) не тестируется юнит-тестами — см.
// interfaces.md, раздел «Швы для тестов»: ui проверяется вручную при ревью.

import { BOARD_SIZE } from '../game/board.js';
import { computeCellSize, pixelToCell, drawShapeGhost } from './render.js';

/**
 * Определяет, допустима ли позиция для фигуры прямо сейчас. Это и есть шов
 * «определение недопустимой позиции при драге»: во время перетаскивания
 * курсор/палец может быть ещё вне поля (row/col не определены) — такая
 * позиция всегда недопустима; иначе решение делегируется board.canPlace.
 * @param {{canPlace(shape:object, row:number, col:number): boolean}} board
 * @param {{cells:number[][]}} shape
 * @param {number|null|undefined} row
 * @param {number|null|undefined} col
 * @returns {boolean}
 */
export function isValidDrop(board, shape, row, col) {
  if (row === null || row === undefined || col === null || col === undefined) {
    return false;
  }
  return board.canPlace(shape, row, col);
}

/**
 * Ищет первую валидную позицию для одной из фигур лотка — используется
 * кнопкой «Подсказка» (R15). Порядок обхода фиксирован и детерминирован:
 * сначала по фигурам в порядке лотка, для каждой — по клеткам поля сверху
 * вниз, слева направо. Пустые слоты лотка (null — фигура уже поставлена)
 * пропускаются.
 * @param {{canPlace(shape:object, row:number, col:number): boolean}} board
 * @param {({cells:number[][]}|null)[]} shapes
 * @returns {{shapeIndex:number, row:number, col:number}|null}
 */
export function findHint(board, shapes) {
  for (let shapeIndex = 0; shapeIndex < shapes.length; shapeIndex++) {
    const shape = shapes[shapeIndex];
    if (!shape) continue;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board.canPlace(shape, row, col)) {
          return { shapeIndex, row, col };
        }
      }
    }
  }
  return null;
}

/** Клетки поля, которые заняла бы фигура при постановке в (row, col). */
export function shapeCells(shape, row, col) {
  return shape.cells.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
}

/** Габариты фигуры в клетках (ширина/высота её ограничивающего прямоугольника). */
export function shapeBounds(shape) {
  let maxRow = 0;
  let maxCol = 0;
  for (const [r, c] of shape.cells) {
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  return { width: maxCol + 1, height: maxRow + 1 };
}

/**
 * Подключает drag-and-drop к слотам лотка и полю через Pointer Events.
 * DOM-обвязка — проверяется вручную при ревью, не юнит-тестами.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.boardCanvas - канвас поля (для координат и размера)
 * @param {HTMLCanvasElement} opts.dragCanvas - overlay-канвас для «призрака» фигуры
 * @param {HTMLElement[]} opts.trayEls - канвасы слотов лотка (data-index = индекс фигуры)
 * @param {() => object} opts.getBoard - текущий Board
 * @param {() => (object|null)[]} opts.getShapes - текущие фигуры лотка (с цветами через getShapeColor)
 * @param {(index:number) => string} opts.getShapeColor - цвет фигуры по индексу лотка
 * @param {() => number} opts.getCellSize - текущий размер клетки поля в пикселях
 * @param {() => boolean} opts.isLocked - блокировка ввода (например, game over)
 * @param {(highlight: {row:number, col:number, valid:boolean}[]) => void} opts.onHover
 * @param {() => void} opts.onHoverEnd
 * @param {(shapeIndex:number, row:number, col:number) => void} opts.onDrop
 * @param {(shapeIndex:number) => void} opts.onInvalidDrop
 */
export function attachDragAndDrop({
  boardCanvas,
  dragCanvas,
  trayEls,
  getBoard,
  getShapes,
  getShapeColor,
  getCellSize,
  isLocked,
  onHover,
  onHoverEnd,
  onDrop,
  onInvalidDrop,
}) {
  const dragCtx = dragCanvas.getContext('2d');
  let dragging = null;

  function boardRelativePoint(event) {
    const rect = boardCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function updateDrag(event) {
    if (!dragging) return;
    const cellSize = getCellSize();
    const { x, y } = boardRelativePoint(event);
    const bounds = shapeBounds(dragging.shape);
    // якорь фигуры — под точкой касания, приподнят и отцентрован по ширине,
    // чтобы палец не закрывал клетку постановки
    const anchorX = x - (bounds.width / 2) * cellSize;
    const anchorY = y - (bounds.height / 2 + 1.2) * cellSize;
    const { row, col } = pixelToCell(anchorX, anchorY, cellSize);
    dragging.row = row;
    dragging.col = col;

    const board = getBoard();
    const valid = isValidDrop(board, dragging.shape, row, col);

    dragCtx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    drawShapeGhost(dragCtx, dragging.shape, row, col, cellSize, dragging.color);

    onHover(shapeCells(dragging.shape, row, col).map((c) => ({ ...c, valid })));
  }

  function finishDrag(commit) {
    if (!dragging) return;
    const { shapeIndex, shape, row, col, el } = dragging;
    el.classList.remove('tray-slot--dragging');
    dragCtx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    dragging = null;
    onHoverEnd();

    if (!commit) return;
    const board = getBoard();
    if (isValidDrop(board, shape, row, col)) {
      onDrop(shapeIndex, row, col);
    } else {
      onInvalidDrop(shapeIndex);
    }
  }

  trayEls.forEach((el) => {
    el.addEventListener('pointerdown', (event) => {
      if (isLocked && isLocked()) return;
      const shapeIndex = Number(el.dataset.index);
      const shapes = getShapes();
      const shape = shapes[shapeIndex];
      if (!shape) return;
      el.setPointerCapture(event.pointerId);
      dragging = {
        pointerId: event.pointerId,
        shapeIndex,
        shape,
        color: getShapeColor(shapeIndex),
        el,
        row: null,
        col: null,
      };
      el.classList.add('tray-slot--dragging');
      updateDrag(event);
      event.preventDefault();
    });
  });

  document.addEventListener('pointermove', (event) => {
    if (dragging && event.pointerId === dragging.pointerId) updateDrag(event);
  });
  document.addEventListener('pointerup', (event) => {
    if (dragging && event.pointerId === dragging.pointerId) finishDrag(true);
  });
  document.addEventListener('pointercancel', (event) => {
    if (dragging && event.pointerId === dragging.pointerId) finishDrag(false);
  });
}

// экспортируем на случай, если вызывающему коду нужен тот же расчёт размера клетки
export { computeCellSize };
