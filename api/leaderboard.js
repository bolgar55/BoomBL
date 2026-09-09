// api/leaderboard.js
// Vercel serverless function: GET /api/leaderboard -> { entries: [{userId,name,score}] }
// (top-20 global, all-time, public, no auth — just a read).
// POST /api/leaderboard {initData, score} -> {ok, rank, bestScore} — saves the
// player's result, only if it beats what's already stored; initData is required
// and verified (bot/verify-webapp-data.js), otherwise anyone could send someone
// else's Telegram id and post a score under their name.
//
// Storage — Vercel KV (Redis, see README on deploy): without it the leaderboard
// doesn't work, but the rest of the game must keep running — GET/POST respond
// with 503 in that case instead of throwing (same soft-failure principle as
// api/create-invoice.js).

import { verifyInitData } from '../bot/verify-webapp-data.js';

const LEADERBOARD_KEY = 'boombl:leaderboard:alltime:scores'; // sorted set: member=userId, score=best score
const NAMES_KEY = 'boombl:leaderboard:alltime:names'; // hash: userId -> display name
const TOP_N = 20;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader?.('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/**
 * Creates the handler with injectable dependencies — for tests (mock fetch,
 * no real calls to Upstash/Vercel KV) and for production use.
 * @param {{kvUrl?: string, kvToken?: string, botToken?: string, fetchImpl?: Function}} [deps]
 */
export function createLeaderboardHandler(deps = {}) {
  const kvUrl = deps.kvUrl ?? process.env.KV_REST_API_URL ?? '';
  const kvToken = deps.kvToken ?? process.env.KV_REST_API_TOKEN ?? '';
  const botToken = deps.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  /** Runs a single Redis command via the Upstash/Vercel KV REST API. */
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

  /** Player's display name (R "global leaderboard") — username takes priority over full name. */
  function displayName(user) {
    if (user.username) return user.username;
    const full = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return full || 'Player';
  }

  async function handleGet(req, res) {
    try {
      // ZREVRANGE key 0 (N-1) WITHSCORES -> flat array [member, score, member, score, ...]
      const raw = await redis(['ZREVRANGE', LEADERBOARD_KEY, 0, TOP_N - 1, 'WITHSCORES']);
      const entries = [];
      for (let i = 0; i < raw.length; i += 2) {
        entries.push({ userId: raw[i], score: Number(raw[i + 1]) });
      }
      const userIds = entries.map((e) => e.userId);
      const names = userIds.length ? await redis(['HMGET', NAMES_KEY, ...userIds]) : [];
      entries.forEach((e, i) => {
        e.name = names[i] || 'Player';
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
      // GT — only updates if the new score beats the stored one (otherwise
      // leaves the existing entry untouched); CH — return whether anything changed.
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
      // Storage isn't configured (KV not connected) — soft failure, the game
      // without a leaderboard must still work (spec §Decisions 9, R46i).
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

// Default export — Vercel entry point (production dependencies).
export default createLeaderboardHandler();
