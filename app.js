// app.js
// Точка входа приложения (тикет 07 — интеграция). Связывает все модули,
// построенные в тикетах 01–06, в одно рабочее приложение: игровой цикл
// (board/shapes/score), рендеринг и ввод (ui/render, ui/input, ui/animations),
// персистентность high score и настроек, мост к Telegram (тема/haptics/
// MainButton/шеринг), экран Game Over, звук, i18n, ежедневный челлендж.
// Кнопки «Подсказка» и «Задонатить» из интерфейса убраны по просьбе — сами
// модули (ui/input.js findHint, ui/donate.js) не трогали, просто не вызываем.
// Сам модуль (как и весь `ui`, см. interfaces.md) наружу ничего не
// выставляет — это верхний уровень приложения.
//
// GAME_URL — открытое место спецификации, читается из переменных окружения
// через config.js (см. этот файл и api/config.js), а не зашито константой здесь.

import { Board, BOARD_SIZE, hasAnyValidMove } from './game/board.js';
import { generateShapeSet, resetWaveRhythm } from './game/shapes.js';
import { Score } from './game/score.js';
import { computeCellSize, drawBoard, drawShapePreview, randomBlockColor } from './ui/render.js';
import { attachDragAndDrop, isValidDrop } from './ui/input.js';
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
} from './ui/animations.js';
import { createPersistence } from './game/persistence.js';
import { createTelegramBridge } from './telegram/bridge.js';
import { createI18n } from './i18n/index.js';
import { createChallenges } from './game/challenges.js';
import { createAchievements } from './game/achievements.js';
import { createGameOverScreen } from './ui/gameover.js';
import { createAchievementsScreen, showAchievementUnlock } from './ui/achievements.js';
import { createSoundEngine } from './ui/sound.js';
import { loadConfig } from './config.js';

// Бонус за закрытие изолированного пробела (R05.4) — за клетку закрытого
// пробела. Открытое число баланса — не задано спецификацией, подобрано так,
// чтобы быть заметным на фоне обычных очков (1/клетку) и очистки линий (10×N²).
const GAP_FILL_BONUS_PER_CELL = 10;
// Бонус за полное удаление какого-то одного цвета с поля (R05.10) — за
// клетку этого цвета, удалённую именно этим ходом. Считается для КАЖДОГО
// цвета, который этим ходом исчез с поля целиком (был хоть где-то на поле
// до хода — и нигде не остался после); если очистка убрала сразу несколько
// цветов целиком (например, полная очистка всего поля), бонусы суммируются.
const COLOR_CLEAR_BONUS_PER_CELL = 20;
// Флэт-бонус за полную очистку поля («идеальный» ход, R06) — задан явно.
const FULL_CLEAR_BONUS = 1500;
// Короткая пауза (R06: «короткая пауза после очистки») между обычным
// взрывом очищенной линии и большим праздничным откликом полной очистки —
// иначе оба эффекта стартуют в один и тот же кадр и сливаются в один.
const FULL_CLEAR_PAUSE_MS = 280;

// ---------- элементы DOM ----------
const boardCanvas = document.getElementById('board-canvas');
const boardCtx = boardCanvas.getContext('2d');
const effectsCanvas = document.getElementById('effects-canvas');
const effectsCtx = effectsCanvas.getContext('2d');
// Превью потенциального комбо при перетаскивании (R05.3) делит этот же
// overlay-канвас с движком остальных эффектов (fxEngine) — они не
// пересекаются во времени: превью гаснет в onHoverEnd раньше, чем commit
// доходит до анимации взрыва после реальной постановки.
const comboPreview = createComboPreview(effectsCtx);
// Движок остальных canvas-эффектов (R19): взрыв линии, импульс размещения,
// вспышка при недопустимом ходе, фейерверк полной очистки — могут идти
// одновременно на одном канвасе, поэтому не self-driven функции, а слои
// в общем движке (см. ui/animations.js, createEffectsEngine).
const fxEngine = createEffectsEngine(effectsCtx);
const dragCanvas = document.getElementById('drag-float');
const boardWrap = document.getElementById('board-wrap');
// Слой всплывающих "+N" за бонус (R19) — над полем, внутри board-wrap.
const bonusLayer = document.getElementById('bonus-layer');
const trayEls = Array.from(document.querySelectorAll('.tray-slot'));
const scoreLabelEl = document.getElementById('score-label');
const scoreValueEl = document.getElementById('score-value');
const comboValueEl = document.getElementById('combo-value');
const highScoreLabelEl = document.getElementById('high-score-label');
const highScoreValueEl = document.getElementById('high-score-value');
const achievementsBtn = document.getElementById('achievements-btn');
const languageBtn = document.getElementById('language-btn');
const soundSlot = document.getElementById('sound-toggle-slot');
const challengeLabelEl = document.getElementById('challenge-label');
const challengeProgressEl = document.getElementById('challenge-progress');
const overlayRoot = document.getElementById('overlay-root');

// ---- состояние партии (партия не сохраняется между запусками — spec §12) ----
let board = new Board();
let score = new Score();
let shapes = generateShapeSet(board);
let shapeColors = shapes.map(() => randomBlockColor());
let colorGrid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
let totalScore = 0;
let displayedScore = 0; // то, что реально показано в scoreValueEl прямо сейчас (см. updateScoreUI)
let highScore = 0;
let cellSize = 0;
let gameOver = false;
// R05.5: сколько ходов подряд прошло без очистки линии — растёт «умную»
// генерацию лотка (game/shapes.js) в сторону спасительных фигур, когда
// игроку давно не удаётся ни одной комбо-очистки.
let movesSinceClear = 0;
// R05.7: метрики для достижений, которые не хранит ни Board, ни Score —
// сбрасываются в resetGame() вместе с остальным состоянием партии.
let consecutiveMoves = 0; // подряд успешных ходов без единого недопустимого дропа
let hadInvalidThisGame = false; // хоть одна неудачная попытка за эту партию
let shapesPlacedThisGame = 0; // фигур поставлено именно в этой партии (для «идеального старта»)

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function render(highlight) {
  drawBoard(boardCtx, board, colorGrid, cellSize, currentTheme(), highlight);
}

/**
 * Остаётся ли цвет ещё где-то на поле (R05.10, бонус за полное удаление
 * цвета) — проверяет colorGrid, пропуская клетки из excludeKeys (набор
 * "row,col", уже взорванные этим ходом, но ещё не обнулённые в colorGrid на
 * момент вызова — вызывать ДО их обнуления).
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
  for (const canvas of [boardCanvas, effectsCanvas]) {
    fitCanvasToCss(canvas, size);
  }
  cellSize = computeCellSize(size);
  trayEls.forEach((el) => fitCanvasToCss(el, Math.round(el.clientWidth)));
  render();
  renderTray();
}

// Поле и лоток рисуются сразу же, ещё до async-инициализации ниже (тема,
// язык, звук, персистентность и т.д.) — если что-то в main() упадёт
// (например, устаревший закэшированный app.js на телефоне ссылается на
// DOM-элемент, которого уже нет в свежей index.html), игрок всё равно
// увидит поле и фигуры, а не пустой экран.
resize();

async function main() {
  // Конфигурация из окружения (GAME_URL, STARS_AMOUNTS) — без бэкенда рядом
  // (например, статика открыта напрямую файлом) config.js вернёт безопасный
  // фолбэк, и игра всё равно останется играбельной (spec §Решения 9).
  const config = await loadConfig();

  const persistence = createPersistence();
  const telegramBridge = createTelegramBridge({ gameUrl: config.gameUrl || undefined });
  const i18n = createI18n({ persistence });
  const challenges = createChallenges({ persistence });
  const achievements = createAchievements({ persistence });
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

  // ---- отступ под собственный интерфейс Telegram (R05.11) ----
  // Верхние кнопки шапки визуально видны, но без этого отступа на телефоне
  // в них легко «промахнуться» — тач в этой полосе перехватывает нативную
  // шапку/хэндл Telegram поверх WebView, а не саму игру. См. style.css:
  // #app использует эту переменную в padding-top вместе с CSS env()
  // (вырез экрана) через max() — берём более крупный из двух отступов.
  function applySafeAreaTop() {
    const top = telegramBridge.getContentSafeAreaTop();
    document.documentElement.style.setProperty('--tg-safe-area-top', `${top}px`);
  }
  applySafeAreaTop();
  telegramBridge.onSafeAreaChange(applySafeAreaTop);

  // ---- звук: переключатель монтируется в свой слот в шапке (R20) ----
  soundEngine.mountToggleButton({ container: soundSlot });

  // ---- лучший результат (R12/R30) ----
  highScore = await persistence.getItem('highScore', 0);
  highScoreValueEl.textContent = String(highScore);

  // ---- тексты интерфейса через словарь (R44) ----
  function applyTexts() {
    scoreLabelEl.textContent = i18n.t('score');
    highScoreLabelEl.textContent = i18n.t('highScore');
    achievementsBtn.setAttribute('aria-label', i18n.t('achievementsBtnLabel'));
    languageBtn.textContent = i18n.getLanguage().toUpperCase();
    languageBtn.setAttribute('aria-label', i18n.t('language'));
    updateScoreUI(score.comboStreak ?? 0);
  }

  languageBtn.addEventListener('click', async () => {
    const next = i18n.getLanguage() === 'ru' ? 'en' : 'ru';
    await i18n.setLanguage(next);
    applyTexts();
    await renderTopPanel();
  });

  // ---- верхняя панель под шапкой (R05.8) ----
  // Раньше тут всегда был дневной челлендж — он общий на всех игроков и
  // привязан к календарной дате, поэтому в рамках одной сессии выглядел
  // «застывшим». Теперь тут достижение: если игрок сам закрепил одно (📌 в
  // списке, ui/achievements.js) — показываем именно его; если нет — панель
  // сама выбирает то, что скоро получится (наибольший прогресс/цель среди
  // ещё не полученных, см. game/achievements.js getDisplayed) — так она
  // всегда живая, даже без ручного выбора. Дневной челлендж остаётся только
  // как запасной вариант на случай, если вообще всё уже получено.
  let lastChallenge = null;

  async function renderTopPanel() {
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

  // ---- экран Game Over (R21/R27) ----
  const gameOverScreen = createGameOverScreen({
    telegramBridge,
    persistence,
    container: overlayRoot,
    onRestart: resetGame,
    playGameOverSound: () => soundEngine.playGameOver(),
  });

  // ---- достижения (R05.7): постоянный прогресс + экран списка + тосты ----
  // R05.8: закрепление достижения (📌 в списке) сразу обновляет верхнюю
  // панель (onPinChange), не дожидаясь следующего хода.
  const achievementsScreen = createAchievementsScreen({
    container: overlayRoot,
    i18n,
    getAchievements: () => achievements.getAll(),
    getPinnedId: async () => (await achievements.getPinned())?.id ?? null,
    setPinned: (id) => achievements.setPinned(id),
    onPinChange: () => renderTopPanel(),
  });
  achievementsBtn.addEventListener('click', () => achievementsScreen.show());

  /**
   * Прогоняет событие через трекер достижений и показывает тост для каждого,
   * что разблокировался именно этим вызовом — reportEvent сам гарантирует,
   * что одно и то же достижение не всплывёт дважды (см. game/achievements.js).
   * @param {Record<string, number>} deltas
   */
  async function reportAchievements(deltas) {
    const newly = await achievements.reportEvent(deltas);
    for (const def of newly) {
      showAchievementUnlock({ container: document.body, i18n, def });
      telegramBridge.haptic('lineClear'); // тот же «тяжёлый» impact, что и на очистке линии — разблокировка тоже событие-праздник
    }
    // Живой прогресс закреплённого достижения в верхней панели (R05.8) —
    // обновляем на каждое событие, не только на разблокировку.
    await renderTopPanel();
  }

  // R19: очки не «прыгают» мгновенно, а плавно докручиваются от прежнего
  // значения к новому (animateScoreCountUp сама не делает ничего, если
  // from===to — например, сразу после resetGame). Вызывается сразу после
  // каждого изменения totalScore; для бонуса полной очистки (R06) — ещё раз
  // отдельно, после паузы, когда сам totalScore уже вырос на FULL_CLEAR_BONUS
  // (см. placeShape) — так «докрутка счётчика» видна именно в момент вспышки.
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

  async function showGameOver() {
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
    // R05.5: если хоть одна фигура лотка ещё куда-то влезает — партия
    // продолжается; ни одна не влезает — Game Over.
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
      // «Умная» генерация (R05.5) смотрит на текущее поле и на то, как давно
      // не было очистки линии — see game/shapes.js pickForBoard.
      shapes = generateShapeSet(board, { movesSinceClear });
      shapeColors = shapes.map(() => randomBlockColor());
      renderTray();
      playAppear(trayEls);
    }
  }

  function placeShape(shapeIndex, row, col) {
    if (gameOver) return;
    const shape = shapes[shapeIndex];
    if (!shape) return;

    // Повторная проверка прямо перед постановкой (R07): ui/input.js уже
    // проверил допустимость в момент отпускания пальца, но между этим и
    // фактическим вызовом onDrop идёт анимация «влёта» (~140мс) — если игрок
    // успел сверхбыстро начать и завершить ещё один драг за это время и тот
    // уже поменял поле, здесь мы не должны попытаться поставить фигуру
    // поверх уже занятых клеток (board.place иначе бросит исключение и
    // оставит фигуру «зависшей» — ни на поле, ни в лотке).
    if (!isValidDrop(board, shape, row, col)) return;

    const color = shapeColors[shapeIndex];
    const cellsPlaced = shape.cells.length;

    // Бонус за закрытие пробела (R05.4) — считаем ДО place(), пока поле ещё
    // в состоянии «как было»: findEnclosedPocket смотрит, была ли область
    // пустых клеток вокруг фигуры изолированной и в точности её размера
    // (иначе это просто ход в открытое место, без бонуса).
    const pocket = board.findEnclosedPocket(shape, row, col);
    const isGapFill = pocket.length === shape.cells.length;

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
    // Захватываем ДО обновления movesSinceClear — «камбэк» (R05.7) считает
    // именно то, что было накоплено ПЕРЕД этим ходом, не после его сброса.
    const wasStruggling = movesSinceClear >= 6;
    movesSinceClear = linesCleared > 0 ? 0 : movesSinceClear + 1;
    consecutiveMoves += 1; // недопустимые попытки (invalidDrop) сбрасывают эту серию в 0
    shapesPlacedThisGame += 1;
    const isLastSlot = shapes.every((s) => s === null);
    const isBigShape = cellsPlaced >= 6;

    const gapBonus = isGapFill ? pocket.length * GAP_FILL_BONUS_PER_CELL : 0;
    let colorClearBonus = 0;
    const colorClearEvents = []; // { color, count, bonus, cx, cy } — по одному на каждый полностью удалённый цвет

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

      // Бонус за полное удаление цвета с поля (R05.10) — считаем ДО обнуления
      // colorGrid для explodedCells: для каждого встретившегося в этом взрыве
      // цвета проверяем, остался ли он ГДЕ-ТО ЕЩЁ на поле вне взорванных
      // клеток. Если нет — этот ход убрал цвет с поля целиком, бонус по
      // числу клеток именно этого цвета, взорванных именно сейчас.
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
        const bonus = count * COLOR_CLEAR_BONUS_PER_CELL;
        colorClearBonus += bonus;
        colorClearEvents.push({ color: cellColor, count, bonus, cx, cy });
      }

      for (const { row: r, col: c } of explodedCells) {
        colorGrid[r][c] = null;
      }
      render();
      // R19: интенсивность (число осколков, вторая волна) сама растёт с
      // числом одновременно очищенных линий и серией комбо — «несколько
      // линий одновременно» и «большое комбо» выглядят мощнее не по флагу,
      // а по факту.
      fxEngine.add(createLineClearLayer(explodedCells, cellSize, { comboStreak, linesCleared }));
      soundEngine.playLineClear();
      telegramBridge.haptic('lineClear');
    } else {
      // Обычная постановка без очистки линий — лёгкий тактильный импульс на
      // клетках фигуры (R19, «установка фигуры»/«успешное размещение»),
      // отдельный от более мощного взрыва при очистке.
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

    // По одному попапу на каждый цвет, полностью удалённый этим ходом —
    // тонированному в сам этот цвет (см. playBonusPopup), у своей области.
    for (const event of colorClearEvents) {
      playBonusPopup(bonusLayer, {
        x: (event.cx + 0.5) * cellSize,
        y: (event.cy + 0.5) * cellSize,
        text: `+${event.bonus}`,
        color: event.color,
      });
    }

    const totalBonus = gapBonus + colorClearBonus;
    totalScore += points + totalBonus;
    updateScoreUI(comboStreak);

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

    // Полная очистка поля (R06) — самый мощный визуальный отклик в игре,
    // плюс отдельный флэт-бонус +1500. Не срабатывает на самом ходе,
    // который лишь размещает фигуру: только когда после него поле
    // действительно опустело целиком, и ровно один раз на это событие —
    // проверка board.isEmpty() выполняется один раз для этого конкретного
    // вызова place(), не по таймеру/анимации, повторно сработать неоткуда.
    // Короткая пауза (FULL_CLEAR_PAUSE_MS) отделяет обычный взрыв линии от
    // большого праздничного отклика, чтобы они не слипались в один кадр —
    // остальная игровая логика (тайл, проверка game over) паузу не ждёт.
    const isFullClear = linesCleared > 0 && board.isEmpty();
    if (isFullClear) {
      reportAchievements({
        totalFullClears: 1,
        ...(shapesPlacedThisGame <= 5 ? { perfectStarts: 1 } : {}),
      });
      setTimeout(() => {
        if (gameOver) return; // партия уже перезапущена — не начисляем бонус поверх новой
        fxEngine.add(createFullClearBurstLayer(cellSize, BOARD_SIZE));
        playBonusPopup(bonusLayer, {
          x: (BOARD_SIZE / 2) * cellSize,
          y: (BOARD_SIZE / 2) * cellSize,
          text: `${i18n.t('perfectClear')} +${FULL_CLEAR_BONUS}`,
          big: true,
        });
        totalScore += FULL_CLEAR_BONUS;
        revealScore();
        // Отдельным событием (не в основном reportGameEvent этого хода —
        // тогда бонус посчитался бы в тот же вызов дважды с учётом задержки),
        // только scoreDelta — linesCleared/comboStreak этот ход уже разово
        // учтены в основном вызове ниже, второй раз их сюда не добавляем.
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

  // Вибро-тик при наведении на валидную позицию во время драга — только на
  // переход на НОВУЮ клетку, а не на каждый пиксель движения (onHover зовётся
  // на каждый pointermove): ключ — набор клеток-кандидатов, повтор с тем же
  // ключом ничего не шлёт, иначе вибрация дребезжала бы непрерывно, пока
  // палец просто чуть дрожит над одной и той же валидной позицией.
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

  // R05.7: метрики «начала партии» — общие для самого первого запуска и
  // каждого resetGame(). lateNightGames — секретное достижение за игру
  // глубокой ночью по времени устройства игрока.
  function reportNewGameStart() {
    const hour = new Date().getHours();
    reportAchievements({
      gamesPlayed: 1,
      ...(hour >= 0 && hour < 4 ? { lateNightGames: 1 } : {}),
    });
  }

  // ---- новая партия поверх той же сессии (без перезагрузки страницы) ----
  function resetGame() {
    resetWaveRhythm(); // R05.9: новая партия — новый волновой ритм размеров фигур
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
    // Сброс счёта — сразу, без анимации отсчёта вниз (animateScoreCountUp
    // внутри updateScoreUI ничего не делает при from===to).
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
  reportNewGameStart(); // партия из самого первого запуска main() тоже считается
}

main();
