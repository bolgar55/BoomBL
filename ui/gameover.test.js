// Тесты для ui/gameover.js — чистая логика экрана Game Over (форматирование
// результата, определение нового рекорда) и оркестрация через инжектируемые
// моки telegram-bridge/persistence (R20/R21/R27).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNewHighScore,
  computeGameOverState,
  formatShareText,
  formatResultText,
  createGameOverScreen,
} from './gameover.js';

test('isNewHighScore() true, если новый счёт больше сохранённого рекорда', () => {
  assert.equal(isNewHighScore(150, 100), true);
});

test('isNewHighScore() false, если новый счёт не превышает сохранённый рекорд', () => {
  assert.equal(isNewHighScore(80, 100), false);
  assert.equal(isNewHighScore(100, 100), false);
});

test('computeGameOverState() при побитом рекорде возвращает новый highScore и флаг', () => {
  const state = computeGameOverState(150, 100);

  assert.deepEqual(state, { score: 150, highScore: 150, isNewHighScore: true });
});

test('computeGameOverState() без нового рекорда сохраняет старый highScore', () => {
  const state = computeGameOverState(70, 100);

  assert.deepEqual(state, { score: 70, highScore: 100, isNewHighScore: false });
});

test('formatShareText() добавляет пометку о рекорде только когда он побит', () => {
  assert.equal(formatShareText(120, false), 'Я набрал 120 очков в Block Blast!');
  assert.match(formatShareText(120, true), /рекорд/i);
  assert.match(formatShareText(120, true), /120/);
});

test('formatResultText() показывает рекорд из истории, если новый не побит', () => {
  const text = formatResultText(70, 100, false);

  assert.match(text, /70/);
  assert.match(text, /100/);
});

// Минимальный фейковый DOM — только то, что реально трогает контроллер
// (createElement/appendChild/querySelector/textContent/hidden), без jsdom.
function createFakeDocument() {
  function makeElement() {
    const attrs = {};
    const listeners = {};
    return {
      hidden: false,
      textContent: '',
      children: [],
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      appendChild(child) { this.children.push(child); },
      addEventListener(event, handler) { listeners[event] = handler; },
      _fireClick() { listeners.click?.(); },
      querySelector(selector) {
        const match = selector.match(/data-role="(.+)"/);
        const role = match?.[1];
        return this.children.find((c) => c.getAttribute('data-role') === role) ?? null;
      },
    };
  }
  return {
    body: makeElement(),
    createElement() { return makeElement(); },
  };
}

function createFakePersistenceForGameOver(initial = {}) {
  const store = { ...initial };
  return {
    store,
    async getItem(key, defaultValue) { return key in store ? store[key] : defaultValue; },
    async setItem(key, value) { store[key] = value; },
  };
}

function createFakeBridge() {
  const calls = { showMainButton: [], hideMainButton: 0, shareResult: [] };
  return {
    calls,
    showMainButton(text, onClick) { calls.showMainButton.push({ text, onClick }); },
    hideMainButton() { calls.hideMainButton++; },
    shareResult(text) { calls.shareResult.push(text); },
  };
}

test('show() сохраняет новый рекорд через persistence и показывает MainButton «Играть снова»', async () => {
  const persistence = createFakePersistenceForGameOver({ highScore: 100 });
  const bridge = createFakeBridge();
  const screen = createGameOverScreen({
    telegramBridge: bridge,
    persistence,
    document: createFakeDocument(),
  });

  const state = await screen.show(150);

  assert.equal(state.isNewHighScore, true);
  assert.equal(persistence.store.highScore, 150);
  assert.equal(bridge.calls.showMainButton.length, 1);
  assert.equal(bridge.calls.showMainButton[0].text, 'Играть снова');
});

test('show() без нового рекорда не перезаписывает сохранённый highScore', async () => {
  const persistence = createFakePersistenceForGameOver({ highScore: 100 });
  const bridge = createFakeBridge();
  const screen = createGameOverScreen({
    telegramBridge: bridge,
    persistence,
    document: createFakeDocument(),
  });

  await screen.show(40);

  assert.equal(persistence.store.highScore, 100);
});

test('hide() скрывает MainButton', async () => {
  const persistence = createFakePersistenceForGameOver();
  const bridge = createFakeBridge();
  const screen = createGameOverScreen({
    telegramBridge: bridge,
    persistence,
    document: createFakeDocument(),
  });
  await screen.show(10);

  screen.hide();

  assert.equal(bridge.calls.hideMainButton, 1);
});

test('клик по кнопке «Поделиться» вызывает telegramBridge.shareResult с текстом результата', async () => {
  const persistence = createFakePersistenceForGameOver({ highScore: 100 });
  const bridge = createFakeBridge();
  const fakeDoc = createFakeDocument();
  const screen = createGameOverScreen({
    telegramBridge: bridge,
    persistence,
    document: fakeDoc,
  });
  await screen.show(150);

  const overlay = fakeDoc.body.children[0];
  const shareButton = overlay.querySelector('[data-role="share"]');
  shareButton._fireClick();

  assert.equal(bridge.calls.shareResult.length, 1);
  assert.equal(bridge.calls.shareResult[0], formatShareText(150, true));
});
