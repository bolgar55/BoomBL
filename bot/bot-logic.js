// bot/bot-logic.js
// Разбор апдейтов Telegram-бота (граница модуля `bot-logic` — interfaces.md,
// spec §Решения 8/11, R33/R35/R39/R43). Сам модуль не хранит состояние —
// каждый апдейт обрабатывается независимо, платёж разовый (spec §12/§8).
//
// Токен бота НИКОГДА не пишется в код — только имя переменной окружения
// TELEGRAM_BOT_TOKEN (interfaces.md, .env.example). HTTP-клиент инжектируется
// (deps.fetchImpl), чтобы тесты не делали реальных сетевых вызовов к Telegram.

// GAME_URL — открытое место спецификации (см. spec «Открытые места»,
// telegram/bridge.js). Плейсхолдер намеренно не похож на настоящий адрес,
// чтобы его нельзя было принять за рабочий и забыть заменить при деплое —
// таск хостинга/бота (07) обязан передать настоящий через deps.gameUrl.
const DEFAULT_GAME_URL = '[ВПИШИ-АДРЕС-ИГРЫ]';

/**
 * Создаёт обработчик апдейтов бота с инжектируемыми зависимостями — нужно
 * для тестов (мок HTTP-клиента) и для реальной работы (fetch к Bot API).
 * @param {{token?: string, gameUrl?: string, fetchImpl?: Function}} [deps]
 *   token — токен бота (по умолчанию из process.env.TELEGRAM_BOT_TOKEN);
 *   gameUrl — адрес игры для кнопки WebApp;
 *   fetchImpl — функция вида fetch(url, options) -> Promise<Response>.
 */
export function createBotLogic(deps = {}) {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  const gameUrl = deps.gameUrl ?? DEFAULT_GAME_URL;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  /** Вызов метода Telegram Bot API напрямую через fetch, без сторонних пакетов. */
  function callApi(method, params) {
    return fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }

  /** Ответ на /start: inline-кнопка WebApp, открывающая игру (R33/R39). */
  function handleStart(message) {
    return callApi('sendMessage', {
      chat_id: message.chat.id,
      text: 'BoomBL — нажми кнопку ниже, чтобы начать игру.',
      reply_markup: {
        inline_keyboard: [[{ text: 'Играть', web_app: { url: gameUrl } }]],
      },
    });
  }

  /** Подтверждение pre_checkout_query — обязательный шаг перед оплатой Stars. */
  function handlePreCheckout(preCheckoutQuery) {
    return callApi('answerPreCheckoutQuery', {
      pre_checkout_query_id: preCheckoutQuery.id,
      ok: true,
    });
  }

  /**
   * Успешный платёж (R43): ничего не сохраняется — донат разовый, лидерборда
   * нет (spec §Решения 8/12). Отправляем короткую благодарность игроку.
   */
  function handleSuccessfulPayment(message) {
    return callApi('sendMessage', {
      chat_id: message.chat.id,
      text: 'Спасибо за поддержку! ⭐',
    });
  }

  /**
   * Разбирает один апдейт Telegram и реагирует на него (interfaces.md:
   * `bot-logic.handleUpdate(update)`). Неизвестные типы апдейтов — no-op.
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
    // Прочие апдейты вне зоны этого таска — тихо игнорируются.
  }

  return { handleUpdate };
}
