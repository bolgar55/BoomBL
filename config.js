// config.js
// Simple config module, no bundler (ticket 07, criterion: GAME_URL and
// STARS_AMOUNTS must actually be read from the environment, not hardcoded
// constants). The browser has no environment variables — process.env only
// exists server-side (Vercel serverless, see api/config.js). So the client
// calls its own serverless endpoint /api/config, which reads
// process.env.GAME_URL / process.env.STARS_AMOUNTS and returns them as JSON.
//
// If the endpoint is unreachable (e.g. static files served locally via
// `python -m http.server` with no backend, or no network) — a safe fallback
// is used: empty gameUrl (telegram-bridge substitutes its own non-functional
// placeholder) and an empty list of donation amounts (the donate button is
// hidden in that case — see app.js).

// Cache the result — config doesn't change within a single page session, so
// repeated loadConfig() calls shouldn't hit the network again.
let cached = null;

/**
 * Loads the app's public config (GAME_URL, STARS_AMOUNTS) from the server.
 * Injectable fetchImpl — for tests, defaults to window.fetch.
 * @param {Function} [fetchImpl]
 * @returns {Promise<{gameUrl: string|null, starsAmounts: number[]}>}
 */
export async function loadConfig(fetchImpl = globalThis.fetch) {
  if (cached) return cached;

  try {
    const response = await fetchImpl('/api/config');
    if (!response.ok) throw new Error('config: non-2xx response');
    const data = await response.json();
    cached = {
      gameUrl: typeof data.gameUrl === 'string' && data.gameUrl ? data.gameUrl : null,
      starsAmounts: Array.isArray(data.starsAmounts) ? data.starsAmounts.filter((n) => Number.isFinite(n) && n > 0) : [],
    };
  } catch {
    // No backend next to the static files, or a network failure — the game
    // must not crash, just falls back to non-functional defaults.
    cached = { gameUrl: null, starsAmounts: [] };
  }

  return cached;
}

/** Resets the cache — only needed by tests, to check both scenarios in a row. */
export function resetConfigCacheForTests() {
  cached = null;
}
