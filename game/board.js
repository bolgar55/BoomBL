// game/board.js
// Игровое поле 8×8: хранит состояние сетки, проверяет размещение фигур,
// фиксирует ход и очищает полностью заполненные строки/столбцы.
// Модуль не знает ни про DOM, ни про Telegram — чистая логика.

const SIZE = 8;

export class Board {
  constructor() {
    // grid[row][col] === true — клетка занята. Внутреннее представление
    // намеренно скрыто от остальных модулей — наружу торчат только методы ниже.
    this.grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  }

  /**
   * Проверяет, помещается ли фигура на поле, если её опорная клетка (0,0)
   * встаёт в позицию (row, col). Отклоняет позиции за границей поля и
   * позиции, где хотя бы одна клетка фигуры уже занята.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {boolean}
   */
  canPlace(shape, row, col) {
    for (const [dr, dc] of shape.cells) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      if (this.grid[r][c]) return false;
    }
    return true;
  }

  /**
   * Фиксирует фигуру на поле и очищает полностью заполненные строки/столбцы.
   * Все линии, заполненные этим ходом, очищаются как один результат хода
   * (а не по одной), поэтому вызывающий код может корректно обработать
   * синхронную анимацию и бонус за комбо-очистку.
   * Вызывающий код обязан проверить canPlace заранее — при недопустимой
   * позиции метод бросает исключение вместо тихой порчи состояния.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {{clearedRows: number[], clearedCols: number[]}}
   */
  place(shape, row, col) {
    if (!this.canPlace(shape, row, col)) {
      throw new Error('Недопустимое размещение фигуры');
    }
    for (const [dr, dc] of shape.cells) {
      this.grid[row + dr][col + dc] = true;
    }

    const clearedRows = [];
    for (let r = 0; r < SIZE; r++) {
      if (this.grid[r].every(Boolean)) clearedRows.push(r);
    }

    const clearedCols = [];
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) {
        if (!this.grid[r][c]) {
          full = false;
          break;
        }
      }
      if (full) clearedCols.push(c);
    }

    for (const r of clearedRows) {
      this.grid[r].fill(false);
    }
    for (const c of clearedCols) {
      for (let r = 0; r < SIZE; r++) this.grid[r][c] = false;
    }

    return { clearedRows, clearedCols };
  }

  /**
   * Определяет, есть ли на поле хоть одна позиция для хоть одной из
   * переданных фигур. Перебирает все 64 клетки для каждой фигуры (§3 спецификации).
   * @param {{cells: number[][]}[]} shapes
   * @returns {boolean}
   */
  canFitAnywhere(shapes) {
    for (const shape of shapes) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (this.canPlace(shape, r, c)) return true;
        }
      }
    }
    return false;
  }
}

export const BOARD_SIZE = SIZE;
