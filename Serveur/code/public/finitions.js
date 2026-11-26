// JMH 6.9.0 — finitions : page de connexion personnalisable, onglet « Écran de connexion »,
// habillage de Musiques et de Mes fichiers (classes communes définies dans finitions.css).
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICON = {
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    folder: svg('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/>'),
    upload: svg('<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5"/><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"/>'),
    reset: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5V8H8"/>'),
    login: svg('<rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>')
  };

  /* ---------- Habillage (idempotent : rejoué quand les pages se reconstruisent) ---------- */
  function dress() {
    $$('#musicPage .music-tabs, .file-space-tabs').forEach(n => n.classList.add('jmh-pills'));
    // Boutons sans classe : le thème les peindrait tous comme des boutons principaux (tous « actifs »).
    $$('.jmh-pills > button:not([class]), #storageBreadcrumb > button:not([class])').forEach(b => b.classList.add('jmh-pill'));
    const ms = $('#musicPage .music-search');
    if (ms && !ms.classList.contains('jmh-field')) { ms.classList.add('jmh-field'); ms.insertAdjacentHTML('afterbegin', ICON.search); }
    $$('#musicPage .music-filters select').forEach(s => s.classList.add('jmh-select'));
    const input = $('#storageSearchInput');
    if (input && !input.closest('.jmh-field')) {
      const field = document.createElement('label'); field.className = 'jmh-field'; field.innerHTML = ICON.search;
      input.before(field); field.append(input); input.placeholder = 'Rechercher un fichier ou un dossier…';
    }
    const folder = $('#createFolderBtn');
    if (folder && !folder.dataset.jmh) { folder.dataset.jmh = '1'; folder.classList.add('jmh-btn'); folder.innerHTML = ICON.folder + '<span>Nouveau dossier</span>'; }
    const upload = $('#storagePage .upload-button');
    if (upload && !upload.dataset.jmh) {
      upload.dataset.jmh = '1'; upload.classList.add('jmh-btn', 'primary');
      for (const n of [...upload.childNodes]) if (n.nodeType === 3) n.remove();
      upload.insertAdjacentHTML('afterbegin', ICON.upload + '<span>Ajouter des fichiers</span>');
    }
    const sBtn = $('#storageSearchBtn'); if (sBtn && !sBtn.dataset.jmh) { sBtn.dataset.jmh = '1'; sBtn.classList.add('jmh-btn', 'primary'); }
    const rBtn = $('#storageResetSearchBtn'); if (rBtn && !rBtn.dataset.jmh) { rBtn.dataset.jmh = '1'; rBtn.classList.add('jmh-btn'); rBtn.innerHTML = ICON.reset + '<span>Réinitialiser</span>'; }
  }
  let pending = false;
  new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; dress(); }); } }).observe(document.body, { childList: true, subtree: true });
  dress();

  /* ---------- Écran de connexion : fond, flou, assombrissement, carte, horloge ---------- */
  const KEY = 'jmh.login.v1', PHOTO = 'jmh.login.photo';
  const DEFAULTS = { wall: 'app', blur: 0, dim: 20, card: 58, clock: true };
  const read = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } };
  const photo = () => { try { const v = localStorage.getItem(PHOTO); return v && /^data:image\/(jpeg|png|webp);base64,/.test(v) ? v : null; } catch { return null; } };
  let login = read();
  const walls = () => window.JMHRefonte?.wallpapers || {};
  function wallCss(id) {
    if (id === 'photo') { const p = photo(); return p ? `url("${p}") center/cover no-repeat` : walls().univers?.css; }
    if (id === 'app') return $('#refonteWallpaper .r-wall-image')?.style.background || walls().univers?.css;
    const w = walls()[id]; return w && !w.special && w.css !== 'none' ? w.css : (w?.css === 'none' ? 'var(--r-bg)' : walls().univers?.css);
  }
  function save(patch) { login = { ...login, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(login)); } catch {} applyLogin(); renderPanel(); }

  // 7.1.1 : mémorise le fond réellement affiché pour que fond-precoce.js le pose dès le chargement suivant.
  function rememberEarly(css) {
    try {
      const photoKey = /data:image/.test(css) ? (login.wall === 'photo' ? PHOTO : 'jmh.studio.wallpaper') : null;
      const color = getComputedStyle(document.body).backgroundColor;
      localStorage.setItem('jmh.fond.cache', JSON.stringify({ bg: photoKey ? 'photo' : css, photo: photoKey, dim: Math.max(0, Math.min(80, +login.dim || 0)) / 100, color }));
    } catch {}
  }
  function applyLogin() {
    const view = $('#loginView'); if (!view) return;
    let bg = $('.jmh-login-bg', view), dim = $('.jmh-login-dim', view);
    if (!bg) { bg = document.createElement('div'); bg.className = 'jmh-login-bg'; dim = document.createElement('div'); dim.className = 'jmh-login-dim'; view.prepend(bg, dim); }
    bg.style.background = wallCss(login.wall) || '#0b0d18';
    rememberEarly(bg.style.background);
    view.style.setProperty('--jmh-login-blur', Math.max(0, Math.min(30, +login.blur || 0)) + 'px');
    view.style.setProperty('--jmh-login-dim', String(Math.max(0, Math.min(80, +login.dim || 0)) / 100));
    view.style.setProperty('--jmh-login-card', String(Math.max(20, Math.min(100, +login.card || 58)) / 100));
    document.body.dataset.jmhLoginClock = login.clock ? 'on' : 'off';
    if (!$('.jmh-login-clock', view)) { const c = document.createElement('div'); c.className = 'jmh-login-clock'; c.setAttribute('aria-hidden', 'true'); c.innerHTML = '<strong></strong><span></span>'; view.append(c); }
    tick();
  }
  function tick() {
    const c = $('#loginView .jmh-login-clock'); if (!c) return; const d = new Date();
    c.querySelector('strong').textContent = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    c.querySelector('span').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  setInterval(tick, 15000);

  // Photo personnelle : réduite (1920 px max, JPEG) pour rester légère dans le stockage local.
  function usePhoto(file) {
    if (!file || !/^image\//.test(file.type)) return;
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1920 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try { localStorage.setItem(PHOTO, c.toDataURL('image/jpeg', .85)); save({ wall: 'photo' }); }
      catch { window.toast?.('Cette photo est trop lourde pour être enregistrée sur cet appareil.'); }
    };
    img.src = url;
  }

  /* ---------- Paramètres → onglet « Écran de connexion » ---------- */
  let panel = null;
  function renderPanel() {
    if (!panel) return;
    const pv = $('.jl-preview', panel);
    $('.jl-preview-bg', pv).style.background = wallCss(login.wall) || '#0b0d18';
    $('.jl-preview-bg', pv).style.filter = `blur(${(+login.blur || 0) / 2}px)`;
    $('.jl-preview-dim', pv).style.background = `rgba(0,0,0,${(+login.dim || 0) / 100})`;
    pv.style.setProperty('--jl-card', String((+login.card || 58) / 100));
    $('.jl-preview-clock', pv).hidden = !login.clock;
    $('.jl-preview-clock', pv).textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $$('.jl-grid button', panel).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wall === login.wall)));
    const appSwatch = $('.jl-grid button[data-wall=app] b', panel); if (appSwatch) appSwatch.style.background = wallCss('app');
    const photoSwatch = $('.jl-grid button[data-wall=photo] b', panel); if (photoSwatch && photo()) { photoSwatch.textContent = ''; photoSwatch.style.background = wallCss('photo'); }
    $('#jlBlur', panel).value = login.blur; $('#jlDim', panel).value = login.dim; $('#jlCard', panel).value = login.card; $('#jlClock', panel).checked = !!login.clock;
  }
  function buildPanel() {
    const tabs = $('#settingsPage .preferences-tabs'), content = $('#settingsPage .preferences-content'), appearanceTab = $$('#settingsPage .preference-tab').find(t => t.textContent.trim() === 'Apparence');
    if (!tabs || !content || !appearanceTab || !window.JMHRefonte) return false;
    if ($('#jmhLoginTab')) return true;
    const tab = document.createElement('button'); tab.type = 'button'; tab.id = 'jmhLoginTab'; tab.className = 'preference-tab'; tab.setAttribute('role', 'tab'); tab.dataset.preferenceTab = 'login-screen';
    tab.innerHTML = ICON.login.replace('<svg ', '<svg class="studio-icon" ') + 'Écran de connexion';
    appearanceTab.after(tab);
    panel = document.createElement('section'); panel.id = 'preference-login-screen'; panel.className = 'preference-panel studio-panel jmh-login-settings hidden';
    const choices = [['app', 'Comme l’application'], ...Object.entries(walls()).filter(([, w]) => !w.special).map(([id, w]) => [id, w.name]), ['photo', 'Ma photo']];
    panel.innerHTML = '<h2>Écran de connexion</h2><p class="muted-text">L’arrière-plan de la page de connexion, indépendant de l’apparence de l’application. Réglage propre à cet appareil.</p>' +
      '<div class="jl-preview"><div class="jl-preview-bg"></div><div class="jl-preview-dim"></div><div class="jl-preview-card"><i class="t"></i><i></i><i></i><i class="b"></i></div><span class="jl-preview-clock"></span></div>' +
      '<h3>Arrière-plan</h3><div class="jl-grid"></div><input type="file" accept="image/*" hidden id="jlPhoto">' +
      '<h3>Ambiance</h3><div class="jl-rows">' +
      '<div class="jl-row"><div><strong>Flou de l’arrière-plan</strong><small>Adoucit l’image derrière la carte.</small></div><input id="jlBlur" type="range" min="0" max="24"></div>' +
      '<div class="jl-row"><div><strong>Assombrir</strong><small>Plus de contraste pour lire la carte.</small></div><input id="jlDim" type="range" min="0" max="75"></div>' +
      '<div class="jl-row"><div><strong>Opacité de la carte</strong><small>Plus transparente, ou plus opaque.</small></div><input id="jlCard" type="range" min="25" max="100"></div>' +
      '<div class="jl-row"><div><strong>Afficher l’horloge</strong><small>Heure et date en bas à gauche.</small></div><input id="jlClock" type="checkbox"></div></div>' +
      '<div class="jl-actions"><button type="button" class="jmh-btn" id="jlReset">Réinitialiser</button></div>';
    const grid = $('.jl-grid', panel);
    for (const [id, name] of choices) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'jl-wall'; b.dataset.wall = id;
      const sw = document.createElement('b'); if (id === 'photo') { sw.className = 'jl-photo'; sw.textContent = photo() ? '' : '+ Choisir'; }
      const css = id === 'photo' && !photo() ? null : wallCss(id); if (css) sw.style.background = css;
      b.append(sw, document.createTextNode(name));
      b.onclick = () => id === 'photo' ? $('#jlPhoto', panel).click() : save({ wall: id });
      grid.append(b);
    }
    $('#jlPhoto', panel).onchange = e => usePhoto(e.target.files[0]);
    $('#jlBlur', panel).oninput = e => save({ blur: +e.target.value });
    $('#jlDim', panel).oninput = e => save({ dim: +e.target.value });
    $('#jlCard', panel).oninput = e => save({ card: +e.target.value });
    $('#jlClock', panel).onchange = e => save({ clock: e.target.checked });
    $('#jlReset', panel).onclick = () => { try { localStorage.removeItem(PHOTO); } catch {} login = { ...DEFAULTS }; save({}); };
    content.append(panel);
    tab.onclick = () => {
      for (const t of $$('#settingsPage .preference-tab')) { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); }
      $$('#settingsPage .preference-panel').forEach(p => p.classList.toggle('hidden', p !== panel));
      $('#settingsPage .preferences-content form')?.classList.add('hidden');
      renderPanel();
    };
    // Les autres onglets masquent ce panneau (ils masquent tous les .preference-panel) : rien d'autre à faire.
    return true;
  }

  applyLogin();
  // Le vrai fond est en place : le fond provisoire de fond-precoce.js n'est plus utile.
  requestAnimationFrame(() => document.documentElement.classList.remove('jmh-early'));
  // Un changement de fond pendant la session est mémorisé avant la déconnexion ou la fermeture.
  window.addEventListener('pagehide', () => applyLogin());
  let tries = 0; const t = setInterval(() => { if (buildPanel() || ++tries > 120) clearInterval(t); }, 500);
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === PHOTO) { login = read(); applyLogin(); renderPanel(); } });
  window.JMHLoginScreen = { get: () => ({ ...login }), set: save, apply: applyLogin };
})();
