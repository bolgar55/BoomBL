// bot/verify-webapp-data.js
// Verifies the authenticity of Telegram.WebApp.initData (Telegram's algorithm:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// Required for any API that trusts a player-submitted user.id — without
// signature verification, anyone could send someone else's Telegram profile
// and post a score under their name on the leaderboard (api/leaderboard.js).
// The bot token never leaves the server (same as in bot/bot-logic.js) — it's
// only used here, for verifying the signature.

import { createHmac, timingSafeEqual } from 'node:crypto';

// Reject stale initData — replay protection (someone could accidentally or
// deliberately resend a long-ago-intercepted initData string).
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Verifies initData and returns the parsed user data, or null on any
 * verification failure (missing hash, bad signature, auth_date too old,
 * missing/malformed user) — callers should not distinguish the reason,
 * just treat the request as unauthorized.
 * @param {string} initData - raw Telegram.WebApp.initData string
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
