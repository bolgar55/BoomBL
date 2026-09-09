// api/create-invoice.js
// Vercel serverless function: POST /api/create-invoice {amountStars} -> {invoiceUrl}
// (boundary `api/create-invoice` — interfaces.md, spec §Decisions 8, R43).
// The bot token is needed for createInvoiceLink and must never reach client
// code — so the call is made here, server-side, from TELEGRAM_BOT_TOKEN.

// HTTP client is injected (deps.fetchImpl) so tests don't make real network
// calls to Telegram (see the implementer's contract).

/**
 * Creates the handler with injectable dependencies — for tests (mock fetch)
 * and for production use (fetch to the Bot API, token from env).
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
      // No token in env — server misconfiguration, not a player error (R43.1).
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
          // payload — arbitrary string for the bot side to cross-check; the
          // payment is one-off and never stored anywhere (spec §Decisions 8/12).
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
      // Network/Bot API failure — soft error (R43.1), doesn't crash the game.
      sendJson(res, 502, { error: 'invoice_failed' });
    }
  };
}

// Default export — Vercel entry point (production dependencies).
export default createInvoiceHandler();
