// JMH — mini-lecteur rétractable sur le côté droit, et « Ma couleur » accessible.
(() => {
  'use strict';
  const KEY = 'jmh.miniPlayer.hidden', body = document.body;
  const store = { get: () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }, set: v => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {} } };
  const chevron = dir => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir === 'right' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'}"/></svg>`;

  function setHidden(hidden) {
    body.classList.toggle('jmh-mini-hidden', hidden); store.set(hidden);
    const tab = document.getElementById('jmhMiniTab'); if (tab) tab.setAttribute('aria-hidden', String(!hidden));
  }

  function mount() {
    const dock = document.getElementById('musicPlayerDock'), audio = document.getElementById('musicAudio');
    if (!dock || !audio || document.getElementById('jmhMiniHide')) return !!document.getElementById('jmhMiniHide');
    const hide = document.createElement('button'); hide.type = 'button'; hide.id = 'jmhMiniHide'; hide.className = 'jmh-mini-hide';
    hide.title = 'Ranger le lecteur sur le côté'; hide.setAttribute('aria-label', 'Ranger le mini-lecteur sur le côté droit'); hide.innerHTML = chevron('right');
    hide.addEventListener('click', event => { event.stopPropagation(); setHidden(true); });
    dock.append(hide);
    const tab = document.createElement('button'); tab.type = 'button'; tab.id = 'jmhMiniTab'; tab.className = 'jmh-mini-tab';
    tab.title = 'Afficher le lecteur'; tab.setAttribute('aria-label', 'Afficher le mini-lecteur'); tab.setAttribute('aria-hidden', 'true');
    tab.innerHTML = chevron('left') + '<span class="jmh-mini-bars" aria-hidden="true"><i></i><i></i><i></i></span>';
    tab.addEventListener('click', () => setHidden(false));
    body.append(tab);
    // L'onglet n'apparaît que lorsque le mini-lecteur existe (titre chargé, hors page Musiques).
    const sync = () => {
      const compact = dock.classList.contains('music-dock-compact') && !dock.classList.contains('hidden');
      body.classList.toggle('jmh-mini-available', compact);
      body.classList.toggle('jmh-mini-playing', !audio.paused);
    };
    new MutationObserver(sync).observe(dock, { attributes: true, attributeFilter: ['class'] });
    for (const type of ['play', 'pause', 'ended', 'emptied']) audio.addEventListener(type, sync);
    setHidden(store.get()); sync();
    return true;
  }

  // « Ma couleur » : pastille ronde avec un nom accessible et l'état sélectionné.
  function customColor() {
    for (const label of document.querySelectorAll('.r-accents label.r-custom')) {
      if (label.dataset.jmhReady) continue; label.dataset.jmhReady = '1';
      const input = label.querySelector('input[type=color]'); if (!input) continue;
      label.title = 'Ma couleur — choisir une couleur personnalisée'; input.setAttribute('aria-label', 'Ma couleur personnalisée');
      const dots = [...label.parentElement.querySelectorAll('.r-dot')];
      const active = !dots.some(d => d.getAttribute('aria-pressed') === 'true') && !label.parentElement.querySelector('.r-chip.r-primary');
      label.classList.toggle('is-active', active);
    }
  }

  // Barre de navigation : boutons ← → ↑ ⌂ regroupés dans une pilule, avec de vraies icônes.
  const NAV_ICONS = {
    'Précédent': '<path d="M15 5l-7 7 7 7"/>',
    'Suivant': '<path d="M9 5l7 7-7 7"/>',
    'Dossier parent': '<path d="M12 19V6M6 11.5 12 5.5l6 6"/>',
    'Accueil JMH': '<path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.5 9.5V19h4v-5h3v5h4V9.5"/>'
  };
  function navigation() {
    const bar = document.querySelector('nav.jmh-navigation');
    if (!bar || bar.querySelector('.jmh-nav-group')) return !!bar;
    const buttons = [...bar.querySelectorAll(':scope > .jmh-navigation-button')]; if (!buttons.length) return false;
    const group = document.createElement('div'); group.className = 'jmh-nav-group'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Se déplacer');
    for (const b of buttons) {
      const key = Object.keys(NAV_ICONS).find(k => (b.getAttribute('aria-label') || '').startsWith(k));
      if (key) b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + NAV_ICONS[key] + '</svg>';
      if (key === 'Accueil JMH') { const sep = document.createElement('span'); sep.className = 'jmh-nav-sep'; sep.setAttribute('aria-hidden', 'true'); group.append(sep); }
      group.append(b);
    }
    bar.prepend(group);
    return true;
  }

  let tries = 0, navTries = 0;
  const timer = setInterval(() => { if (mount() || ++tries > 60) clearInterval(timer); }, 500);
  const navTimer = setInterval(() => { if (navigation() || ++navTries > 120) clearInterval(navTimer); }, 250);
  new MutationObserver(customColor).observe(document.body, { childList: true, subtree: true });
  customColor();
})();
