// game/score.js
// Move scoring and combo streak.
//
// 1) Placement points: +1 point per occupied cell, awarded immediately when
//    the shape touches the board - regardless of whether a line clears, and
//    with no multiplier (combo doesn't affect these).
// 2) Line-clear points (before combo) - not linear, a triangular number:
//    10*N*(N+1)/2, where N = lines cleared THIS move. 1 line = 10,
//    2 lines = 30 (not 20), 3 lines = 60 (not 30), 4 lines = 100 - each
//    additional simultaneous line adds 10 more than the previous increment
//    (10, +20, +30, +40, ...), giving a progressive bonus for clearing
//    multiple lines in one move.
// 3) Combo multiplier: this move's line points (item 2) are multiplied by
//    the current combo streak count directly (not 1+0.1*streak, just xN) -
//    the streak counts consecutive moves that cleared at least one line;
//    if this move clears a line, it joins the streak BEFORE the multiplier
//    is applied (the streak's first clear is already x1, not x0). The
//    multiplier never touches placement points (item 1).
//
// Combo streak (R05.6): a move with no clear doesn't reset it by itself -
// it holds as long as the player clears at least once every MAX_MISSES
// consecutive moves (currently 3: "every third placed block must clear at
// least one line"). We count consecutive no-clear moves while the streak is
// active; once they reach MAX_MISSES, the streak resets on that same move.
// Pure move counter, no time involved - module knows nothing about clocks/timers.

const MAX_MISSES = 3;
const LINE_POINTS_PER_STEP = 10;

/** Triangular number: 10*(1+2+...+N) - progressive points for N lines in one move. */
function lineClearBasePoints(linesCleared) {
  return (LINE_POINTS_PER_STEP * linesCleared * (linesCleared + 1)) / 2;
}

export class Score {
  constructor() {
    // Length of the current streak of moves that cleared at least one line.
    // The scoring formula and streak-break rule are module internals - only
    // addMove/reset are exposed.
    this.comboStreak = 0;
    // How many consecutive no-clear moves have passed since the last clear
    // within the current streak - only counted while comboStreak > 0.
    this.missesSinceClear = 0;
  }

  /**
   * Awards points for one move. The combo streak grows on a line clear and
   * resets the miss counter; a move with no clear during an active streak
   * increments the miss counter, and MAX_MISSES consecutive misses breaks
   * the streak right on that move.
   * @param {{cellsPlaced: number, linesCleared: number}} move
   * @returns {{points: number, comboStreak: number}}
   */
  addMove({ cellsPlaced, linesCleared }) {
    const placementPoints = cellsPlaced;

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

    const linePoints = linesCleared > 0 ? lineClearBasePoints(linesCleared) * this.comboStreak : 0;
    const points = placementPoints + linePoints;

    return { points, comboStreak: this.comboStreak };
  }

  /** Resets the combo streak (used when a new game starts). */
  reset() {
    this.comboStreak = 0;
    this.missesSinceClear = 0;
  }
}
