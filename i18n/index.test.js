// i18n/index.test.js
// Тесты шва i18n: определение языка по умолчанию, переключение языка,
// сохранение выбора через persistence. Реализация — game/persistence.js —
// не используется напрямую, вместо неё простой in-memory мок (тот же
// контракт getItem/setItem-Promise, что описан в interfaces.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createI18n } from './index.js';

function createMockPersistence(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async getItem(key, defaultValue) {
      return store.has(key) ? store.get(key) : defaultValue ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    _store: store,
  };
}

test('detectLanguage: язык Telegram-пользователя имеет приоритет над языком браузера', () => {
  const i18n = createI18n({ telegramLanguageCode: 'ru', navigatorLanguage: 'en-US' });
  assert.equal(i18n.detectLanguage(), 'ru');
});

test('detectLanguage: без Telegram — язык браузера (нормализация en-US -> en)', () => {
  const i18n = createI18n({ telegramLanguageCode: null, navigatorLanguage: 'en-US' });
  assert.equal(i18n.detectLanguage(), 'en');
});

test('detectLanguage: ни Telegram, ни поддерживаемый браузер — по умолчанию ru', () => {
  const i18n = createI18n({ telegramLanguageCode: null, navigatorLanguage: 'fr-FR' });
  assert.equal(i18n.detectLanguage(), 'ru');
});

test('t(key): возвращает строку на текущем языке, setLanguage меняет мгновенно', async () => {
  const i18n = createI18n();
  assert.equal(i18n.t('hint'), 'Подсказка');
  await i18n.setLanguage('en');
  assert.equal(i18n.t('hint'), 'Hint');
});

test('init(): при первом запуске (persistence пуста) определяет язык автоматически и сохраняет его', async () => {
  const persistence = createMockPersistence();
  const i18n = createI18n({ telegramLanguageCode: 'en-GB', persistence });
  const lang = await i18n.init();
  assert.equal(lang, 'en');
  assert.equal(await persistence.getItem('language'), 'en');
});

test('init(): при повторном запуске использует ранее сохранённый язык, а не автоопределение', async () => {
  const persistence = createMockPersistence({ language: 'en' });
  // Telegram и браузер "говорят" ru, но сохранённый выбор игрока — en.
  const i18n = createI18n({ telegramLanguageCode: 'ru', persistence });
  const lang = await i18n.init();
  assert.equal(lang, 'en');
});
