// Lecteur Cinéma : commandes en surimpression qui s'effacent, clic sur l'image = lecture/pause,
// double-clic = plein écran, raccourcis clavier. Réutilise les boutons créés par cinema.js (mêmes id).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const ICON = {
    play: svg('<path class="fill" d="M8 5.6v12.8c0 .8.9 1.3 1.6.8l10-6.4c.6-.4.6-1.2 0-1.6l-10-6.4C8.9 4.3 8 4.8 8 5.6z"/>'),
    pause: svg('<rect class="fill" x="6.5" y="5" width="4" height="14" rx="1.2"/><rect class="fill" x="13.5" y="5" width="4" height="14" rx="1.2"/>'),
    back: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v3.5H8"/><text x="12" y="15.2" text-anchor="middle">10</text>'),
    forward: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v3.5H16"/><text x="12" y="15.2" text-anchor="middle">10</text>'),
    volume: svg('<path class="fill" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
    muted: svg('<path class="fill" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
    settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    enter: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    exit: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>')
  };
  let ready = false, idleTimer = 0, clickTimer = 0;

  function sync() {
    const video = $('cinemaVideo'), play = $('cinemaPlayPause'), mute = $('cinemaMute'), stage = document.querySelector('.cp-stage');
    if (!video || !play || !stage) return;
    const paused = video.paused, silent = video.muted || video.volume === 0;
    if (play.dataset.icon !== String(paused) || !play.querySelector('svg')) { play.innerHTML = paused ? ICON.play : ICON.pause; play.dataset.icon = String(paused); }
    play.setAttribute('aria-label', paused ? 'Lecture' : 'Pause'); play.title = paused ? 'Lecture (Espace)' : 'Pause (Espace)';
    if (mute.dataset.icon !== String(silent) || !mute.querySelector('svg')) { mute.innerHTML = silent ? ICON.muted : ICON.volume; mute.dataset.icon = String(silent); }
    mute.setAttribute('aria-label', silent ? 'Réactiver le son' : 'Couper le son'); mute.title = (silent ? 'Réactiver le son' : 'Couper le son') + ' (M)';
    const seek = $('cinemaNasSeek'), max = Number(seek.max) || 1;
    seek.style.setProperty('--p', Math.max(0, Math.min(100, (Number(seek.value) || 0) / max * 100)) + '%');
    const volume = $('cinemaVolume'); volume.style.setProperty('--p', (video.muted ? 0 : video.volume * 100) + '%');
    stage.classList.toggle('cp-paused', paused);
    const full = document.fullscreenElement === $('cinemaPlayerSurface'), fs = $('cinemaFullscreen');
    if (fs.dataset.icon !== String(full)) { fs.innerHTML = full ? ICON.exit : ICON.enter; fs.dataset.icon = String(full); }
    fs.setAttribute('aria-label', full ? 'Quitter le plein écran' : 'Plein écran'); fs.title = (full ? 'Quitter le plein écran' : 'Plein écran') + ' (F)';
    if (paused) wake();
  }

  function flash(icon) {
    const box = document.querySelector('.cp-flash'); if (!box) return;
    box.innerHTML = icon; box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
  }

  function wake() {
    const stage = document.querySelector('.cp-stage'); if (!stage) return;
    stage.classList.remove('cp-idle'); clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const video = $('cinemaVideo');
      if (!video.paused && !stage.matches('.cp-settings-open') && !stage.querySelector('.cp-bar:hover')) stage.classList.add('cp-idle');
    }, 2600);
  }

  function togglePlay() { $('cinemaPlayPause').click(); flash($('cinemaVideo').paused ? ICON.play : ICON.pause); }

  function build() {
    const surface = $('cinemaPlayerSurface'), video = $('cinemaVideo'), seekRow = $('cinemaNasControls'), toolbar = document.querySelector('.cinema-playback-toolbar');
    const transport = document.querySelector('.cinema-transport'), settings = document.querySelector('.cinema-playback-settings');
    if (!surface || !video || !seekRow || !toolbar || !transport || !settings || !$('cinemaPlayPause')) return false;

    const stage = document.createElement('div'); stage.className = 'cp-stage cp-paused';
    video.before(stage); stage.append(video);
    const flashBox = document.createElement('div'); flashBox.className = 'cp-flash'; flashBox.setAttribute('aria-hidden', 'true');
    const title = document.createElement('div'); title.className = 'cp-title'; title.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div'); bar.className = 'cp-bar';
    const row = document.createElement('div'); row.className = 'cp-row';
    const right = document.createElement('div'); right.className = 'cp-right';
    stage.append(flashBox, title, bar);

    // Groupe de gauche : lecture, −10 s, +10 s, son, volume, temps.
    const volume = $('cinemaVolume'), volumeLabel = volume.closest('label');
    const volumeBox = document.createElement('div'); volumeBox.className = 'cp-volume';
    volumeBox.append($('cinemaMute'), volume); volumeLabel?.remove();
    $('cinemaRewind').innerHTML = ICON.back; $('cinemaRewind').title = 'Reculer de 10 s (←)';
    $('cinemaForward').innerHTML = ICON.forward; $('cinemaForward').title = 'Avancer de 10 s (→)';
    transport.classList.add('cp-left');
    transport.prepend($('cinemaPlayPause'), $('cinemaRewind'), $('cinemaForward'), volumeBox);
    transport.append($('cinemaNasTime'));

    // Groupe de droite : réglages (qualité, audio, vitesse, voix) et plein écran.
    const gear = document.createElement('button'); gear.type = 'button'; gear.id = 'cinemaSettingsToggle'; gear.innerHTML = ICON.settings;
    gear.setAttribute('aria-label', 'Réglages de lecture'); gear.setAttribute('aria-expanded', 'false'); gear.title = 'Qualité, audio, vitesse';
    const panel = document.createElement('div'); panel.className = 'cp-settings'; panel.hidden = true;
    const heading = document.createElement('strong'); heading.textContent = 'Réglages de lecture';
    panel.append(heading, settings, $('cinemaQualityNote'));
    right.append(gear, $('cinemaFullscreen'));
    row.append(transport, right);
    bar.append(seekRow, row);
    stage.append(panel);
    toolbar.remove();
    const fullscreenButton = $('cinemaFullscreen'); fullscreenButton.textContent = '';

    const closeSettings = () => { panel.hidden = true; gear.setAttribute('aria-expanded', 'false'); stage.classList.remove('cp-settings-open'); wake(); };
    gear.addEventListener('click', event => { event.stopPropagation(); const open = panel.hidden; panel.hidden = !open; gear.setAttribute('aria-expanded', String(open)); stage.classList.toggle('cp-settings-open', open); wake(); });
    panel.addEventListener('click', event => event.stopPropagation());
    document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && event.target !== gear) closeSettings(); });

    // Clic sur l'image : lecture / pause. Double-clic : plein écran.
    video.addEventListener('click', () => { clearTimeout(clickTimer); clickTimer = setTimeout(togglePlay, 200); });
    video.addEventListener('dblclick', () => { clearTimeout(clickTimer); fullscreenButton.click(); });
    flashBox.addEventListener('click', togglePlay);

    for (const type of ['mousemove', 'pointerdown', 'touchstart', 'focusin']) stage.addEventListener(type, wake, { passive: true });
    stage.addEventListener('mouseleave', () => { if (!video.paused && panel.hidden) { clearTimeout(idleTimer); stage.classList.add('cp-idle'); } });

    for (const type of ['play', 'pause', 'volumechange', 'timeupdate', 'loadedmetadata', 'emptied', 'durationchange']) video.addEventListener(type, sync);
    $('cinemaNasSeek').addEventListener('input', sync);
    document.addEventListener('fullscreenchange', () => { sync(); wake(); });
    // cinema.js réécrit le texte des boutons : on remet les icônes aussitôt.
    new MutationObserver(() => { if (!$('cinemaPlayPause').querySelector('svg') || !$('cinemaMute').querySelector('svg')) { $('cinemaPlayPause').dataset.icon = ''; $('cinemaMute').dataset.icon = ''; sync(); } })
      .observe(transport, { childList: true, subtree: true, characterData: true });
    new MutationObserver(() => { title.textContent = $('cinemaPlayerTitle').textContent; }).observe($('cinemaPlayerTitle'), { childList: true, characterData: true, subtree: true });

    // Raccourcis clavier quand le lecteur est ouvert.
    $('cinemaPlayerDialog').addEventListener('keydown', event => {
      const target = event.target, typing = target.matches('select, input:not([type=range]), textarea') || target.isContentEditable;
      if (typing || event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase(); let handled = true;
      if (key === ' ' || key === 'k') { if (target.matches('button') && key === ' ') return; togglePlay(); }
      else if (key === 'arrowleft' || key === 'j') { $('cinemaRewind').click(); flash(ICON.back); }
      else if (key === 'arrowright' || key === 'l') { $('cinemaForward').click(); flash(ICON.forward); }
      else if (key === 'f') fullscreenButton.click();
      else if (key === 'm') $('cinemaMute').click();
      else if (key === 'arrowup' || key === 'arrowdown') { const v = Math.max(0, Math.min(1, video.volume + (key === 'arrowup' ? 0.05 : -0.05))); video.volume = v; video.muted = false; volume.value = v; }
      else if (key === 'escape' && !panel.hidden) closeSettings();
      else handled = false;
      if (handled) { event.preventDefault(); wake(); }
    });
    $('cinemaPlayerDialog').addEventListener('close', () => { closeSettings(); stage.classList.remove('cp-idle'); });

    title.textContent = $('cinemaPlayerTitle').textContent;
    // Une classe propre évite le style « bouton principal » que le thème donne aux boutons sans classe.
    bar.querySelectorAll('button').forEach(button => button.classList.add('cp-btn'));
    sync();
    return true;
  }

  window.JMHCinemaUI = { sync };
  const timer = setInterval(() => { if (!ready && build()) { ready = true; clearInterval(timer); } }, 400);
})();
