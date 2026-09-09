# BoomBL

A block-placement puzzle game (Block Blast-style) built as a Telegram Mini App. Drag blocks onto an 8×8 board, clear lines, chain combos, and climb a global leaderboard — all inside Telegram.

## Features

- **Core gameplay** — drag-and-drop block placement with a live combo preview, invalid-position feedback, and smooth landing/return animations.
- **Scoring** — line-clear combo multiplier, bonuses for closing enclosed gaps and fully clearing a color off the board, named combo tiers (×5/×10/×20), and score milestones up to 1,000,000.
- **Smart tray generation** — the next set of shapes reacts to the board: it never deals a shape with nowhere to go, softly discourages hole-prone shapes (corners, zigzags, L/T pieces), and guarantees a shape-shaped gap gets filled on the next refill.
- **Session events** — one random light modifier per game (double points, a big-shape-rain, or a color-bonus rush), announced with a short heads-up before it starts.
- **Achievements** — 40+ achievements across common/rare/epic/secret tiers, with a pinnable or auto-suggested achievement shown in the top panel.
- **Global leaderboard** — top-20, all-time, backed by a Redis-compatible store, with Telegram-signature-verified score submission.
- **Telegram integration** — theme sync, haptics, safe-area-aware layout, and native share.
- **i18n** — Russian and English, auto-detected from the Telegram client or browser.

## Tech stack

Plain ES modules, no build step, no framework. Canvas 2D for rendering. Backend is a handful of serverless functions plus a webhook-based Telegram bot.

## Project structure

```
index.html, app.js, style.css   Frontend entry point
game/                           Pure game logic (board, shapes, score, achievements, events, ...)
ui/                             Rendering, input, animations, and screen components
telegram/                       Telegram.WebApp bridge
i18n/                           ru/en string dictionary
api/                            Serverless functions (config, leaderboard, Stars invoice, bot webhook)
bot/                            Telegram bot update handling + initData verification
```

## Deployment

The frontend and backend are deployed from the same repository to two different targets:

- **Frontend** — static hosting (e.g. GitHub Pages) is enough to play the game - it's a fully client-side app with no required backend.
- **Backend** — the `api/` serverless functions, an optional add-on for the Telegram bot webhook and the global leaderboard.

None of the environment variables below are required for the game itself - each one only unlocks one specific backend feature, and every feature fails gracefully (with a clear disabled/error state, never a crash) when its variable is missing:

| Variable | Enables | Without it |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | The bot's messages, and verifying who's submitting a leaderboard score | The bot can't respond; leaderboard score submissions are rejected (viewing the leaderboard still works) |
| `GAME_URL` | The bot's "Play" button and the correct link in "Share result" | The game still works when opened at its real hosting URL directly; only the bot's button/share link would point at a placeholder |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | The leaderboard's storage (a Redis-compatible key-value store) | The leaderboard screen shows a "couldn't load" message; nothing else is affected |

`STARS_AMOUNTS` (Telegram Stars donation amounts) exists in `.env.example` and `api/config.js`, but the donate button was removed from the UI - it currently has no effect either way.
