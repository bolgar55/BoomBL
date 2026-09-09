// game/persistence.js
// Persistence: high score, settings (sound/language), daily challenge
// progress (module `persistence` boundaries - interfaces.md).
// Backend selection is transparent to the caller: inside Telegram, its
// CloudStorage; outside Telegram or on CloudStorage failure, localStorage
// (spec §Decisions 9, R12.2, R46i). Only getItem/setItem are exposed -
// backend selection and switching is internal to the module.

// Default values for keys whose first-run behavior is explicitly specified
// in acceptance criteria (R12.1): highScore must be 0, not undefined/an error.
const BUILTIN_DEFAULTS = {
  highScore: 0,
};

/**
 * Creates a persistence handler with injectable dependencies - needed both
 * for tests (mock CloudStorage/localStorage) and real usage: without deps
 * the module finds window.Telegram?.WebApp and window.localStorage itself.
 * @param {{telegram?: object, storage?: object}} [deps]
 *   telegram - a Telegram.WebApp-like object (may be absent outside Telegram);
 *   storage - a localStorage-like object (may be absent/throw in private mode).
 * @returns {{getItem: (key: string, defaultValue?: *) => Promise<*>, setItem: (key: string, value: *) => Promise<void>}}
 */
export function createPersistence(deps = {}) {
  const telegram =
    deps.telegram ?? globalThis.window?.Telegram?.WebApp ?? globalThis.Telegram?.WebApp ?? null;
  const storage = deps.storage ?? globalThis.window?.localStorage ?? globalThis.localStorage ?? null;
  const cloudStorage = telegram?.CloudStorage ?? null;

  // Telegram clients older than the version that actually supports
  // CloudStorage still expose the CloudStorage object itself - but calling
  // getItem/setItem on them logs "CloudStorage is not supported in version N"
  // and silently never invokes the callback at all (neither success nor
  // error) - that's the real Telegram SDK behavior. Without a timeout this
  // hangs the await below FOREVER (real bug: the Game Over screen didn't
  // appear on a new high score - it was waiting on setItem there). The
  // timeout turns such a hang into an ordinary failure - the try/catch in
  // getItem/setItem below already falls back to localStorage anyway.
  const CLOUD_CALLBACK_TIMEOUT_MS = 2500;

  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('CloudStorage callback timed out')),
        CLOUD_CALLBACK_TIMEOUT_MS
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  // Telegram CloudStorage is a callback API - wrap it in a Promise for consistency.
  function cloudGet(key) {
    return withTimeout(
      new Promise((resolve, reject) => {
        try {
          cloudStorage.getItem(key, (error, value) => {
            if (error) reject(error);
            else resolve(value);
          });
        } catch (error) {
          reject(error);
        }
      })
    );
  }

  function cloudSet(key, value) {
    return withTimeout(
      new Promise((resolve, reject) => {
        try {
          cloudStorage.setItem(key, value, (error) => {
            if (error) reject(error);
            else resolve();
          });
        } catch (error) {
          reject(error);
        }
      })
    );
  }

  // Safe localStorage read/write - a failure (e.g. private browsing mode)
  // must not crash the game or show an error to the player.
  function localGet(key) {
    try {
      return storage ? storage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  function localSet(key, value) {
    try {
      storage?.setItem(key, value);
    } catch {
      // Couldn't save anywhere - silently ignore, the game continues.
    }
  }

  // CloudStorage returns '' for a missing key, localStorage returns null.
  // Both mean "nothing saved" - fall back to the default value.
  function parse(raw, fallback) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function resolveFallback(key, defaultValue) {
    if (defaultValue !== undefined) return defaultValue;
    return key in BUILTIN_DEFAULTS ? BUILTIN_DEFAULTS[key] : null;
  }

  async function getItem(key, defaultValue) {
    const fallback = resolveFallback(key, defaultValue);

    if (cloudStorage) {
      try {
        const raw = await cloudGet(key);
        // Mirror a successful read into localStorage (see setItem below) -
        // otherwise the local cache never gets updated by reads, and the
        // next cloud failure/timeout would fall back to a stale (or
        // default) value instead of the real last-known one.
        localSet(key, raw);
        return parse(raw, fallback);
      } catch {
        // CloudStorage read failed - silently fall back to localStorage (R12.2).
      }
    }

    return parse(localGet(key), fallback);
  }

  async function setItem(key, value) {
    const raw = JSON.stringify(value);

    if (cloudStorage) {
      try {
        await cloudSet(key, raw);
        // Mirror a successful write into localStorage too - without this,
        // localStorage stays permanently "cold" (never updated while
        // CloudStorage works), and any single cloud failure/timeout (see
        // withTimeout above) falls back to an empty/default value instead
        // of the real one. Real bug: high score 5197 in the cloud, a one-off
        // read failure on Game Over fell back to 0, showing "new record" at
        // 1500 - and the next write risked overwriting the real 5197 with
        // that wrong, smaller number.
        localSet(key, raw);
        return;
      } catch {
        // CloudStorage write failed - silently fall back to localStorage.
      }
    }

    localSet(key, raw);
  }

  return { getItem, setItem };
}
