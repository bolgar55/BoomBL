// game/achievements.js
// Достижения (R05.7) — в отличие от game/challenges.js (ежедневный, сбрасывается
// по дате), достижения постоянны: прогресс копится через все партии и сессии,
// каждое достижение разблокируется максимум один раз и остаётся полученным
// навсегда. Модуль не знает про DOM/Telegram — чистое хранение метрик и каталог,
// как и persistence/challenges, с инжектируемой persistence для тестируемости.

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
  // ---- очки (простые/средние/редкие) ----
  { id: 'score-500', tier: 'common', icon: '🏆', metric: 'lifetimeScore', goal: 500 },
  { id: 'score-2000', tier: 'common', icon: '🏆', metric: 'lifetimeScore', goal: 2000 },
  { id: 'score-10000', tier: 'uncommon', icon: '🏆', metric: 'lifetimeScore', goal: 10000 },
  { id: 'score-50000', tier: 'rare', icon: '👑', metric: 'lifetimeScore', goal: 50000 },
  { id: 'game-score-1000', tier: 'common', icon: '⭐', metric: 'bestGameScore', goal: 1000 },
  { id: 'game-score-5000', tier: 'uncommon', icon: '🌟', metric: 'bestGameScore', goal: 5000 },

  // ---- комбо ----
  { id: 'first-combo', tier: 'common', icon: '🔥', metric: 'maxComboStreak', goal: 1 },
  { id: 'combo-streak-3', tier: 'uncommon', icon: '🔥', metric: 'maxComboStreak', goal: 3 },
  { id: 'combo-streak-5', tier: 'rare', icon: '🔥', metric: 'maxComboStreak', goal: 5 },
  { id: 'combo-streak-8', tier: 'epic', icon: '☄️', metric: 'maxComboStreak', goal: 8 },

  // ---- линии ----
  { id: 'clear-line-1', tier: 'common', icon: '📏', metric: 'totalLinesCleared', goal: 1 },
  { id: 'clear-lines-50', tier: 'uncommon', icon: '📏', metric: 'totalLinesCleared', goal: 50 },
  { id: 'clear-lines-200', tier: 'rare', icon: '📐', metric: 'totalLinesCleared', goal: 200 },
  { id: 'multi-line-2', tier: 'uncommon', icon: '💥', metric: 'maxLinesInOneMove', goal: 2 },
  { id: 'multi-line-3', tier: 'rare', icon: '💥', metric: 'maxLinesInOneMove', goal: 3 },

  // ---- полная очистка и бонус за пробел ----
  { id: 'full-clear-1', tier: 'rare', icon: '✨', metric: 'totalFullClears', goal: 1 },
  { id: 'full-clear-5', tier: 'epic', icon: '💫', metric: 'totalFullClears', goal: 5 },
  { id: 'gap-bonus-1', tier: 'common', icon: '🕳️', metric: 'totalGapBonuses', goal: 1 },
  { id: 'gap-bonus-20', tier: 'uncommon', icon: '🕳️', metric: 'totalGapBonuses', goal: 20 },

  // ---- объём игры ----
  { id: 'shapes-100', tier: 'common', icon: '🧩', metric: 'totalShapesPlaced', goal: 100 },
  { id: 'shapes-1000', tier: 'uncommon', icon: '🧩', metric: 'totalShapesPlaced', goal: 1000 },
  { id: 'games-10', tier: 'common', icon: '🎮', metric: 'gamesPlayed', goal: 10 },
  { id: 'games-50', tier: 'uncommon', icon: '🎮', metric: 'gamesPlayed', goal: 50 },

  // ---- мастерство хода ----
  { id: 'move-score-100', tier: 'uncommon', icon: '⚡', metric: 'maxSingleMoveScore', goal: 100 },
  { id: 'move-score-500', tier: 'rare', icon: '⚡', metric: 'maxSingleMoveScore', goal: 500 },
  { id: 'streak-moves-10', tier: 'rare', icon: '⛓️', metric: 'maxConsecutiveMoves', goal: 10 },
  { id: 'clean-game', tier: 'rare', icon: '🎯', metric: 'gamesWithoutInvalid', goal: 1 },
  { id: 'last-slot', tier: 'rare', icon: '🥇', metric: 'lastSlotPlacements', goal: 1 },
  { id: 'big-shape-master', tier: 'uncommon', icon: '🟪', metric: 'bigShapesPlaced', goal: 10 },
  { id: 'full-tray-user', tier: 'common', icon: '📦', metric: 'traySetsUsed', goal: 20 },
  { id: 'comeback', tier: 'epic', icon: '💪', metric: 'comebacks', goal: 1 },

  // ---- редкие/секретные ----
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
 * Создаёт объект работы с достижениями — постоянный прогресс через persistence.
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
    // defaultMetrics() гарантирует, что новые метрики (добавленные в каталог
    // позже, чем сохранённый прогресс игрока) не окажутся undefined.
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
   * Обновляет метрики по событию хода/партии и возвращает достижения,
   * разблокированные именно этим вызовом (пустой массив — если ничего
   * нового). Ключ вида 'max:метрика' обновляет метрику через Math.max
   * (лучшие результаты — комбо, очки за ход и т.п.), обычный ключ — через
   * прибавление (счётчики событий). Одно и то же достижение разблокируется
   * не более одного раза за всю историю игрока — unlocked проверяется и
   * записывается синхронно внутри одного вызова, повторно тот же id уже
   * не пройдёт (see checkNewlyUnlocked: `if (state.unlocked[def.id]) continue`).
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

  /** Полный список достижений с текущим прогрессом/статусом — для экрана достижений. */
  async function getAll() {
    await load();
    return ACHIEVEMENTS.map(toEntry);
  }

  /**
   * Закреплённое игроком достижение (R05.8) — показывается в верхней панели
   * вместо статичного дневного челленджа, если выбрано. id=null снимает
   * закрепление. Закрепить можно любое достижение каталога, включая ещё не
   * полученное (это и есть основной сценарий — следить за прогрессом) и
   * секретное (тогда в панели тоже будет «???», как и в списке).
   * @param {string|null} id
   */
  async function setPinned(id) {
    await load();
    state.pinned = id && ACHIEVEMENTS.some((def) => def.id === id) ? id : null;
    await save();
  }

  /** Текущее закреплённое достижение с прогрессом, или null, если ничего не закреплено. */
  async function getPinned() {
    await load();
    if (!state.pinned) return null;
    const def = ACHIEVEMENTS.find((d) => d.id === state.pinned);
    return def ? toEntry(def) : null;
  }

  /**
   * Что показывать в верхней панели прямо сейчас (R05.8): если игрок сам
   * закрепил достижение — оно и есть ответ. Если нет — автовыбор того,
   * которое скоро получится: среди ещё не полученных берём с наибольшим
   * отношением progress/goal (ближе всего к цели). Секретные в автовыбор не
   * попадают — их прогресс не должен «спойлериться» без явного решения
   * игрока закрепить именно секрет руками (getPinned/setPinned это всё ещё
   * разрешают). Если вообще всё уже получено (или каталог пуст) — null,
   * вызывающий код сам решает, чем заполнить панель в этом случае (в app.js —
   * прежний дневной челлендж).
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
