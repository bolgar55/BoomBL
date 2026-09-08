// Тесты для game/persistence.js — выбор backend'а (CloudStorage/localStorage)
// через инжектируемые моки (spec: швы для тестов, R12/R12.1/R12.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPersistence } from './persistence.js';

// Мок localStorage — простое хранилище на Map, синхронный API как у настоящего.
function createFakeLocalStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

// Мок Telegram.WebApp.CloudStorage — тоже на Map, но с колбэк-API как у настоящего.
function createFakeCloudStorage() {
  const map = new Map();
  return {
    getItem: (key, callback) => callback(null, map.has(key) ? map.get(key) : ''),
    setItem: (key, value, callback) => {
      map.set(key, value);
      callback(null, true);
    },
  };
}

function createFailingCloudStorage() {
  return {
    getItem: (key, callback) => callback(new Error('cloud недоступен')),
    setItem: (key, value, callback) => callback(new Error('cloud недоступен')),
  };
}

test('внутри Telegram с рабочим CloudStorage: setItem/getItem работают через него', async () => {
  const cloudStorage = createFakeCloudStorage();
  const storage = createFakeLocalStorage();
  const persistence = createPersistence({ telegram: { CloudStorage: cloudStorage }, storage });

  await persistence.setItem('highScore', 120);
  const value = await persistence.getItem('highScore');

  assert.equal(value, 120);
  // localStorage не должен использоваться, пока CloudStorage доступен.
  assert.equal(storage.getItem('highScore'), null);
});

test('вне Telegram (нет CloudStorage): используется localStorage', async () => {
  const storage = createFakeLocalStorage();
  const persistence = createPersistence({ telegram: undefined, storage });

  await persistence.setItem('highScore', 42);
  const value = await persistence.getItem('highScore');

  assert.equal(value, 42);
  assert.equal(storage.getItem('highScore'), '42');
});

test('сбой CloudStorage: тихий откат на localStorage, без исключения', async () => {
  const cloudStorage = createFailingCloudStorage();
  const storage = createFakeLocalStorage();
  const persistence = createPersistence({ telegram: { CloudStorage: cloudStorage }, storage });

  await persistence.setItem('highScore', 77);
  const value = await persistence.getItem('highScore');

  assert.equal(value, 77);
  assert.equal(storage.getItem('highScore'), '77');
});

test('первый запуск: getItem("highScore") возвращает 0, а не undefined/ошибку', async () => {
  const storage = createFakeLocalStorage();
  const persistence = createPersistence({ telegram: undefined, storage });

  const value = await persistence.getItem('highScore');

  assert.equal(value, 0);
});

test('первый запуск внутри Telegram (CloudStorage пуст): highScore тоже 0', async () => {
  const cloudStorage = createFakeCloudStorage();
  const persistence = createPersistence({ telegram: { CloudStorage: cloudStorage }, storage: createFakeLocalStorage() });

  const value = await persistence.getItem('highScore');

  assert.equal(value, 0);
});

test('произвольный ключ без встроенного значения по умолчанию возвращает null', async () => {
  const persistence = createPersistence({ telegram: undefined, storage: createFakeLocalStorage() });

  const value = await persistence.getItem('language');

  assert.equal(value, null);
});

test('явно переданное значение по умолчанию используется, если ключ не найден', async () => {
  const persistence = createPersistence({ telegram: undefined, storage: createFakeLocalStorage() });

  const value = await persistence.getItem('soundEnabled', true);

  assert.equal(value, true);
});
