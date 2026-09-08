// game/score.js
// Подсчёт очков за ход и серия комбо (spec §Решения 2).
// Формула: +1 очко за каждую занятую клетку при постановке; очистка линий —
// 10×N² очков, где N — число линий, очищенных этим ходом; итог умножается
// на (1 + 0.1×серия), с округлением вниз.
//
// Серия комбо (R05.6): ход без очистки сам по себе её не обнуляет — но серия
// держится только пока игрок успевает очищать хотя бы раз в MAX_MISSES ходов
// подряд (сейчас 3: «каждый третий поставленный блок должен удалить хотя бы
// одну линию»). Считаем подряд идущие ходы БЕЗ очистки, пока идёт серия;
// как только их набирается MAX_MISSES — серия обнуляется прямо на этом ходе.
// Чисто счётчик ходов, без времени — модуль не знает про часы/таймеры.

const MAX_MISSES = 3;

export class Score {
  constructor() {
    // Длина текущей серии ходов, очистивших хотя бы одну линию. Формула
    // начисления и правило обрыва серии — детали модуля, наружу торчит
    // только addMove/reset.
    this.comboStreak = 0;
    // Сколько ходов подряд без очистки прошло с последней очистки внутри
    // текущей серии — считается, только пока comboStreak > 0.
    this.missesSinceClear = 0;
  }

  /**
   * Начисляет очки за один ход. Серия комбо растёт при очистке линии(й) и
   * сбрасывает счётчик промахов; ход без очистки во время активной серии
   * увеличивает счётчик промахов, а при MAX_MISSES промахах подряд обрывает
   * серию тут же, на этом ходе.
   * @param {{cellsPlaced: number, linesCleared: number}} move
   * @returns {{points: number, comboStreak: number}}
   */
  addMove({ cellsPlaced, linesCleared }) {
    const placementPoints = cellsPlaced;
    const linePoints = linesCleared > 0 ? 10 * linesCleared * linesCleared : 0;

    if (linesCleared > 0) {
      this.comboStreak += 1;
      this.missesSinceClear = 0;
    } else if (this.comboStreak > 0) {
      this.missesSinceClear += 1;
      if (this.missesSinceClear >= MAX_MISSES) {
        this.comboStreak = 0;
        this.missesSinceClear = 0;
      }
    }

    const multiplier = 1 + 0.1 * this.comboStreak;
    const points = Math.floor((placementPoints + linePoints) * multiplier);

    return { points, comboStreak: this.comboStreak };
  }

  /** Сбрасывает серию комбо (используется при старте новой партии). */
  reset() {
    this.comboStreak = 0;
    this.missesSinceClear = 0;
  }
}
