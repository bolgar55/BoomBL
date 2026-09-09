// ui/leaderboard.js
// Экран глобального лидерборда (топ-20, всё время) — полноэкранный оверлей,
// та же структура/стили, что и у ui/achievements.js (.achievements-overlay/
// -panel/-header/-close, только список — свой, .leaderboard-*). Модуль сам
// строит DOM в container при первом show(), как и остальные оверлеи.
// Не хранит счёт/состояние партии — только запрашивает список через
// fetchLeaderboard (app.js передаёт функцию похода на api/leaderboard.js) и
// рисует то, что пришло; ошибку сети показывает как обычный текст в списке,
// не роняя экран (spec §Решения 9, R46i).

/**
 * Создаёт контроллер экрана лидерборда.
 * @param {{
 *   container: HTMLElement,
 *   i18n: { t: (key:string, params?:object) => string },
 *   fetchLeaderboard: () => Promise<{ entries: {userId:string, name:string, score:number}[] } | null>,
 *   getMyUserId?: () => string | null,
 * }} deps
 * @returns {{ show(): Promise<void>, hide(): void }}
 */
export function createLeaderboardScreen({ container, i18n, fetchLeaderboard, getMyUserId }) {
  let overlay = null;
  let listEl = null;

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
    closeBtn.setAttribute('aria-label', i18n.t('close'));
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', hide);

    header.appendChild(title);
    header.appendChild(closeBtn);

    listEl = document.createElement('div');
    listEl.className = 'achievements-list leaderboard-list';

    panel.appendChild(header);
    panel.appendChild(listEl);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) hide();
    });
    container.appendChild(overlay);

    return overlay;
  }

  const RANK_MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

  function renderRow(entry, rank, isMe) {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    if (isMe) row.classList.add('leaderboard-row--me');

    const rankEl = document.createElement('div');
    rankEl.className = 'leaderboard-rank';
    rankEl.textContent = RANK_MEDALS[rank] ?? `#${rank}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'leaderboard-name';
    nameEl.textContent = entry.name;

    const scoreEl = document.createElement('div');
    scoreEl.className = 'leaderboard-score';
    scoreEl.textContent = String(entry.score);

    row.appendChild(rankEl);
    row.appendChild(nameEl);
    row.appendChild(scoreEl);
    return row;
  }

  async function refresh() {
    const el = ensureOverlay();
    el.querySelector('[data-role="title"]').textContent = i18n.t('leaderboard');
    listEl.innerHTML = '';

    const loading = document.createElement('div');
    loading.className = 'leaderboard-status';
    loading.textContent = i18n.t('leaderboardLoading');
    listEl.appendChild(loading);

    const data = await fetchLeaderboard();
    listEl.innerHTML = '';

    if (!data || !Array.isArray(data.entries)) {
      const errorEl = document.createElement('div');
      errorEl.className = 'leaderboard-status';
      errorEl.textContent = i18n.t('leaderboardError');
      listEl.appendChild(errorEl);
      return;
    }

    if (data.entries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'leaderboard-status';
      emptyEl.textContent = i18n.t('leaderboardEmpty');
      listEl.appendChild(emptyEl);
      return;
    }

    const myUserId = getMyUserId?.() ?? null;
    data.entries.forEach((entry, i) => {
      listEl.appendChild(renderRow(entry, i + 1, myUserId != null && entry.userId === myUserId));
    });
  }

  async function show() {
    const el = ensureOverlay();
    el.hidden = false;
    await refresh();
  }

  function hide() {
    if (overlay) overlay.hidden = true;
  }

  return { show, hide };
}
