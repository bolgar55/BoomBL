# BoomBL

A block-placement puzzle game (Block Blast-style) built as a Telegram Mini App. Drag blocks onto an 8×8 board, clear lines, chain combos, and climb a global leaderboard — all inside Telegram.

## Features

- **Core gameplay** — drag-and-drop block placement with a live combo preview, invalid-position feedback, and smooth landing/return animations.
- **Scoring** — line-clear combo multiplier, bonuses for closing enclosed gaps and fully clearing a color off the board, named combo tiers (×5/×10/×20), and score milestones up to 1,000,000.
- **Smart tray generation** — the next set of shapes reacts to the board: it never deals a shape with nowhere to go, softly discourages hole-prone shapes (corners, zigzags, L/T pieces), and guarantees a shape-shaped gap gets filled on the next refill.
- **Session events** — one random light modifier per game (double points, a big-shape-rain, or a color-bonus rush), announced with a short heads-up before it starts.
- **Achievements** — 40+ achievements across common/rare/epic/secret tiers, with a pinnable or auto-suggested achievement shown in the top panel.
- **Global leaderboard** — top-20, all-time, backed by a Redis-compatible store, with Telegram-signature-verified score submission.
- **Telegram integration** — theme sync, haptics, safe-area-aware layout, native share, and Stars-based donation support.
- **i18n** — Russian and English, auto-detected from the Telegram client or browser.

## Tech stack

Plain ES modules, no build step, no framework. Canvas 2D for rendering. Backend is a handful of Vercel serverless functions plus a webhook-based Telegram bot.

## Project structure

```
index.html, app.js, style.css   Frontend entry point
game/                           Pure game logic (board, shapes, score, achievements, events, ...)
ui/                             Rendering, input, animations, and screen components
telegram/                       Telegram.WebApp bridge
i18n/                           ru/en string dictionary
api/                            Vercel serverless functions (config, leaderboard, Stars invoice, bot webhook)
bot/                            Telegram bot update handling + initData verification
```

## Running locally

The frontend is static — any static file server works:

```bash
python -m http.server 8123
```

The backend (`api/`, `bot/`) is a set of Vercel serverless functions. To run everything together locally, use the Vercel CLI:

```bash
npx vercel dev
```

## Deployment

The frontend and backend are deployed from the same repository to two different targets:

- **Frontend** — GitHub Pages (static files only).
- **Backend** — Vercel (`api/` and `vercel.json`), for the Telegram bot webhook, the Stars invoice endpoint, and the leaderboard API.

Required environment variables (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot API token, also used to verify `Telegram.WebApp.initData` signatures |
| `GAME_URL` | Public URL of the deployed game, used by the bot's WebApp button and share links |
| `STARS_AMOUNTS` | Comma-separated donation amounts (Telegram Stars) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Redis-compatible store for the leaderboard (e.g. Vercel KV) |
