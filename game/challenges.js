// game/challenges.js
// Сегодняшний челлендж и прогресс (границы модуля `challenges` — interfaces.md,
// spec §Решения 4). Наружу — getTodayChallenge()/reportProgress(event),
// генерация шаблона по дате и хранение прогресса спрятаны внутри.
//
// Фабрика createChallenges(deps), как и createPersistence/createI18n —
// принимает инжектируемые persistence и источник текущего времени, чтобы
// детерминированность по дате была тестируема без реальных часов.

// Пять шаблонов челленджа (spec §4). Индекс на день = hash(YYYY-MM-DD) % 5 —
// один и тот же день у всех игроков даёт один и тот же шаблон и цель.
// Цель фиксирована на шаблон: раз шаблон выбирается по дате, цель тоже
// детерминирована по дате (через шаблон), без отдельной рандомизации числа.
const TEMPLATES = [
  { id: 'clearLines', goal: 10 },
  { id: 'score', goal: 500 },
  { id: 'combo', goal: 2 },
  { id: 'shapesPlaced', goal: 20 },
  { id: 'survive', goal: 15 },
];

const STORAGE_KEY = 'dailyChallenge';

// Локальная календарная дата устройства как 'YYYY-MM-DD' (не UTC — spec §4
// требует именно календарную дату устройства, R14.2).
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Простой детерминированный хэш строки даты: сумма кодов символов.
// Не нужна криптостойкость — только чтобы один день всегда давал один и тот
// же индекс шаблона у всех игроков.
function hashDateKey(dateKey) {
  let sum = 0;
  for (let i = 0; i < dateKey.length; i++) sum += dateKey.charCodeAt(i);
  return sum;
}

function pickTemplate(dateKey) {
  return TEMPLATES[hashDateKey(dateKey) % TEMPLATES.length];
}

// Пересчитывает прогресс по шаблону и событию хода/партии.
// state — {progress, runLength} до события; runLength используется только
// шаблоном 'survive' (текущая незавершённая серия ходов без game over).
function applyEvent(templateId, state, event) {
  const progress = state.progress ?? 0;
  const runLength = state.runLength ?? 0;

  switch (templateId) {
    case 'clearLines':
      return { progress: progress + (event.linesCleared ?? 0), runLength };
    case 'score':
      return { progress: progress + (event.scoreDelta ?? 0), runLength };
    case 'shapesPlaced':
      return { progress: progress + (event.shapesPlaced ?? 0), runLength };
    case 'combo': {
      const reached = (event.comboStreak ?? 0) >= 2;
      return { progress: reached ? 1 : progress, runLength };
    }
    case 'survive': {
      const nextRun = event.gameOver ? 0 : runLength + 1;
      return { progress: Math.max(progress, nextRun), runLength: nextRun };
    }
    default:
      return { progress, runLength };
  }
}

/**
 * Создаёт объект работы с дневным челленджем.
 * @param {{persistence: {getItem: Function, setItem: Function}, now?: () => Date}} deps
 *   persistence — модуль persistence (game/persistence.js), хранит прогресс и дату;
 *   now — источник текущего времени, по умолчанию () => new Date() (инжектируется в тестах).
 * @returns {{
 *   getTodayChallenge: () => Promise<{id: string, goal: number, progress: number}>,
 *   reportProgress: (event: object) => Promise<{id: string, goal: number, progress: number}>
 * }}
 */
export function createChallenges(deps = {}) {
  const persistence = deps.persistence;
  const now = deps.now ?? (() => new Date());

  // Читает сохранённое состояние и решает, актуально ли оно на сегодня —
  // при смене календарной даты устройства прогресс обнуляется (R14.2),
  // а без сыгранных партий в первый день он виден как 0 (R14.1).
  async function loadState(dateKey) {
    const stored = await persistence.getItem(STORAGE_KEY, null);
    if (stored && stored.date === dateKey) {
      return { progress: stored.progress ?? 0, runLength: stored.runLength ?? 0 };
    }
    return { progress: 0, runLength: 0 };
  }

  async function saveState(dateKey, templateId, state) {
    await persistence.setItem(STORAGE_KEY, {
      date: dateKey,
      id: templateId,
      progress: state.progress,
      runLength: state.runLength,
    });
  }

  async function getTodayChallenge() {
    const dateKey = formatDateKey(now());
    const template = pickTemplate(dateKey);
    const state = await loadState(dateKey);
    const progress = Math.min(template.goal, state.progress);
    return { id: template.id, goal: template.goal, progress };
  }

  async function reportProgress(event) {
    const dateKey = formatDateKey(now());
    const template = pickTemplate(dateKey);
    const state = await loadState(dateKey);
    const next = applyEvent(template.id, state, event ?? {});
    const clamped = { progress: Math.min(template.goal, next.progress), runLength: next.runLength };
    await saveState(dateKey, template.id, clamped);
    return { id: template.id, goal: template.goal, progress: clamped.progress };
  }

  return { getTodayChallenge, reportProgress };
}
