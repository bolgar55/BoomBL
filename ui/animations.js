// ui/animations.js
// UI animations (R19): shape appearance, various block/line/combo clear
// effects, a pulse on successful placement, shake+flash on failed placement,
// a popup bonus for filling a gap, an animated score counter, a full-board
// clear celebration, and a combo preview while dragging a shape (R05.3).
// Works on top of DOM elements/Canvas passed in by the caller — stateless.
// Visual layer, not covered by unit tests (see interfaces.md, "Test seams").
//
// Several effects can run at once on the same effects canvas (e.g. a
// placement pulse + a line explosion + a full-clear firework), so each one
// isn't its own self-driven rAF loop with its own clearRect (that would wipe
// out neighboring effects) — instead it's a "layer" with a pure
// draw(now, ctx) -> still alive? function added to the shared engine
// createEffectsEngine, which alone clears the canvas and runs all active
// layers per frame. Effects never block game logic: all triggers are
// fire-and-forget — the caller (app.js) doesn't wait for them before the next move.

import { drawComboPreview } from './render.js?v=0.5.1';

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
 * Appear animation for new tray shapes (R19): a light cascade — slots appear
 * one after another rather than all at once (small per-index delay), which
 * is itself the "next shape appears" animation. Restarts the CSS animation
 * even if the class was already applied before (forced reflow).
 * @param {HTMLElement[]} elements
 */
export function playAppear(elements) {
  elements.forEach((el, i) => {
    el.classList.remove(APPEAR_CLASS);
    el.style.animationDelay = `${i * 60}ms`;
    void el.offsetWidth; // force reflow so the animation can restart
    el.classList.add(APPEAR_CLASS);
  });
}

/**
 * Shake an element on a failed attempt to place a shape (R05.2/R19).
 * @param {HTMLElement} el
 */
export function playShake(el) {
  el.classList.remove(SHAKE_CLASS);
  void el.offsetWidth;
  el.classList.add(SHAKE_CLASS);
  el.addEventListener('animationend', () => el.classList.remove(SHAKE_CLASS), { once: true });
}

/**
 * Engine for several simultaneous canvas effects on one context (R19): each
 * layer — { draw(now, ctx): boolean } — draws itself and reports whether
 * it's still alive; the engine clears the canvas once per frame and runs all
 * active layers without them interfering with each other. Starts/stops its
 * own rAF — idles when there are no active layers.
 * @param {CanvasRenderingContext2D} ctx - effects canvas overlaid on the board
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
 * Layer for the cleared-lines explosion (R07/R19) — not identical every
 * time: cells fade out in a sequential "wave", a ring expands outward from
 * the center, and rotating rectangular fragments (particle-like, slight
 * rotation) fly off with a soft glow (shadowBlur). Intensity scales with the
 * number of lines cleared at once and the combo streak — this is what makes
 * "multiple lines at once" and "big combo" visually more powerful: more
 * fragments, a second gold/orange wave, a pink-tinted flash.
 * @param {{row:number, col:number, color:string}[]} cells - cleared cells with their color
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
        const y = p.y + p.vy * t + 0.5 * 340 * t * t; // slight gravity
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
 * Layer for a light pulse on successful placement without a line clear
 * (R19, "shape placed" / "successful placement") — a ring on each cell of
 * the shape, expanding and fading. Tactile feedback for every normal move,
 * separate from the bigger explosion on a line clear.
 * @param {{row:number, col:number}[]} cells - cells the shape landed on
 * @param {number} cellSize
 * @param {string} color
 * @returns {{draw(now:number, ctx:CanvasRenderingContext2D): boolean}}
 */
export function createPlacementPulseLayer(cells, cellSize, color) {
  const start = performance.now();
  return {
    draw(now, ctx) {
      // now can arrive slightly before start on the very first frame after
      // add() (the rAF timestamp is the frame's start time, not the JS call
      // time) — without the lower bound, t went negative, easeOutCubic(t<0)
      // went negative too, and radius could end up negative: ctx.arc() with
      // a negative radius throws in Chrome.
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
 * Layer for a brief red flash over the whole board on an invalid placement
 * attempt (R05.2/R19) — runs alongside playShake, a separate animation
 * (flash, not movement).
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
 * Layer for the big celebration effect on a full-board clear (R19, "clear
 * the whole board") — the game's most powerful reaction: a full-canvas
 * flash, a gold ring expanding from center to edges, and confetti falling
 * across the whole board width.
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
      // Math.max(0, ...) — see the comment in createPlacementPulseLayer: on
      // the very first frame, now can arrive slightly before start.
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
 * Animated score counter (R19): the text smoothly "counts up" from the old
 * value to the new one instead of changing instantly. A token on the
 * element itself guards against a race if the next move starts a new
 * animation before the previous one finished — the old rAF loop notices
 * it's been superseded and stops itself.
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
    if (el.__scoreAnimToken !== token) return; // superseded by a newer call
    const t = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(from + (to - from) * easeOutCubic(t)));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/**
 * Popup "+N" above the bonus spot (R19, "bonus for filling gaps") — not
 * static text: smoothly grows, bounces slightly, holds, then fades while
 * floating up — the animation is entirely in CSS (@keyframes bonusPop in
 * style.css), this just creates/positions/self-removes the DOM node.
 * @param {HTMLElement} container - positioned container (e.g. a layer over the board)
 * @param {{x:number, y:number, text:string, big?:boolean}} opts - x/y in the container's CSS pixels
 */
export function playBonusPopup(container, { x, y, text, big = false, color = null }) {
  const el = document.createElement('div');
  el.className = big ? 'bonus-popup bonus-popup--big' : 'bonus-popup';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  // color — optional tint for a specific occasion (e.g. the bonus for fully
  // clearing a color from the board is tinted that color instead of the
  // default gold) — overrides the text color and its glow.
  if (color) {
    el.style.color = color;
    el.style.textShadow = `0 2px 6px rgba(0, 0, 0, 0.55), 0 0 14px ${color}`;
  }
  container.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/**
 * Confetti on the Game Over screen — an independent rAF loop on its own
 * canvas (not via createEffectsEngine: it covers the whole screen, not just
 * the board, and starts exactly once when the screen shows, unlike game
 * effects which fire repeatedly). The canvas is sized to its container's
 * current size (full-screen overlay), adjusted for devicePixelRatio.
 * @param {HTMLCanvasElement} canvas
 * @param {{count?: number, durationMs?: number}} [opts]
 * @returns {() => void} stop function — cancels the rAF and clears the canvas
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

// "Breathing" speed of the preview highlight — sine wave rad/sec (~2s per cycle).
const COMBO_PREVIEW_BREATH_SPEED = 3.2;

/**
 * Combo preview while dragging a shape (R05.3): ui/input.js calls update()
 * on every cursor move with the cells that would disappear on placement
 * (empty = don't show the preview); this runs its own "breathing" rAF loop
 * (sine-wave pulse) that draws them over the board via drawComboPreview. The
 * loop starts itself when cells first appear and stops itself when they're
 * gone — it doesn't spin idly when there's nothing to preview. stop() is a
 * hard stop when the drag ends (also clears the canvas).
 * @param {CanvasRenderingContext2D} ctx - effects canvas overlaid on the board
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
