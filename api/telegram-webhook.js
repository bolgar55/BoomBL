// api/telegram-webhook.js
// Серверлесс-функция Vercel — точка входа вебхука Telegram-бота (spec §Решения 11:
// бот работает в режиме webhook, не long-polling — единственный режим,
// совместимый с серверлесс-функциями). Вся логика разбора апдейтов — в
// bot/bot-logic.js (граница `bot-logic` — interfaces.md), здесь только приём
// HTTP-запроса и ответ Telegram.
//
// Точка входа/интеграция с внешним API — проверяется вручную при ревью,
// а не юнит-тестом (interfaces.md: швы для тестов).
import { createBotLogic } from '../bot/bot-logic.js';

const botLogic = createBotLogic();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return;
  }

  try {
    await botLogic.handleUpdate(req.body);
  } catch {
    // Ошибка обработки апдейта не должна превращаться в 5xx для Telegram —
    // иначе он будет бесконечно повторять доставку одного и того же апдейта.
  }

  // Telegram ожидает быстрый 200 OK независимо от исхода обработки.
  res.statusCode = 200;
  res.end('ok');
}
