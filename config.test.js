// Тесты для config.js — единственный новый модуль с логикой в тикете 07
// (интеграция), остальные файлы этого тикета — точки входа/DOM/конфигурация,
// проверяются вручную (interfaces.md: швы для тестов).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, resetConfigCacheForTests } from './config.js';

// Мок fetch, возвращающий успешный JSON-ответ.
function fetchOk(payload) {
  return async () => ({ ok: true, json: async () => payload });
}

// Мок fetch, имитирующий отсутствие бэкенда рядом со статикой (сеть недоступна).
function fetchFail() {
  return async () => {
    throw new Error('network error');
  };
}

test('загружает GAME_URL и STARS_AMOUNTS из /api/config при успешном ответе', async () => {
  resetConfigCacheForTests();
  const config = await loadConfig(fetchOk({ gameUrl: 'https://example.vercel.app', starsAmounts: [25, 50, 100] }));
  assert.equal(config.gameUrl, 'https://example.vercel.app');
  assert.deepEqual(config.starsAmounts, [25, 50, 100]);
});

test('без бэкенда (сбой сети) возвращает безопасный фолбэк, а не бросает исключение', async () => {
  resetConfigCacheForTests();
  const config = await loadConfig(fetchFail());
  assert.equal(config.gameUrl, null);
  assert.deepEqual(config.starsAmounts, []);
});

test('при не-2xx ответе тоже возвращает безопасный фолбэк', async () => {
  resetConfigCacheForTests();
  const config = await loadConfig(async () => ({ ok: false, json: async () => ({}) }));
  assert.equal(config.gameUrl, null);
  assert.deepEqual(config.starsAmounts, []);
});

test('отфильтровывает некорректные номиналы доната (не число, 0, отрицательные)', async () => {
  resetConfigCacheForTests();
  const config = await loadConfig(fetchOk({ gameUrl: '', starsAmounts: [25, 0, -5, 'x', 100] }));
  assert.deepEqual(config.starsAmounts, [25, 100]);
});

test('результат кэшируется — повторный вызов не обращается к fetch снова', async () => {
  resetConfigCacheForTests();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ gameUrl: 'https://example.vercel.app', starsAmounts: [10] }) };
  };
  await loadConfig(fetchImpl);
  await loadConfig(fetchImpl);
  assert.equal(calls, 1);
});
