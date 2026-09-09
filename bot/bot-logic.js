// bot/bot-logic.js
// Telegram bot update parsing (module boundary `bot-logic` — interfaces.md,
// spec §Decisions 8/11, R33/R35/R39/R43). The module itself is stateless —
// each update is handled independently, the donation is one-off (spec §12/§8).
//
// The bot token is NEVER hardcoded — only the env var name
// TELEGRAM_BOT_TOKEN (interfaces.md, .env.example). The HTTP client is
// injected (deps.fetchImpl) so tests don't make real network calls to Telegram.

// GAME_URL — an open spec item (see spec "Open items", telegram/bridge.js).
// The placeholder is deliberately unlike a real address so it can't be
// mistaken for a working one and forgotten at deploy time — the hosting/bot
// task (07) must pass the real one via deps.gameUrl.
const DEFAULT_GAME_URL = '@MeBoombl_BOT';

/**
 * Creates the bot update handler with injectable dependencies — needed for
 * tests (mock HTTP client) and for production use (fetch to the Bot API).
 * @param {{token?: string, gameUrl?: string, fetchImpl?: Function}} [deps]
 *   token — bot token (defaults to process.env.TELEGRAM_BOT_TOKEN);
 *   gameUrl — game address for the WebApp button;
 *   fetchImpl — function shaped like fetch(url, options) -> Promise<Response>.
 */
export function createBotLogic(deps = {}) {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  const gameUrl = deps.gameUrl ?? DEFAULT_GAME_URL;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  /** Calls a Telegram Bot API method directly via fetch, no third-party packages. */
  function callApi(method, params) {
    return fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }

  /** Reply to /start: inline WebApp button that opens the game (R33/R39). */
  function handleStart(message) {
    return callApi('sendMessage', {
      chat_id: message.chat.id,
      text: 'BoomBL — нажми кнопку ниже, чтобы начать игру.',
      reply_markup: {
        inline_keyboard: [[{ text: 'Играть', web_app: { url: gameUrl } }]],
      },
    });
  }

  /** Confirms pre_checkout_query — required step before a Stars payment. */
  function handlePreCheckout(preCheckoutQuery) {
    return callApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: preCheckoutQuery.id,
      ok: true,
    });
  }

  /**
   * Successful payment (R43): nothing is stored — the donation is one-off,
   * there's no leaderboard for it (spec §Decisions 8/12). Sends the player a
   * short thank-you.
   */
  function handleSuccessfulPayment(message) {
    return callApi('sendMessage', {
      chat_id: message.chat.id,
      text: 'Спасибо за поддержку! ⭐',
    });
  }

  /**
   * Parses one Telegram update and reacts to it (interfaces.md:
   * `bot-logic.handleUpdate(update)`). Unknown update types are a no-op.
   */
  async function handleUpdate(update) {
    if (update?.pre_checkout_query) {
      await handlePreCheckout(update.pre_checkout_query);
      return;
    }
    if (update?.message?.successful_payment) {
      await handleSuccessfulPayment(update.message);
      return;
    }
    if (update?.message?.text === '/start') {
      await handleStart(update.message);
      return;
    }
    // Other update types are out of scope for this task — silently ignored.
  }

  return { handleUpdate };
}
