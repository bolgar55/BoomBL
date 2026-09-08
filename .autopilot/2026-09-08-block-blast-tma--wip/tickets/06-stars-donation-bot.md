# 06 — Донат через Stars и Telegram-бот

**Требования:** R02, R31, R33, R35, R39, R43, R43.1, R43.2
**Blocked by:** 02, 03
**Зона:** `bot/`, `api/create-invoice.js`, `api/telegram-webhook.js`, `ui/donate.js`
**Волна:** 3
**Status:** ready

## Что должно заработать

Кнопка доната в игре вызывает `POST /api/create-invoice {amountStars}`, серверлесс-функция создаёт ссылку через Bot API `createInvoiceLink` (`currency: "XTR"`, токен из `TELEGRAM_BOT_TOKEN`), клиент открывает её через `telegram-bridge.openInvoice(url)`. Бот (через вебхук-функцию) отвечает на `/start` inline-кнопкой типа `WebApp`, открывающей игру, подтверждает `pre_checkout_query` и принимает `successful_payment` (ничего не хранит — платёж разовый). Если счёт создать не удалось — мягкая ошибка, игра не ломается; если платёж отменён — тихий возврат в игру без сообщения об ошибке.

## Из брифа, дословно

> «Монетизация: (нужна ли реклама, донаты через Telegram Stars, или игра полностью бесплатная)» → «Донаты через Telegram Stars»
> «Бот при команде /start должен присылать сообщение с inline-кнопкой типа WebApp, которая открывает игру»
> «Backend (опционально): ... для самого Telegram-бота, который открывает Mini App через кнопку меню или inline-кнопку»
> «Создать бота через @BotFather, получить токен» *(бот уже создан пользователем, токен есть)*

## Разделы спецификации

Истории 31–34, 38, Решения §8 (донат через Stars), §11 (Vercel, webhook), Границы (`bot-logic`, `api/create-invoice`), Открытые места (`TELEGRAM_BOT_TOKEN`, номиналы доната).

## Критерии приёмки

- [ ] `POST /api/create-invoice` с валидным `amountStars` возвращает `{invoiceUrl}`, вызывая `createInvoiceLink` с `currency: "XTR"`
- [ ] Токен бота читается из переменной окружения `TELEGRAM_BOT_TOKEN`; нигде в коде и в ответах API токен не встречается
- [ ] Кнопка доната в игре открывает `invoiceUrl` через `telegram-bridge.openInvoice`
- [ ] Если `/api/create-invoice` вернул ошибку — игрок видит мягкое сообщение, игра продолжает работать
- [ ] Отменённый платёж не показывает ошибку — тихий возврат в игру
- [ ] `bot-logic.handleUpdate` на `/start` отвечает inline-кнопкой `web_app: {url: GAME_URL}` (плейсхолдер, см. Открытые места)
- [ ] `bot-logic.handleUpdate` подтверждает `pre_checkout_query` и принимает `successful_payment`, ничего не записывая в хранилище
- [ ] Номиналы доната в Stars — видимый плейсхолдер в коде (`STARS_AMOUNTS`), не выдуманное число
