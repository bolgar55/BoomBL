// telegram/bridge.js
// Обёртка над Telegram.WebApp (границы модуля `telegram-bridge` — interfaces.md).
// Вне Telegram (window.Telegram?.WebApp отсутствует) все методы — безопасные
// no-op: игра не падает и не пишет ошибок в консоль игроку (R46i, spec §Решения 9).

// Схема темы вне Telegram — тёмная по умолчанию (spec §Решения 9). Палитра
// внутри режима своя (§Решения 5/6) — отсюда наружу идёт только режим.
const DEFAULT_COLOR_SCHEME = 'dark';

// Плейсхолдер ссылки на игру для "Поделиться результатом" (§Решения 7).
// GAME_URL — открытое место спецификации («Открытые места»): реальный адрес
// появится только после деплоя и регистрации бота. Намеренно НЕ похож на
// настоящую ссылку (в отличие от правдоподобного https://t.me/...), чтобы
// его нельзя было принять за рабочий адрес и забыть заменить при деплое —
// таск хостинга/бота обязан передать настоящий через deps.gameUrl.
const DEFAULT_GAME_URL = '@MeBoombl_BOT';

// Семантические типы вибро-отклика (R28) → конкретные вызовы HapticFeedback.
// impactOccurred — физическое столкновение (постановка/взрыв линии),
// notificationOccurred — результат действия (ошибка размещения),
// selectionChanged — лёгкий тик при наведении на новую валидную позицию во
// время драга (часто, на каждую новую клетку — impact/notification для этого
// слишком «тяжёлые» и быстро утомили бы при частом срабатывании).
const HAPTIC_ACTIONS = {
  placement: (haptics) => haptics.impactOccurred?.('light'),
  lineClear: (haptics) => haptics.impactOccurred?.('heavy'),
  invalidPlacement: (haptics) => haptics.notificationOccurred?.('error'),
  hoverValid: (haptics) => haptics.selectionChanged?.(),
};

/**
 * Создаёт мост к Telegram.WebApp с инжектируемой зависимостью — нужно и для
 * тестов (мок Telegram.WebApp), и для явной работы без Telegram.
 * @param {{telegram?: object}} [deps] telegram — объект вида Telegram.WebApp
 *   (может отсутствовать вне Telegram — тогда все методы становятся no-op).
 */
export function createTelegramBridge(deps = {}) {
  const telegram =
    deps.telegram ?? globalThis.window?.Telegram?.WebApp ?? globalThis.Telegram?.WebApp ?? null;
  const gameUrl = deps.gameUrl ?? DEFAULT_GAME_URL;

  // Подписчики на смену темы Telegram (R22.1) — уведомляются без перезагрузки.
  const themeListeners = new Set();

  function getColorScheme() {
    if (!telegram) return DEFAULT_COLOR_SCHEME;
    return telegram.colorScheme === 'light' ? 'light' : 'dark';
  }

  if (telegram?.onEvent) {
    try {
      telegram.onEvent('themeChanged', () => {
        const scheme = getColorScheme();
        for (const listener of themeListeners) listener(scheme);
      });
    } catch {
      // Сбой подписки на событие Telegram не должен ронять игру.
    }
  }

  /** Инициализация: ready() + expand() при старте внутри Telegram (R24/R25). */
  function init() {
    if (!telegram) return;
    try {
      telegram.ready?.();
      telegram.expand?.();
    } catch {
      // Безопасный no-op при сбое SDK — игра не должна падать (R46i).
    }
  }

  /**
   * Подписка на смену темы Telegram во время сессии (R22.1).
   * @param {(scheme: 'dark'|'light') => void} callback
   * @returns {() => void} функция отписки
   */
  function onThemeChange(callback) {
    themeListeners.add(callback);
    return () => themeListeners.delete(callback);
  }

  /**
   * Отступ сверху, который занимает собственный интерфейс Telegram (шапка
   * мини-аппа с хэндлом сворачивания/крестиком закрытия) поверх контента
   * (R05.11) — если игру не сдвинуть под него, верхние кнопки визуально
   * видны, но тач в этой полосе перехватывает нативный UI Telegram, а не
   * WebView, и по кнопкам «промахиваешься». contentSafeAreaInset (новые
   * версии Telegram.WebApp) уже учитывает и вырез устройства, и саму шапку
   * Telegram — предпочтительнее; safeAreaInset — только вырез устройства
   * (более старые версии), тоже сойдёт как фолбэк. Вне Telegram или без этих
   * полей в SDK — 0, отступ под вырез экрана всё равно берёт на себя чистый
   * CSS env(safe-area-inset-top) в style.css.
   * @returns {number}
   */
  function getContentSafeAreaTop() {
    if (!telegram) return 0;
    return telegram.contentSafeAreaInset?.top ?? telegram.safeAreaInset?.top ?? 0;
  }

  /**
   * Подписка на изменение отступа (поворот экрана, версия Telegram меняет
   * своё UI и т.п.) — callback получает актуальный getContentSafeAreaTop().
   * @param {(top: number) => void} callback
   * @returns {() => void} функция отписки
   */
  function onSafeAreaChange(callback) {
    if (!telegram?.onEvent) return () => {};
    const handler = () => callback(getContentSafeAreaTop());
    try {
      telegram.onEvent('safeAreaChanged', handler);
      telegram.onEvent('contentSafeAreaChanged', handler);
    } catch {
      // Сбой подписки не должен ронять игру — просто не будет живого обновления.
    }
    return () => {
      try {
        telegram.offEvent?.('safeAreaChanged', handler);
        telegram.offEvent?.('contentSafeAreaChanged', handler);
      } catch {
        // no-op
      }
    };
  }

  /**
   * Вибро-отклик (R28). type — один из 'placement' | 'lineClear' |
   * 'invalidPlacement' | 'hoverValid'.
   * Неизвестный type и отсутствие Telegram/HapticFeedback — безопасный no-op.
   */
  function haptic(type) {
    const haptics = telegram?.HapticFeedback;
    if (!haptics) return;
    try {
      HAPTIC_ACTIONS[type]?.(haptics);
    } catch {
      // Вибро-отклик не критичен для игры — сбой не должен её ронять.
    }
  }

  // Текущий обработчик клика MainButton — чтобы не копить дубликаты подписок
  // при повторных showMainButton() (Telegram.WebApp.MainButton.onClick иначе
  // добавляет новый колбэк поверх старого).
  let currentMainButtonHandler = null;

  /** Показывает MainButton Telegram с текстом и обработчиком клика (R27). */
  function showMainButton(text, onClick) {
    const mainButton = telegram?.MainButton;
    if (!mainButton) return;
    try {
      if (currentMainButtonHandler) {
        mainButton.offClick?.(currentMainButtonHandler);
      }
      currentMainButtonHandler = onClick;
      mainButton.setText?.(text);
      mainButton.onClick?.(onClick);
      mainButton.show?.();
    } catch {
      // Безопасный no-op — экран не должен падать из-за сбоя MainButton.
    }
  }

  /** Скрывает MainButton Telegram. */
  function hideMainButton() {
    try {
      telegram?.MainButton?.hide?.();
    } catch {
      // no-op
    }
  }

  /**
   * Открывает окно оплаты Telegram Stars (R43, §Решения 8).
   * Вне Telegram или при сбое SDK резолвится как 'failed' — вызывающий код
   * (донат) сам решает, как мягко сообщить об этом игроку (R43.1).
   * @param {string} url
   * @returns {Promise<'paid'|'cancelled'|'failed'|'pending'>}
   */
  function openInvoice(url) {
    return new Promise((resolve) => {
      if (!telegram?.openInvoice) {
        resolve('failed');
        return;
      }
      try {
        telegram.openInvoice(url, (status) => resolve(status));
      } catch {
        resolve('failed');
      }
    });
  }

  /** «Поделиться результатом» через нативный способ Telegram (§Решения 7). */
  function shareResult(text) {
    if (!telegram?.openTelegramLink) return;
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(gameUrl)}&text=${encodeURIComponent(text)}`;
      telegram.openTelegramLink(shareUrl);
    } catch {
      // no-op
    }
  }

  /**
   * Сырая строка Telegram.WebApp.initData — подписанные данные текущего
   * игрока (см. bot/verify-webapp-data.js), нужна только для отправки
   * результата в лидерборд (api/leaderboard.js): сервер сам проверяет
   * подпись, здесь это просто прозрачная передача строки как есть. Вне
   * Telegram (initData отсутствует) — пустая строка, вызывающий код (API
   * лидерборда) тогда просто не отправляет счёт.
   * @returns {string}
   */
  function getInitData() {
    return telegram?.initData ?? '';
  }

  /**
   * Telegram id текущего игрока — только для UI (подсветить свою строку в
   * списке лидерборда), НЕ для авторизации: initDataUnsafe, как следует из
   * названия, не проверен подписью и не должен использоваться нигде, где
   * важна доверенность значения (для этого есть getInitData() выше, которую
   * сервер сам проверяет). Строкой — id из лидерборда тоже строка (ключ
   * Redis-хэша), сравнивать через ===.
   * @returns {string|null}
   */
  function getMyUserId() {
    const id = telegram?.initDataUnsafe?.user?.id;
    return typeof id === 'number' ? String(id) : null;
  }

  return {
    init,
    getColorScheme,
    onThemeChange,
    getContentSafeAreaTop,
    onSafeAreaChange,
    haptic,
    showMainButton,
    hideMainButton,
    openInvoice,
    shareResult,
    getInitData,
    getMyUserId,
  };
}
