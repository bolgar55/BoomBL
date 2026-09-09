// game/challenges.js
// Today's challenge and progress (module `challenges` boundaries -
// interfaces.md, spec §Decisions 4). Externally: getTodayChallenge()/
// reportProgress(event); template generation by date and progress storage
// are internal.
//
// The createChallenges(deps) factory, like createPersistence/createI18n,
// accepts injectable persistence and a current-time source so date
// determinism is testable without a real clock.

// Five challenge templates (spec §4). Day index = hash(YYYY-MM-DD) % 5 - the
// same day gives every player the same template and goal.
// Goal is fixed per template: since the template is chosen by date, the
// goal is also date-deterministic (via the template), with no separate
// number randomization.
const TEMPLATES = [
  { id: 'clearLines', goal: 10 },
  { id: 'score', goal: 500 },
  { id: 'combo', goal: 2 },
  { id: 'shapesPlaced', goal: 20 },
  { id: 'survive', goal: 15 },
];

const STORAGE_KEY = 'dailyChallenge';

// The device's local calendar date as 'YYYY-MM-DD' (not UTC - spec §4
// requires the device's calendar date specifically, R14.2).
function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Simple deterministic hash of the date string: sum of char codes.
// No need for cryptographic strength - just needs one day to always give
// the same template index for every player.
function hashDateKey(dateKey) {
  let sum = 0;
  for (let i = 0; i < dateKey.length; i++) sum += dateKey.charCodeAt(i);
  return sum;
}

function pickTemplate(dateKey) {
  return TEMPLATES[hashDateKey(dateKey) % TEMPLATES.length];
}

// Recomputes progress from a template and a move/game event.
// state is {progress, runLength} before the event; runLength is only used
// by the 'survive' template (current unfinished streak of moves without a game over).
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
 * Creates a daily challenge handler.
 * @param {{persistence: {getItem: Function, setItem: Function}, now?: () => Date}} deps
 *   persistence - the persistence module (game/persistence.js), stores progress and date;
 *   now - current-time source, defaults to () => new Date() (injected in tests).
 * @returns {{
 *   getTodayChallenge: () => Promise<{id: string, goal: number, progress: number}>,
 *   reportProgress: (event: object) => Promise<{id: string, goal: number, progress: number}>
 * }}
 */
export function createChallenges(deps = {}) {
  const persistence = deps.persistence;
  const now = deps.now ?? (() => new Date());

  // Reads saved state and decides whether it's still valid for today - when
  // the device's calendar date changes, progress resets (R14.2), and with
  // no games played on a fresh day it shows as 0 (R14.1).
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
