# Интерфейсы

## Правила проекта (для любого таска)

- **Стек:** HTML5 + CSS + JavaScript (ES-модули), без сборщика, без фреймворка. Рендеринг сетки/фигур — Canvas 2D API. Бэкенд — Node.js, серверлесс-функции Vercel (`/api/*.js`), не Express-процесс.
- **Комментарии в коде — на русском** (R41), во всех файлах, всеми тасками.
- **Тест-команда:** `node --test` по файлам `*.test.js` рядом с модулем (Node.js со встроенным test runner — без внешних зависимостей на тесты). Если таск вводит новый способ тестирования — обосновать в отчёте, не молчать.
- **Запуск локально:** `npx vercel dev` (или `python3 -m http.server` для одной статики, если бэкенд ещё не собран).
- **Секреты:** `TELEGRAM_BOT_TOKEN` — только имя переменной в `.env.example`, значение никогда не пишется в код и не запрашивается у пользователя.
- **Отсутствующая зависимость** — таск возвращает `BLOCKED` с точным именем пакета, не ставит её сам.
- **Фигуры не вращаются** (R10.1) — ни в одном модуле нет операции поворота фигуры.
- **Партия не сохраняется между запусками** (Решения §12) — персистится только high score, настройки (звук/язык) и прогресс дневного челленджа.

## Границы, решённые в спецификации

| Модуль | Владеет | Выставляет | Прячет |
|---|---|---|---|
| `board` | состояние сетки 8×8 | `canPlace(shape, row, col)`, `place(shape, row, col) -> {clearedRows[], clearedCols[]}`, `canFitAnywhere(shapes[]) -> bool` | внутреннее представление сетки |
| `shapes` | каталог фигур | `generateShapeSet() -> Shape[3]` | случайный выбор из каталога |
| `score` | очки и серия комбо | `addMove({cellsPlaced, linesCleared}) -> {points, comboStreak}`, `reset()` | формулу начисления (spec §Решения 2) |
| `persistence` | лучший результат, настройки (звук, язык), прогресс челленджа | `getItem(key)`, `setItem(key, value)` — оба `Promise` | выбор backend'а: CloudStorage внутри Telegram, `localStorage` вне его или при сбое |
| `challenges` | сегодняшний челлендж и прогресс | `getTodayChallenge() -> {id, goal, progress}`, `reportProgress(event)` | генерацию шаблона по дате (spec §Решения 4) |
| `i18n` | словарь строк, текущий язык | `t(key) -> string`, `setLanguage(lang)`, `detectLanguage()` | структуру словаря |
| `telegram-bridge` | обёртка над `Telegram.WebApp` | `init()`, `getColorScheme()`, `haptic(type)`, `showMainButton(text, onClick)`, `hideMainButton()`, `openInvoice(url) -> Promise`, `shareResult(text)` | проверку наличия Telegram (spec §Решения 9) |
| `ui` | рендеринг, ввод (drag/touch), анимации, звук, экраны | точка входа приложения — сама ничего не выставляет другим модулям | детали Canvas/DOM |
| `bot-logic` | разбор апдейтов Telegram-бота | `handleUpdate(update)` | детали Telegram Bot API |
| `api/create-invoice` | — | `POST /api/create-invoice {amountStars} -> {invoiceUrl}` | вызов `createInvoiceLink` и токен бота |

## Швы для тестов

`board`, `shapes`, `score`, `challenges` — чистая логика, тестируются напрямую через сигнатуры выше. `persistence` и `telegram-bridge` — тестируются через инжектируемый мок стораджа/`window.Telegram`. `ui`, `bot-logic`, `api/create-invoice` — точки входа, проверяются вручную при ревью.

## Что построено (растёт по ходу сборки)

### Из таска 01 — ядро игровой логики

- `game/board.js` — `class Board`: `canPlace(shape, row, col) -> bool`, `place(shape, row, col) -> {clearedRows: number[], clearedCols: number[]}`, `canFitAnywhere(shapes[]) -> bool`; `export const BOARD_SIZE = 8`
- `game/shapes.js` — `generateShapeSet() -> Shape[3]` (`Shape = {id, cells: number[][]}`), `export SHAPE_CATALOG` (31 форма, без поворотов)
- `game/score.js` — `class Score`: `addMove({cellsPlaced, linesCleared}) -> {points, comboStreak}`, `reset()`
- Тесты: `node --test` (Node.js встроенный test runner), один файл — `node --test game/board.test.js`
- `package.json` создан (`type: module`, тестовый скрипт)
