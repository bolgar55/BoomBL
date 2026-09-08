// Тесты для bot/bot-logic.js — разбор апдейтов Telegram-бота через
// инжектируемый мок HTTP-клиента (без реальных сетевых вызовов к Telegram).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBotLogic } from './bot-logic.js';

// Мок fetch — записывает вызовы и возвращает успешный ответ Bot API.
function createFakeFetch(calls) {
  return async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true, result: {} }) };
  };
}

test('/start отвечает inline-кнопкой web_app с GAME_URL (R33/R39)', async () => {
  const calls = [];
  const bot = createBotLogic({
    token: 'test-token',
    gameUrl: 'https://example.com/game',
    fetchImpl: createFakeFetch(calls),
  });

  await bot.handleUpdate({ message: { text: '/start', chat: { id: 42 } } });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/sendMessage$/);
  assert.equal(calls[0].body.chat_id, 42);
  const button = calls[0].body.reply_markup.inline_keyboard[0][0];
  assert.equal(button.web_app.url, 'https://example.com/game');
});

test('токен бота не попадает в тело запроса к Bot API, только в URL', async () => {
  const calls = [];
  const bot = createBotLogic({
    token: 'secret-token',
    gameUrl: 'https://example.com',
    fetchImpl: createFakeFetch(calls),
  });

  await bot.handleUpdate({ message: { text: '/start', chat: { id: 1 } } });

  assert.doesNotMatch(JSON.stringify(calls[0].body), /secret-token/);
  assert.match(calls[0].url, /secret-token/); // токен — часть URL Bot API, это ожидаемо
});

test('pre_checkout_query подтверждается (ok: true)', async () => {
  const calls = [];
  const bot = createBotLogic({ token: 'test-token', fetchImpl: createFakeFetch(calls) });

  await bot.handleUpdate({ pre_checkout_query: { id: 'pcq-1' } });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/answerPreCheckoutQuery$/);
  assert.deepEqual(calls[0].body, { pre_checkout_query_id: 'pcq-1', ok: true });
});

test('successful_payment обрабатывается без исключений и без хранения платежа', async () => {
  const calls = [];
  const bot = createBotLogic({ token: 'test-token', fetchImpl: createFakeFetch(calls) });

  await assert.doesNotReject(
    bot.handleUpdate({
      message: { chat: { id: 7 }, successful_payment: { total_amount: 50, currency: 'XTR' } },
    })
  );
});

test('неизвестный тип апдейта — тихий no-op, без ошибок и лишних вызовов', async () => {
  const calls = [];
  const bot = createBotLogic({ token: 'test-token', fetchImpl: createFakeFetch(calls) });

  await assert.doesNotReject(bot.handleUpdate({ foo: 'bar' }));
  assert.equal(calls.length, 0);
});
