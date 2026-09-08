// Тесты для ui/sound.js — переключатель звука и диспетчеризация трёх эффектов
// через инжектируемые моки persistence/плеера (без реального DOM/Web Audio).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSoundEngine } from './sound.js';

// Мок persistence — повторяет сигнатуру game/persistence.js (getItem/setItem -> Promise).
function createFakePersistence(initial = {}) {
  const store = { ...initial };
  return {
    store,
    async getItem(key, defaultValue) {
      return key in store ? store[key] : defaultValue;
    },
    async setItem(key, value) {
      store[key] = value;
    },
  };
}

test('init() без сохранённого значения включает звук по умолчанию', async () => {
  const persistence = createFakePersistence();
  const engine = createSoundEngine({ persistence });

  await engine.init();

  assert.equal(engine.isEnabled(), true);
});

test('init() подхватывает ранее сохранённое выключенное состояние', async () => {
  const persistence = createFakePersistence({ soundEnabled: false });
  const engine = createSoundEngine({ persistence });

  await engine.init();

  assert.equal(engine.isEnabled(), false);
});

test('toggle() переключает состояние и сохраняет его через persistence', async () => {
  const persistence = createFakePersistence();
  const engine = createSoundEngine({ persistence });
  await engine.init();

  const afterFirstToggle = await engine.toggle();

  assert.equal(afterFirstToggle, false);
  assert.equal(engine.isEnabled(), false);
  assert.equal(persistence.store.soundEnabled, false);

  const afterSecondToggle = await engine.toggle();

  assert.equal(afterSecondToggle, true);
  assert.equal(persistence.store.soundEnabled, true);
});

test('playClick() воспроизводит звук через плеер, когда звук включён', async () => {
  let playCalls = 0;
  const createPlayer = () => ({ play: () => { playCalls++; } });
  const engine = createSoundEngine({ persistence: createFakePersistence(), createPlayer });
  await engine.init();

  engine.playClick();

  assert.equal(playCalls, 1);
});

test('playClick() не воспроизводит звук, когда переключатель выключен', async () => {
  let playCalls = 0;
  const createPlayer = () => ({ play: () => { playCalls++; } });
  const engine = createSoundEngine({
    persistence: createFakePersistence({ soundEnabled: false }),
    createPlayer,
  });
  await engine.init();

  engine.playClick();
  engine.playLineClear();
  engine.playGameOver();

  assert.equal(playCalls, 0);
});

// Минимальный фейковый DOM-элемент/документ — только то, что трогает кнопка
// переключателя (createElement/appendChild/addEventListener/textContent).
function createFakeDocument() {
  function makeElement() {
    const listeners = {};
    return {
      textContent: '',
      attrs: {},
      children: [],
      setAttribute(name, value) { this.attrs[name] = value; },
      appendChild(child) { this.children.push(child); },
      addEventListener(event, handler) { listeners[event] = handler; },
      _fireClick() { return listeners.click?.(); },
    };
  }
  return { body: makeElement(), createElement: () => makeElement() };
}

test('mountToggleButton() создаёт кнопку и клик по ней переключает звук с сохранением', async () => {
  const persistence = createFakePersistence();
  const engine = createSoundEngine({ persistence });
  await engine.init();
  const fakeDoc = createFakeDocument();

  const button = engine.mountToggleButton({ document: fakeDoc });

  assert.equal(fakeDoc.body.children[0], button);
  const labelWhenEnabled = button.textContent;

  await button._fireClick();

  assert.equal(engine.isEnabled(), false);
  assert.equal(persistence.store.soundEnabled, false);
  assert.notEqual(button.textContent, labelWhenEnabled);
});

test('три эффекта используют три разных источника звука', async () => {
  const requestedSrcs = [];
  const createPlayer = (src) => {
    requestedSrcs.push(src);
    return { play() {} };
  };
  const engine = createSoundEngine({ persistence: createFakePersistence(), createPlayer });
  await engine.init();

  engine.playClick();
  engine.playLineClear();
  engine.playGameOver();

  assert.equal(new Set(requestedSrcs).size, 3);
});
