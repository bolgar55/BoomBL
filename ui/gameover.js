// ui/gameover.js
// Экран Game Over (R20/R21/R27): итоговый счёт, новый рекорд, кнопки
// «Играть снова» (через telegram-bridge.showMainButton — видна только на
// этом экране) и «Поделиться результатом» (через telegram-bridge.shareResult).
// Показывать экран (по факту board.canFitAnywhere() === false) решает
// вызывающий код интеграции (таск 07) — этот модуль сам ничего не опрашивает.
//
// DOM экрана модуль создаёт сам при первом show() и добавляет в container —
// это осознанное решение, чтобы не требовать правок index.html/style.css
// (чужая зона: интеграция всех модулей — отдельный таск 07, см. CONCERNS).

// Ключ persistence — общий с остальными тасками, читающими/пишущими рекорд.
const HIGH_SCORE_KEY = 'highScore';

/**
 * Определяет, побит ли рекорд (чистая логика, без DOM).
 * @param {number} score
 * @param {number} previousHighScore
 * @returns {boolean}
 */
export function isNewHighScore(score, previousHighScore) {
  return score > previousHighScore;
}

/**
 * Итоговое состояние экрана Game Over — чистая функция, тестируется без DOM.
 * @param {number} score
 * @param {number} previousHighScore
 * @returns {{score: number, highScore: number, isNewHighScore: boolean}}
 */
export function computeGameOverState(score, previousHighScore) {
  const newRecord = isNewHighScore(score, previousHighScore);
  return {
    score,
    highScore: newRecord ? score : previousHighScore,
    isNewHighScore: newRecord,
  };
}

/**
 * Текст для «Поделиться результатом» (§Решения 7) — ссылка добавляется самим
 * telegram-bridge.shareResult, здесь формируется только текст сообщения.
 * @param {number} score
 * @param {boolean} isNewRecordFlag
 * @returns {string}
 */
export function formatShareText(score, isNewRecordFlag) {
  const base = `Я набрал ${score} очков в BoomBL!`;
  return isNewRecordFlag ? `${base} Новый личный рекорд!` : base;
}

/**
 * Текст итогового счёта, показываемый на самом экране (форматирование,
 * без DOM — определение того, показывать ли пометку о рекорде).
 * @param {number} score
 * @param {number} highScore
 * @param {boolean} isNewRecordFlag
 * @returns {string}
 */
export function formatResultText(score, highScore, isNewRecordFlag) {
  return isNewRecordFlag
    ? `Счёт: ${score} — новый рекорд!`
    : `Счёт: ${score} (рекорд: ${highScore})`;
}

/**
 * Создаёт контроллер экрана Game Over.
 * @param {{
 *   telegramBridge: {showMainButton: Function, hideMainButton: Function, shareResult: Function},
 *   persistence: {getItem: Function, setItem: Function},
 *   container?: object,
 *   document?: object,
 *   onRestart?: () => void,
 *   playGameOverSound?: () => void,
 * }} deps
 */
export function createGameOverScreen(deps) {
  const { telegramBridge, persistence } = deps;
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : null);

  let overlay = null;
  let lastState = null;

  function ensureOverlay() {
    if (overlay || !doc) return overlay;
    const container = deps.container ?? doc.body;

    overlay = doc.createElement('div');
    overlay.className = 'gameover-overlay';
    overlay.hidden = true;

    const title = doc.createElement('h2');
    title.textContent = 'Игра окончена';

    const result = doc.createElement('p');
    result.setAttribute('data-role', 'result');

    const shareButton = doc.createElement('button');
    shareButton.type = 'button';
    shareButton.setAttribute('data-role', 'share');
    shareButton.textContent = 'Поделиться результатом';
    shareButton.addEventListener('click', shareCurrentResult);

    overlay.appendChild(title);
    overlay.appendChild(result);
    overlay.appendChild(shareButton);
    container.appendChild(overlay);

    return overlay;
  }

  function shareCurrentResult() {
    if (!lastState) return;
    telegramBridge.shareResult(formatShareText(lastState.score, lastState.isNewHighScore));
  }

  /**
   * Показывает экран Game Over: читает и при необходимости обновляет
   * сохранённый рекорд, выводит счёт, включает MainButton «Играть снова».
   * @param {number} score
   * @returns {Promise<{score:number, highScore:number, isNewHighScore:boolean}>}
   */
  async function show(score) {
    const previousHighScore = await persistence.getItem(HIGH_SCORE_KEY, 0);
    const state = computeGameOverState(score, previousHighScore);
    lastState = state;

    if (state.isNewHighScore) {
      await persistence.setItem(HIGH_SCORE_KEY, state.highScore);
    }

    deps.playGameOverSound?.();

    const el = ensureOverlay();
    if (el) {
      el.querySelector('[data-role="result"]').textContent = formatResultText(
        state.score,
        state.highScore,
        state.isNewHighScore
      );
      el.hidden = false;
    }

    telegramBridge.showMainButton('Играть снова', () => {
      hide();
      deps.onRestart?.();
    });

    return state;
  }

  /** Скрывает экран и MainButton — виден только на экране Game Over (R27). */
  function hide() {
    if (overlay) overlay.hidden = true;
    telegramBridge.hideMainButton();
  }

  return { show, hide };
}
