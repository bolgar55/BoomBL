// game/achievements.js
// Achievements (R05.7) - unlike game/challenges.js (daily, resets by date),
// achievements are permanent: progress accumulates across all games and
// sessions, each achievement unlocks at most once and stays unlocked
// forever. Module knows nothing about DOM/Telegram - just metric storage and
// a catalog, like persistence/challenges, with injectable persistence for testability.

/**
 * @typedef {{
 *   id: string,
 *   tier: 'common'|'uncommon'|'rare'|'epic'|'secret',
 *   icon: string,
 *   metric: string,
 *   goal: number,
 * }} AchievementDef
 */

/** @type {AchievementDef[]} */
const ACHIEVEMENTS = [
  // ---- score (common/uncommon/rare) ----
  { id: 'score-500', tier: 'common', icon: '🏆', metric: 'lifetimeScore', goal: 500 },
  { id: 'score-2000', tier: 'common', icon: '🏆', metric: 'lifetimeScore', goal: 2000 },
  { id: 'score-10000', tier: 'uncommon', icon: '🏆', metric: 'lifetimeScore', goal: 10000 },
  { id: 'score-50000', tier: 'rare', icon: '👑', metric: 'lifetimeScore', goal: 50000 },
  { id: 'score-100000', tier: 'epic', icon: '👑', metric: 'lifetimeScore', goal: 100000 },
  { id: 'score-250000', tier: 'epic', icon: '💎', metric: 'lifetimeScore', goal: 250000 },
  { id: 'game-score-1000', tier: 'common', icon: '⭐', metric: 'bestGameScore', goal: 1000 },
  { id: 'game-score-5000', tier: 'uncommon', icon: '🌟', metric: 'bestGameScore', goal: 5000 },
  { id: 'game-score-10000', tier: 'rare', icon: '🌠', metric: 'bestGameScore', goal: 10000 },
  { id: 'game-score-50000', tier: 'epic', icon: '🌌', metric: 'bestGameScore', goal: 50000 },
  { id: 'game-score-100000', tier: 'epic', icon: '👑', metric: 'bestGameScore', goal: 100000 },

  // ---- combo ----
  { id: 'first-combo', tier: 'common', icon: '🔥', metric: 'maxComboStreak', goal: 1 },
  { id: 'combo-streak-3', tier: 'uncommon', icon: '🔥', metric: 'maxComboStreak', goal: 3 },
  { id: 'combo-streak-5', tier: 'rare', icon: '🔥', metric: 'maxComboStreak', goal: 5 },
  { id: 'combo-streak-8', tier: 'epic', icon: '☄️', metric: 'maxComboStreak', goal: 8 },

  // ---- lines ----
  { id: 'clear-line-1', tier: 'common', icon: '📏', metric: 'totalLinesCleared', goal: 1 },
  { id: 'clear-lines-50', tier: 'uncommon', icon: '📏', metric: 'totalLinesCleared', goal: 50 },
  { id: 'clear-lines-200', tier: 'rare', icon: '📐', metric: 'totalLinesCleared', goal: 200 },
  { id: 'multi-line-2', tier: 'uncommon', icon: '💥', metric: 'maxLinesInOneMove', goal: 2 },
  { id: 'multi-line-3', tier: 'rare', icon: '💥', metric: 'maxLinesInOneMove', goal: 3 },

  // ---- full clear and gap bonus ----
  { id: 'full-clear-1', tier: 'rare', icon: '✨', metric: 'totalFullClears', goal: 1 },
  { id: 'full-clear-5', tier: 'epic', icon: '💫', metric: 'totalFullClears', goal: 5 },
  { id: 'gap-bonus-1', tier: 'common', icon: '🕳️', metric: 'totalGapBonuses', goal: 1 },
  { id: 'gap-bonus-20', tier: 'uncommon', icon: '🕳️', metric: 'totalGapBonuses', goal: 20 },
  { id: 'color-clear-1', tier: 'uncommon', icon: '🎨', metric: 'totalColorClears', goal: 1 },
  { id: 'color-clear-15', tier: 'rare', icon: '🌈', metric: 'totalColorClears', goal: 15 },

  // ---- play volume ----
  { id: 'shapes-100', tier: 'common', icon: '🧩', metric: 'totalShapesPlaced', goal: 100 },
  { id: 'shapes-1000', tier: 'uncommon', icon: '🧩', metric: 'totalShapesPlaced', goal: 1000 },
  { id: 'games-10', tier: 'common', icon: '🎮', metric: 'gamesPlayed', goal: 10 },
  { id: 'games-50', tier: 'uncommon', icon: '🎮', metric: 'gamesPlayed', goal: 50 },

  // ---- move mastery ----
  { id: 'move-score-100', tier: 'uncommon', icon: '⚡', metric: 'maxSingleMoveScore', goal: 100 },
  { id: 'move-score-500', tier: 'rare', icon: '⚡', metric: 'maxSingleMoveScore', goal: 500 },
  { id: 'streak-moves-10', tier: 'rare', icon: '⛓️', metric: 'maxConsecutiveMoves', goal: 10 },
  { id: 'clean-game', tier: 'rare', icon: '🎯', metric: 'gamesWithoutInvalid', goal: 1 },
  { id: 'last-slot', tier: 'rare', icon: '🥇', metric: 'lastSlotPlacements', goal: 1 },
  { id: 'big-shape-master', tier: 'uncommon', icon: '🟪', metric: 'bigShapesPlaced', goal: 10 },
  { id: 'full-tray-user', tier: 'common', icon: '📦', metric: 'traySetsUsed', goal: 20 },
  { id: 'comeback', tier: 'epic', icon: '💪', metric: 'comebacks', goal: 1 },

  // ---- rare/secret ----
  { id: 'secret-perfect-start', tier: 'secret', icon: '🎇', metric: 'perfectStarts', goal: 1 },
  { id: 'secret-night-owl', tier: 'secret', icon: '🌙', metric: 'lateNightGames', goal: 1 },
];

const STORAGE_KEY = 'achievements';

function defaultMetrics() {
  const metrics = {};
  for (const def of ACHIEVEMENTS) metrics[def.metric] = 0;
  return metrics;
}

/**
 * Creates an achievements handler - persistent progress via persistence.
 * @param {{persistence: {getItem: Function, setItem: Function}}} deps
 * @returns {{
 *   reportEvent: (deltas: Record<string, number>) => Promise<AchievementDef[]>,
 *   getAll: () => Promise<(AchievementDef & {progress:number, unlocked:boolean, unlockedAt:number|null})[]>,
 * }}
 */
export function createAchievements(deps = {}) {
  const persistence = deps.persistence;
  let state = null;

  async function load() {
    if (state) return state;
    const stored = await persistence.getItem(STORAGE_KEY, null);
    // defaultMetrics() ensures new metrics (added to the catalog after the
    // player's saved progress) don't end up undefined.
    state = {
      metrics: { ...defaultMetrics(), ...(stored?.metrics ?? {}) },
      unlocked: stored?.unlocked ?? {},
      pinned: stored?.pinned ?? null,
    };
    return state;
  }

  async function save() {
    await persistence.setItem(STORAGE_KEY, state);
  }

  function checkNewlyUnlocked() {
    const newly = [];
    for (const def of ACHIEVEMENTS) {
      if (state.unlocked[def.id]) continue;
      if ((state.metrics[def.metric] ?? 0) >= def.goal) {
        state.unlocked[def.id] = { unlockedAt: Date.now() };
        newly.push(def);
      }
    }
    return newly;
  }

  /**
   * Updates metrics from a move/game event and returns achievements
   * unlocked by this exact call (empty array if nothing new). A key like
   * 'max:metric' updates the metric via Math.max (best results - combo,
   * points per move, etc.), a plain key updates via addition (event
   * counters). The same achievement unlocks at most once in the player's
   * whole history - unlocked is checked and written synchronously within
   * one call, so the same id won't pass again
   * (see checkNewlyUnlocked: `if (state.unlocked[def.id]) continue`).
   * @param {Record<string, number>} deltas
   * @returns {Promise<AchievementDef[]>}
   */
  async function reportEvent(deltas) {
    await load();
    for (const [key, value] of Object.entries(deltas)) {
      if (key.startsWith('max:')) {
        const metricKey = key.slice(4);
        state.metrics[metricKey] = Math.max(state.metrics[metricKey] ?? 0, value);
      } else {
        state.metrics[key] = (state.metrics[key] ?? 0) + value;
      }
    }
    const newly = checkNewlyUnlocked();
    await save();
    return newly;
  }

  function toEntry(def) {
    const entry = state.unlocked[def.id];
    return {
      ...def,
      progress: Math.min(state.metrics[def.metric] ?? 0, def.goal),
      unlocked: Boolean(entry),
      unlockedAt: entry?.unlockedAt ?? null,
    };
  }

  /** Full achievement list with current progress/status - for the achievements screen. */
  async function getAll() {
    await load();
    return ACHIEVEMENTS.map(toEntry);
  }

  /**
   * The achievement the player pinned (R05.8) - shown in the top bar
   * instead of the static daily challenge, if selected. id=null clears the
   * pin. Any catalog achievement can be pinned, including one not yet
   * unlocked (this is the main use case - tracking progress) and secret
   * ones (the bar then also shows "???", same as the list).
   * @param {string|null} id
   */
  async function setPinned(id) {
    await load();
    state.pinned = id && ACHIEVEMENTS.some((def) => def.id === id) ? id : null;
    await save();
  }

  /** Currently pinned achievement with progress, or null if nothing is pinned. */
  async function getPinned() {
    await load();
    if (!state.pinned) return null;
    const def = ACHIEVEMENTS.find((d) => d.id === state.pinned);
    return def ? toEntry(def) : null;
  }

  /**
   * What to show in the top bar right now (R05.8): if the player pinned an
   * achievement themselves, that's the answer. Otherwise auto-pick the one
   * closest to completion: among those not yet unlocked, take the highest
   * progress/goal ratio. Secret achievements are excluded from auto-pick -
   * their progress shouldn't be spoiled without the player explicitly
   * pinning that secret by hand (getPinned/setPinned still allow that). If
   * everything is already unlocked (or the catalog is empty) - null, caller
   * decides what to fill the bar with in that case (in app.js, the previous
   * daily challenge).
   * @returns {Promise<(AchievementDef & {progress:number, unlocked:boolean, unlockedAt:number|null, pinnedByUser:boolean})|null>}
   */
  async function getDisplayed() {
    await load();
    if (state.pinned) {
      const def = ACHIEVEMENTS.find((d) => d.id === state.pinned);
      if (def) return { ...toEntry(def), pinnedByUser: true };
    }

    let best = null;
    let bestRatio = -1;
    for (const def of ACHIEVEMENTS) {
      if (state.unlocked[def.id] || def.tier === 'secret') continue;
      const ratio = (state.metrics[def.metric] ?? 0) / def.goal;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = def;
      }
    }
    return best ? { ...toEntry(best), pinnedByUser: false } : null;
  }

  return { reportEvent, getAll, setPinned, getPinned, getDisplayed };
}

export { ACHIEVEMENTS };
