// game/score.js
// Подсчёт очков за ход и серия комбо (spec §Решения 2).
// Формула: +1 очко за каждую занятую клетку при постановке; очистка линий —
// 10×N² очков, где N — число линий, очищенных этим ходом; очищающие ходы
// подряд наращивают серию комбо, ход без очистки сбрасывает её в 0; итог
// умножается на (1 + 0.1×серия), с округлением вниз.

export class Score {
  constructor() {
    // Длина текущей серии подряд идущих ходов, очистивших хотя бы одну линию.
    // Формула начисления — деталь модуля, наружу торчит только addMove/reset.
    this.comboStreak = 0;
  }

  /**
   * Начисляет очки за один ход.
   * @param {{cellsPlaced: number, linesCleared: number}} move
   * @returns {{points: number, comboStreak: number}}
   */
  addMove({ cellsPlaced, linesCleared }) {
    const placementPoints = cellsPlaced;
    const linePoints = linesCleared > 0 ? 10 * linesCleared * linesCleared : 0;

    if (linesCleared > 0) {
      this.comboStreak += 1;
    } else {
      this.comboStreak = 0;
    }

    const multiplier = 1 + 0.1 * this.comboStreak;
    const points = Math.floor((placementPoints + linePoints) * multiplier);

    return { points, comboStreak: this.comboStreak };
  }

  /** Сбрасывает серию комбо (используется при старте новой партии). */
  reset() {
    this.comboStreak = 0;
  }
}
