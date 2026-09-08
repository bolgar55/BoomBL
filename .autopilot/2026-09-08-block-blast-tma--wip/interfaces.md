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

### Из таска 02 — рендеринг, ввод, подсказка

- `ui/render.js` — `THEME`, `BLOCK_COLORS`, `randomBlockColor()`, `computeCellSize(canvasSize)`, `cellRect(row,col,cellSize)`, `pixelToCell(x,y,cellSize)`, `isOccupied(board,row,col)`, `drawBoard(ctx,board,colorGrid,cellSize,theme,highlight)`, `drawShapePreview(ctx,shape,color,canvasSize)`, `drawShapeGhost(ctx,shape,row,col,cellSize,color)`
- `ui/input.js` — `isValidDrop(board,shape,row,col)`, `findHint(board,shapes) -> {shapeIndex,row,col}|null`, `shapeCells`, `shapeBounds`, `attachDragAndDrop(opts)` (Pointer Events, единый код для мыши и touch)
- `ui/animations.js` — `playAppear(els)`, `playShake(el)`, `playLineClear(ctx,cells,cellSize,isCombo,onDone)`
- `style.css`, `index.html` — палитра из `reference.md` использована буквально (hex-коды)
- Игра пока показывает минимальное текстовое уведомление на game over — полноценный экран (R21/R27) строит таск 04, поверх `telegram-bridge`/`persistence` из таска 03

### Из таска 03 — персистентность и мост к Telegram

- `game/persistence.js` — `createPersistence({telegram?, storage?}) -> {getItem(key, defaultValue?) -> Promise<*>, setItem(key, value) -> Promise<void>}` (JSON-сериализация, `highScore` по умолчанию 0)
- `telegram/bridge.js` — `createTelegramBridge({telegram?, gameUrl?}) -> {init(), getColorScheme()->'dark'|'light', onThemeChange(cb)->unsubscribe, haptic(type) [type: 'placement'|'lineClear'|'invalidPlacement'], showMainButton(text,onClick), hideMainButton(), openInvoice(url)->Promise<'paid'|'cancelled'|'failed'|'pending'>, shareResult(text)}`
- `onThemeChange` — метод сверх исходного списка в «Границах», добавлен ради R22.1 (живая перекраска при смене темы Telegram); дальнейшие таски используют его для подписки на смену темы
- Плейсхолдер URL закрыт дозапросом: `DEFAULT_GAME_URL = '[ВПИШИ-АДРЕС-ИГРЫ]'` — явный нефункциональный маркер, реальный адрес — через `deps.gameUrl`

### Из таска 05 — языки и ежедневный челлендж

- `i18n/index.js` — `createI18n({telegramLanguageCode?, navigatorLanguage?, persistence?}) -> {t(key,params?)->string, setLanguage(lang)->Promise<void>, detectLanguage()->'ru'|'en', getLanguage()->'ru'|'en', init()->Promise<'ru'|'en'>}` — фабрика, не singleton; `init`/`getLanguage` — методы сверх исходного списка (нужны для R44.1)
- `game/challenges.js` — `createChallenges({persistence, now?}) -> {getTodayChallenge()->Promise<{id,goal,progress}>, reportProgress(event)->Promise<{id,goal,progress}>}`; ключ хранения прогресса — `dailyChallenge`, ключ языка — `language`; шаблоны челленджа: clearLines/score/combo/shapesPlaced/survive, индекс = сумма кодов символов `YYYY-MM-DD` % 5
- **Открыто для таска 07:** контракт события `reportProgress(event)` (поля `linesCleared`/`scoreDelta`/`comboStreak`/`shapesPlaced`/`gameOver`) должен вызываться из игрового цикла в `index.html`; тексты интерфейса должны идти через `i18n.t(key)`, а не быть зашиты в разметке

### Из таска 06 — донат через Stars и бот

- `bot/bot-logic.js` — `createBotLogic(deps={token?, gameUrl?, fetchImpl?}) -> {handleUpdate(update) -> Promise<void>}` (обрабатывает `/start`, `pre_checkout_query`, `successful_payment`)
- `api/create-invoice.js` — `createInvoiceHandler(deps={token?, fetchImpl?}) -> (req,res) => Promise<void>`; default export — боевой Vercel-хендлер `POST /api/create-invoice {amountStars} -> {invoiceUrl}`
- `api/telegram-webhook.js` — default export `(req,res) => Promise<void>`, форвардит апдейты в `bot-logic.handleUpdate`
- `ui/donate.js` — `export const STARS_AMOUNTS` (пустой видимый плейсхолдер — номиналы не заданы пользователем), `createDonateFlow({telegramBridge, fetchImpl?, onError?}) -> {donate(amountStars) -> Promise<void>}`
- `.env.example` создан: `TELEGRAM_BOT_TOKEN=` (пусто)
- `GAME_URL` — переиспользован плейсхолдер `[ВПИШИ-АДРЕС-ИГРЫ]` из `telegram/bridge.js`
- **Открыто для таска 07:** `ui/donate.js` не подключён в `index.html` — кнопка доната и вызов `donate()` появляются там; `vercel.json` и деплой должны знать про `/api/create-invoice` и `/api/telegram-webhook`

### Из таска 04 — экран Game Over и звук

- `ui/gameover.js` — `isNewHighScore(score,prevHigh)->bool`, `computeGameOverState(score,prevHigh)->{score,highScore,isNewHighScore}`, `formatShareText(score,isNewHighScore)->string`, `formatResultText(...)->string`, `createGameOverScreen({telegramBridge,persistence,container?,document?,onRestart?,playGameOverSound?}) -> {show(score)->Promise<state>, hide()}`
- `ui/sound.js` — `createSoundEngine({persistence?,createPlayer?}) -> {init()->Promise<bool>, isEnabled()->bool, setEnabled(v)->Promise<bool>, toggle()->Promise<bool>, mountToggleButton({document?,container?})->Element|null, playClick(), playLineClear(), playGameOver()}`
- Ключи `persistence`: `highScore` (общий с таском 03), `soundEnabled` (новый)
- Звуки — синтезированные WAV-заглушки в `assets/sounds/` (click/line-clear/game-over), явно различимые
- **Открыто для таска 07:** смонтировать `createGameOverScreen(...).show(score)` в момент `board.canFitAnywhere()===false`; вызывать `playClick/playLineClear/playGameOver` в игровом цикле; вызвать `sound.mountToggleButton()`; добавить CSS для `.gameover-overlay`/`.sound-toggle`; тексты внутри `ui/gameover.js` («Играть снова», «Поделиться результатом», «Игра окончена») и метки `ui/sound.js` сейчас зашиты на русском без шва для перевода — таск 07 должен провести их через `i18n.t(key)` наравне с остальной разметкой (находка ревью, не блокирует, но нужно закрыть при интеграции)
