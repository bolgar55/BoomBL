// api/config.js
// Серверлесс-функция Vercel: GET /api/config -> { gameUrl, starsAmounts }.
// Отдаёт клиенту публичную конфигурацию, которую нельзя прочитать в браузере
// напрямую (process.env существует только на сервере) — GAME_URL и
// STARS_AMOUNTS задаются в переменных окружения Vercel (см. README-deploy.md
// и .env.example), а не в коде. Используется через config.js (тикет 07).
//
// Ничего секретного здесь нет: GAME_URL и так публичен (адрес самой игры),
// STARS_AMOUNTS — просто список сумм для кнопок доната. Токен бота сюда не
// попадает и не отдаётся клиенту ни при каких условиях.

export default function handler(req, res) {
  const gameUrl = process.env.GAME_URL || '';
  const starsAmounts = (process.env.STARS_AMOUNTS || '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  // Значения не меняются между деплоями чаще, чем раз в релиз — короткое
  // кэширование на CDN Vercel не повредит и снизит число обращений.
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.end(JSON.stringify({ gameUrl, starsAmounts }));
}
