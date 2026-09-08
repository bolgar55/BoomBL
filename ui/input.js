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

/** Клетка приподнимается над пальцем/курсором на столько клеток, чтобы игрок видел всю фигуру. */
const LIFT_CELLS = 1.2;
// Коэффициент сглаживания следования за курсором (0..1 за кадр) — чем выше,
// тем «резче» отклик; 0.32 даёт плавное, но не «резиновое» следование.
const FOLLOW_EASE = 0.32;
const LAND_MS = 140; // анимация посадки в валидную позицию
const RETURN_MS = 200; // анимация возврата в лоток при недопустимой позиции

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/** Пересекает ли ограничивающий прямоугольник фигуры в (row, col) сетку поля хоть немного. */
function overlapsBoard(row, col, bounds) {
  return (
    row + bounds.height > 0 &&
    row < BOARD_SIZE &&
    col + bounds.width > 0 &&
    col < BOARD_SIZE
  );
}

/**
 * Подключает drag-and-drop к слотам лотка и полю через Pointer Events.
 * Перетаскиваемая фигура рисуется один раз в overlay-canvas (dragCanvas,
 * position:fixed — см. style.css) и дальше просто двигается transform'ом:
 * плавно следует за курсором/пальцем по всему экрану (не только над полем),
 * а при отпускании либо красиво «влетает» в клетку поля, либо возвращается
 * в лоток — обе анимации через requestAnimationFrame с ease-out.
 * DOM-обвязка — проверяется вручную при ревью, не юнит-тестами.
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.boardCanvas - канвас поля (для координат и размера)
 * @param {HTMLCanvasElement} opts.dragCanvas - fixed-overlay канвас перетаскиваемой фигуры
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
  const floatCanvas = dragCanvas;
  const floatCtx = floatCanvas.getContext('2d');
  let dragging = null;

  function sizeFloatCanvas(cssWidth, cssHeight) {
    const dpr = window.devicePixelRatio || 1;
    floatCanvas.width = Math.max(1, Math.round(cssWidth * dpr));
    floatCanvas.height = Math.max(1, Math.round(cssHeight * dpr));
    floatCanvas.style.width = `${cssWidth}px`;
    floatCanvas.style.height = `${cssHeight}px`;
    floatCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setFloatTransform(x, y, scale = 1) {
    floatCanvas.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  }

  function followTick() {
    if (!dragging) return;
    dragging.current.x += (dragging.target.x - dragging.current.x) * FOLLOW_EASE;
    dragging.current.y += (dragging.target.y - dragging.current.y) * FOLLOW_EASE;
    setFloatTransform(dragging.current.x, dragging.current.y);
    dragging.rafId = requestAnimationFrame(followTick);
  }

  function updateDrag(event) {
    if (!dragging) return;
    const cellSize = getCellSize();
    const bounds = dragging.bounds;
    const boardRect = boardCanvas.getBoundingClientRect();

    // якорь фигуры — под точкой касания, приподнят и отцентрован по ширине,
    // чтобы палец/курсор не закрывал клетку постановки и была видна вся фигура
    const x = event.clientX - boardRect.left;
    const y = event.clientY - boardRect.top;
    const anchorX = x - (bounds.width / 2) * cellSize;
    const anchorY = y - (bounds.height / 2 + LIFT_CELLS) * cellSize;
    const { row, col } = pixelToCell(anchorX, anchorY, cellSize);
    dragging.row = row;
    dragging.col = col;

    const board = getBoard();
    const valid = isValidDrop(board, dragging.shape, row, col);
    dragging.valid = valid;
    const overBoard = overlapsBoard(row, col, bounds);

    // фигура всегда свободно следует за курсором/пальцем — привязку к сетке
    // видно только по подсветке клеток (onHover ниже) и в анимации при
    // отпускании (landFloat); магнитный «прыжок» самой фигуры при переходе
    // между клетками ощущался как рывок, поэтому её тут нет
    dragging.target.x = event.clientX - (bounds.width / 2) * cellSize;
    dragging.target.y = event.clientY - (bounds.height / 2 + LIFT_CELLS) * cellSize;

    if (dragging.first) {
      dragging.current.x = dragging.target.x;
      dragging.current.y = dragging.target.y;
      setFloatTransform(dragging.current.x, dragging.current.y);
      dragging.first = false;
    }

    floatCanvas.classList.toggle('drag-float--invalid', overBoard && !valid);

    onHover(shapeCells(dragging.shape, row, col).map((c) => ({ ...c, valid })));
  }

  function resetFloat() {
    floatCanvas.classList.remove('drag-float--invalid');
    floatCanvas.style.display = 'none';
    floatCanvas.style.transform = '';
  }

  function animateFloat(from, to, duration, onDone) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = easeOutCubic(t);
      setFloatTransform(
        from.x + (to.x - from.x) * eased,
        from.y + (to.y - from.y) * eased,
        from.scale + (to.scale - from.scale) * eased
      );
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onDone();
      }
    }
    requestAnimationFrame(step);
  }

  // Валидная позиция: фигура красиво «влетает» и встаёт вровень с клеткой
  // поля, только после этого коммитим реальную постановку (onDrop) — без
  // рывка между анимацией и отрисовкой уже размещённого блока на поле.
  function landFloat(state) {
    const cellSize = getCellSize();
    const boardRect = boardCanvas.getBoundingClientRect();
    const to = {
      x: boardRect.left + state.col * cellSize,
      y: boardRect.top + state.row * cellSize,
      scale: 1,
    };
    floatCanvas.classList.remove('drag-float--invalid');
    animateFloat({ ...state.current, scale: 1 }, to, LAND_MS, () => {
      resetFloat();
      state.el.classList.remove('tray-slot--dragging');
      onDrop(state.shapeIndex, state.row, state.col);
    });
  }

  // Недопустимая позиция (или отмена драга): фигура плавно возвращается и
  // уменьшается до размера своего слота в лотке, слот восстанавливает
  // непрозрачность ровно к моменту, когда фигура «садится» на место.
  function returnFloat(state) {
    const slotRect = state.el.getBoundingClientRect();
    const cellSize = getCellSize();
    const shapePxW = state.bounds.width * cellSize;
    const shapePxH = state.bounds.height * cellSize;
    const fitSize = Math.min(slotRect.width, slotRect.height) * 0.72;
    const scale = fitSize / Math.max(shapePxW, shapePxH, 1);
    const to = {
      x: slotRect.left + slotRect.width / 2 - (shapePxW * scale) / 2,
      y: slotRect.top + slotRect.height / 2 - (shapePxH * scale) / 2,
      scale,
    };
    animateFloat({ ...state.current, scale: 1 }, to, RETURN_MS, () => {
      resetFloat();
      state.el.classList.remove('tray-slot--dragging');
    });
  }

  function finishDrag(commit) {
    if (!dragging) return;
    const state = dragging;
    dragging = null;
    cancelAnimationFrame(state.rafId);
    onHoverEnd();

    const board = getBoard();
    const valid = commit && isValidDrop(board, state.shape, state.row, state.col);

    if (valid) {
      landFloat(state);
    } else {
      returnFloat(state);
      if (commit) onInvalidDrop(state.shapeIndex);
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

      const cellSize = getCellSize();
      const bounds = shapeBounds(shape);
      const color = getShapeColor(shapeIndex);

      sizeFloatCanvas(bounds.width * cellSize, bounds.height * cellSize);
      drawShapeGhost(floatCtx, shape, 0, 0, cellSize, color);
      floatCanvas.style.display = 'block';

      dragging = {
        pointerId: event.pointerId,
        shapeIndex,
        shape,
        bounds,
        el,
        row: null,
        col: null,
        valid: false,
        target: { x: 0, y: 0 },
        current: { x: 0, y: 0 },
        rafId: null,
        first: true,
      };
      el.classList.add('tray-slot--dragging');
      updateDrag(event);
      dragging.rafId = requestAnimationFrame(followTick);
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
