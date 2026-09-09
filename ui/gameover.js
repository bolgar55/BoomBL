// ui/gameover.js
// Экран Game Over: итоговый счёт (с анимированной докруткой), бейдж нового
// рекорда, мини-статистика партии (линий очищено / лучшее комбо), конфетти,
// кнопки «Играть снова» (дублирует telegramBridge.showMainButton — видна
// только на этом экране — своей кнопкой в самой карточке, чтобы работать
// и вне Telegram) и «Поделиться результатом» (через telegramBridge.shareResult).
// DOM экрана модуль создаёт сам при первом show() и добавляет в container.

import { animateScoreCountUp, playGameOverConfetti } from './animations.js?v=0.4.4';

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
 * Создаёт контроллер экрана Game Over.
 * @param {{
 *   telegramBridge: {showMainButton: Function, hideMainButton: Function, shareResult: Function},
 *   persistence: {getItem: Function, setItem: Function},
 *   i18n: {t: Function},
 *   container?: object,
 *   document?: object,
 *   onRestart?: () => void,
 * }} deps
 */
export function createGameOverScreen(deps) {
  const { telegramBridge, persistence, i18n } = deps;
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : null);

  let overlay = null;
  let els = null;
  let lastState = null;
  let stopConfetti = null;

  function ensureOverlay() {
    if (overlay || !doc) return overlay;
    const container = deps.container ?? doc.body;

    overlay = doc.createElement('div');
    overlay.className = 'gameover-overlay';
    overlay.hidden = true;

    const confetti = doc.createElement('canvas');
    confetti.className = 'gameover-confetti';
    confetti.setAttribute('data-role', 'confetti');
    confetti.setAttribute('aria-hidden', 'true');

    const card = doc.createElement('div');
    card.className = 'gameover-card';

    const icon = doc.createElement('div');
    icon.className = 'gameover-icon';
    icon.setAttribute('data-role', 'icon');
    icon.setAttribute('aria-hidden', 'true');

    const title = doc.createElement('h2');
    title.setAttribute('data-role', 'title');

    const recordBadge = doc.createElement('span');
    recordBadge.className = 'gameover-record-badge';
    recordBadge.setAttribute('data-role', 'record-badge');
    recordBadge.hidden = true;

    const scoreLabel = doc.createElement('div');
    scoreLabel.className = 'gameover-score-label';
    scoreLabel.setAttribute('data-role', 'score-label');

    const scoreValue = doc.createElement('div');
    scoreValue.className = 'gameover-score-value';
    scoreValue.setAttribute('data-role', 'score-value');
    scoreValue.textContent = '0';

    const highscoreLine = doc.createElement('div');
    highscoreLine.className = 'gameover-highscore';
    highscoreLine.setAttribute('data-role', 'highscore-line');

    const stats = doc.createElement('div');
    stats.className = 'gameover-stats';

    function buildStat(role) {
      const stat = doc.createElement('div');
      stat.className = 'gameover-stat';
      const value = doc.createElement('div');
      value.className = 'gameover-stat-value';
      value.setAttribute('data-role', `stat-${role}-value`);
      const label = doc.createElement('div');
      label.className = 'gameover-stat-label';
      label.setAttribute('data-role', `stat-${role}-label`);
      stat.appendChild(value);
      stat.appendChild(label);
      return { stat, value, label };
    }
    const linesStat = buildStat('lines');
    const comboStat = buildStat('combo');
    stats.appendChild(linesStat.stat);
    stats.appendChild(comboStat.stat);

    const actions = doc.createElement('div');
    actions.className = 'gameover-actions';

    const restartButton = doc.createElement('button');
    restartButton.type = 'button';
    restartButton.setAttribute('data-role', 'restart');
    restartButton.addEventListener('click', () => {
      hide();
      deps.onRestart?.();
    });

    const shareButton = doc.createElement('button');
    shareButton.type = 'button';
    shareButton.setAttribute('data-role', 'share');
    shareButton.addEventListener('click', shareCurrentResult);

    actions.appendChild(restartButton);
    actions.appendChild(shareButton);

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(recordBadge);
    card.appendChild(scoreLabel);
    card.appendChild(scoreValue);
    card.appendChild(highscoreLine);
    card.appendChild(stats);
    card.appendChild(actions);

    overlay.appendChild(confetti);
    overlay.appendChild(card);
    container.appendChild(overlay);

    els = {
      confetti,
      icon,
      title,
      recordBadge,
      scoreLabel,
      scoreValue,
      highscoreLine,
      linesValue: linesStat.value,
      linesLabel: linesStat.label,
      comboValue: comboStat.value,
      comboLabel: comboStat.label,
      restartButton,
      shareButton,
    };

    return overlay;
  }

  function shareCurrentResult() {
    if (!lastState) return;
    const key = lastState.isNewHighScore ? 'shareTextRecord' : 'shareText';
    telegramBridge.shareResult(i18n.t(key, { score: lastState.score }));
  }

  /**
   * Показывает экран Game Over: читает и при необходимости обновляет
   * сохранённый рекорд, выводит счёт (с докруткой) и мини-статистику
   * партии, запускает конфетти, включает MainButton «Играть снова».
   * @param {number} score
   * @param {{linesCleared?: number, bestCombo?: number}} [stats]
   * @returns {Promise<{score:number, highScore:number, isNewHighScore:boolean}>}
   */
  async function show(score, stats = {}) {
    const previousHighScore = await persistence.getItem(HIGH_SCORE_KEY, 0);
    const state = computeGameOverState(score, previousHighScore);
    lastState = state;

    if (state.isNewHighScore) {
      await persistence.setItem(HIGH_SCORE_KEY, state.highScore);
    }

    const el = ensureOverlay();
    if (el && els) {
      els.icon.textContent = state.isNewHighScore ? '🏆' : '💥';
      els.title.textContent = i18n.t('gameOver');
      els.recordBadge.hidden = !state.isNewHighScore;
      els.recordBadge.textContent = i18n.t('newRecord');
      els.scoreLabel.textContent = i18n.t('score');
      els.highscoreLine.textContent = state.isNewHighScore
        ? ''
        : `${i18n.t('highScore')}: ${state.highScore}`;
      els.linesValue.textContent = String(stats.linesCleared ?? 0);
      els.linesLabel.textContent = i18n.t('linesCleared');
      els.comboValue.textContent = `×${stats.bestCombo ?? 0}`;
      els.comboLabel.textContent = i18n.t('bestCombo');
      els.restartButton.textContent = i18n.t('playAgain');
      els.shareButton.textContent = i18n.t('share');

      animateScoreCountUp(els.scoreValue, 0, state.score, 900);

      stopConfetti?.();
      stopConfetti = playGameOverConfetti(els.confetti, {
        count: state.isNewHighScore ? 110 : 60,
        durationMs: state.isNewHighScore ? 3200 : 2200,
      });

      el.hidden = false;
    }

    telegramBridge.showMainButton(i18n.t('playAgain'), () => {
      hide();
      deps.onRestart?.();
    });

    return state;
  }

  /** Скрывает экран и MainButton — виден только на экране Game Over (R27). */
  function hide() {
    if (overlay) overlay.hidden = true;
    stopConfetti?.();
    stopConfetti = null;
    telegramBridge.hideMainButton();
  }

  return { show, hide };
}
