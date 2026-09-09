// api/leaderboard.js
// Серверлесс-функция Vercel: GET /api/leaderboard -> { entries: [{userId,name,score}] }
// (топ-20 глобально, за всё время, публично, без авторизации — просто чтение).
// POST /api/leaderboard {initData, score} -> {ok, rank, bestScore} — записывает
// результат игрока, только если он выше уже сохранённого; initData обязателен
// и проверяется (bot/verify-webapp-data.js), иначе кто угодно мог бы прислать
// чужой Telegram id и записать очки от чужого имени.
//
// Хранилище — Vercel KV (Redis, см. README при деплое): без него лидерборд
// не работает, но остальная игра не должна ломаться — GET/POST в этом случае
// отвечают 503, а не падают с ошибкой (тот же принцип мягкого отказа, что и
// у api/create-invoice.js).

import { verifyInitData } from '../bot/verify-webapp-data.js';

const LEADERBOARD_KEY = 'boombl:leaderboard:alltime:scores'; // sorted set: member=userId, score=лучший счёт
const NAMES_KEY = 'boombl:leaderboard:alltime:names'; // hash: userId -> отображаемое имя
const TOP_N = 20;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader?.('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Создаёт обработчик с инжектируемыми зависимостями — для тестов (мок fetch,
 * без реального похода в Upstash/Vercel KV) и для реальной работы.
 * @param {{kvUrl?: string, kvToken?: string, botToken?: string, fetchImpl?: Function}} [deps]
 */
export function createLeaderboardHandler(deps = {}) {
  const kvUrl = deps.kvUrl ?? process.env.KV_REST_API_URL ?? '';
  const kvToken = deps.kvToken ?? process.env.KV_REST_API_TOKEN ?? '';
  const botToken = deps.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  /** Один вызов команды Redis через REST API Upstash/Vercel KV. */
  async function redis(command) {
    const res = await fetchImpl(kvUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });
    const body = await res.json();
    if (body?.error) throw new Error(body.error);
    return body.result;
  }

  /** Отображаемое имя игрока (R «глобальный лидерборд») — username приоритетнее ФИО. */
  function displayName(user) {
    if (user.username) return user.username;
    const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return full || 'Игрок';
  }

  async function handleGet(req, res) {
    try {
      // ZREVRANGE ключ 0 (N-1) WITHSCORES -> плоский массив [участник, счёт, участник, счёт, ...]
      const raw = await redis(['ZREVRANGE', LEADERBOARD_KEY, 0, TOP_N - 1, 'WITHSCORES']);
      const entries = [];
      for (let i = 0; i < raw.length; i += 2) {
        entries.push({ userId: raw[i], score: Number(raw[i + 1]) });
      }
      const userIds = entries.map((e) => e.userId);
      const names = userIds.length ? await redis(['HMGET', NAMES_KEY, ...userIds]) : [];
      entries.forEach((e, i) => {
        e.name = names[i] || 'Игрок';
      });

      sendJson(res, 200, { entries });
    } catch {
      sendJson(res, 502, { error: 'leaderboard_unavailable' });
    }
  }

  async function handlePost(req, res) {
    const initData = req.body?.initData;
    const verified = verifyInitData(initData, botToken);
    if (!verified) {
      sendJson(res, 401, { error: 'invalid_init_data' });
      return;
    }

    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || score < 0) {
      sendJson(res, 400, { error: 'invalid_score' });
      return;
    }

    const userId = String(verified.user.id);
    const name = displayName(verified.user);

    try {
      // GT — обновляет только если новый счёт больше уже сохранённого (иначе
      // не трогает существующую запись); CH — вернуть, изменилось ли что-то.
      await redis(['ZADD', LEADERBOARD_KEY, 'GT', 'CH', score, userId]);
      await redis(['HSET', NAMES_KEY, userId, name]);

      const rank = await redis(['ZREVRANK', LEADERBOARD_KEY, userId]);
      const bestScore = await redis(['ZSCORE', LEADERBOARD_KEY, userId]);

      sendJson(res, 200, {
        ok: true,
        rank: rank === null ? null : rank + 1,
        bestScore: Number(bestScore),
      });
    } catch {
      sendJson(res, 502, { error: 'leaderboard_unavailable' });
    }
  }

  return async function handler(req, res) {
    if (!kvUrl || !kvToken) {
      // Хранилище не настроено (KV не подключён) — мягкий отказ, игра без
      // лидерборда всё равно должна работать (spec §Решения 9, R46i).
      sendJson(res, 503, { error: 'leaderboard_not_configured' });
      return;
    }

    if (req.method === 'GET') {
      await handleGet(req, res);
      return;
    }
    if (req.method === 'POST') {
      await handlePost(req, res);
      return;
    }
    sendJson(res, 405, { error: 'method_not_allowed' });
  };
}

// Экспорт по умолчанию — точка входа для Vercel (боевые зависимости).
export default createLeaderboardHandler();
