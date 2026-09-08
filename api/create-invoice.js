// api/create-invoice.js
// Серверлесс-функция Vercel: POST /api/create-invoice {amountStars} -> {invoiceUrl}
// (граница `api/create-invoice` — interfaces.md, spec §Решения 8, R43).
// Токен бота нужен для createInvoiceLink и не может попасть в клиентский код —
// поэтому вызов делается здесь, на сервере, из TELEGRAM_BOT_TOKEN.

// HTTP-клиент инжектируется (deps.fetchImpl), чтобы тесты не делали реальных
// сетевых вызовов к Telegram (см. contract исполнителя).

/**
 * Создаёт обработчик с инжектируемыми зависимостями — для тестов (мок fetch)
 * и для реальной работы (fetch к Bot API, токен из окружения).
 * @param {{token?: string, fetchImpl?: Function}} [deps]
 */
export function createInvoiceHandler(deps = {}) {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader?.('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  }

  return async function handler(req, res) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' });
      return;
    }

    const amountStars = req.body?.amountStars;
    if (!Number.isInteger(amountStars) || amountStars <= 0) {
      sendJson(res, 400, { error: 'invalid_amount' });
      return;
    }

    if (!token) {
      // Нет токена в окружении — сервер не настроен, а не ошибка игрока (R43.1).
      sendJson(res, 500, { error: 'server_misconfigured' });
      return;
    }

    try {
      const apiRes = await fetchImpl(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Поддержать разработчика',
          description: 'Донат автору игры BoomBL через Telegram Stars',
          // payload — произвольная строка для сверки на стороне бота, платёж
          // разовый и нигде не сохраняется (spec §Решения 8/12).
          payload: `donate_${amountStars}_${Date.now()}`,
          currency: 'XTR',
          prices: [{ label: 'Донат', amount: amountStars }],
        }),
      });
      const data = await apiRes.json();

      if (!data?.ok) {
        sendJson(res, 502, { error: 'invoice_failed' });
        return;
      }

      sendJson(res, 200, { invoiceUrl: data.result });
    } catch {
      // Сбой сети/Bot API — мягкая ошибка (R43.1), без падения игры.
      sendJson(res, 502, { error: 'invoice_failed' });
    }
  };
}

// Экспорт по умолчанию — точка входа для Vercel (боевые зависимости).
export default createInvoiceHandler();
