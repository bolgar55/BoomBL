# 03 — Персистентность и мост к Telegram

**Требования:** R02, R12, R12.1, R12.2, R22, R22.1, R24, R25, R26, R28, R30, R46i
**Blocked by:** 01
**Зона:** `telegram/bridge.js`, `game/persistence.js`
**Волна:** 2
**Status:** ready

## Что должно заработать

Игра подключает Telegram Web Apps SDK, разворачивается на весь экран при старте, подхватывает тёмную/светлую тему Telegram (только режим — палитра своя, см. Решения §6) и перекрашивается на лету при смене темы прямо во время игры. Лучший результат хранится через Telegram CloudStorage внутри Telegram и через `localStorage` вне его или при сбое CloudStorage — незаметно для игрока. Вибро-отклик на взрыв линии и на ошибку размещения. Вне Telegram (обычный браузер) всё это работает в безопасном no-op режиме — игра не падает и полностью играбельна.

## Из брифа, дословно

> «упакуй её как Telegram Mini App, чтобы она открывалась прямо внутри Telegram через бота»
> «обязательно подключить `<script src="https://telegram.org/js/telegram-web-app.js"></script>`»
> «Telegram.WebApp.ready() и Telegram.WebApp.expand() — разворачивание на весь экран»
> «Telegram.WebApp.themeParams — подхват цветовой темы пользователя»
> «Telegram.WebApp.HapticFeedback — вибро-отклик при взрыве линий и ошибках»
> «Telegram.WebApp.CloudStorage — для сохранения high score в облаке Telegram без своего бэкенда»
> «Поддержка тёмной/светлой темы синхронно с темой Telegram»
> «Сохраняется лучший результат (high score) локально и/или на сервере»

## Разделы спецификации

Истории 15–17, 27–28, 34–35, 37, Решения §6 (тема), §9 (работа вне Telegram), Границы (`telegram-bridge`, `persistence`), Швы — оба модуля тестируются через инжектируемый мок.

## Критерии приёмки

- [ ] `telegram-bridge.init()` вызывает `ready()` и `expand()` при старте внутри Telegram
- [ ] `telegram-bridge.getColorScheme()` возвращает `dark`/`light` из Telegram; при смене темы во время сессии подписчики уведомляются без перезагрузки страницы
- [ ] `persistence.getItem('highScore')`/`setItem` работают через CloudStorage внутри Telegram и через `localStorage` вне его
- [ ] Если CloudStorage кидает ошибку — тихий откат на `localStorage`, без сообщения об ошибке игроку
- [ ] При первом запуске (ничего не сохранено) `getItem('highScore')` возвращает 0, а не `undefined`/ошибку
- [ ] `telegram-bridge.haptic(type)` вызывает `impactOccurred`/`notificationOccurred` и не падает, если `Telegram.WebApp` отсутствует
- [ ] Вне Telegram (`window.Telegram` отсутствует) все методы `telegram-bridge` — безопасные no-op, `persistence` сразу использует `localStorage`, приложение не падает и не показывает ошибок в консоли
- [ ] Тесты на швах `persistence` и `telegram-bridge` покрывают: наличие Telegram, отсутствие Telegram, сбой CloudStorage, первый запуск
