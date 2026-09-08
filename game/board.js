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
   * Не трогая реальное состояние поля, определяет, какие строки/столбцы
   * были бы полностью заполнены и какие клетки исчезли бы, если поставить
   * фигуру в (row, col) прямо сейчас. Используется превью комбо при
   * перетаскивании (R05.3) — вызывающий код показывает подсветку по
   * результату, ничего не размещая на самом деле; фиксирует ход, как и
   * раньше, только place(). На недопустимой позиции возвращает пустой
   * результат вместо ошибки (в отличие от place()) — это чисто
   * информационный запрос, а не попытка хода.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {{clearedRows: number[], clearedCols: number[], cells: {row:number, col:number}[]}}
   */
  previewClear(shape, row, col) {
    if (!this.canPlace(shape, row, col)) {
      return { clearedRows: [], clearedCols: [], cells: [] };
    }

    const willOccupy = (r, c) => {
      if (this.grid[r][c]) return true;
      for (const [dr, dc] of shape.cells) {
        if (row + dr === r && col + dc === c) return true;
      }
      return false;
    };

    const clearedRows = [];
    for (let r = 0; r < SIZE; r++) {
      let full = true;
      for (let c = 0; c < SIZE; c++) {
        if (!willOccupy(r, c)) {
          full = false;
          break;
        }
      }
      if (full) clearedRows.push(r);
    }

    const clearedCols = [];
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) {
        if (!willOccupy(r, c)) {
          full = false;
          break;
        }
      }
      if (full) clearedCols.push(c);
    }

    const cells = [];
    const seen = new Set();
    const addCell = (r, c) => {
      const key = `${r},${c}`;
      if (seen.has(key)) return;
      seen.add(key);
      cells.push({ row: r, col: c });
    };
    for (const r of clearedRows) {
      for (let c = 0; c < SIZE; c++) addCell(r, c);
    }
    for (const c of clearedCols) {
      for (let r = 0; r < SIZE; r++) addCell(r, c);
    }

    return { clearedRows, clearedCols, cells };
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

  /**
   * Заливка (4-связность) изолированной пустой области поля, содержащей
   * клетки фигуры в позиции (row, col) — не трогает состояние поля, вызывать
   * до place(). Используется бонусом за закрытие пробела: если размер этой
   * области в точности равен числу клеток фигуры, значит фигура целиком
   * закрыла изолированный пробел (а не просто легла в открытое место — тогда
   * область захватила бы куда больше пустых клеток вокруг). Стартует с
   * первой клетки самой фигуры — canPlace уже гарантирует, что она пуста;
   * на недопустимой позиции возвращает пустой массив.
   * @param {{cells: number[][]}} shape
   * @param {number} row
   * @param {number} col
   * @returns {{row:number, col:number}[]}
   */
  findEnclosedPocket(shape, row, col) {
    if (!this.canPlace(shape, row, col)) return [];

    const [seedDr, seedDc] = shape.cells[0];
    const stack = [[row + seedDr, col + seedDc]];
    const seen = new Set();
    const pocket = [];

    while (stack.length) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) continue;
      const key = `${r},${c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.grid[r][c]) continue; // занятая клетка — граница пробела
      pocket.push({ row: r, col: c });
      stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }

    return pocket;
  }

  /** Полностью ли пусто поле — используется бонусом за полную очистку. */
  isEmpty() {
    return this.grid.every((row) => row.every((cell) => !cell));
  }
}

export const BOARD_SIZE = SIZE;
