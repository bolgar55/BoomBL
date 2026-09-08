// ui/achievements.js
// Экран списка достижений + всплывающее уведомление о разблокировке (R05.7).
// Не хранит игровое состояние — только строит DOM по данным, которые ему
// передают (game/achievements.js — источник истины по прогрессу). Паттерн
// «модуль сам строит свой DOM в container при первом show()» — как и
// ui/gameover.js, чтобы не требовать правок index.html под каждый элемент.

const TIER_LABEL = {
  common: '',
  uncommon: '',
  rare: '★',
  epic: '★★',
  secret: '?',
};

/**
 * Создаёт контроллер экрана достижений — полноэкранный оверлей со списком.
 * @param {{
 *   container: HTMLElement,
 *   i18n: { t: (key:string, params?:object) => string },
 *   getAchievements: () => Promise<Array<import('../game/achievements.js').AchievementDef & {progress:number, unlocked:boolean}>>,
 *   getPinnedId: () => Promise<string|null>,
 *   setPinned: (id: string|null) => Promise<void>,
 *   onPinChange?: () => void,
 * }} deps
 * @returns {{ show(): Promise<void>, hide(): void }}
 */
export function createAchievementsScreen({ container, i18n, getAchievements, getPinnedId, setPinned, onPinChange }) {
  let overlay = null;
  let listEl = null;
  let pinnedId = null;

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'achievements-overlay';
    overlay.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'achievements-panel';

    const header = document.createElement('div');
    header.className = 'achievements-header';

    const title = document.createElement('h2');
    title.setAttribute('data-role', 'title');

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'achievements-close';
    closeBtn.setAttribute('data-role', 'close');
    closeBtn.setAttribute('aria-label', i18n.t('close'));
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', hide);

    header.appendChild(title);
    header.appendChild(closeBtn);

    listEl = document.createElement('div');
    listEl.className = 'achievements-list';

    panel.appendChild(header);
    panel.appendChild(listEl);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) hide();
    });
    container.appendChild(overlay);

    return overlay;
  }

  // Не ждём setPinned() перед обновлением интерфейса — она сохраняет выбор
  // через persistence, которая внутри Telegram уходит в CloudStorage (реальный
  // сетевой запрос, иногда заметно медленный); UI обновляется сразу по
  // локальному pinnedId, а сохранение продолжается в фоне (тот же фикс, что
  // и для кнопки языка в app.js).
  function togglePin(id) {
    const next = pinnedId === id ? null : id;
    pinnedId = next;
    setPinned(next);
    onPinChange?.();
    refresh();
  }

  function renderItem(def) {
    const item = document.createElement('div');
    item.className = 'achievement-item';
    item.classList.add(def.unlocked ? 'achievement-item--unlocked' : 'achievement-item--locked');
    if (def.tier === 'secret' && !def.unlocked) item.classList.add('achievement-item--secret');
    if (def.id === pinnedId) item.classList.add('achievement-item--pinned');

    const icon = document.createElement('div');
    icon.className = 'achievement-icon';
    icon.textContent = def.tier === 'secret' && !def.unlocked ? '❔' : def.icon;

    const body = document.createElement('div');
    body.className = 'achievement-body';

    const titleRow = document.createElement('div');
    titleRow.className = 'achievement-title-row';

    const titleEl = document.createElement('span');
    titleEl.className = 'achievement-title';
    titleEl.textContent =
      def.tier === 'secret' && !def.unlocked ? '???' : i18n.t(`achievement.${def.id}.title`);

    const tierBadge = TIER_LABEL[def.tier];
    if (tierBadge) {
      const badge = document.createElement('span');
      badge.className = `achievement-tier achievement-tier--${def.tier}`;
      badge.textContent = tierBadge;
      titleRow.appendChild(titleEl);
      titleRow.appendChild(badge);
    } else {
      titleRow.appendChild(titleEl);
    }

    const descEl = document.createElement('div');
    descEl.className = 'achievement-desc';
    descEl.textContent =
      def.tier === 'secret' && !def.unlocked ? i18n.t('achievementLocked') : i18n.t(`achievement.${def.id}.desc`);

    const progressWrap = document.createElement('div');
    progressWrap.className = 'achievement-progress-wrap';
    const progressBar = document.createElement('div');
    progressBar.className = 'achievement-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'achievement-progress-fill';
    const pct = def.unlocked ? 100 : Math.min(100, Math.round((def.progress / def.goal) * 100));
    progressFill.style.width = `${pct}%`;
    progressBar.appendChild(progressFill);
    const progressText = document.createElement('span');
    progressText.className = 'achievement-progress-text';
    progressText.textContent = def.unlocked
      ? i18n.t('achievementUnlocked')
      : i18n.t('achievementProgress', { progress: def.progress, goal: def.goal });
    progressWrap.appendChild(progressBar);
    progressWrap.appendChild(progressText);

    body.appendChild(titleRow);
    body.appendChild(descEl);
    body.appendChild(progressWrap);

    const pinBtn = document.createElement('button');
    pinBtn.type = 'button';
    pinBtn.className = 'achievement-pin';
    pinBtn.classList.toggle('achievement-pin--active', def.id === pinnedId);
    pinBtn.setAttribute('aria-label', i18n.t(def.id === pinnedId ? 'unpinAchievement' : 'pinAchievement'));
    pinBtn.setAttribute('aria-pressed', String(def.id === pinnedId));
    pinBtn.textContent = '📌';
    pinBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      togglePin(def.id);
    });

    item.appendChild(icon);
    item.appendChild(body);
    item.appendChild(pinBtn);
    return item;
  }

  async function refresh() {
    const el = ensureOverlay();
    el.querySelector('[data-role="title"]').textContent = i18n.t('achievements');
    listEl.innerHTML = '';
    pinnedId = await getPinnedId();
    const all = await getAchievements();
    // Закреплённое — всегда первым (это и есть его смысл), затем
    // разблокированные, дальше по прогрессу (кто ближе к цели — выше),
    // секретные нераскрытые — в самом конце.
    const sorted = [...all].sort((a, b) => {
      if (a.id === pinnedId || b.id === pinnedId) return a.id === pinnedId ? -1 : 1;
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (!a.unlocked && !b.unlocked) {
        const aSecret = a.tier === 'secret';
        const bSecret = b.tier === 'secret';
        if (aSecret !== bSecret) return aSecret ? 1 : -1;
        return b.progress / b.goal - a.progress / a.goal;
      }
      return (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0);
    });
    for (const def of sorted) listEl.appendChild(renderItem(def));
  }

  async function show() {
    await refresh();
    overlay.hidden = false;
  }

  function hide() {
    if (overlay) overlay.hidden = true;
  }

  return { show, hide };
}

const TOAST_LIFETIME_MS = 4200;

/**
 * Показывает всплывающую карточку о новом достижении (R05.7) — растёт и
 * появляется, держится, затем уезжает и исчезает; можно закрыть вручную.
 * Если уведомлений несколько подряд — складываются в очередь и показываются
 * один за другим, а не поверх друг друга.
 * @param {{ container: HTMLElement, i18n: object, def: import('../game/achievements.js').AchievementDef }} opts
 */
const toastQueue = [];
let toastShowing = false;

export function showAchievementUnlock({ container, i18n, def }) {
  toastQueue.push({ container, i18n, def });
  if (!toastShowing) processToastQueue();
}

function processToastQueue() {
  const next = toastQueue.shift();
  if (!next) {
    toastShowing = false;
    return;
  }
  toastShowing = true;
  renderToast(next, () => processToastQueue());
}

function renderToast({ container, i18n, def }, onDone) {
  const toast = document.createElement('div');
  toast.className = 'achievement-toast';

  const icon = document.createElement('div');
  icon.className = 'achievement-toast-icon';
  icon.textContent = def.icon;

  const body = document.createElement('div');
  body.className = 'achievement-toast-body';

  const kicker = document.createElement('div');
  kicker.className = 'achievement-toast-kicker';
  kicker.textContent = i18n.t('newAchievement');

  const title = document.createElement('div');
  title.className = 'achievement-toast-title';
  title.textContent = i18n.t(`achievement.${def.id}.title`);

  const desc = document.createElement('div');
  desc.className = 'achievement-toast-desc';
  desc.textContent = i18n.t(`achievement.${def.id}.desc`);

  body.appendChild(kicker);
  body.appendChild(title);
  body.appendChild(desc);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'achievement-toast-close';
  closeBtn.setAttribute('aria-label', i18n.t('close'));
  closeBtn.textContent = '✕';

  toast.appendChild(icon);
  toast.appendChild(body);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  let dismissed = false;
  let timer = null;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (timer) clearTimeout(timer);
    toast.classList.add('achievement-toast--leaving');
    toast.addEventListener(
      'animationend',
      () => {
        toast.remove();
        onDone();
      },
      { once: true }
    );
  }

  closeBtn.addEventListener('click', dismiss);
  timer = setTimeout(dismiss, TOAST_LIFETIME_MS);

  // форсируем reflow перед добавлением класса появления — иначе анимация
  // может не запуститься (браузер схлопнёт добавление класса с начальным рендером)
  void toast.offsetWidth;
  toast.classList.add('achievement-toast--visible');
}
