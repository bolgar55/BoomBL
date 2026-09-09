// ui/animations.js
// Анимации интерфейса (R19): появление фигур, разнообразные эффекты
// удаления блоков/линий/комбо, импульс успешного размещения, тряска и
// вспышка при неудачной попытке, всплывающий бонус за закрытие пробела и
// анимированный счётчик очков, полная очистка поля, превью потенциального
// комбо при перетаскивании фигуры (R05.3).
// Работает поверх DOM-элементов/Canvas, переданных вызывающим кодом —
// не хранит состояние партии. Визуальный слой, не покрывается юнит-тестами
// (см. interfaces.md, «Швы для тестов»).
//
// Несколько эффектов на одном effects-канвасе могут идти одновременно
// (например: импульс размещения + взрыв линии + фейерверк полной очистки),
// поэтому каждый из них — не отдельный self-driven rAF-цикл со своим
// clearRect (это стирало бы соседние эффекты), а «слой» с чистой функцией
// draw(now, ctx) → жив ли ещё, который добавляется в общий movок
// createEffectsEngine — он один чистит канвас и вызывает все активные слои
// за кадр. Эффекты не блокируют игровую логику: все триггеры — fire-and-forget,
// вызывающий код (app.js) не ждёт их завершения перед следующим ходом.

import { drawComboPreview } from './render.js?v=0.4.8';

const APPEAR_CLASS = 'anim-appear';
const SHAKE_CLASS = 'anim-shake';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function drawRotatedFragment(ctx, x, y, size, rotation, color, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

/**
 * Анимация появления новых фигур в лотке (R19): лёгкий каскад — слоты
 * появляются не одновременно, а друг за другом (небольшая задержка на
 * индекс), это и есть отдельная анимация «появление следующей фигуры».
 * Перезапускает CSS-анимацию даже если класс уже был навешан раньше
 * (форсированный reflow).
 * @param {HTMLElement[]} elements
 */
export function playAppear(elements) {
  elements.forEach((el, i) => {
    el.classList.remove(APPEAR_CLASS);
    el.style.animationDelay = `${i * 60}ms`;
    void el.offsetWidth; // форсируем reflow, чтобы анимацию можно было перезапустить
    el.classList.add(APPEAR_CLASS);
  });
}

/**
 * Тряска элемента при неудачной попытке поставить фигуру (R05.2/R19).
 * @param {HTMLElement} el
 */
export function playShake(el) {
  el.classList.remove(SHAKE_CLASS);
  void el.offsetWidth;
  el.classList.add(SHAKE_CLASS);
  el.addEventListener('animationend', () => el.classList.remove(SHAKE_CLASS), { once: true });
}

/**
 * Движок нескольких одновременных canvas-эффектов на одном контексте (R19):
 * каждый слой — { draw(now, ctx): boolean } — рисует себя и сообщает, жив ли
 * ещё; движок один раз в кадр чистит канвас и прогоняет все активные слои,
 * не мешая друг другу. Стартует/останавливает свой rAF сам — простаивает,
 * когда активных слоёв нет.
 * @param {CanvasRenderingContext2D} ctx - effects-канвас поверх поля
 * @returns {{add(layer: {draw:(now:number, ctx:CanvasRenderingContext2D) => boolean}): void}}
 */
export function createEffectsEngine(ctx) {
  const layers = new Set();
  let rafId = null;

  function tick(now) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const layer of layers) {
      if (!layer.draw(now, ctx)) layers.delete(layer);
    }
    rafId = layers.size > 0 ? requestAnimationFrame(tick) : null;
  }

  return {
    add(layer) {
      layers.add(layer);
      if (rafId === null) rafId = requestAnimationFrame(tick);
    },
  };
}

const CELL_FLASH_MS = 200;
const STAGGER_MS = 16;
const PARTICLE_LIFE_MS = 620;
const RING_MS = 520;

/**
 * Слой взрыва очищенных линий (R07/R19) — не выглядит одинаково каждый раз:
 * клетки гаснут «волной» по порядку (последовательное исчезновение), от
 * центра расходится кольцо (волновой эффект), разлетаются вращающиеся
 * прямоугольные осколки (particle-like + небольшой rotation) с мягким
 * свечением (shadowBlur). Интенсивность растёт с числом одновременно
 * очищенных линий и серией комбо — это и есть отдельные, визуально более
 * мощные анимации «нескольких линий одновременно» и «большого комбо»:
 * больше осколков, вторая (золотая/оранжевая) волна, розовый оттенок вспышки.
 * @param {{row:number, col:number, color:string}[]} cells - очищенные клетки с их цветом
 * @param {number} cellSize
 * @param {{comboStreak?: number, linesCleared?: number}} [meta]
 * @returns {{draw(now:number, ctx:CanvasRenderingContext2D): boolean}}
 */
export function createLineClearLayer(cells, cellSize, meta = {}) {
  const { comboStreak = 0, linesCleared = 1 } = meta;
  const bigCombo = linesCleared >= 2 || comboStreak >= 3;
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const centerCol = sorted.reduce((s, c) => s + c.col, 0) / sorted.length;
  const centerRow = sorted.reduce((s, c) => s + c.row, 0) / sorted.length;
  const centerX = (centerCol + 0.5) * cellSize;
  const centerY = (centerRow + 0.5) * cellSize;

  const particlesPerCell = 5 + (linesCleared >= 2 ? 5 : 0) + (comboStreak >= 3 ? 6 : 0);
  const goldRatio = bigCombo ? 0.5 : comboStreak >= 1 || linesCleared >= 2 ? 0.25 : 0;

  const flashes = sorted.map((cell, i) => ({ cell, delay: i * STAGGER_MS }));

  const particles = [];
  for (const { row, col, color } of sorted) {
    const px = col * cellSize + cellSize / 2;
    const py = row * cellSize + cellSize / 2;
    for (let i = 0; i < particlesPerCell; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * (bigCombo ? 220 : 150);
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 10,
        color: Math.random() < goldRatio ? '#FFD700' : color,
        size: 3 + Math.random() * (bigCombo ? 4.5 : 3),
        delay: Math.random() * STAGGER_MS * 2,
      });
    }
  }

  const rings = [{ delay: 0, color: bigCombo ? '#FFD700' : '#FFFFFF', maxRadius: cellSize * (2.6 + sorted.length * 0.12) }];
  if (bigCombo) {
    rings.push({ delay: 90, color: '#FF8A3D', maxRadius: cellSize * (3.4 + sorted.length * 0.14) });
  }

  const totalDuration = sorted.length * STAGGER_MS + Math.max(CELL_FLASH_MS, PARTICLE_LIFE_MS, RING_MS) + 60;
  const start = performance.now();

  return {
    draw(now, ctx) {
      const elapsed = now - start;
      if (elapsed >= totalDuration) return false;

      for (const { cell, delay } of flashes) {
        const t = (elapsed - delay) / CELL_FLASH_MS;
        if (t < 0 || t >= 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.shadowColor = bigCombo ? '#FFD700' : '#FFFFFF';
        ctx.shadowBlur = bigCombo ? 24 : 14;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(cell.col * cellSize, cell.row * cellSize, cellSize, cellSize);
        ctx.restore();
      }

      for (const p of particles) {
        const pElapsed = elapsed - p.delay;
        if (pElapsed < 0) continue;
        const life = 1 - pElapsed / PARTICLE_LIFE_MS;
        if (life <= 0) continue;
        const t = pElapsed / 1000;
        const x = p.x + p.vx * t;
        const y = p.y + p.vy * t + 0.5 * 340 * t * t; // лёгкая гравитация
        drawRotatedFragment(ctx, x, y, p.size, p.rotation + p.rotationSpeed * t, p.color, life);
      }

      for (const ring of rings) {
        const rElapsed = elapsed - ring.delay;
        if (rElapsed < 0) continue;
        const t = rElapsed / RING_MS;
        if (t >= 1) continue;
        const radius = Math.max(0, ring.maxRadius * easeOutCubic(t));
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = bigCombo ? 5 : 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      return true;
    },
  };
}

const PLACEMENT_PULSE_MS = 260;

/**
 * Слой лёгкого импульса при успешной установке фигуры без очистки линий
 * (R19, «установка фигуры» / «успешное размещение») — по кольцу на каждой
 * клетке фигуры, расширяется и гаснет. Тактильная обратная связь на каждый
 * обычный ход, отдельная от более мощного взрыва при очистке линий.
 * @param {{row:number, col:number}[]} cells - клетки, куда легла фигура
 * @param {number} cellSize
 * @param {string} color
 * @returns {{draw(now:number, ctx:CanvasRenderingContext2D): boolean}}
 */
export function createPlacementPulseLayer(cells, cellSize, color) {
  const start = performance.now();
  return {
    draw(now, ctx) {
      // now может прийти чуть раньше start на самом первом кадре после
      // add() (таймстамп rAF — момент начала кадра, а не вызова JS) — без
      // нижней границы t уходил в минус, easeOutCubic(t<0) — тоже в минус,
      // и radius мог стать отрицательным: ctx.arc() с отрицательным
      // радиусом бросает исключение в Chrome.
      const t = Math.max(0, (now - start) / PLACEMENT_PULSE_MS);
      if (t >= 1) return false;
      const eased = easeOutCubic(t);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      for (const { row, col } of cells) {
        const cx = col * cellSize + cellSize / 2;
        const cy = row * cellSize + cellSize / 2;
        const radius = Math.max(0, (cellSize / 2) * (0.25 + eased * 0.85));
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      return true;
    },
  };
}

const INVALID_PULSE_MS = 320;

/**
 * Слой краткой красной вспышки по всему полю при недопустимой попытке
 * размещения (R05.2/R19) — идёт вместе с playShake, отдельная от неё
 * анимация (flash, а не движение).
 * @param {number} cellSize
 * @param {number} boardSize
 * @returns {{draw(now:number, ctx:CanvasRenderingContext2D): boolean}}
 */
export function createInvalidPulseLayer(cellSize, boardSize) {
  const size = cellSize * boardSize;
  const start = performance.now();
  return {
    draw(now, ctx) {
      const t = (now - start) / INVALID_PULSE_MS;
      if (t >= 1) return false;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.28;
      ctx.fillStyle = '#FF4757';
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
      return true;
    },
  };
}

const FULL_CLEAR_MS = 900;
const FULL_CLEAR_CONFETTI_COLORS = ['#FFD700', '#FF6B9D', '#1E90FF', '#2ED573', '#A55EEA', '#FFA502'];

/**
 * Слой большого праздничного эффекта при полной очистке поля (R19,
 * «очистка всего поля») — самая мощная реакция в игре: вспышка на весь
 * канвас, расходящееся золотое кольцо от центра до краёв и конфетти,
 * падающее по всей ширине поля.
 * @param {number} cellSize
 * @param {number} boardSize
 * @returns {{draw(now:number, ctx:CanvasRenderingContext2D): boolean}}
 */
export function createFullClearBurstLayer(cellSize, boardSize) {
  const size = cellSize * boardSize;
  const centerX = size / 2;
  const centerY = size / 2;
  const maxRadius = Math.hypot(centerX, centerY) * 1.15;
  const start = performance.now();

  const confetti = [];
  for (let i = 0; i < 60; i++) {
    confetti.push({
      x: Math.random() * size,
      y: -20 - Math.random() * 60,
      vy: 140 + Math.random() * 180,
      vx: (Math.random() - 0.5) * 60,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 8,
      size: 4 + Math.random() * 5,
      color: FULL_CLEAR_CONFETTI_COLORS[Math.floor(Math.random() * FULL_CLEAR_CONFETTI_COLORS.length)],
      delay: Math.random() * 250,
    });
  }

  return {
    draw(now, ctx) {
      // Math.max(0, ...) — см. комментарий в createPlacementPulseLayer: на
      // самом первом кадре now может прийти чуть раньше start.
      const elapsed = Math.max(0, now - start);
      if (elapsed >= FULL_CLEAR_MS) return false;

      const flashT = elapsed / 260;
      if (flashT < 1) {
        ctx.save();
        ctx.globalAlpha = (1 - flashT) * 0.5;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
      }

      const ringT = Math.min(1, elapsed / 700);
      if (ringT < 1) {
        ctx.save();
        ctx.globalAlpha = (1 - ringT) * 0.7;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(centerX, centerY, Math.max(0, maxRadius * easeOutCubic(ringT)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      for (const p of confetti) {
        const pElapsed = elapsed - p.delay;
        if (pElapsed < 0) continue;
        const lifeSpan = FULL_CLEAR_MS - p.delay;
        const life = 1 - pElapsed / lifeSpan;
        if (life <= 0) continue;
        const t = pElapsed / 1000;
        const y = p.y + p.vy * t;
        if (y > size + 20) continue;
        drawRotatedFragment(ctx, p.x + p.vx * t, y, p.size, p.rotation + p.rotationSpeed * t, p.color, Math.min(life, 1));
      }

      return true;
    },
  };
}

/**
 * Анимированный счёт очков (R19): текст плавно «докручивается» от старого
 * значения к новому, а не меняется мгновенно. Токен на самом элементе
 * защищает от гонки, если следующий ход стартует новую анимацию раньше, чем
 * долетела предыдущая — старый rAF-цикл сам замечает, что его сменили, и
 * останавливается.
 * @param {HTMLElement} el
 * @param {number} from
 * @param {number} to
 * @param {number} [duration]
 */
export function animateScoreCountUp(el, from, to, duration = 500) {
  if (from === to) {
    el.textContent = String(to);
    return;
  }
  const token = Symbol('scoreAnim');
  el.__scoreAnimToken = token;
  const start = performance.now();
  function frame(now) {
    if (el.__scoreAnimToken !== token) return; // подменили новым вызовом
    const t = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(from + (to - from) * easeOutCubic(t)));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Всплывающий «+N» над местом бонуса (R19, «бонус за заполнение пустот») —
 * не статичный текст: плавно увеличивается, слегка подпрыгивает, держится и
 * растворяется, уплывая вверх — анимация целиком в CSS (@keyframes bonusPop
 * в style.css), здесь только создание/позиционирование/самоудаление DOM-узла.
 * @param {HTMLElement} container - позиционируемый контейнер (например, слой над полем)
 * @param {{x:number, y:number, text:string, big?:boolean}} opts - x/y в CSS-пикселях контейнера
 */
export function playBonusPopup(container, { x, y, text, big = false, color = null }) {
  const el = document.createElement('div');
  el.className = big ? 'bonus-popup bonus-popup--big' : 'bonus-popup';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  // color — необязательная подсветка под конкретный повод (например, бонус
  // за полное удаление цвета с поля тонируется в тот самый цвет, а не
  // стандартным золотым) — переопределяет цвет текста и его свечение.
  if (color) {
    el.style.color = color;
    el.style.textShadow = `0 2px 6px rgba(0, 0, 0, 0.55), 0 0 14px ${color}`;
  }
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/**
 * Конфетти на экране Game Over — независимый rAF-цикл на своём канвасе (не
 * через createEffectsEngine: живёт поверх целого экрана, а не только поля, и
 * запускается ровно один раз при показе экрана, а не многократно, как
 * игровые эффекты). Канвас растягивается под текущий размер своего
 * контейнера (overlay во весь экран) с поправкой на devicePixelRatio.
 * @param {HTMLCanvasElement} canvas
 * @param {{count?: number, durationMs?: number}} [opts]
 * @returns {() => void} остановка — отменяет rAF и чистит канвас
 */
export function playGameOverConfetti(canvas, { count = 70, durationMs = 2600 } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const pieces = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      x: Math.random() * width,
      y: -20 - Math.random() * height * 0.5,
      vy: 90 + Math.random() * 140,
      vx: (Math.random() - 0.5) * 50,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 6,
      size: 5 + Math.random() * 6,
      color: FULL_CLEAR_CONFETTI_COLORS[Math.floor(Math.random() * FULL_CLEAR_CONFETTI_COLORS.length)],
      delay: Math.random() * 500,
    });
  }

  const start = performance.now();
  let rafId = null;

  function frame(now) {
    const elapsed = Math.max(0, now - start);
    ctx.clearRect(0, 0, width, height);
    if (elapsed >= durationMs) {
      rafId = null;
      return;
    }
    for (const p of pieces) {
      const pElapsed = elapsed - p.delay;
      if (pElapsed < 0) continue;
      const t = pElapsed / 1000;
      const y = p.y + p.vy * t;
      if (y > height + 20) continue;
      const lifeSpan = Math.max(1, durationMs - p.delay) / 1000;
      const life = Math.max(0, 1 - t / lifeSpan);
      drawRotatedFragment(ctx, p.x + p.vx * t, y, p.size, p.rotation + p.rotationSpeed * t, p.color, Math.min(1, life * 2));
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    ctx.clearRect(0, 0, width, height);
  };
}

// Скорость «дыхания» подсветки превью — рад/сек синусоиды (~2с на цикл).
const COMBO_PREVIEW_BREATH_SPEED = 3.2;

/**
 * Превью потенциального комбо при перетаскивании фигуры (R05.3): пока
 * ui/input.js на каждое движение курсора зовёт update() с клетками, которые
 * исчезли бы после установки (пусто — превью не показываем), здесь крутится
 * независимый rAF-цикл «дыхания» (пульс по синусоиде), который их рисует
 * поверх поля через drawComboPreview. Цикл сам стартует при первых клетках
 * и сам останавливается, когда клеток не стало — не крутится вхолостую,
 * когда превью нечего показывать. stop() — жёсткая остановка при завершении
 * драга (в т.ч. вместе с очисткой канваса).
 * @param {CanvasRenderingContext2D} ctx - effects-канвас поверх поля
 * @returns {{update(cells:{row:number,col:number}[], color:string, cellSize:number):void, stop():void}}
 */
export function createComboPreview(ctx) {
  let cells = [];
  let color = '#FFFFFF';
  let cellSize = 0;
  let rafId = null;
  let phaseStart = 0;

  function clear() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  function frame(now) {
    if (!cells.length) {
      rafId = null;
      clear();
      return;
    }
    clear();
    const pulse = (Math.sin(((now - phaseStart) / 1000) * COMBO_PREVIEW_BREATH_SPEED) + 1) / 2;
    drawComboPreview(ctx, cells, cellSize, color, pulse);
    rafId = requestAnimationFrame(frame);
  }

  return {
    update(nextCells, nextColor, nextCellSize) {
      cells = nextCells;
      color = nextColor;
      cellSize = nextCellSize;
      if (cells.length && rafId === null) {
        phaseStart = performance.now();
        rafId = requestAnimationFrame(frame);
      }
    },
    stop() {
      cells = [];
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      clear();
    },
  };
}
