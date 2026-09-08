// Тесты для telegram/bridge.js — обёртка над Telegram.WebApp через
// инжектируемый мок (spec: швы для тестов, R24/R25/R22/R22.1/R28/R46i).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramBridge } from './bridge.js';

// Мок Telegram.WebApp с минимальным набором полей/методов, которые трогает мост.
function createFakeTelegramWebApp(overrides = {}) {
  const eventHandlers = {};
  return {
    colorScheme: 'dark',
    ready: () => {},
    expand: () => {},
    onEvent: (name, handler) => {
      eventHandlers[name] = handler;
    },
    // тестовый хук — не часть реального API, чтобы дёргать колбэк вручную
    _emit: (name, ...args) => eventHandlers[name]?.(...args),
    HapticFeedback: {
      impactOccurred: () => {},
      notificationOccurred: () => {},
    },
    MainButton: {
      setText: () => {},
      onClick: () => {},
      offClick: () => {},
      show: () => {},
      hide: () => {},
    },
    openInvoice: (url, callback) => callback('paid'),
    openTelegramLink: () => {},
    ...overrides,
  };
}

test('init() внутри Telegram вызывает ready() и expand()', () => {
  let readyCalled = false;
  let expandCalled = false;
  const telegram = createFakeTelegramWebApp({
    ready: () => { readyCalled = true; },
    expand: () => { expandCalled = true; },
  });
  const bridge = createTelegramBridge({ telegram });

  bridge.init();

  assert.equal(readyCalled, true);
  assert.equal(expandCalled, true);
});

test('init() вне Telegram — безопасный no-op, не бросает исключение', () => {
  const bridge = createTelegramBridge({ telegram: undefined });

  assert.doesNotThrow(() => bridge.init());
});

test('getColorScheme() возвращает схему из Telegram', () => {
  const telegram = createFakeTelegramWebApp({ colorScheme: 'light' });
  const bridge = createTelegramBridge({ telegram });

  assert.equal(bridge.getColorScheme(), 'light');
});

test('getColorScheme() вне Telegram возвращает тёмную схему по умолчанию', () => {
  const bridge = createTelegramBridge({ telegram: undefined });

  assert.equal(bridge.getColorScheme(), 'dark');
});

test('onThemeChange уведомляет подписчиков при смене темы Telegram (R22.1)', () => {
  const telegram = createFakeTelegramWebApp({ colorScheme: 'dark' });
  const bridge = createTelegramBridge({ telegram });
  let notifiedScheme = null;
  bridge.onThemeChange((scheme) => { notifiedScheme = scheme; });

  // Смена темы: колбэк Telegram сообщает о событии, схема уже обновлена.
  telegram.colorScheme = 'light';
  telegram._emit('themeChanged');

  assert.equal(notifiedScheme, 'light');
});

test('haptic("lineClear") вызывает impactOccurred', () => {
  let impactStyle = null;
  const telegram = createFakeTelegramWebApp({
    HapticFeedback: { impactOccurred: (style) => { impactStyle = style; }, notificationOccurred: () => {} },
  });
  const bridge = createTelegramBridge({ telegram });

  bridge.haptic('lineClear');

  assert.equal(impactStyle, 'heavy');
});

test('haptic("invalidPlacement") вызывает notificationOccurred', () => {
  let notificationType = null;
  const telegram = createFakeTelegramWebApp({
    HapticFeedback: { impactOccurred: () => {}, notificationOccurred: (type) => { notificationType = type; } },
  });
  const bridge = createTelegramBridge({ telegram });

  bridge.haptic('invalidPlacement');

  assert.equal(notificationType, 'error');
});

test('haptic() вне Telegram не падает', () => {
  const bridge = createTelegramBridge({ telegram: undefined });

  assert.doesNotThrow(() => bridge.haptic('lineClear'));
  assert.doesNotThrow(() => bridge.haptic('invalidPlacement'));
});

test('showMainButton()/hideMainButton() вне Telegram не падают', () => {
  const bridge = createTelegramBridge({ telegram: undefined });

  assert.doesNotThrow(() => bridge.showMainButton('Играть снова', () => {}));
  assert.doesNotThrow(() => bridge.hideMainButton());
});

test('showMainButton() внутри Telegram задаёт текст, колбэк и показывает кнопку', () => {
  let text = null;
  let shown = false;
  let clicked = false;
  const telegram = createFakeTelegramWebApp({
    MainButton: {
      setText: (t) => { text = t; },
      onClick: (cb) => { clicked = cb; },
      offClick: () => {},
      show: () => { shown = true; },
      hide: () => {},
    },
  });
  const bridge = createTelegramBridge({ telegram });

  bridge.showMainButton('Играть снова', () => {});

  assert.equal(text, 'Играть снова');
  assert.equal(shown, true);
  assert.equal(typeof clicked, 'function');
});

test('openInvoice() вне Telegram резолвится как failed, без исключения', async () => {
  const bridge = createTelegramBridge({ telegram: undefined });

  const status = await bridge.openInvoice('https://example.com/invoice');

  assert.equal(status, 'failed');
});

test('openInvoice() внутри Telegram резолвится статусом от Telegram', async () => {
  const telegram = createFakeTelegramWebApp({
    openInvoice: (url, callback) => callback('paid'),
  });
  const bridge = createTelegramBridge({ telegram });

  const status = await bridge.openInvoice('https://example.com/invoice');

  assert.equal(status, 'paid');
});

test('shareResult() вне Telegram не падает', () => {
  const bridge = createTelegramBridge({ telegram: undefined });

  assert.doesNotThrow(() => bridge.shareResult('Счёт: 100'));
});

test('shareResult() внутри Telegram открывает ссылку через openTelegramLink', () => {
  let openedUrl = null;
  const telegram = createFakeTelegramWebApp({
    openTelegramLink: (url) => { openedUrl = url; },
  });
  const bridge = createTelegramBridge({ telegram });

  bridge.shareResult('Счёт: 100');

  assert.match(openedUrl, /^https:\/\/t\.me\/share\/url\?url=.+&text=.*100/);
});
