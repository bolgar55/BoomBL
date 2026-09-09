// ui/render.js
// Отрисовка игрового поля и фигур на Canvas 2D. Модуль не хранит состояние
// партии — только рисует то, что ему передали через параметры, и содержит
// чистую геометрию (перевод пикселей в клетки поля и обратно), которую
// переиспользует ui/input.js при перетаскивании.
//
// Палитра — дословно из reference.md (§5 спецификации), единственный
// источник цвета для игры (Telegram даёт только сигнал тёмная/светлая тема,
// см. spec §Решения 6 — переключение темы делает вызывающий код через атрибут
// data-theme на <html>, этот модуль лишь читает переданное имя темы).

import { BOARD_SIZE } from '../game/board.js?v=0.4.8';

export const THEME = {
  dark: {
    background: '#1A1A2E',
    cell: '#2C2C44',
  },
  light: {
    background: '#F0F0F5',
    cell: '#E8E8F0',
  },
};

// Яркие цвета блоков — случайный цвет назначается фигуре при спавне (reference.md).
export const BLOCK_COLORS = [
  '#FF4757', // красный
  '#FFA502', // оранжевый
  '#FFD32A', // жёлтый
  '#2ED573', // зелёный
  '#1E90FF', // голубой
  '#A55EEA', // фиолетовый
  '#FF6B9D', // розовый/малиновый
  '#00D2D3', // бирюзовый
];

export const LINE_CLEAR_FLASH_COLOR = '#FFFFFF';

/** Случайный цвет блока из палитры — используется при спавне новой фигуры. */
export function randomBlockColor() {
  return BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
}

const GAP = 3; // визуальный зазор между клетками в пикселях, на логику не влияет
const RADIUS = 4; // скругление углов блоков

/** Считает размер одной клетки, чтобы сетка BOARD_SIZE×BOARD_SIZE влезла в квадрат canvasSize. */
export function computeCellSize(canvasSize, boardSize = BOARD_SIZE) {
  return canvasSize / boardSize;
}

/** Пиксельный прямоугольник клетки (row, col) с учётом зазора между клетками. */
export function cellRect(row, col, cellSize) {
  return {
    x: col * cellSize + GAP / 2,
    y: row * cellSize + GAP / 2,
    size: cellSize - GAP,
  };
}

/**
 * Переводит пиксельные координаты (относительно канваса поля) в координаты
 * клетки. Может вернуть индекс вне границ поля (отрицательный или >= BOARD_SIZE) —
 * вызывающий код (isValidDrop) сам решает, валидна ли позиция.
 */
export function pixelToCell(x, y, cellSize) {
  return {
    row: Math.floor(y / cellSize),
    col: Math.floor(x / cellSize),
  };
}

// Единичная фигура — служебный приём, чтобы узнать занятость клетки через
// публичный board.canPlace, не трогая скрытое внутреннее представление сетки.
const UNIT_CELL = { cells: [[0, 0]] };

/** Занята ли клетка (row, col) — определяется только через публичный canPlace. */
export function isOccupied(board, row, col) {
  return !board.canPlace(UNIT_CELL, row, col);
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Лёгкий градиент сверху вниз для объёма — «блоки выглядят глянцевыми,
// как в оригинальной игре» (reference.md, принцип).
function drawGloss(ctx, x, y, size) {
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.03)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = gradient;
  drawRoundedRect(ctx, x, y, size, size, RADIUS);
  ctx.fill();
}

function drawBlock(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  drawRoundedRect(ctx, x, y, size, size, RADIUS);
  ctx.fill();
  drawGloss(ctx, x, y, size);
}

/**
 * Рисует поле: фон, клетки (пустые/занятые цветом из colorGrid) и, если
 * передан highlight, полупрозрачную подсветку допустимости позиции при драге
 * (зелёная — можно поставить, красная — нельзя, R05.1).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} board - объект с canPlace (см. game/board.js)
 * @param {(string|null)[][]} colorGrid - цвет занятой клетки, ведёт вызывающий код
 * @param {number} cellSize
 * @param {'dark'|'light'} theme
 * @param {{row:number, col:number, valid:boolean}[]} [highlight]
 */
export function drawBoard(ctx, board, colorGrid, cellSize, theme, highlight) {
  const palette = THEME[theme] || THEME.dark;
  const size = cellSize * BOARD_SIZE;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const { x, y, size: s } = cellRect(row, col, cellSize);
      const occupied = isOccupied(board, row, col);
      if (occupied) {
        drawBlock(ctx, x, y, s, colorGrid?.[row]?.[col] || BLOCK_COLORS[0]);
      } else {
        ctx.fillStyle = palette.cell;
        drawRoundedRect(ctx, x, y, s, s, RADIUS);
        ctx.fill();
      }
    }
  }

  if (highlight) {
    for (const { row, col, valid } of highlight) {
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) continue;
      const { x, y, size: s } = cellRect(row, col, cellSize);
      ctx.fillStyle = valid ? 'rgba(46, 213, 115, 0.5)' : 'rgba(255, 71, 87, 0.65)';
      drawRoundedRect(ctx, x, y, s, s, RADIUS);
      ctx.fill();
    }
  }
}

/** Габариты фигуры (ширина/высота ограничивающего прямоугольника в клетках). */
function boundsOf(shape) {
  let maxRow = 0;
  let maxCol = 0;
  for (const [r, c] of shape.cells) {
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  return { width: maxCol + 1, height: maxRow + 1 };
}

/** Рисует превью фигуры, вписанное и отцентрованное в квадратный канвас лотка. */
export function drawShapePreview(ctx, shape, color, canvasSize) {
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  const { width, height } = boundsOf(shape);
  const padding = canvasSize * 0.14;
  const available = canvasSize - padding * 2;
  const cell = available / Math.max(width, height);
  const offsetX = (canvasSize - width * cell) / 2;
  const offsetY = (canvasSize - height * cell) / 2;
  const s = Math.max(cell - 3, 1);

  for (const [r, c] of shape.cells) {
    drawBlock(ctx, offsetX + c * cell, offsetY + r * cell, s, color);
  }
}

/** Рисует «призрак» перетаскиваемой фигуры поверх поля в позиции (row, col). */
export function drawShapeGhost(ctx, shape, row, col, cellSize, color) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const [dr, dc] of shape.cells) {
    const { x, y, size } = cellRect(row + dr, col + dc, cellSize);
    drawBlock(ctx, x, y, size, color);
  }
  ctx.restore();
}

/** Смешивает hex-цвет с белым на amount (0..1) — светлее исходного, для мерцающего контура. */
function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * Превью потенциальной комбо-очистки при перетаскивании (R05.3): клетки,
 * которые исчезнут после установки фигуры, подсвечиваются её цветом —
 * мягкое свечение (shadowBlur) + мерцающий светлеющий контур, оба
 * пульсируют по фазе pulse (0..1, обычно синусоида) — «дыхание» подсветки.
 * Чистая функция одного кадра; сам цикл дыхания ведёт ui/animations.js
 * (createComboPreview), не тестируется юнит-тестами (визуальный эффект).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{row:number, col:number}[]} cells
 * @param {number} cellSize
 * @param {string} color
 * @param {number} pulse
 */
export function drawComboPreview(ctx, cells, cellSize, color, pulse) {
  if (!cells.length) return;
  ctx.save();

  ctx.shadowColor = color;
  ctx.shadowBlur = 10 + pulse * 14;
  ctx.globalAlpha = 0.3 + pulse * 0.25;
  ctx.fillStyle = color;
  for (const { row, col } of cells) {
    const { x, y, size } = cellRect(row, col, cellSize);
    drawRoundedRect(ctx, x, y, size, size, RADIUS);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.lineWidth = 2;
  ctx.strokeStyle = lightenColor(color, 0.35 + pulse * 0.3);
  for (const { row, col } of cells) {
    const { x, y, size } = cellRect(row, col, cellSize);
    drawRoundedRect(ctx, x + 1, y + 1, size - 2, size - 2, RADIUS);
    ctx.stroke();
  }

  ctx.restore();
}
