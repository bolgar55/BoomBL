// game/events.js
// Лёгкие временные ивенты на одну игровую сессию — не привязаны к дате/
// реальному времени (в отличие от game/challenges.js), а к ходам партии:
// один раз за партию, в случайный момент между TRIGGER_MOVE_MIN и
// TRIGGER_MOVE_MAX-м поставленным блоком, включается один случайный эффект
// на DURATION_MIN..DURATION_MAX ходов, затем сам гаснет. Не более одного
// ивента за партию — по просьбе «не напряжным и не сложным».
//
// Чистая логика без DOM/board — сами эффекты (множители очков/бонуса,
// повышенный шанс крупных фигур) читает вызывающий код (app.js,
// game/shapes.js) через геттеры ниже. «Дождь крупных фигур» НЕ обходит
// проверку допустимости позиции: он только повышает вес крупных фигур в
// game/shapes.js (pickForBoard), а фильтр «есть хоть одна допустимая
// позиция» (findValidPlacements) там применяется первым и безусловно — так
// что фигуру, которую физически некуда поставить, ивент всё равно не выдаст.

export const EVENT_TYPES = ['doublePoints', 'bigShapeRain', 'colorBonusRush'];

const TRIGGER_MOVE_MIN = 5;
const TRIGGER_MOVE_MAX = 15;
const DURATION_MIN = 6;
const DURATION_MAX = 8;
// За сколько ходов до старта показывать лёгкий безадресный намёк («скоро
// что-то произойдёт») — не раскрывает ни тип, ни точный ход, просто готовит
// игрока к тому, что ивент близко (просьба игрока — «добавить лёгкий намёк
// заранее», а не оставлять его полной внезапностью).
const HINT_LEAD_MOVES = 2;

function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * @typedef {{ type: string, movesRemaining: number, totalMoves: number }} ActiveEvent
 */

/**
 * Создаёт контроллер ивентов на одну партию. Состояние — на весь модуль не
 * хранится (в отличие от game/shapes.js waveState): вызывающий код (app.js)
 * держит один инстанс на партию и сам вызывает reset() при новой игре.
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
   * Вызывать после каждой успешно поставленной фигуры, с уже увеличенным
   * счётчиком shapesPlacedThisGame (его ведёт app.js). Возвращает, что
   * изменилось именно этим вызовом, или null, если ивент не стартовал и не
   * закончился прямо сейчас — вызывающий код показывает тост/перерисовывает
   * верхнюю панель только когда действительно есть изменение.
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
   * Безадресный намёк «скоро что-то произойдёт» — активен ровно
   * HINT_LEAD_MOVES ходов непосредственно перед стартом (и только пока
   * ивент этой партии ещё не сработал ни разу). Не привязан к
   * onShapePlaced — можно спрашивать в любой момент рендера верхней панели,
   * просто по текущему счётчику ходов партии.
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
