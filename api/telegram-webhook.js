// api/telegram-webhook.js
// Vercel serverless function — entry point for the Telegram bot webhook (spec
// §Decisions 11: the bot runs in webhook mode, not long-polling — the only
// mode compatible with serverless functions). All update-parsing logic lives
// in bot/bot-logic.js (boundary `bot-logic` — interfaces.md); this file only
// receives the HTTP request and replies to Telegram.
//
// Entry point/external API integration — verified manually in review, not by
// a unit test (interfaces.md: test seams).
import { createBotLogic } from '../bot/bot-logic.js';

// GAME_URL — an open spec item (see telegram/bridge.js), passed in here from
// a Vercel environment variable (ticket 07, integration): bot-logic.js itself
// doesn't change for this, only its call site — gameUrl was already an
// injectable parameter of its deps.
const botLogic = createBotLogic({ gameUrl: process.env.GAME_URL || undefined });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return;
  }

  try {
    await botLogic.handleUpdate(req.body);
  } catch {
    // An error while processing an update must not turn into a 5xx for
    // Telegram — otherwise it will keep redelivering the same update forever.
  }

  // Telegram expects a fast 200 OK regardless of how processing went.
  res.statusCode = 200;
  res.end('ok');
}
