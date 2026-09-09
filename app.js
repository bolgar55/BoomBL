// app.js
// App entry point. Wires every module into one working app: the game loop
// (board/shapes/score), rendering and input (ui/render, ui/input,
// ui/animations), high-score/settings persistence, the Telegram bridge
// (theme/haptics/MainButton/sharing), the Game Over screen, i18n, and the
// daily challenge.
// This module (like all of `ui`) exposes nothing outward - it's the app's
// top level.

// ?v=X.Y.Z on every local import - cache busting. This is a static site
// with no build step and no filename hashing, so a browser/WebView can keep
// serving a stale cached copy of a module even after index.html's own
// version updates. The import specifier must be a string literal (ES module
// syntax forbids a template string/variable here), so the version has to be
// written by hand on every line - keep it in sync with package.json /
// index.html's version tag on every push.
import { Board, BOARD_SIZE, hasAnyValidMove } from './game/board.js?v=0.5.1';
import { generateShapeSet } from './game/shapes.js?v=0.5.1';
import { Score } from './game/score.js?v=0.5.1';
import { createEventDirector } from './game/events.js?v=0.5.1';
import { computeCellSize, drawBoard, drawShapePreview, randomBlockColor } from './ui/render.js?v=0.5.1';
import { attachDragAndDrop, isValidDrop } from './ui/input.js?v=0.5.1';
import {
  playAppear,
  playShake,
  createComboPreview,
  createEffectsEngine,
  createLineClearLayer,
  createPlacementPulseLayer,
  createInvalidPulseLayer,
  createFullClearBurstLayer,
  animateScoreCountUp,
  playBonusPopup,
} from './ui/animations.js?v=0.5.1';
import { createPersistence } from './game/persistence.js?v=0.5.1';
import { createTelegramBridge } from './telegram/bridge.js?v=0.5.1';
import { createI18n } from './i18n/index.js?v=0.5.1';
import { createChallenges } from './game/challenges.js?v=0.5.1';
import { createAchievements } from './game/achievements.js?v=0.5.1';
import { createGameOverScreen } from './ui/gameover.js?v=0.5.1';
import { createAchievementsScreen, showAchievementUnlock, showEventToast } from './ui/achievements.js?v=0.5.1';
import { createLeaderboardScreen } from './ui/leaderboard.js?v=0.5.1';
import { loadConfig } from './config.js?v=0.5.1';

// Bonus for closing an isolated gap, per cell closed. Not spec-mandated -
// tuned to be noticeable against ordinary points (1/cell) and line clears.
// Raised from 10 so big plays move the score further toward large numbers
// (100,000+) without touching the already-verified line/combo formula in
// game/score.js.
const GAP_FILL_BONUS_PER_CELL = 15;
// Bonus for fully removing one color from the board, per cell of that color
// cleared this move. Counted for EVERY color that this move removed from
// the board entirely (was present somewhere before the move, gone after);
// if a single clear removes multiple colors at once (e.g. a full-board
// clear), the bonuses stack. Raised from 20 - see GAP_FILL_BONUS_PER_CELL above.
const COLOR_CLEAR_BONUS_PER_CELL = 30;
// Flat bonus for fully clearing the board (a "perfect" move). Raised from
// 1500 - see GAP_FILL_BONUS_PER_CELL above.
const FULL_CLEAR_BONUS = 2500;
// Short pause between the normal line-clear burst and the big celebratory
// full-clear effect, so they don't land on the same frame and blend together.
const FULL_CLEAR_PAUSE_MS = 280;

// Named combo tiers: a one-time popup + flat bonus the first time the
// CURRENT streak reaches each threshold (not on every move within the
// tier - see announcedComboTier below, reset along with the combo itself).
// Levels are strictly increasing.
const COMBO_TIERS = [
  { threshold: 5, key: 'comboTier5', bonus: 50 },
  { threshold: 10, key: 'comboTier10', bonus: 150 },
  { threshold: 20, key: 'comboTier20', bonus: 400 },
];

// Score milestones for the current game: a one-time popup + bonus the first
// time THIS game crosses each one (announcedMilestones below, reset in
// resetGame). The bonus is a fraction of the milestone itself, so bigger
// milestones are celebrated more.
const SCORE_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const SCORE_MILESTONE_BONUS_RATE = 0.05;

// Icons for the current-game event (game/events.js) - used by the toast
// announcement and the top panel while an event is active.
const EVENT_ICONS = {
  doublePoints: '⚡',
  bigShapeRain: '🧱',
  colorBonusRush: '🎨',
};

// ---------- DOM elements ----------
const boardCanvas = document.getElementById('board-canvas');
const boardCtx = boardCanvas.getContext('2d');
const effectsCanvas = document.getElementById('effects-canvas');
const effectsCtx = effectsCanvas.getContext('2d');
// The combo preview shown while dragging shares this overlay canvas with the
// rest of the effects engine (fxEngine) - they never overlap in time: the
// preview fades in onHoverEnd before a commit's explosion animation starts.
const comboPreview = createComboPreview(effectsCtx);
// Engine for the rest of the canvas effects: line-clear burst, placement
// pulse, invalid-drop flash, full-clear fireworks - these can run
// simultaneously on one canvas, so they're layers in one shared engine
// rather than separate self-driven functions (see ui/animations.js,
// createEffectsEngine).
const fxEngine = createEffectsEngine(effectsCtx);
const dragCanvas = document.getElementById('drag-float');
const boardWrap = document.getElementById('board-wrap');
// Layer for the popup "+N" bonus text, over the board, inside board-wrap.
const bonusLayer = document.getElementById('bonus-layer');
const trayEls = Array.from(document.querySelectorAll('.tray-slot'));
const scoreLabelEl = document.getElementById('score-label');
const scoreValueEl = document.getElementById('score-value');
const comboValueEl = document.getElementById('combo-value');
const highScoreLabelEl = document.getElementById('high-score-label');
const highScoreValueEl = document.getElementById('high-score-value');
const leaderboardBtn = document.getElementById('leaderboard-btn');
const achievementsBtn = document.getElementById('achievements-btn');
const languageBtn = document.getElementById('language-btn');
const challengePanelEl = document.getElementById('challenge-panel');
const challengeLabelEl = document.getElementById('challenge-label');
const challengeProgressEl = document.getElementById('challenge-progress');
const overlayRoot = document.getElementById('overlay-root');

// ---- game state (not persisted between runs) ----
let board = new Board();
let score = new Score();
// This game's light event (game/events.js) - once per game, random moment,
// see placeShape()/resetGame().
let eventDirector = createEventDirector();
let shapes = generateShapeSet(board);
let shapeColors = shapes.map(() => randomBlockColor());
let colorGrid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let totalScore = 0;
let displayedScore = 0; // what's actually shown in scoreValueEl right now (see updateScoreUI)
let highScore = 0;
let cellSize = 0;
let gameOver = false;
// How many moves in a row passed without a line clear - biases the smart
// tray generator (game/shapes.js) toward more forgiving shapes when the
// player hasn't landed a clear in a while.
let movesSinceClear = 0;
// Achievement metrics that neither Board nor Score track on their own -
// reset in resetGame() along with the rest of the game state.
let consecutiveMoves = 0; // successful moves in a row without a single invalid drop
let hadInvalidThisGame = false; // whether there was ever an invalid attempt this game
let shapesPlacedThisGame = 0; // shapes placed in this specific game (for the "perfect start" achievement)
let linesClearedThisGame = 0; // for the Game Over mini-stats
let bestComboThisGame = 0; // for the Game Over mini-stats
// Highest combo tier (COMBO_TIERS) already shown for the CURRENT streak -
// reset to 0 along with the combo itself (see placeShape), not just in
// resetGame(), so a tier can fire again in a fresh streak within the same game.
let announcedComboTier = 0;
// Score milestones (SCORE_MILESTONES) already announced THIS game - reset in resetGame().
let announcedMilestones = new Set();

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function render(highlight) {
  drawBoard(boardCtx, board, colorGrid, cellSize, currentTheme(), highlight);
}

/**
 * Whether a color still appears anywhere on the board (used by the
 * full-color-clear bonus) - checks colorGrid, skipping cells in excludeKeys
 * (a set of "row,col" strings already exploded this move but not yet
 * zeroed out in colorGrid at call time - call this BEFORE zeroing them).
 * @param {string} cellColor
 * @param {Set<string>} excludeKeys
 * @returns {boolean}
 */
function colorRemainsOnBoard(cellColor, excludeKeys) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (excludeKeys.has(`${r},${c}`)) continue;
      if (colorGrid[r][c] === cellColor) return true;
    }
  }
  return false;
}

function renderTray() {
  trayEls.forEach((el, i) => {
    const ctx = el.getContext('2d');
    const cssSize = el.clientWidth;
    ctx.clearRect(0, 0, cssSize, cssSize);
    if (shapes[i]) drawShapePreview(ctx, shapes[i], shapeColors[i], cssSize);
  });
}

// Scale the canvas's internal resolution to devicePixelRatio so blocks stay
// crisp on retina phone screens - the rest of the code (cellSize, drawBoard,
// etc.) keeps working in CSS pixels; the physical-pixel scaling is hidden
// here behind ctx.setTransform.
function fitCanvasToCss(canvas, cssSize) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resize() {
  const size = Math.round(boardWrap.clientWidth);
  for (const canvas of [boardCanvas, effectsCanvas]) {
    fitCanvasToCss(canvas, size);
  }
  cellSize = computeCellSize(size);
  trayEls.forEach((el) => fitCanvasToCss(el, Math.round(el.clientWidth)));
  render();
  renderTray();
}

// Draw the board and tray immediately, before the async init below (theme,
// language, persistence, etc.) - if something in main() throws (e.g. a
// stale cached app.js on a phone references a DOM element that's gone from
// a fresh index.html), the player still sees the board and shapes instead
// of a blank screen.
resize();

async function main() {
  // Config from the environment (GAME_URL, STARS_AMOUNTS) - if there's no
  // backend nearby (e.g. the static files opened directly, no server),
  // config.js returns a safe fallback and the game stays playable.
  const config = await loadConfig();

  const persistence = createPersistence();
  const telegramBridge = createTelegramBridge({ gameUrl: config.gameUrl || undefined });
  const i18n = createI18n({ persistence });
  const challenges = createChallenges({ persistence });
  const achievements = createAchievements({ persistence });

  // Telegram SDK: ready()/expand() at startup; outside Telegram this is a
  // safe no-op.
  telegramBridge.init();

  await i18n.init();

  // ---- theme: dark/light signal comes from Telegram, the palette is our own ----
  function applyTheme(scheme) {
    document.documentElement.dataset.theme = scheme === 'light' ? 'light' : 'dark';
    render();
    renderTray();
  }
  applyTheme(telegramBridge.getColorScheme());
  telegramBridge.onThemeChange(applyTheme); // live re-theme

  // ---- padding for Telegram's own chrome ----
  // The top-bar buttons are visible, but without this padding they're easy
  // to miss-tap on a phone - touches in that strip get intercepted by
  // Telegram's native header/handle over the WebView, not the game. See
  // style.css: #app uses this custom property in padding-top together with
  // CSS env() (device notch) via max() - whichever inset is larger wins.
  function applySafeAreaTop() {
    const top = telegramBridge.getContentSafeAreaTop();
    document.documentElement.style.setProperty('--tg-safe-area-top', `${top}px`);
  }
  applySafeAreaTop();
  telegramBridge.onSafeAreaChange(applySafeAreaTop);

  // ---- high score ----
  highScore = await persistence.getItem('highScore', 0);
  highScoreValueEl.textContent = String(highScore);

  // ---- UI text via the dictionary ----
  function applyTexts() {
    scoreLabelEl.textContent = i18n.t('score');
    highScoreLabelEl.textContent = i18n.t('highScore');
    leaderboardBtn.setAttribute('aria-label', i18n.t('leaderboardBtnLabel'));
    achievementsBtn.setAttribute('aria-label', i18n.t('achievementsBtnLabel'));
    languageBtn.textContent = i18n.getLanguage().toUpperCase();
    languageBtn.setAttribute('aria-label', i18n.t('language'));
    updateScoreUI(score.comboStreak ?? 0);
  }

  languageBtn.addEventListener('click', () => {
    // The language switch (i18n's currentLanguage) happens synchronously,
    // but persistence.setItem can go through Telegram CloudStorage (a real,
    // sometimes noticeably slow network call) - so we deliberately do NOT
    // await it here: the UI updates immediately, and saving the language
    // choice to Telegram continues in the background. (Previously this
    // awaited i18n.setLanguage(...) before applyTexts() - the button would
    // visibly hang for the network round trip, sometimes swallowing taps
    // entirely.)
    const next = i18n.getLanguage() === 'ru' ? 'en' : 'ru';
    i18n.setLanguage(next);
    applyTexts();
    renderTopPanel();
  });

  // ---- top panel, under the header ----
  // This used to always show the daily challenge - shared across all
  // players and tied to the calendar date, so within one session it felt
  // "frozen". Now it shows an achievement instead: if the player pinned one
  // themselves (📌 in the list, ui/achievements.js), show that; otherwise
  // the panel auto-picks whichever unlocked achievement is closest (highest
  // progress/goal ratio among the still-locked ones, see
  // game/achievements.js getDisplayed) - so it's always alive even without
  // a manual pin. The daily challenge is now only a fallback for when
  // everything has already been unlocked.
  let lastChallenge = null;

  // While a current-game event (game/events.js) is active, it takes over
  // this same panel above the achievement/challenge display - higher
  // priority because it's temporary and needs the player's attention right
  // now, unlike the "background" achievement progress. A couple of moves
  // before it starts, a light unaddressed hint shows instead - lower
  // priority than an active event, but higher than the achievement/challenge.
  async function renderTopPanel() {
    challengePanelEl.classList.remove('challenge-panel--event', 'challenge-panel--event-hint');

    const activeEvent = eventDirector.getActive();
    if (activeEvent) {
      challengePanelEl.classList.add('challenge-panel--event');
      challengeLabelEl.textContent = `${EVENT_ICONS[activeEvent.type]} ${i18n.t(`event.${activeEvent.type}.title`)}`;
      challengeProgressEl.textContent = i18n.t('eventMovesLeft', { goal: activeEvent.movesRemaining });
      return;
    }
    if (eventDirector.isHintActive(shapesPlacedThisGame)) {
      challengePanelEl.classList.add('challenge-panel--event-hint');
      challengeLabelEl.textContent = i18n.t('eventHint');
      challengeProgressEl.textContent = '';
      return;
    }

    const displayed = await achievements.getDisplayed();
    if (displayed) {
      const isSecretLocked = displayed.tier === 'secret' && !displayed.unlocked;
      challengeLabelEl.textContent = isSecretLocked ? '???' : i18n.t(`achievement.${displayed.id}.title`);
      challengeProgressEl.textContent = displayed.unlocked
        ? i18n.t('achievementUnlocked')
        : i18n.t('achievementProgress', { progress: displayed.progress, goal: displayed.goal });
      return;
    }
    if (lastChallenge) {
      challengeLabelEl.textContent = i18n.t(`challenge.${lastChallenge.id}`, { goal: lastChallenge.goal });
      challengeProgressEl.textContent = `${lastChallenge.progress}/${lastChallenge.goal}`;
      return;
    }
    challengeLabelEl.textContent = i18n.t('noPinnedAchievement');
    challengeProgressEl.textContent = '';
  }

  async function renderChallenge(challenge) {
    if (!challenge) return;
    lastChallenge = challenge;
    await renderTopPanel();
  }
  await renderChallenge(await challenges.getTodayChallenge());

  async function reportGameEvent(event) {
    await renderChallenge(await challenges.reportProgress(event));
  }

  // ---- Game Over screen ----
  const gameOverScreen = createGameOverScreen({
    telegramBridge,
    persistence,
    i18n,
    container: overlayRoot,
    onRestart: resetGame,
  });

  // ---- achievements: persistent progress + list screen + toasts ----
  // Pinning an achievement (📌 in the list) updates the top panel right
  // away (onPinChange), without waiting for the next move.
  const achievementsScreen = createAchievementsScreen({
    container: overlayRoot,
    i18n,
    getAchievements: () => achievements.getAll(),
    getPinnedId: async () => (await achievements.getPinned())?.id ?? null,
    setPinned: (id) => achievements.setPinned(id),
    onPinChange: () => renderTopPanel(),
  });
  achievementsBtn.addEventListener('click', () => achievementsScreen.show());

  // ---- leaderboard (global, top-20, all-time) ----
  // Public read - /api/config already established the pattern that there
  // may be no backend nearby (static served locally) or it may error out
  // (KV not configured) - the screen has to show that gracefully, not crash.
  async function fetchLeaderboardData() {
    try {
      const response = await fetch('/api/leaderboard');
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  const leaderboardScreen = createLeaderboardScreen({
    container: overlayRoot,
    i18n,
    fetchLeaderboard: fetchLeaderboardData,
    getMyUserId: () => telegramBridge.getMyUserId(),
  });
  leaderboardBtn.addEventListener('click', () => leaderboardScreen.show());

  // Submitting a score is fire-and-forget (same principle as saving the
  // high score in ui/gameover.js: don't block the UI on a network call).
  // The server verifies initData and decides on its own whether this score
  // beats the stored one (GT in api/leaderboard.js) - no need to know the
  // player's previous result here, just send what we have.
  function submitLeaderboardScore(score) {
    const initData = telegramBridge.getInitData();
    if (!initData) return; // outside Telegram (or initData unavailable) - nothing to send
    fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, score }),
    }).catch(() => {
      // A network/backend failure shouldn't break anything for the player.
    });
  }

  /**
   * Runs an event through the achievement tracker and shows a toast for
   * each one it unlocks this call - reportEvent itself guarantees the same
   * achievement never fires twice (see game/achievements.js).
   * @param {Record<string, number>} deltas
   */
  async function reportAchievements(deltas) {
    const newly = await achievements.reportEvent(deltas);
    for (const def of newly) {
      showAchievementUnlock({ container: document.body, i18n, def });
      telegramBridge.haptic('lineClear'); // same "heavy" impact as a line clear - unlocking is a celebration too
    }
    // Live progress of the pinned achievement in the top panel - update on
    // every event, not just on unlock.
    await renderTopPanel();
  }

  // The score doesn't jump instantly, it eases from the old value to the
  // new one (animateScoreCountUp is a no-op if from===to, e.g. right after
  // resetGame). Called right after every totalScore change; for the
  // full-clear bonus, called again separately after the pause, once
  // totalScore has already grown by FULL_CLEAR_BONUS (see placeShape) - so
  // the counter's roll-up is visible right at the flash.
  function revealScore() {
    animateScoreCountUp(scoreValueEl, displayedScore, totalScore);
    displayedScore = totalScore;
  }

  function updateComboBadge(comboStreak) {
    if (comboStreak > 0) {
      comboValueEl.hidden = false;
      comboValueEl.textContent = i18n.t('combo', { goal: comboStreak });
    } else {
      comboValueEl.hidden = true;
    }
  }

  function updateScoreUI(comboStreak) {
    revealScore();
    updateComboBadge(comboStreak);
  }

  // Score milestones (SCORE_MILESTONES) - run after EVERY totalScore
  // change, wherever it came from (a normal move or the delayed full-clear
  // bonus), so a milestone is never missed or double-announced:
  // announcedMilestones is the source of truth for what's already been
  // flagged this game. If a single score jump crosses several milestones at
  // once, one popup shows the highest, and the bonuses for all of them add up.
  function checkScoreMilestones() {
    const crossed = SCORE_MILESTONES.filter((m) => totalScore >= m && !announcedMilestones.has(m));
    if (crossed.length === 0) return;
    let bonus = 0;
    for (const milestone of crossed) {
      announcedMilestones.add(milestone);
      bonus += Math.round(milestone * SCORE_MILESTONE_BONUS_RATE);
    }
    const highest = crossed[crossed.length - 1];
    totalScore += bonus;
    revealScore();
    playBonusPopup(bonusLayer, {
      x: (BOARD_SIZE / 2) * cellSize,
      y: (BOARD_SIZE / 2) * cellSize,
      text: `${i18n.t('scoreMilestone', { goal: highest })} +${bonus}`,
      big: true,
    });
    telegramBridge.haptic('lineClear');
    reportAchievements({ 'max:bestGameScore': totalScore });
    reportGameEvent({ scoreDelta: bonus });
  }

  async function showGameOver() {
    submitLeaderboardScore(totalScore);
    const state = await gameOverScreen.show(totalScore, {
      linesCleared: linesClearedThisGame,
      bestCombo: bestComboThisGame,
    });
    if (state.highScore > highScore) {
      highScore = state.highScore;
      highScoreValueEl.textContent = String(highScore);
    }
  }

  function checkGameOver() {
    // If any tray shape still fits somewhere, the game continues; if none do, it's Game Over.
    if (!hasAnyValidMove(board, shapes)) {
      gameOver = true;
      if (!hadInvalidThisGame) reportAchievements({ gamesWithoutInvalid: 1 });
      reportGameEvent({ gameOver: true });
      showGameOver();
    }
  }

  function refillTrayIfEmpty() {
    if (shapes.every((s) => s === null)) {
      reportAchievements({ traySetsUsed: 1 });
      // The smart generator looks at the current board - see game/shapes.js
      // pickForBoard. bigShapeRainActive is this game's event (game/events.js).
      shapes = generateShapeSet(board, {
        bigShapeRainActive: eventDirector.isBigShapeRainActive(),
      });
      shapeColors = shapes.map(() => randomBlockColor());
      renderTray();
      playAppear(trayEls);
    }
  }

  function placeShape(shapeIndex, row, col) {
    if (gameOver) return;
    const shape = shapes[shapeIndex];
    if (!shape) return;

    // Re-check right before placing: ui/input.js already validated the
    // position on pointer-up, but the "land" animation takes ~140ms between
    // that and the actual onDrop call - if the player somehow started and
    // finished another drag in that window and it already changed the
    // board, we must not try to place this shape over now-occupied cells
    // (board.place would throw and leave the shape stuck - neither on the
    // board nor in the tray).
    if (!isValidDrop(board, shape, row, col)) return;

    const color = shapeColors[shapeIndex];
    const cellsPlaced = shape.cells.length;

    // Gap-fill bonus - computed BEFORE place(), while the board is still in
    // its "before" state: findEnclosedPocket checks whether the empty
    // region around the shape was isolated and exactly its size (otherwise
    // it's just a move into open space, no bonus).
    const pocket = board.findEnclosedPocket(shape, row, col);
    const isGapFill = pocket.length === shape.cells.length;

    const { clearedRows, clearedCols } = board.place(shape, row, col);
    for (const [dr, dc] of shape.cells) {
      colorGrid[row + dr][col + dc] = color;
    }

    shapes[shapeIndex] = null;
    renderTray();
    render();

    telegramBridge.haptic('placement');

    const linesCleared = clearedRows.length + clearedCols.length;
    const { points: rawPoints, comboStreak } = score.addMove({ cellsPlaced, linesCleared });
    // Read the current event's multipliers BEFORE onShapePlaced() below -
    // that call can itself start/end the event on this exact move, and the
    // effect should only apply to moves AFTER the announcement, not the one
    // that triggered it (otherwise the player wouldn't have seen the toast
    // yet, but the bonus would already apply retroactively to a move that's
    // already been scored).
    const scoreMultiplier = eventDirector.getScoreMultiplier();
    const colorBonusMultiplier = eventDirector.getColorBonusMultiplier();
    // The "double points" event multiplies right here, once - every later
    // use of points (totalScore, achievements, popup) reads the already-
    // doubled value, never multiplying again.
    const points = rawPoints * scoreMultiplier;
    linesClearedThisGame += linesCleared;
    bestComboThisGame = Math.max(bestComboThisGame, comboStreak);

    // Named combo tiers (COMBO_TIERS) - reset "already shown" along with the
    // combo itself (comboStreak===0 means the streak broke - 3 misses in a
    // row, see game/score.js); otherwise raise it to the highest threshold
    // reached just NOW (tier.threshold > announcedComboTier stops it firing
    // again on every following move within the same streak). Safe to call
    // every move - if nothing new was reached, reachedTier just won't be found.
    if (comboStreak === 0) announcedComboTier = 0;
    let comboTierBonus = 0;
    const reachedTier = [...COMBO_TIERS].reverse().find(
      (tier) => comboStreak >= tier.threshold && tier.threshold > announcedComboTier
    );
    if (reachedTier) {
      announcedComboTier = reachedTier.threshold;
      comboTierBonus = reachedTier.bonus;
      playBonusPopup(bonusLayer, {
        x: (BOARD_SIZE / 2) * cellSize,
        y: (BOARD_SIZE / 2) * cellSize,
        text: `${i18n.t(reachedTier.key)} +${comboTierBonus}`,
        big: true,
      });
    }

    // Captured BEFORE updating movesSinceClear - the "comeback" achievement
    // counts what had built up BEFORE this move, not after it resets.
    const wasStruggling = movesSinceClear >= 6;
    movesSinceClear = linesCleared > 0 ? 0 : movesSinceClear + 1;
    consecutiveMoves += 1; // an invalid attempt (invalidDrop) resets this streak to 0
    shapesPlacedThisGame += 1;

    // This game's event (game/events.js) - once per game, random moment/duration.
    const eventChange = eventDirector.onShapePlaced(shapesPlacedThisGame);
    if (eventChange?.type === 'started') {
      const active = eventDirector.getActive();
      showEventToast({
        container: document.body,
        i18n,
        icon: EVENT_ICONS[eventChange.eventType],
        title: i18n.t(`event.${eventChange.eventType}.title`),
        desc: i18n.t(`event.${eventChange.eventType}.desc`, { goal: active.totalMoves }),
      });
      renderTopPanel();
    } else if (eventChange?.type === 'ended') {
      renderTopPanel();
    }

    const isLastSlot = shapes.every((s) => s === null);
    const isBigShape = cellsPlaced >= 6;

    const gapBonus = isGapFill ? pocket.length * GAP_FILL_BONUS_PER_CELL : 0;
    let colorClearBonus = 0;
    const colorClearEvents = []; // { color, count, bonus, cx, cy } - one per fully-removed color

    if (linesCleared > 0) {
      // First collect the cells and their colors (a cell at the intersection
      // of a cleared row and column must not appear twice, and must not
      // read an already-zeroed color), then clear colorGrid in one pass.
      const seen = new Set();
      const explodedCells = [];
      const addCell = (r, c) => {
        const key = `${r},${c}`;
        if (seen.has(key)) return;
        seen.add(key);
        explodedCells.push({ row: r, col: c, color: colorGrid[r][c] });
      };
      for (const r of clearedRows) {
        for (let c = 0; c < BOARD_SIZE; c++) addCell(r, c);
      }
      for (const c of clearedCols) {
        for (let r = 0; r < BOARD_SIZE; r++) addCell(r, c);
      }

      // Full-color-clear bonus - computed BEFORE zeroing colorGrid for
      // explodedCells: for every color seen in this explosion, check
      // whether it remains ANYWHERE ELSE on the board outside the exploded
      // cells. If not, this move removed the color entirely - bonus scaled
      // by how many cells of that color were exploded just now.
      const explodedKeys = new Set(explodedCells.map(({ row: r, col: c }) => `${r},${c}`));
      const colorCounts = new Map();
      for (const { color: cellColor } of explodedCells) {
        if (!cellColor) continue;
        colorCounts.set(cellColor, (colorCounts.get(cellColor) ?? 0) + 1);
      }
      for (const [cellColor, count] of colorCounts) {
        if (colorRemainsOnBoard(cellColor, explodedKeys)) continue;
        const cellsOfColor = explodedCells.filter((e) => e.color === cellColor);
        const cx = cellsOfColor.reduce((s, e) => s + e.col, 0) / cellsOfColor.length;
        const cy = cellsOfColor.reduce((s, e) => s + e.row, 0) / cellsOfColor.length;
        const bonus = count * COLOR_CLEAR_BONUS_PER_CELL * colorBonusMultiplier;
        colorClearBonus += bonus;
        colorClearEvents.push({ color: cellColor, count, bonus, cx, cy });
      }

      for (const { row: r, col: c } of explodedCells) {
        colorGrid[r][c] = null;
      }
      render();
      // Effect intensity (fragment count, second wave) grows on its own
      // with the number of simultaneously cleared lines and the combo
      // streak - "several lines at once" and "big combo" look more
      // powerful by actual fact, not by a flag.
      fxEngine.add(createLineClearLayer(explodedCells, cellSize, { comboStreak, linesCleared }));
      telegramBridge.haptic('lineClear');
    } else {
      // A normal placement with no line clear - a light haptic pulse on the
      // shape's cells, separate from the bigger clear explosion.
      const placedCells = shape.cells.map(([dr, dc]) => ({ row: row + dr, col: col + dc }));
      fxEngine.add(createPlacementPulseLayer(placedCells, cellSize, color));
    }

    if (gapBonus > 0) {
      const cx = pocket.reduce((s, c) => s + c.col, 0) / pocket.length;
      const cy = pocket.reduce((s, c) => s + c.row, 0) / pocket.length;
      playBonusPopup(bonusLayer, {
        x: (cx + 0.5) * cellSize,
        y: (cy + 0.5) * cellSize,
        text: `+${gapBonus}`,
      });
    }

    // One popup per color fully removed this move, tinted in that color (see playBonusPopup).
    for (const event of colorClearEvents) {
      playBonusPopup(bonusLayer, {
        x: (event.cx + 0.5) * cellSize,
        y: (event.cy + 0.5) * cellSize,
        text: `+${event.bonus}`,
        color: event.color,
      });
    }

    const totalBonus = gapBonus + colorClearBonus + comboTierBonus;
    totalScore += points + totalBonus;
    updateScoreUI(comboStreak);
    checkScoreMilestones();

    reportAchievements({
      totalShapesPlaced: 1,
      totalLinesCleared: linesCleared,
      'max:maxLinesInOneMove': linesCleared,
      'max:maxComboStreak': comboStreak,
      'max:maxSingleMoveScore': points + totalBonus,
      'max:maxConsecutiveMoves': consecutiveMoves,
      lifetimeScore: points + totalBonus,
      'max:bestGameScore': totalScore,
      ...(gapBonus > 0 ? { totalGapBonuses: 1 } : {}),
      ...(colorClearEvents.length > 0 ? { totalColorClears: colorClearEvents.length } : {}),
      ...(isBigShape ? { bigShapesPlaced: 1 } : {}),
      ...(isLastSlot ? { lastSlotPlacements: 1 } : {}),
      ...(linesCleared > 0 && wasStruggling ? { comebacks: 1 } : {}),
    });

    // Full board clear - the biggest visual response in the game, plus a
    // separate flat bonus. Doesn't fire on the move that merely places a
    // shape: only when the board is actually empty afterward, and exactly
    // once for that event - board.isEmpty() is checked once for this
    // specific place() call, not on a timer/animation, so it can't fire
    // again from anywhere else. The short pause (FULL_CLEAR_PAUSE_MS)
    // separates the normal line-clear burst from the big celebration so
    // they don't collide on the same frame - the rest of the game logic
    // (tray refill, game-over check) doesn't wait for the pause.
    const isFullClear = linesCleared > 0 && board.isEmpty();
    if (isFullClear) {
      reportAchievements({
        totalFullClears: 1,
        ...(shapesPlacedThisGame <= 5 ? { perfectStarts: 1 } : {}),
      });
      setTimeout(() => {
        if (gameOver) return; // the game already restarted - don't add the bonus on top of the new one
        fxEngine.add(createFullClearBurstLayer(cellSize, BOARD_SIZE));
        playBonusPopup(bonusLayer, {
          x: (BOARD_SIZE / 2) * cellSize,
          y: (BOARD_SIZE / 2) * cellSize,
          text: `${i18n.t('perfectClear')} +${FULL_CLEAR_BONUS}`,
          big: true,
        });
        totalScore += FULL_CLEAR_BONUS;
        revealScore();
        checkScoreMilestones();
        // A separate event (not folded into this move's main reportGameEvent
        // below - the bonus would be counted twice given the delay), only
        // scoreDelta - linesCleared/comboStreak were already counted once by
        // the main call below, not added again here.
        reportGameEvent({ scoreDelta: FULL_CLEAR_BONUS });
      }, FULL_CLEAR_PAUSE_MS);
    }

    refillTrayIfEmpty();
    reportGameEvent({ linesCleared, scoreDelta: points + totalBonus, comboStreak, shapesPlaced: 1, gameOver: false });
    checkGameOver();
  }

  function invalidDrop() {
    playShake(boardWrap);
    fxEngine.add(createInvalidPulseLayer(cellSize, BOARD_SIZE));
    telegramBridge.haptic('invalidPlacement');
    consecutiveMoves = 0;
    hadInvalidThisGame = true;
  }

  // Haptic tick when hovering a valid position during drag - only on moving
  // to a NEW cell, not on every pixel of movement (onHover fires on every
  // pointermove): the key is the set of candidate cells, a repeat with the
  // same key sends nothing, otherwise it would buzz continuously while a
  // finger just trembles slightly over the same valid position.
  let lastValidHoverKey = null;

  attachDragAndDrop({
    boardCanvas,
    dragCanvas,
    trayEls,
    getBoard: () => board,
    getShapes: () => shapes,
    getShapeColor: (i) => shapeColors[i],
    getCellSize: () => cellSize,
    isLocked: () => gameOver,
    onHover: ({ highlight, comboCells, color }) => {
      render(highlight);
      comboPreview.update(comboCells, color, cellSize);

      const valid = highlight.length > 0 && highlight.every((c) => c.valid);
      const key = valid ? highlight.map((c) => `${c.row},${c.col}`).join('|') : null;
      if (valid && key !== lastValidHoverKey) {
        telegramBridge.haptic('hoverValid');
      }
      lastValidHoverKey = key;
    },
    onHoverEnd: () => {
      render();
      comboPreview.stop();
      lastValidHoverKey = null;
    },
    onDrop: (shapeIndex, row, col) => placeShape(shapeIndex, row, col),
    onInvalidDrop: () => invalidDrop(),
  });

  // "Game started" metrics - shared by both the very first launch and every
  // resetGame(). lateNightGames is a secret achievement for playing deep in
  // the night on the player's own device clock.
  function reportNewGameStart() {
    const hour = new Date().getHours();
    reportAchievements({
      gamesPlayed: 1,
      ...(hour >= 0 && hour < 4 ? { lateNightGames: 1 } : {}),
    });
  }

  // ---- start a new game on top of the same session (no page reload) ----
  function resetGame() {
    eventDirector.reset(); // new game - new random event moment/type
    board = new Board();
    score = new Score();
    shapes = generateShapeSet(board);
    shapeColors = shapes.map(() => randomBlockColor());
    colorGrid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    totalScore = 0;
    movesSinceClear = 0;
    consecutiveMoves = 0;
    hadInvalidThisGame = false;
    shapesPlacedThisGame = 0;
    linesClearedThisGame = 0;
    bestComboThisGame = 0;
    announcedComboTier = 0;
    announcedMilestones = new Set();
    // Reset the score immediately, no count-down animation (animateScoreCountUp
    // inside updateScoreUI is a no-op when from===to).
    displayedScore = 0;
    scoreValueEl.textContent = '0';
    gameOver = false;
    updateScoreUI(0);
    render();
    renderTray();
    playAppear(trayEls);
    reportNewGameStart();
  }

  window.addEventListener('resize', resize);
  applyTexts();
  resize();
  playAppear(trayEls);
  reportNewGameStart(); // the very first main() launch counts as a game too
}

main();
