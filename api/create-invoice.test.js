// Тесты для api/create-invoice.js — POST /api/create-invoice, через
// инжектируемый мок HTTP-клиента (без реальных сетевых вызовов к Telegram).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvoiceHandler } from './create-invoice.js';

// Мок res в стиле Vercel/Node — достаточно для проверки статуса и тела ответа.
function createFakeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
    },
  };
}

test('валидный amountStars → 200 {invoiceUrl}, запрос к createInvoiceLink с currency XTR', async () => {
  let capturedUrl;
  let capturedBody;
  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, result: 'https://t.me/invoice/abc' }) };
  };
  const handler = createInvoiceHandler({ token: 'test-token', fetchImpl });
  const res = createFakeRes();

  await handler({ method: 'POST', body: { amountStars: 50 } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { invoiceUrl: 'https://t.me/invoice/abc' });
  assert.match(capturedUrl, /\/createInvoiceLink$/);
  assert.equal(capturedBody.currency, 'XTR');
  assert.equal(capturedBody.prices[0].amount, 50);
});

test('токен бота не встречается в теле ответа клиенту', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ ok: true, result: 'https://t.me/invoice/abc' }),
  });
  const handler = createInvoiceHandler({ token: 'super-secret-token', fetchImpl });
  const res = createFakeRes();

  await handler({ method: 'POST', body: { amountStars: 25 } }, res);

  assert.doesNotMatch(res.body, /super-secret-token/);
});

test('невалидный amountStars → 400, Bot API не вызывается', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, json: async () => ({}) };
  };
  const handler = createInvoiceHandler({ token: 'test-token', fetchImpl });
  const res = createFakeRes();

  await handler({ method: 'POST', body: { amountStars: -5 } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('createInvoiceLink вернул ok:false → мягкая ошибка 502, без исключения', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ok: false, description: 'boom' }) });
  const handler = createInvoiceHandler({ token: 'test-token', fetchImpl });
  const res = createFakeRes();

  await assert.doesNotReject(handler({ method: 'POST', body: { amountStars: 25 } }, res));
  assert.equal(res.statusCode, 502);
});

test('не-POST метод → 405', async () => {
  const handler = createInvoiceHandler({ token: 'test-token', fetchImpl: async () => ({}) });
  const res = createFakeRes();

  await handler({ method: 'GET', body: {} }, res);

  assert.equal(res.statusCode, 405);
});
