// JMH 7.1 — égaliseur en bulle : ancré au bouton EQ, curseurs verticaux, réglages prédéfinis.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const PRESETS = [['Neutre', [0, 0, 0]], ['Basses +', [6, 0, -1]], ['Voix', [-2, 4, 2]], ['Aigus +', [-1, 0, 6]], ['Soirée', [5, -1, 4]]];
  let anchor = null, frame = 0;

  // Mémorise le bouton qui ouvre l'égaliseur, pour placer la bulle à côté.
  document.addEventListener('click', e => {
    const b = e.target.closest('#musicEqualizerBtn, #musicToolbarEqualizerBtn');
    if (!b) return;
    anchor = b;
    // Si music.js a recréé la bulle, on l'adopte au clic ; puis on la replace contre le bouton cliqué.
    setTimeout(() => { adopt($('#musicEqualizerDialog')); opened(); }, 0);
  }, true);

  const ranges = panel => $$('.music-eq-band input[type=range]', panel);
  function markPreset(panel) {
    const values = ranges(panel).map(r => Number(r.value));
    $$('.eq71-presets button', panel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.values === values.join(','))));
    ranges(panel).forEach(r => r.style.setProperty('--p', ((Number(r.value) + 12) / 24 * 100) + '%'));
  }
  function applyPreset(panel, values) {
    const on = $('#musicEqEnabled', panel);
    if (on && !on.checked) { on.checked = true; on.dispatchEvent(new Event('change', { bubbles: true })); }
    ranges(panel).forEach((r, i) => { r.value = values[i]; r.dispatchEvent(new Event('input', { bubbles: true })); });
    markPreset(panel);
  }

  function dress(panel) {
    if (panel.dataset.eq71) return;
    panel.dataset.eq71 = '1'; panel.classList.add('eq71');
    const close = $('#musicEqClose', panel);
    if (close) { close.textContent = ''; close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'; close.setAttribute('aria-label', 'Fermer l’égaliseur'); }
    const bands = $('.music-eq-bands', panel);
    if (bands) {
      const row = document.createElement('div'); row.className = 'eq71-presets'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Réglages prédéfinis');
      for (const [name, values] of PRESETS) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.values = values.join(',');
        b.onclick = () => applyPreset(panel, values); row.append(b);
      }
      bands.before(row);
    }
    ranges(panel).forEach(r => r.addEventListener('input', () => markPreset(panel)));
    const tip = document.createElement('i'); tip.className = 'eq71-tip'; tip.setAttribute('aria-hidden', 'true'); panel.append(tip);
    markPreset(panel);
  }

  // Place la bulle au-dessus (ou au-dessous) du bouton EQ visible ; sinon au centre de l'écran.
  function place(panel) {
    const visible = b => b && b.offsetParent !== null && b.getBoundingClientRect().width > 0;
    const target = [anchor, $('#musicEqualizerBtn'), $('#musicToolbarEqualizerBtn')].find(visible);
    const w = panel.offsetWidth, h = panel.offsetHeight, gap = 14, m = 12;
    let left, top, below = false, tipX = w / 2;
    if (target) {
      const r = target.getBoundingClientRect(), cx = r.left + r.width / 2;
      left = Math.min(Math.max(cx - w / 2, m), innerWidth - w - m);
      top = r.top - h - gap;
      if (top < m) { top = r.bottom + gap; below = true; }
      tipX = Math.min(Math.max(cx - left, 24), w - 24);
    } else { left = (innerWidth - w) / 2; top = Math.max(m, (innerHeight - h) / 2); }
    panel.style.setProperty('left', Math.round(left) + 'px', 'important');
    panel.style.setProperty('top', Math.round(top) + 'px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
    panel.style.setProperty('--eq71-tip', Math.round(tipX) + 'px');
    panel.classList.toggle('eq71-below', below); panel.classList.toggle('eq71-free', !target);
  }
  // Audit N3 : la bulle n'est recalculée que lorsque quelque chose bouge (ouverture, défilement, fenêtre ou mini-lecteur
  // redimensionnés, lecteur compact), au plus une fois par image — plus de boucle continue tant qu'elle est ouverte.
  let watched = null;
  const isOpen = () => watched && !watched.hidden;
  function schedule() { if (!isOpen() || frame) return; frame = requestAnimationFrame(() => { frame = 0; if (isOpen()) place(watched); }); }
  const resized = new ResizeObserver(schedule);
  const dockChanged = new MutationObserver(schedule);
  function opened() {
    if (!isOpen()) return;
    markPreset(watched); place(watched); schedule();
    resized.disconnect(); resized.observe(watched);
    for (const el of [$('#musicPlayerDock'), $('#musicEqualizerBtn'), $('#musicToolbarEqualizerBtn')]) if (el) resized.observe(el);
    const dock = $('#musicPlayerDock'); dockChanged.disconnect(); if (dock) dockChanged.observe(dock, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  }
  addEventListener('scroll', schedule, { capture: true, passive: true });
  addEventListener('resize', schedule, { passive: true });
  function adopt(panel) {
    if (!panel || panel === watched || panel.tagName === 'DIALOG') return !!watched;
    watched = panel; dress(panel);
    new MutationObserver(() => { if (isOpen()) opened(); else { resized.disconnect(); dockChanged.disconnect(); } }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
    opened();
    return true;
  }
  // La bulle est créée par music.js : on attend son apparition, puis on n'observe plus qu'elle.
  if (!adopt($('#musicEqualizerDialog'))) {
    const wait = new MutationObserver(() => { if (adopt($('#musicEqualizerDialog'))) wait.disconnect(); });
    wait.observe(document.body, { childList: true, subtree: true });
  }
})();
