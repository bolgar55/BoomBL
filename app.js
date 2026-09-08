// app.js
// Точка входа приложения (тикет 07 — интеграция). Связывает все модули,
// построенные в тикетах 01–06, в одно рабочее приложение: игровой цикл
// (board/shapes/score), рендеринг и ввод (ui/render, ui/input, ui/animations),
// персистентность high score и настроек, мост к Telegram (тема/haptics/
// MainButton/шеринг), экран Game Over, звук, i18n, ежедневный челлендж и
// донат через Stars. Сам модуль (как и весь `ui`, см. interfaces.md) наружу
// ничего не выставляет — это верхний уровень приложения.
//
// GAME_URL/STARS_AMOUNTS — открытые места спецификации, читаются из
// переменных окружения через config.js (см. этот файл и api/config.js), а не
// зашиты константой здесь.

import { Board, BOARD_SIZE } from './game/board.js';
import { generateShapeSet } from './game/shapes.js';
import { Score } from './game/score.js';
import { computeCellSize, drawBoard, drawShapePreview, randomBlockColor } from './ui/render.js';
import { findHint, attachDragAndDrop } from './ui/input.js';
import { playAppear, playShake, playLineClear } from './ui/animations.js';
import { createPersistence } from './game/persistence.js';
import { createTelegramBridge } from './telegram/bridge.js';
import { createI18n } from './i18n/index.js';
import { createChallenges } from './game/challenges.js';
import { createGameOverScreen } from './ui/gameover.js';
import { createSoundEngine } from './ui/sound.js';
import { createDonateFlow } from './ui/donate.js';
import { loadConfig } from './config.js';

// Тексты, которых нет в словаре i18n/index.js (модуль не в зоне этого
// тикета — не расширяем его словарь, а держим здесь маленькую локальную
// добавку для двух-трёх строк вне основной разметки, см. CONCERNS в отчёте).
const EXTRA_TEXT = {
  ru: { donateError: 'Не получилось создать счёт для доната. Попробуйте позже.' },
  en: { donateError: 'Could not create a donation invoice. Please try again later.' },
};

// ---------- элементы DOM ----------
const boardCanvas = document.getElementById('board-canvas');
const boardCtx = boardCanvas.getContext('2d');
const effectsCanvas = document.getElementById('effects-canvas');
const effectsCtx = effectsCanvas.getContext('2d');
const dragCanvas = document.getElementById('drag-ghost');
const boardWrap = document.getElementById('board-wrap');
const trayEls = Array.from(document.querySelectorAll('.tray-slot'));
const scoreLabelEl = document.getElementById('score-label');
const scoreValueEl = document.getElementById('score-value');
const comboValueEl = document.getElementById('combo-value');
const highScoreLabelEl = document.getElementById('high-score-label');
const highScoreValueEl = document.getElementById('high-score-value');
const hintBtn = document.getElementById('hint-btn');
const languageBtn = document.getElementById('language-btn');
const soundSlot = document.getElementById('sound-toggle-slot');
const statusLine = document.getElementById('status-line');
const challengeLabelEl = document.getElementById('challenge-label');
const challengeProgressEl = document.getElementById('challenge-progress');
const donatePanel = document.getElementById('donate-panel');
const donateBtn = document.getElementById('donate-btn');
const overlayRoot = document.getElementById('overlay-root');

// ---- состояние партии (партия не сохраняется между запусками — spec §12) ----
let board = new Board();
let score = new Score();
let shapes = generateShapeSet();
let shapeColors = shapes.map(() => randomBlockColor());
let colorGrid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let totalScore = 0;
let highScore = 0;
let cellSize = 0;
let gameOver = false;
let statusTimer = null;

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function render(highlight) {
  drawBoard(boardCtx, board, colorGrid, cellSize, currentTheme(), highlight);
}

function renderTray() {
  trayEls.forEach((el, i) => {
    const ctx = el.getContext('2d');
    const cssSize = el.clientWidth;
    ctx.clearRect(0, 0, cssSize, cssSize);
    if (shapes[i]) drawShapePreview(ctx, shapes[i], shapeColors[i], cssSize);
  });
}

// Приводим внутреннее разрешение канваса к devicePixelRatio, чтобы блоки
// были чёткими на «глянце» телефонов с ретиной — весь остальной код
// (cellSize, drawBoard и т.д.) продолжает работать в CSS-пикселях,
// масштаб на физические пиксели скрыт здесь через ctx.setTransform.
function fitCanvasToCss(canvas, cssSize) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resize() {
  const size = Math.round(boardWrap.clientWidth);
  for (const canvas of [boardCanvas, effectsCanvas, dragCanvas]) {
    fitCanvasToCss(canvas, size);
  }
  cellSize = computeCellSize(size);
  trayEls.forEach((el) => fitCanvasToCss(el, Math.round(el.clientWidth)));
  render();
  renderTray();
}

function showStatus(text, ms) {
  statusLine.textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => { statusLine.textContent = ''; }, ms);
}

async function main() {
  // Конфигурация из окружения (GAME_URL, STARS_AMOUNTS) — без бэкенда рядом
  // (например, статика открыта напрямую файлом) config.js вернёт безопасный
  // фолбэк, и игра всё равно останется играбельной (spec §Решения 9).
  const config = await loadConfig();

  const persistence = createPersistence();
  const telegramBridge = createTelegramBridge({ gameUrl: config.gameUrl || undefined });
  const i18n = createI18n({ persistence });
  const challenges = createChallenges({ persistence });
  const soundEngine = createSoundEngine({ persistence });

  // Telegram SDK: ready()/expand() при старте (R02/R24/R25); вне Telegram —
  // безопасный no-op (R46i).
  telegramBridge.init();

  await i18n.init();
  await soundEngine.init();

  // ---- тема: сигнал тёмная/светлая берём из Telegram, палитра — своя (§6) ----
  function applyTheme(scheme) {
    document.documentElement.dataset.theme = scheme === 'light' ? 'light' : 'dark';
    render();
    renderTray();
  }
  applyTheme(telegramBridge.getColorScheme());
  telegramBridge.onThemeChange(applyTheme); // R22.1 — перекраска на лету

  // ---- звук: переключатель монтируется в свой слот в шапке (R20) ----
  soundEngine.mountToggleButton({ container: soundSlot });

  // ---- лучший результат (R12/R30) ----
  highScore = await persistence.getItem('highScore', 0);
  highScoreValueEl.textContent = String(highScore);

  // ---- тексты интерфейса через словарь (R44) ----
  function applyTexts() {
    scoreLabelEl.textContent = i18n.t('score');
    highScoreLabelEl.textContent = i18n.t('highScore');
    hintBtn.textContent = i18n.t('hint');
    donateBtn.textContent = i18n.t('donate');
    languageBtn.textContent = i18n.getLanguage().toUpperCase();
    languageBtn.setAttribute('aria-label', i18n.t('language'));
    updateScoreUI(score.comboStreak ?? 0);
  }

  languageBtn.addEventListener('click', async () => {
    const next = i18n.getLanguage() === 'ru' ? 'en' : 'ru';
    await i18n.setLanguage(next);
    applyTexts();
    renderChallenge(lastChallenge);
  });

  // ---- ежедневный челлендж (R14) ----
  let lastChallenge = null;
  function renderChallenge(challenge) {
    if (!challenge) return;
    lastChallenge = challenge;
    challengeLabelEl.textContent = i18n.t(`challenge.${challenge.id}`, { goal: challenge.goal });
    challengeProgressEl.textContent = `${challenge.progress}/${challenge.goal}`;
  }
  renderChallenge(await challenges.getTodayChallenge());

  async function reportGameEvent(event) {
    renderChallenge(await challenges.reportProgress(event));
  }

  // ---- донат через Telegram Stars (R43) ----
  const donateFlow = createDonateFlow({
    telegramBridge,
    onError: () => showStatus(EXTRA_TEXT[i18n.getLanguage()]?.donateError ?? EXTRA_TEXT.ru.donateError, 4000),
  });
  // Номиналы — из окружения (config.js), а не из плейсхолдера ui/donate.js
  // (тот пуст, пока пользователь не впишет реальные суммы — открытое место
  // спецификации). Без номиналов кнопка доната скрывается, а не падает.
  const amounts = config.starsAmounts;
  donatePanel.hidden = amounts.length === 0;
  donateBtn.addEventListener('click', () => {
    if (amounts.length === 0) return;
    donateFlow.donate(amounts[0]);
  });

  // ---- экран Game Over (R21/R27) ----
  const gameOverScreen = createGameOverScreen({
    telegramBridge,
    persistence,
    container: overlayRoot,
    onRestart: resetGame,
    playGameOverSound: () => soundEngine.playGameOver(),
  });

  function updateScoreUI(comboStreak) {
    scoreValueEl.textContent = String(totalScore);
    if (comboStreak > 0) {
      comboValueEl.hidden = false;
      comboValueEl.textContent = i18n.t('combo', { goal: comboStreak });
    } else {
      comboValueEl.hidden = true;
    }
  }

  async function showGameOver() {
    hintBtn.disabled = true;
    const state = await gameOverScreen.show(totalScore);
    if (state.highScore > highScore) {
      highScore = state.highScore;
      highScoreValueEl.textContent = String(highScore);
    }

    // ui/gameover.js строит свой DOM сам и не принимает i18n — сигнатура не
    // предусматривает перевод (см. CONCERNS в отчёте). Патчим уже
    // отрисованный текст поверх, не трогая сам модуль, чтобы закрыть R44
        // насколько это возможно без правки чужой зоны.
    const overlayEl = overlayRoot.querySelector('.gameover-overlay');
    if (overlayEl) {
      const titleEl = overlayEl.querySelector('h2');
      const resultEl = overlayEl.querySelector('[data-role="result"]');
      const shareEl = overlayEl.querySelector('[data-role="share"]');
      if (titleEl) titleEl.textContent = i18n.t('gameOver');
      if (resultEl) {
        resultEl.textContent = state.isNewHighScore
          ? `${i18n.t('result')}: ${state.score} — ${i18n.t('highScore')}!`
          : `${i18n.t('result')}: ${state.score} (${i18n.t('highScore')}: ${state.highScore})`;
      }
      if (shareEl) shareEl.textContent = i18n.t('share');
    }
    // MainButton выставляется внутри show() с русским текстом — перевыставляем
    // с переведённым, тот же переход (hide + restart), что и внутри модуля.
    telegramBridge.showMainButton(i18n.t('playAgain'), () => {
      gameOverScreen.hide();
      resetGame();
    });
  }

  function checkGameOver() {
    if (!board.canFitAnywhere(shapes.filter(Boolean))) {
      gameOver = true;
      reportGameEvent({ gameOver: true });
      showGameOver();
    }
  }

  function refillTrayIfEmpty() {
    if (shapes.every((s) => s === null)) {
      shapes = generateShapeSet();
      shapeColors = shapes.map(() => randomBlockColor());
      renderTray();
      playAppear(trayEls);
    }
  }

  function placeShape(shapeIndex, row, col) {
    if (gameOver) return;
    const shape = shapes[shapeIndex];
    const color = shapeColors[shapeIndex];
    const cellsPlaced = shape.cells.length;

    const { clearedRows, clearedCols } = board.place(shape, row, col);
    for (const [dr, dc] of shape.cells) {
      colorGrid[row + dr][col + dc] = color;
    }

    shapes[shapeIndex] = null;
    renderTray();
    render();

    soundEngine.playClick();
    telegramBridge.haptic('placement');

    const linesCleared = clearedRows.length + clearedCols.length;
    const { points, comboStreak } = score.addMove({ cellsPlaced, linesCleared });
    totalScore += points;

    if (linesCleared > 0) {
      // сперва собираем клетки и их цвета (клетки на пересечении очищенной
      // строки и столбца не должны попасть в список дважды и не должны
      // читать уже обнулённый цвет), затем одним проходом чистим colorGrid
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
      for (const { row: r, col: c } of explodedCells) {
        colorGrid[r][c] = null;
      }
      render();
      playLineClear(effectsCtx, explodedCells, cellSize, comboStreak > 1, () => {});
      soundEngine.playLineClear();
      telegramBridge.haptic('lineClear');
    }

    updateScoreUI(comboStreak);
    refillTrayIfEmpty();
    reportGameEvent({ linesCleared, scoreDelta: points, comboStreak, shapesPlaced: 1, gameOver: false });
    checkGameOver();
  }

  function invalidDrop() {
    playShake(boardWrap);
    telegramBridge.haptic('invalidPlacement');
  }

  attachDragAndDrop({
    boardCanvas,
    dragCanvas,
    trayEls,
    getBoard: () => board,
    getShapes: () => shapes,
    getShapeColor: (i) => shapeColors[i],
    getCellSize: () => cellSize,
    isLocked: () => gameOver,
    onHover: (highlight) => render(highlight),
    onHoverEnd: () => render(),
    onDrop: (shapeIndex, row, col) => placeShape(shapeIndex, row, col),
    onInvalidDrop: () => invalidDrop(),
  });

  hintBtn.addEventListener('click', () => {
    if (gameOver) return;
    const hint = findHint(board, shapes);
    if (!hint) return;
    const shape = shapes[hint.shapeIndex];
    const highlight = shape.cells.map(([dr, dc]) => ({
      row: hint.row + dr,
      col: hint.col + dc,
      valid: true,
    }));
    render(highlight);
    setTimeout(() => render(), 1500);
  });

  // ---- новая партия поверх той же сессии (без перезагрузки страницы) ----
  function resetGame() {
    board = new Board();
    score = new Score();
    shapes = generateShapeSet();
    shapeColors = shapes.map(() => randomBlockColor());
    colorGrid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    totalScore = 0;
    gameOver = false;
    hintBtn.disabled = false;
    updateScoreUI(0);
    render();
    renderTray();
    playAppear(trayEls);
  }

  window.addEventListener('resize', resize);
  applyTexts();
  resize();
  playAppear(trayEls);
}

main();
