// ui/sound.js
// Звуковые эффекты (R20): клик при постановке фигуры, взрыв при очистке линии,
// game over — с единым переключателем, сохраняющим выбор через `persistence`.
// Диспетчеризация (какой звук на какое событие, включён/выключен) — чистая
// логика, тестируется через инжектируемые моки persistence/плеера. Реальное
// воспроизведение (HTMLAudioElement) — DOM-слой, не покрывается юнит-тестами
// (interfaces.md, «Швы для тестов»: ui — точка входа, проверяется вручную).

// Ключ в persistence — общий для всех тасков, использующих настройки звука.
const STORAGE_KEY = 'soundEnabled';

// Пути к звуковым файлам-заглушкам (сгенерированы в assets/sounds/, см. README
// в самой папке при её отсутствии — распознаются по расширению .wav).
const SOUND_SOURCES = {
  click: 'assets/sounds/click.wav',
  lineClear: 'assets/sounds/line-clear.wav',
  gameOver: 'assets/sounds/game-over.wav',
};

/**
 * Создаёт звуковой движок с инжектируемыми зависимостями.
 * @param {{persistence?: {getItem: Function, setItem: Function}, createPlayer?: (src: string) => {play: () => void}}} [deps]
 *   persistence — хранилище настройки (интерфейс как у game/persistence.js);
 *   createPlayer — фабрика плеера по пути к файлу; по умолчанию — обёртка
 *   над HTMLAudioElement (реальное воспроизведение, не тестируется напрямую).
 */
export function createSoundEngine(deps = {}) {
  const persistence = deps.persistence ?? null;
  const createPlayer = deps.createPlayer ?? defaultCreatePlayer;

  // Включён по умолчанию до вызова init() — чтобы play* не падали, если
  // вызывающий код случайно дёрнет их раньше загрузки настройки.
  let enabled = true;
  const players = {};

  function getPlayer(key) {
    if (!players[key]) players[key] = createPlayer(SOUND_SOURCES[key]);
    return players[key];
  }

  /** Загружает сохранённый выбор (по умолчанию — звук включён). */
  async function init() {
    if (!persistence) return enabled;
    enabled = await persistence.getItem(STORAGE_KEY, true);
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  /** Устанавливает и сохраняет состояние переключателя звука. */
  async function setEnabled(value) {
    enabled = Boolean(value);
    if (persistence) await persistence.setItem(STORAGE_KEY, enabled);
    return enabled;
  }

  /** Переключает звук вкл/выкл одной кнопкой (R20). */
  async function toggle() {
    return setEnabled(!enabled);
  }

  function play(key) {
    if (!enabled) return;
    try {
      getPlayer(key).play();
    } catch {
      // Сбой воспроизведения (например, автоплей заблокирован браузером)
      // не должен ронять игру.
    }
  }

  /**
   * Создаёт и монтирует кнопку-переключатель звука (R20) — модуль строит DOM
   * сам, чтобы не требовать правок index.html/style.css (чужая зона, см.
   * интеграцию — таск 07). Возвращает сам DOM-элемент кнопки.
   * @param {{document?: object, container?: object}} [opts]
   */
  function mountToggleButton(opts = {}) {
    const doc = opts.document ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) return null;
    const container = opts.container ?? doc.body;

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'sound-toggle';
    updateLabel();

    button.addEventListener('click', async () => {
      await toggle();
      updateLabel();
    });

    container.appendChild(button);
    return button;

    function updateLabel() {
      button.textContent = enabled ? '🔊' : '🔇';
      button.setAttribute?.('aria-pressed', String(!enabled));
    }
  }

  return {
    init,
    isEnabled,
    setEnabled,
    toggle,
    mountToggleButton,
    playClick: () => play('click'),
    playLineClear: () => play('lineClear'),
    playGameOver: () => play('gameOver'),
  };
}

/** Плеер по умолчанию — HTMLAudioElement. Вне браузера — безопасный no-op. */
function defaultCreatePlayer(src) {
  if (typeof Audio === 'undefined') {
    return { play() {} };
  }
  const template = new Audio(src);
  return {
    play() {
      // Клонируем узел — быстрые повторные срабатывания (несколько кликов
      // подряд) не должны обрывать предыдущее воспроизведение.
      const instance = template.cloneNode();
      instance.play?.().catch(() => {});
    },
  };
}
