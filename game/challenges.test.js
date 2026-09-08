// game/challenges.test.js
// Тесты шва challenges: детерминированность шаблона/цели по дате, прогресс
// через reportProgress, сброс на новый календарный день (R14, R14.1, R14.2).
//
// Ожидаемые id/goal для тестовых дат посчитаны вручную по алгоритму хэша,
// описанному в challenges.js как "сумма кодов символов даты" — не вызовом
// кода под тестом:
//   '2026-09-08' -> сумма кодов символов = 501 -> 501 % 5 = 1 -> шаблон #1 'score' (goal 500)
//   '2026-09-09' -> сумма кодов символов = 502 -> 502 % 5 = 2 -> шаблон #2 'combo' (goal 2)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChallenges } from './challenges.js';

function createMockPersistence() {
  const store = new Map();
  return {
    async getItem(key, defaultValue) {
      return store.has(key) ? store.get(key) : defaultValue ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
  };
}

test('getTodayChallenge: детерминированный шаблон и цель по дате (совпадают с ручным расчётом хэша)', async () => {
  const challenges = createChallenges({
    persistence: createMockPersistence(),
    now: () => new Date(2026, 8, 8), // 8 сентября 2026 (месяцы в Date с 0)
  });
  const result = await challenges.getTodayChallenge();
  assert.deepEqual(result, { id: 'score', goal: 500, progress: 0 });
});

test('getTodayChallenge: та же дата — тот же шаблон и цель при повторном вызове', async () => {
  const persistence = createMockPersistence();
  const now = () => new Date(2026, 8, 8);
  const first = await createChallenges({ persistence, now }).getTodayChallenge();
  const second = await createChallenges({ persistence, now }).getTodayChallenge();
  assert.deepEqual(first, second);
});

test('getTodayChallenge: другая дата даёт другой шаблон (по ручному расчёту хэша)', async () => {
  const challenges = createChallenges({
    persistence: createMockPersistence(),
    now: () => new Date(2026, 8, 9), // 9 сентября 2026
  });
  const result = await challenges.getTodayChallenge();
  assert.deepEqual(result, { id: 'combo', goal: 2, progress: 0 });
});

test('reportProgress: накапливает прогресс и не превышает цель (шаблон score, goal 500)', async () => {
  const persistence = createMockPersistence();
  const now = () => new Date(2026, 8, 8); // шаблон 'score', goal 500
  const challenges = createChallenges({ persistence, now });

  let state = await challenges.reportProgress({ scoreDelta: 200 });
  assert.deepEqual(state, { id: 'score', goal: 500, progress: 200 });

  state = await challenges.reportProgress({ scoreDelta: 200 });
  assert.equal(state.progress, 400);

  // Ещё +1000 превысило бы цель — прогресс не должен уйти выше goal.
  state = await challenges.reportProgress({ scoreDelta: 1000 });
  assert.equal(state.progress, 500);
});

test('R14.2: при смене календарной даты устройства прогресс и шаблон сбрасываются', async () => {
  const persistence = createMockPersistence();
  let currentDate = new Date(2026, 8, 8); // 8 сентября: шаблон 'score'
  const challenges = createChallenges({ persistence, now: () => currentDate });

  await challenges.reportProgress({ scoreDelta: 300 });
  const before = await challenges.getTodayChallenge();
  assert.deepEqual(before, { id: 'score', goal: 500, progress: 300 });

  currentDate = new Date(2026, 8, 9); // на следующий день дата устройства сменилась
  const after = await challenges.getTodayChallenge();
  assert.deepEqual(after, { id: 'combo', goal: 2, progress: 0 });
});

test('R14.1: в первый день без сыгранных партий прогресс показан как 0, а не пусто', async () => {
  const challenges = createChallenges({
    persistence: createMockPersistence(),
    now: () => new Date(2026, 8, 8),
  });
  const result = await challenges.getTodayChallenge();
  assert.equal(result.progress, 0);
  assert.equal(typeof result.goal, 'number');
  assert.ok(result.goal > 0);
});
