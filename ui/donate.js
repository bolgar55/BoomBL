// ui/donate.js
// Кнопка доната через Telegram Stars (R43, spec §Решения 8). Точка входа —
// проверяется вручную при ревью, а не юнит-тестом (interfaces.md: швы для
// тестов). Логика: POST /api/create-invoice {amountStars} -> {invoiceUrl},
// затем telegram-bridge.openInvoice(invoiceUrl).
//
// Интеграция в index.html (какой элемент вызывает donate()) — зона таска 07,
// этот модуль только выставляет функцию для вызова.

// Номиналы доната в Stars — пользователь их не называл (spec «Открытые
// места»). Это ВИДИМЫЙ плейсхолдер, а не рабочее значение по умолчанию:
// перед интеграцией в UI (таск 07) сюда нужно вписать реальные суммы.
export const STARS_AMOUNTS = [/* впиши, например 25, 50, 100 */];

/**
 * Создаёт функцию доната с инжектируемыми зависимостями — нужно для
 * ручного тестирования вне Telegram и для подмены fetch при необходимости.
 * @param {{telegramBridge: {openInvoice: (url: string) => Promise<string>},
 *          fetchImpl?: Function,
 *          onError?: () => void}} deps
 *   telegramBridge — мост из telegram/bridge.js (таск 03), обязателен;
 *   fetchImpl — по умолчанию window.fetch;
 *   onError — вызывается при неудаче создания счёта (R43.1); отменённый
 *     платёж (R43.2) НЕ считается ошибкой и onError не вызывает.
 * @returns {{donate: (amountStars: number) => Promise<void>}}
 */
export function createDonateFlow(deps = {}) {
  const telegramBridge = deps.telegramBridge;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const onError = deps.onError ?? (() => {});

  /**
   * Запускает донат на amountStars Stars: создаёт счёт на сервере и
   * открывает его через Telegram. Не бросает исключений наружу — все сбои
   * обрабатываются мягко (R43.1), отмена — тихо (R43.2).
   */
  async function donate(amountStars) {
    let invoiceUrl;
    try {
      const response = await fetchImpl('/api/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountStars }),
      });
      if (!response.ok) throw new Error('create-invoice: не-2xx ответ');
      const data = await response.json();
      if (!data?.invoiceUrl) throw new Error('create-invoice: нет invoiceUrl');
      invoiceUrl = data.invoiceUrl;
    } catch {
      // Счёт создать не удалось — мягкая ошибка, игра продолжает работать (R43.1).
      onError();
      return;
    }

    const status = await telegramBridge.openInvoice(invoiceUrl);
    if (status === 'failed') {
      // Сбой открытия окна оплаты — тоже мягкая ошибка (R43.1).
      onError();
    }
    // status === 'cancelled' — тихий возврат в игру, без сообщения (R43.2).
    // status === 'paid' / 'pending' — успех/в обработке, отдельного экрана
    // не требуется: лидерборда и хранения платежа нет (spec §Решения 8/12).
  }

  return { donate };
}
