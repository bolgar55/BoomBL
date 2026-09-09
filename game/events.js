// game/events.js
// Lightweight temporary events for a single game session - not tied to a
// date/real time (unlike game/challenges.js), but to moves within the game:
// once per game, at a random point between the TRIGGER_MOVE_MIN and
// TRIGGER_MOVE_MAX-th placed block, one random effect turns on for
// DURATION_MIN..DURATION_MAX moves, then switches itself off. At most one
// event per game - per request "not stressful and not complicated".
//
// Pure logic, no DOM/board - the actual effects (score/bonus multipliers,
// boosted large-shape chance) are read by caller code (app.js,
// game/shapes.js) via the getters below. "Big shape rain" does NOT bypass
// the placement validity check: it only boosts large-shape weight in
// game/shapes.js (pickForBoard), where the "has at least one valid
// position" filter (findValidPlacements) is still applied first and
// unconditionally - so the event still never hands out a shape with
// nowhere to go.

export const EVENT_TYPES = ['doublePoints', 'bigShapeRain', 'colorBonusRush'];

const TRIGGER_MOVE_MIN = 5;
const TRIGGER_MOVE_MAX = 15;
const DURATION_MIN = 6;
const DURATION_MAX = 8;
// How many moves before the start to show a light, non-specific hint ("something
// will happen soon") - reveals neither the type nor the exact move, just
// prepares the player that an event is near (player request - "add a light
// hint in advance" instead of leaving it a total surprise).
const HINT_LEAD_MOVES = 2;

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * @typedef {{ type: string, movesRemaining: number, totalMoves: number }} ActiveEvent
 */

/**
 * Creates an event controller for one game. State isn't module-level
 * (unlike game/shapes.js waveState): caller code (app.js) holds one
 * instance per game and calls reset() itself on a new game.
 * @returns {{
 *   reset: () => void,
 *   onShapePlaced: (shapesPlacedThisGame: number) => ({type: 'started'|'ended', eventType: string} | null),
 *   getActive: () => ActiveEvent | null,
 *   getScoreMultiplier: () => number,
 *   getColorBonusMultiplier: () => number,
 *   isBigShapeRainActive: () => boolean,
 * }}
 */
export function createEventDirector() {
  let triggerMove = randomBetween(TRIGGER_MOVE_MIN, TRIGGER_MOVE_MAX);
  let active = null;
  let firedThisGame = false;

  function reset() {
    triggerMove = randomBetween(TRIGGER_MOVE_MIN, TRIGGER_MOVE_MAX);
    active = null;
    firedThisGame = false;
  }

  /**
   * Call after every successfully placed shape, with shapesPlacedThisGame
   * already incremented (app.js tracks it). Returns what changed on this
   * exact call, or null if no event started or ended right now - caller
   * only shows a toast/re-renders the top bar when there's an actual change.
   * @param {number} shapesPlacedThisGame
   * @returns {{type: 'started'|'ended', eventType: string} | null}
   */
  function onShapePlaced(shapesPlacedThisGame) {
    if (active) {
      active.movesRemaining -= 1;
      if (active.movesRemaining <= 0) {
        const eventType = active.type;
        active = null;
        return { type: 'ended', eventType };
      }
      return null;
    }
    if (!firedThisGame && shapesPlacedThisGame >= triggerMove) {
      firedThisGame = true;
      const eventType = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
      const totalMoves = randomBetween(DURATION_MIN, DURATION_MAX);
      active = { type: eventType, movesRemaining: totalMoves, totalMoves };
      return { type: 'started', eventType };
    }
    return null;
  }

  function getActive() {
    return active ? { ...active } : null;
  }

  function getScoreMultiplier() {
    return active?.type === 'doublePoints' ? 2 : 1;
  }

  function getColorBonusMultiplier() {
    return active?.type === 'colorBonusRush' ? 2 : 1;
  }

  function isBigShapeRainActive() {
    return active?.type === 'bigShapeRain';
  }

  /**
   * Non-specific "something will happen soon" hint - active for exactly
   * HINT_LEAD_MOVES moves immediately before the start (and only while this
   * game's event hasn't fired yet). Not tied to onShapePlaced - can be
   * queried at any top-bar render, just from the current move counter.
   * @param {number} shapesPlacedThisGame
   * @returns {boolean}
   */
  function isHintActive(shapesPlacedThisGame) {
    if (active || firedThisGame) return false;
    return shapesPlacedThisGame >= triggerMove - HINT_LEAD_MOVES && shapesPlacedThisGame < triggerMove;
  }

  return {
    reset,
    onShapePlaced,
    getActive,
    getScoreMultiplier,
    getColorBonusMultiplier,
    isBigShapeRainActive,
    isHintActive,
  };
}
