// config.js
// Простой конфиг-модуль без сборщика (тикет 07, критерий: GAME_URL и
// STARS_AMOUNTS должны реально читаться из окружения, а не быть константой
// в коде). В браузере переменных окружения не существует — process.env
// доступен только на сервере (Vercel serverless, см. api/config.js). Поэтому
// клиент запрашивает свой собственный serverless-эндпоинт /api/config,
// который читает process.env.GAME_URL / process.env.STARS_AMOUNTS и отдаёт
// их в виде JSON.
//
// Если эндпоинт недоступен (например, статика поднята локально через
// `python -m http.server` без бэкенда, или сеть недоступна) — используется
// безопасный фолбэк: пустой gameUrl (telegram-bridge сам подставит свой
// нефункциональный плейсхолдер) и пустой список номиналов доната (кнопка
// доната в этом случае скрывается — см. app.js).

// Кэшируем результат — конфиг не меняется в рамках одной сессии страницы,
// повторные вызовы loadConfig() не должны бить по сети заново.
let cached = null;

/**
 * Загружает публичную конфигурацию приложения (GAME_URL, STARS_AMOUNTS)
 * с сервера. Инжектируемый fetchImpl — для тестов, по умолчанию window.fetch.
 * @param {Function} [fetchImpl]
 * @returns {Promise<{gameUrl: string|null, starsAmounts: number[]}>}
 */
export async function loadConfig(fetchImpl = globalThis.fetch) {
  if (cached) return cached;

  try {
    const response = await fetchImpl('/api/config');
    if (!response.ok) throw new Error('config: не-2xx ответ');
    const data = await response.json();
    cached = {
      gameUrl: typeof data.gameUrl === 'string' && data.gameUrl ? data.gameUrl : null,
      starsAmounts: Array.isArray(data.starsAmounts) ? data.starsAmounts.filter((n) => Number.isFinite(n) && n > 0) : [],
    };
  } catch {
    // Нет бэкенда рядом со статикой или сбой сети — игра не должна падать,
    // просто используются нефункциональные значения по умолчанию.
    cached = { gameUrl: null, starsAmounts: [] };
  }

  return cached;
}

/** Сбрасывает кэш — нужно только тестам, чтобы проверять оба сценария подряд. */
export function resetConfigCacheForTests() {
  cached = null;
}
