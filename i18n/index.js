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
    gameOver: 'Игра окончена',
    newRecord: 'Новый рекорд!',
    linesCleared: 'Линий',
    bestCombo: 'Лучшее комбо',
    playAgain: 'Играть снова',
    share: 'Поделиться результатом',
    shareText: '🎮 Набрал {score} очков в BoomBL! Попробуй обыграть 💥',
    shareTextRecord: '🏆 Новый рекорд в BoomBL — {score} очков! Сможешь побить?',
    combo: 'Комбо ×{goal}',
    language: 'Язык',
    perfectClear: 'ИДЕАЛЬНО!',
    dailyChallenge: 'Ежедневный челлендж',
    'challenge.clearLines': 'Очисти {goal} линий за партию',
    'challenge.score': 'Набери {goal} очков',
    'challenge.combo': 'Сделай комбо ×2 хотя бы раз',
    'challenge.shapesPlaced': 'Поставь {goal} фигур',
    'challenge.survive': 'Доиграй без game over {goal} ходов подряд',

    achievements: 'Достижения',
    achievementsBtnLabel: 'Достижения',
    achievementLocked: 'Заблокировано',
    achievementUnlocked: 'Получено ✓',
    achievementProgress: '{progress} / {goal}',
    close: 'Закрыть',
    newAchievement: 'Новое достижение!',
    pinAchievement: 'Закрепить сверху',
    unpinAchievement: 'Открепить',
    noPinnedAchievement: 'Выбери достижение для отслеживания 🏆',

    'achievement.score-500.title': 'Первые очки',
    'achievement.score-500.desc': 'Набери 500 очков всего за всё время игры',
    'achievement.score-2000.title': 'Копилка очков',
    'achievement.score-2000.desc': 'Набери 2000 очков всего за всё время игры',
    'achievement.score-10000.title': 'Знаток поля',
    'achievement.score-10000.desc': 'Набери 10 000 очков всего за всё время игры',
    'achievement.score-50000.title': 'Легенда BoomBL',
    'achievement.score-50000.desc': 'Набери 50 000 очков всего за всё время игры',
    'achievement.game-score-1000.title': 'Хорошая партия',
    'achievement.game-score-1000.desc': 'Набери 1000 очков за одну партию',
    'achievement.game-score-5000.title': 'Выдающаяся партия',
    'achievement.game-score-5000.desc': 'Набери 5000 очков за одну партию',

    'achievement.first-combo.title': 'Первое комбо',
    'achievement.first-combo.desc': 'Очисти линию сразу после другой очистки — сделай комбо',
    'achievement.combo-streak-3.title': 'Разогрев',
    'achievement.combo-streak-3.desc': 'Доведи серию комбо до ×3',
    'achievement.combo-streak-5.title': 'Огонь!',
    'achievement.combo-streak-5.desc': 'Доведи серию комбо до ×5',
    'achievement.combo-streak-8.title': 'Неудержимый',
    'achievement.combo-streak-8.desc': 'Доведи серию комбо до ×8',

    'achievement.clear-line-1.title': 'Первая линия',
    'achievement.clear-line-1.desc': 'Очисти свою первую линию',
    'achievement.clear-lines-50.title': 'Уборщик',
    'achievement.clear-lines-50.desc': 'Очисти 50 линий всего за всё время игры',
    'achievement.clear-lines-200.title': 'Мастер очистки',
    'achievement.clear-lines-200.desc': 'Очисти 200 линий всего за всё время игры',
    'achievement.multi-line-2.title': 'Двойной удар',
    'achievement.multi-line-2.desc': 'Очисти 2 линии одним ходом',
    'achievement.multi-line-3.title': 'Тройной удар',
    'achievement.multi-line-3.desc': 'Очисти 3 линии одним ходом',

    'achievement.full-clear-1.title': 'Идеальная очистка',
    'achievement.full-clear-1.desc': 'Полностью очисти игровое поле',
    'achievement.full-clear-5.title': 'Мастер идеала',
    'achievement.full-clear-5.desc': 'Полностью очисти поле 5 раз',
    'achievement.gap-bonus-1.title': 'Ювелирная точность',
    'achievement.gap-bonus-1.desc': 'Получи бонус за закрытие пустого пробела',
    'achievement.gap-bonus-20.title': 'Охотник за пробелами',
    'achievement.gap-bonus-20.desc': 'Получи бонус за пробел 20 раз',
    'achievement.color-clear-1.title': 'Чистый цвет',
    'achievement.color-clear-1.desc': 'Убери какой-нибудь цвет с поля целиком одним ходом',
    'achievement.color-clear-15.title': 'Радуга чистоты',
    'achievement.color-clear-15.desc': 'Получи бонус за полное удаление цвета 15 раз',

    'achievement.shapes-100.title': 'Строитель',
    'achievement.shapes-100.desc': 'Поставь 100 фигур всего за всё время игры',
    'achievement.shapes-1000.title': 'Архитектор',
    'achievement.shapes-1000.desc': 'Поставь 1000 фигур всего за всё время игры',
    'achievement.games-10.title': 'Постоянный игрок',
    'achievement.games-10.desc': 'Сыграй 10 партий',
    'achievement.games-50.title': 'Ветеран',
    'achievement.games-50.desc': 'Сыграй 50 партий',

    'achievement.move-score-100.title': 'Мощный ход',
    'achievement.move-score-100.desc': 'Набери 100 очков за один ход',
    'achievement.move-score-500.title': 'Взрывной ход',
    'achievement.move-score-500.desc': 'Набери 500 очков за один ход',
    'achievement.streak-moves-10.title': 'Без промаха',
    'achievement.streak-moves-10.desc': 'Сделай 10 успешных ходов подряд без единой ошибки',
    'achievement.clean-game.title': 'Чистая игра',
    'achievement.clean-game.desc': 'Заверши партию, ни разу не попытавшись поставить фигуру мимо',
    'achievement.last-slot.title': 'На последнем дыхании',
    'achievement.last-slot.desc': 'Поставь последнюю фигуру из набора лотка',
    'achievement.big-shape-master.title': 'Крупная форма',
    'achievement.big-shape-master.desc': 'Поставь 10 больших фигур (2×3 или 3×3)',
    'achievement.full-tray-user.title': 'Ничего не пропало',
    'achievement.full-tray-user.desc': 'Полностью используй набор из 3 фигур 20 раз',
    'achievement.comeback.title': 'Камбэк',
    'achievement.comeback.desc': 'Очисти линию после долгой серии ходов без очистки',

    'achievement.secret-perfect-start.title': '🤫 Идеальный старт',
    'achievement.secret-perfect-start.desc': 'Полностью очисти поле в первых пяти ходах партии',
    'achievement.secret-night-owl.title': '🤫 Полуночник',
    'achievement.secret-night-owl.desc': 'Сыграй партию глубокой ночью',
  },
  en: {
    score: 'Score',
    highScore: 'High score',
    gameOver: 'Game over',
    newRecord: 'New record!',
    linesCleared: 'Lines',
    bestCombo: 'Best combo',
    playAgain: 'Play again',
    share: 'Share result',
    shareText: '🎮 Scored {score} points in BoomBL! Think you can beat it? 💥',
    shareTextRecord: '🏆 New personal record in BoomBL — {score} points! Can you top it?',
    combo: 'Combo ×{goal}',
    language: 'Language',
    perfectClear: 'PERFECT!',
    dailyChallenge: 'Daily challenge',
    'challenge.clearLines': 'Clear {goal} lines in one game',
    'challenge.score': 'Score {goal} points',
    'challenge.combo': 'Get a ×2 combo at least once',
    'challenge.shapesPlaced': 'Place {goal} shapes',
    'challenge.survive': 'Survive {goal} moves in a row without game over',

    achievements: 'Achievements',
    achievementsBtnLabel: 'Achievements',
    achievementLocked: 'Locked',
    achievementUnlocked: 'Unlocked ✓',
    achievementProgress: '{progress} / {goal}',
    close: 'Close',
    newAchievement: 'New achievement!',
    pinAchievement: 'Pin to top',
    unpinAchievement: 'Unpin',
    noPinnedAchievement: 'Pick an achievement to track 🏆',

    'achievement.score-500.title': 'First points',
    'achievement.score-500.desc': 'Score 500 points in total, across all time',
    'achievement.score-2000.title': 'Piggy bank',
    'achievement.score-2000.desc': 'Score 2,000 points in total, across all time',
    'achievement.score-10000.title': 'Board expert',
    'achievement.score-10000.desc': 'Score 10,000 points in total, across all time',
    'achievement.score-50000.title': 'BoomBL legend',
    'achievement.score-50000.desc': 'Score 50,000 points in total, across all time',
    'achievement.game-score-1000.title': 'Solid run',
    'achievement.game-score-1000.desc': 'Score 1,000 points in a single game',
    'achievement.game-score-5000.title': 'Outstanding run',
    'achievement.game-score-5000.desc': 'Score 5,000 points in a single game',

    'achievement.first-combo.title': 'First combo',
    'achievement.first-combo.desc': 'Clear a line right after another clear — get a combo',
    'achievement.combo-streak-3.title': 'Warming up',
    'achievement.combo-streak-3.desc': 'Reach a ×3 combo streak',
    'achievement.combo-streak-5.title': "On fire!",
    'achievement.combo-streak-5.desc': 'Reach a ×5 combo streak',
    'achievement.combo-streak-8.title': 'Unstoppable',
    'achievement.combo-streak-8.desc': 'Reach a ×8 combo streak',

    'achievement.clear-line-1.title': 'First line',
    'achievement.clear-line-1.desc': 'Clear your first line',
    'achievement.clear-lines-50.title': 'Cleaner',
    'achievement.clear-lines-50.desc': 'Clear 50 lines in total, across all time',
    'achievement.clear-lines-200.title': 'Clearing master',
    'achievement.clear-lines-200.desc': 'Clear 200 lines in total, across all time',
    'achievement.multi-line-2.title': 'Double strike',
    'achievement.multi-line-2.desc': 'Clear 2 lines with a single move',
    'achievement.multi-line-3.title': 'Triple strike',
    'achievement.multi-line-3.desc': 'Clear 3 lines with a single move',

    'achievement.full-clear-1.title': 'Perfect clear',
    'achievement.full-clear-1.desc': 'Clear the entire board',
    'achievement.full-clear-5.title': 'Perfectionist',
    'achievement.full-clear-5.desc': 'Fully clear the board 5 times',
    'achievement.gap-bonus-1.title': 'Precision fit',
    'achievement.gap-bonus-1.desc': 'Earn a bonus for closing an enclosed gap',
    'achievement.gap-bonus-20.title': 'Gap hunter',
    'achievement.gap-bonus-20.desc': 'Earn the gap bonus 20 times',
    'achievement.color-clear-1.title': 'Clean sweep',
    'achievement.color-clear-1.desc': 'Clear an entire color off the board in one move',
    'achievement.color-clear-15.title': 'Rainbow cleaner',
    'achievement.color-clear-15.desc': 'Earn the color-clear bonus 15 times',

    'achievement.shapes-100.title': 'Builder',
    'achievement.shapes-100.desc': 'Place 100 shapes in total, across all time',
    'achievement.shapes-1000.title': 'Architect',
    'achievement.shapes-1000.desc': 'Place 1,000 shapes in total, across all time',
    'achievement.games-10.title': 'Regular player',
    'achievement.games-10.desc': 'Play 10 games',
    'achievement.games-50.title': 'Veteran',
    'achievement.games-50.desc': 'Play 50 games',

    'achievement.move-score-100.title': 'Power move',
    'achievement.move-score-100.desc': 'Score 100 points in a single move',
    'achievement.move-score-500.title': 'Explosive move',
    'achievement.move-score-500.desc': 'Score 500 points in a single move',
    'achievement.streak-moves-10.title': 'Flawless run',
    'achievement.streak-moves-10.desc': 'Make 10 successful moves in a row without a single mistake',
    'achievement.clean-game.title': 'Clean game',
    'achievement.clean-game.desc': 'Finish a game without ever attempting an invalid placement',
    'achievement.last-slot.title': 'Down to the wire',
    'achievement.last-slot.desc': "Place the last shape from the tray's set",
    'achievement.big-shape-master.title': 'Big shapes',
    'achievement.big-shape-master.desc': 'Place 10 large shapes (2×3 or 3×3)',
    'achievement.full-tray-user.title': 'Nothing wasted',
    'achievement.full-tray-user.desc': 'Fully use a set of 3 shapes 20 times',
    'achievement.comeback.title': 'Comeback',
    'achievement.comeback.desc': 'Clear a line after a long streak without one',

    'achievement.secret-perfect-start.title': '🤫 Perfect start',
    'achievement.secret-perfect-start.desc': "Fully clear the board within a game's first five moves",
    'achievement.secret-night-owl.title': '🤫 Night owl',
    'achievement.secret-night-owl.desc': 'Play a game deep in the night',
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
