// api/config.js
// Vercel serverless function: GET /api/config -> { gameUrl, starsAmounts }.
// Serves the client a public config that can't be read directly in the
// browser (process.env only exists server-side) — GAME_URL and
// STARS_AMOUNTS are set via Vercel environment variables (see
// README-deploy.md and .env.example), not hardcoded. Consumed via config.js
// (ticket 07).
//
// Nothing secret here: GAME_URL is public anyway (the game's own address),
// STARS_AMOUNTS is just a list of donation-button amounts. The bot token
// never ends up here and is never sent to the client under any circumstances.

export default function handler(req, res) {
  const gameUrl = process.env.GAME_URL || '';
  const starsAmounts = (process.env.STARS_AMOUNTS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  // Values don't change more than once per release between deploys — a short
  // CDN cache on Vercel is harmless and cuts down on requests.
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.end(JSON.stringify({ gameUrl, starsAmounts }));
}
