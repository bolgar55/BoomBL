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
import { generateShapeSet } from './game/shapes.js';
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
import { createGameOverScreen } from './ui/gameover.js';
import { createSoundEngine } from './ui/sound.js';
import { loadConfig } from './config.js';

// Бонус за закрытие изолированного пробела (R05.4) — за клетку закрытого
// пробела. Открытое число баланса — не задано спецификацией, подобрано так,
// чтобы быть заметным на фоне обычных очков (1/клетку) и очистки линий (10×N²).
const GAP_FILL_BONUS_PER_CELL = 10;
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

  // ---- экран Game Over (R21/R27) ----
  const gameOverScreen = createGameOverScreen({
    telegramBridge,
    persistence,
    container: overlayRoot,
    onRestart: resetGame,
    playGameOverSound: () => soundEngine.playGameOver(),
  });

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

  function updateScoreUI(comboStreak) {
    revealScore();
    if (comboStreak > 0) {
      comboValueEl.hidden = false;
      comboValueEl.textContent = i18n.t('combo', { goal: comboStreak });
    } else {
      comboValueEl.hidden = true;
    }
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
      reportGameEvent({ gameOver: true });
      showGameOver();
    }
  }

  function refillTrayIfEmpty() {
    if (shapes.every((s) => s === null)) {
      // «Умная» генерация (R05.5) смотрит на текущее поле, а не выдаёт
      // фигуры вслепую — see game/shapes.js pickForBoard.
      shapes = generateShapeSet(board);
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

    const gapBonus = isGapFill ? pocket.length * GAP_FILL_BONUS_PER_CELL : 0;

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

    totalScore += points + gapBonus;
    updateScoreUI(comboStreak);

    // Полная очистка поля (R06) — самый мощный визуальный отклик в игре,
    // плюс отдельный флэт-бонус +1500. Не срабатывает на самом ходе,
    // который лишь размещает фигуру: только когда после него поле
    // действительно опустело целиком, и ровно один раз на это событие —
    // проверка board.isEmpty() выполняется один раз для этого конкретного
    // вызова place(), не по таймеру/анимации, повторно сработать неоткуда.
    // Короткая пауза (FULL_CLEAR_PAUSE_MS) отделяет обычный взрыв линии от
    // большого праздничного отклика, чтобы они не слипались в один кадр —
    // остальная игровая логика (тайл, проверка game over) паузу не ждёт.
    if (linesCleared > 0 && board.isEmpty()) {
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
    reportGameEvent({ linesCleared, scoreDelta: points + gapBonus, comboStreak, shapesPlaced: 1, gameOver: false });
    checkGameOver();
  }

  function invalidDrop() {
    playShake(boardWrap);
    fxEngine.add(createInvalidPulseLayer(cellSize, BOARD_SIZE));
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
    onHover: ({ highlight, comboCells, color }) => {
      render(highlight);
      comboPreview.update(comboCells, color, cellSize);
    },
    onHoverEnd: () => {
      render();
      comboPreview.stop();
    },
    onDrop: (shapeIndex, row, col) => placeShape(shapeIndex, row, col),
    onInvalidDrop: () => invalidDrop(),
  });

  // ---- новая партия поверх той же сессии (без перезагрузки страницы) ----
  function resetGame() {
    board = new Board();
    score = new Score();
    shapes = generateShapeSet(board);
    shapeColors = shapes.map(() => randomBlockColor());
    colorGrid = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    totalScore = 0;
    // Сброс счёта — сразу, без анимации отсчёта вниз (animateScoreCountUp
    // внутри updateScoreUI ничего не делает при from===to).
    displayedScore = 0;
    scoreValueEl.textContent = '0';
    gameOver = false;
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
