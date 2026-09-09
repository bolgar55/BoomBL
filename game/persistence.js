// game/persistence.js
// Персистентность: лучший результат, настройки (звук/язык), прогресс дневного
// челленджа (границы модуля `persistence` — interfaces.md).
// Backend выбирается прозрачно для вызывающего кода: внутри Telegram — его
// CloudStorage, вне Telegram или при сбое CloudStorage — localStorage
// (spec §Решения 9, R12.2, R46i). Наружу торчат только getItem/setItem —
// выбор и переключение backend'а спрятаны внутри модуля.

// Значения по умолчанию для ключей, для которых первый запуск оговорён явно
// в приёмке (R12.1): highScore должен быть 0, а не undefined/ошибка.
const BUILTIN_DEFAULTS = {
  highScore: 0,
};

/**
 * Создаёт объект персистентности с инжектируемыми зависимостями — нужно и
 * для тестов (мок CloudStorage/localStorage), и для реальной работы:
 * без deps модуль сам найдёт window.Telegram?.WebApp и window.localStorage.
 * @param {{telegram?: object, storage?: object}} [deps]
 *   telegram — объект вида Telegram.WebApp (может отсутствовать вне Telegram);
 *   storage — объект вида localStorage (может отсутствовать/бросать в приватном режиме).
 * @returns {{getItem: (key: string, defaultValue?: *) => Promise<*>, setItem: (key: string, value: *) => Promise<void>}}
 */
export function createPersistence(deps = {}) {
  const telegram =
    deps.telegram ?? globalThis.window?.Telegram?.WebApp ?? globalThis.Telegram?.WebApp ?? null;
  const storage = deps.storage ?? globalThis.window?.localStorage ?? globalThis.localStorage ?? null;
  const cloudStorage = telegram?.CloudStorage ?? null;

  // Клиенты Telegram старее той версии, что реально поддерживает CloudStorage,
  // всё равно выставляют сам объект CloudStorage — но вызов getItem/setItem на
  // них печатает "CloudStorage is not supported in version N" и молча НЕ
  // вызывает колбэк вообще (ни успеха, ни ошибки) — таков реальный SDK
  // Telegram. Без таймаута это вешает await ниже НАВСЕГДА (реальный баг:
  // экран Game Over не появлялся при новом рекорде — именно там setItem
  // ждали). Таймаут превращает такое зависание в обычный сбой — try/catch в
  // getItem/setItem ниже и так уже откатывается на localStorage.
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

  // CloudStorage Telegram — колбэк-API, оборачиваем в Promise для единообразия.
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

  // Безопасное чтение/запись localStorage — сбой (например, приватный режим
  // браузера) не должен ронять игру и не должен показывать ошибку игроку.
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
      // Сохранить не удалось нигде — тихо игнорируем, партия продолжается.
    }
  }

  // CloudStorage возвращает '' для отсутствующего ключа, localStorage — null.
  // Оба случая — «ничего не сохранено», используем значение по умолчанию.
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
        return parse(raw, fallback);
      } catch {
        // Сбой CloudStorage при чтении — тихий откат на localStorage (R12.2).
      }
    }

    return parse(localGet(key), fallback);
  }

  async function setItem(key, value) {
    const raw = JSON.stringify(value);

    if (cloudStorage) {
      try {
        await cloudSet(key, raw);
        return;
      } catch {
        // Сбой CloudStorage при записи — тихий откат на localStorage.
      }
    }

    localSet(key, raw);
  }

  return { getItem, setItem };
}
