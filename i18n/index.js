// i18n/index.js
// Словарь строк интерфейса и текущий язык (границы модуля `i18n` — interfaces.md).
// Наружу торчат t/setLanguage/detectLanguage(+init) — структура словаря спрятана.
//
// Фабрика createI18n(deps) — как и game/persistence.js, — принимает
// инжектируемые зависимости, чтобы detectLanguage() был тестируем без
// реального window.Telegram/navigator (в Node их просто нет).

// Поддерживаемые языки (R44): русский и английский.
const SUPPORTED_LANGUAGES = ['ru', 'en'];
const DEFAULT_LANGUAGE = 'ru';

// Словарь строк интерфейса. Ключи для описаний шаблонов дневного челленджа
// (`challenge.<id>`) соответствуют id из game/challenges.js и содержат
// плейсхолдер {goal}, подставляемый через t(key, { goal }).
const DICTIONARIES = {
  ru: {
    score: 'Очки',
    highScore: 'Рекорд',
    result: 'Результат',
    gameOver: 'Игра окончена',
    playAgain: 'Играть снова',
    share: 'Поделиться результатом',
    combo: 'Комбо ×{goal}',
    language: 'Язык',
    sound: 'Звук',
    perfectClear: 'ИДЕАЛЬНО!',
    dailyChallenge: 'Ежедневный челлендж',
    'challenge.clearLines': 'Очисти {goal} линий за партию',
    'challenge.score': 'Набери {goal} очков',
    'challenge.combo': 'Сделай комбо ×2 хотя бы раз',
    'challenge.shapesPlaced': 'Поставь {goal} фигур',
    'challenge.survive': 'Доиграй без game over {goal} ходов подряд',
  },
  en: {
    score: 'Score',
    highScore: 'High score',
    result: 'Result',
    gameOver: 'Game over',
    playAgain: 'Play again',
    share: 'Share result',
    combo: 'Combo ×{goal}',
    language: 'Language',
    sound: 'Sound',
    perfectClear: 'PERFECT!',
    dailyChallenge: 'Daily challenge',
    'challenge.clearLines': 'Clear {goal} lines in one game',
    'challenge.score': 'Score {goal} points',
    'challenge.combo': 'Get a ×2 combo at least once',
    'challenge.shapesPlaced': 'Place {goal} shapes',
    'challenge.survive': 'Survive {goal} moves in a row without game over',
  },
};

// Приводит код языка ('ru-RU', 'en-US', 'EN', ...) к поддерживаемому
// двухбуквенному коду либо null, если язык не поддерживается словарём.
function normalizeLanguage(code) {
  if (!code || typeof code !== 'string') return null;
  const short = code.slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.includes(short) ? short : null;
}

// Подставляет параметры вида {name} в строку словаря.
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

/**
 * Создаёт объект i18n с инжектируемыми зависимостями (нужно для тестов и для
 * работы вне браузера/Telegram, по аналогии с createPersistence).
 * @param {{
 *   telegramLanguageCode?: string,
 *   navigatorLanguage?: string,
 *   persistence?: {getItem: Function, setItem: Function}
 * }} [deps]
 *   telegramLanguageCode — код языка Telegram-пользователя (Telegram.WebApp.initDataUnsafe.user.language_code);
 *   navigatorLanguage — код языка браузера (navigator.language);
 *   persistence — модуль persistence (game/persistence.js) для сохранения выбора языка между сессиями.
 * @returns {{
 *   t: (key: string, params?: object) => string,
 *   setLanguage: (lang: 'ru'|'en') => Promise<void>,
 *   detectLanguage: () => 'ru'|'en',
 *   getLanguage: () => 'ru'|'en',
 *   init: () => Promise<'ru'|'en'>
 * }}
 */
export function createI18n(deps = {}) {
  const telegramLanguageCode =
    deps.telegramLanguageCode ??
    globalThis.window?.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ??
    globalThis.Telegram?.WebApp?.initDataUnsafe?.user?.language_code ??
    null;
  const navigatorLanguage =
    deps.navigatorLanguage ?? globalThis.navigator?.language ?? globalThis.window?.navigator?.language ?? null;
  const persistence = deps.persistence ?? null;

  let currentLanguage = DEFAULT_LANGUAGE;

  // R44.1: язык Telegram-пользователя → иначе язык браузера → иначе ru.
  // Чистая функция определения — не трогает persistence и не имеет побочных
  // эффектов, поэтому детерминированно тестируется напрямую.
  function detectLanguage() {
    return normalizeLanguage(telegramLanguageCode) ?? normalizeLanguage(navigatorLanguage) ?? DEFAULT_LANGUAGE;
  }

  function getLanguage() {
    return currentLanguage;
  }

  function t(key, params) {
    const dict = DICTIONARIES[currentLanguage] ?? DICTIONARIES[DEFAULT_LANGUAGE];
    const template = dict[key] ?? DICTIONARIES[DEFAULT_LANGUAGE][key] ?? key;
    return interpolate(template, params);
  }

  // Меняет язык мгновенно (t() сразу отдаёт новые строки) и асинхронно
  // сохраняет выбор через persistence, если она передана.
  async function setLanguage(lang) {
    currentLanguage = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
    if (persistence) {
      await persistence.setItem('language', currentLanguage);
    }
  }

  // Первичная загрузка языка при старте приложения: если язык уже выбирался
  // раньше — берём его из persistence, иначе определяем автоматически и
  // сразу сохраняем результат (чтобы следующий запуск не переопределял его
  // заново, если игрок сменит язык устройства).
  async function init() {
    let stored = null;
    if (persistence) {
      stored = await persistence.getItem('language', null);
    }
    currentLanguage = normalizeLanguage(stored) ?? detectLanguage();
    if (persistence && !normalizeLanguage(stored)) {
      await persistence.setItem('language', currentLanguage);
    }
    return currentLanguage;
  }

  return { t, setLanguage, detectLanguage, getLanguage, init };
}
