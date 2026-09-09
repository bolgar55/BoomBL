// bot/verify-webapp-data.js
// Проверка подлинности Telegram.WebApp.initData (алгоритм Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// Обязательна для любого API, принимающего данные от игрока с доверием к
// присланному user.id — без проверки подписи кто угодно мог бы прислать
// чужой Telegram-профиль и записать результат от чужого имени в лидерборд
// (api/leaderboard.js). Токен бота никогда не покидает сервер (как и в
// bot/bot-logic.js) — только сюда, для проверки подписи.

import { createHmac, timingSafeEqual } from 'node:crypto';

// Старый initData не принимаем — защита от replay (кто-то мог случайно или
// намеренно переслать когда-то davно перехваченную строку initData).
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Проверяет initData и возвращает разобранные данные пользователя, либо null
 * при любой ошибке проверки (нет hash, неверная подпись, слишком старый
 * auth_date, отсутствующий/битый user) — вызывающий код не должен различать
 * причину отказа, просто отклонять запрос как неавторизованный.
 * @param {string} initData - сырая строка Telegram.WebApp.initData
 * @param {string} botToken
 * @returns {{ user: { id: number, username?: string, first_name?: string, last_name?: string } } | null}
 */
export function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]+$/i.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const expected = Buffer.from(computedHash, 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) return null;

  let user;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return null;
  }
  if (!user || typeof user.id !== 'number') return null;

  return { user };
}
