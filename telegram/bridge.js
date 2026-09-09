// telegram/bridge.js
// Wrapper around Telegram.WebApp (module boundary `telegram-bridge` — interfaces.md).
// Outside Telegram (window.Telegram?.WebApp missing) every method is a safe
// no-op: the game doesn't crash or log errors to the player's console (R46i,
// spec §Decisions 9).

// Color scheme outside Telegram — dark by default (spec §Decisions 9). The
// palette within a mode is its own concern (§Decisions 5/6) — only the mode
// itself is exposed from here.
const DEFAULT_COLOR_SCHEME = 'dark';

// Placeholder game link for "Share result" (§Decisions 7).
// GAME_URL is an open spec item ("Open items"): the real address only exists
// after deploy and bot registration. Deliberately NOT shaped like a real link
// (unlike a plausible https://t.me/...), so it can't be mistaken for a
// working address and forgotten at deploy time — the hosting/bot task must
// pass the real one via deps.gameUrl.
const DEFAULT_GAME_URL = '@MeBoombl_BOT';

// Semantic haptic feedback types (R28) → concrete HapticFeedback calls.
// impactOccurred — a physical collision (placing a piece/clearing a line),
// notificationOccurred — the outcome of an action (invalid placement),
// selectionChanged — a light tick when hovering a new valid position while
// dragging (fires often, on every new cell — impact/notification would feel
// too "heavy" for that and get tiring fast).
const HAPTIC_ACTIONS = {
  placement: (haptics) => haptics.impactOccurred?.('light'),
  lineClear: (haptics) => haptics.impactOccurred?.('heavy'),
  invalidPlacement: (haptics) => haptics.notificationOccurred?.('error'),
  hoverValid: (haptics) => haptics.selectionChanged?.(),
};

/**
 * Creates the bridge to Telegram.WebApp with an injectable dependency —
 * needed both for tests (mock Telegram.WebApp) and to explicitly run
 * without Telegram.
 * @param {{telegram?: object}} [deps] telegram — object shaped like Telegram.WebApp
 *   (may be absent outside Telegram — then every method becomes a no-op).
 */
export function createTelegramBridge(deps = {}) {
  const telegram =
    deps.telegram ?? globalThis.window?.Telegram?.WebApp ?? globalThis.Telegram?.WebApp ?? null;
  const gameUrl = deps.gameUrl ?? DEFAULT_GAME_URL;

  // Subscribers to Telegram theme changes (R22.1) — notified without a reload.
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
      // A failed Telegram event subscription must not crash the game.
    }
  }

  /** Init: ready() + expand() on startup inside Telegram (R24/R25). */
  function init() {
    if (!telegram) return;
    try {
      telegram.ready?.();
      telegram.expand?.();
    } catch {
      // Safe no-op on SDK failure — the game must not crash (R46i).
    }
  }

  /**
   * Subscribes to Telegram theme changes during the session (R22.1).
   * @param {(scheme: 'dark'|'light') => void} callback
   * @returns {() => void} unsubscribe function
   */
  function onThemeChange(callback) {
    themeListeners.add(callback);
    return () => themeListeners.delete(callback);
  }

  /**
   * Top inset taken up by Telegram's own mini-app chrome (header with the
   * collapse handle/close cross) over the content (R05.11) — if the game
   * isn't shifted below it, top buttons are visually visible but touches in
   * that strip are intercepted by Telegram's native UI rather than the
   * WebView, so taps on those buttons miss. contentSafeAreaInset (newer
   * Telegram.WebApp versions) already accounts for both the device notch and
   * Telegram's own header — preferred; safeAreaInset covers only the device
   * notch (older versions), still fine as a fallback. Outside Telegram or
   * without these SDK fields — 0; the screen notch inset is still handled by
   * plain CSS env(safe-area-inset-top) in style.css regardless.
   * @returns {number}
   */
  function getContentSafeAreaTop() {
    if (!telegram) return 0;
    return telegram.contentSafeAreaInset?.top ?? telegram.safeAreaInset?.top ?? 0;
  }

  /**
   * Subscribes to inset changes (screen rotation, a Telegram version
   * changing its UI, etc.) — callback receives the current getContentSafeAreaTop().
   * @param {(top: number) => void} callback
   * @returns {() => void} unsubscribe function
   */
  function onSafeAreaChange(callback) {
    if (!telegram?.onEvent) return () => {};
    const handler = () => callback(getContentSafeAreaTop());
    try {
      telegram.onEvent('safeAreaChanged', handler);
      telegram.onEvent('contentSafeAreaChanged', handler);
    } catch {
      // A failed subscription must not crash the game — just no live updates.
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
   * Haptic feedback (R28). type is one of 'placement' | 'lineClear' |
   * 'invalidPlacement' | 'hoverValid'.
   * Unknown type or missing Telegram/HapticFeedback — safe no-op.
   */
  function haptic(type) {
    const haptics = telegram?.HapticFeedback;
    if (!haptics) return;
    try {
      HAPTIC_ACTIONS[type]?.(haptics);
    } catch {
      // Haptic feedback isn't critical to the game — a failure must not crash it.
    }
  }

  // Current MainButton click handler — so repeated showMainButton() calls
  // don't stack duplicate subscriptions (Telegram.WebApp.MainButton.onClick
  // otherwise adds a new callback on top of the old one).
  let currentMainButtonHandler = null;

  /** Shows Telegram's MainButton with text and a click handler (R27). */
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
      // Safe no-op — the screen must not crash on a MainButton failure.
    }
  }

  /** Hides Telegram's MainButton. */
  function hideMainButton() {
    try {
      telegram?.MainButton?.hide?.();
    } catch {
      // no-op
    }
  }

  /**
   * Opens the Telegram Stars payment window (R43, §Decisions 8).
   * Outside Telegram or on SDK failure, resolves as 'failed' — the caller
   * (donation flow) decides how to gracefully report that to the player (R43.1).
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

  /** "Share result" via Telegram's native share (§Decisions 7). */
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
   * Raw Telegram.WebApp.initData string — the current player's signed data
   * (see bot/verify-webapp-data.js), needed only to submit a score to the
   * leaderboard (api/leaderboard.js): the server verifies the signature
   * itself, this is just a transparent passthrough of the string as-is.
   * Outside Telegram (initData absent) — empty string, the caller (the
   * leaderboard API) then simply doesn't submit a score.
   * @returns {string}
   */
  function getInitData() {
    return telegram?.initData ?? '';
  }

  /**
   * Current player's Telegram id — for UI only (highlighting their own row
   * in the leaderboard list), NOT for authorization: initDataUnsafe, as the
   * name implies, is not signature-verified and must never be used anywhere
   * trust matters (that's what getInitData() above is for, which the server
   * verifies itself). Returned as a string — leaderboard ids are strings too
   * (Redis hash key), compare with ===.
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
