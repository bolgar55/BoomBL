// ui/animations.js
// Анимации интерфейса (R19): появление фигур, взрыв линий с частицами,
// тряска при неудачном ходе, дополнительные партиклы при комбо, превью
// потенциального комбо при перетаскивании фигуры (R05.3).
// Работает поверх DOM-элементов/Canvas, переданных вызывающим кодом —
// не хранит состояние партии. Визуальный слой, не покрывается юнит-тестами
// (см. interfaces.md, «Швы для тестов»).

import { drawComboPreview } from './render.js';

const APPEAR_CLASS = 'anim-appear';
const SHAKE_CLASS = 'anim-shake';

/**
 * Анимация появления новых фигур в лотке (R19). Перезапускает CSS-анимацию
 * даже если класс уже был навешан раньше (форсированный reflow).
 * @param {HTMLElement[]} elements
 */
export function playAppear(elements) {
  for (const el of elements) {
    el.classList.remove(APPEAR_CLASS);
    void el.offsetWidth; // форсируем reflow, чтобы анимацию можно было перезапустить
    el.classList.add(APPEAR_CLASS);
  }
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
 * Взрыв очищенных линий (R07/R19): белая вспышка клеток + разлетающиеся
 * частицы в цвете блока. При комбо (isCombo) партиклов больше и часть из них
 * золотая — это и есть отдельная, визуально отличимая анимация «партиклы при
 * комбо», требуемая тикетом.
 * @param {CanvasRenderingContext2D} ctx - контекст эффект-канваса поверх поля
 * @param {{row:number, col:number, color:string}[]} cells - очищенные клетки с их цветом
 * @param {number} cellSize
 * @param {boolean} isCombo
 * @param {() => void} [onDone]
 */
export function playLineClear(ctx, cells, cellSize, isCombo, onDone) {
  const canvas = ctx.canvas;
  const particles = [];

  for (const { row, col, color } of cells) {
    const cx = col * cellSize + cellSize / 2;
    const cy = row * cellSize + cellSize / 2;
    const count = isCombo ? 10 : 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: isCombo && i % 2 === 0 ? '#FFD700' : color,
        size: 2.5 + Math.random() * 3,
      });
    }
  }

  const flashDurationMs = 150;
  const totalDurationMs = 550;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (elapsed < flashDurationMs) {
      ctx.save();
      ctx.globalAlpha = 1 - elapsed / flashDurationMs;
      ctx.fillStyle = '#FFFFFF';
      for (const { row, col } of cells) {
        ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
      ctx.restore();
    }

    const dtSec = 1 / 60;
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vy += 320 * dtSec; // лёгкая гравитация
      p.life -= dtSec / (totalDurationMs / 1000);
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (elapsed < totalDurationMs) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (onDone) onDone();
    }
  }

  requestAnimationFrame(frame);
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
