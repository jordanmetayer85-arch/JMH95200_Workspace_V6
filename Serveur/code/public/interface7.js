// JMH 7.0 — icônes du lecteur et de la connexion, tuiles « Cet ordinateur », mode plein écran verrouillé (interface).
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ico = body => `<svg class="jmh-ico" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const I = {
    play: ico('<path class="f" d="M8.5 5.8v12.4c0 .8.9 1.3 1.6.8l9.6-6.2c.6-.4.6-1.2 0-1.6L10.1 5c-.7-.5-1.6 0-1.6.8z"/>'),
    pause: ico('<rect class="f" x="6.5" y="5" width="4" height="14" rx="1.3"/><rect class="f" x="13.5" y="5" width="4" height="14" rx="1.3"/>'),
    prev: ico('<path class="f" d="M17.5 6.4v11.2c0 .8-.9 1.2-1.5.7l-7.4-5.6a.9.9 0 0 1 0-1.4l7.4-5.6c.6-.5 1.5-.1 1.5.7z"/><rect class="f" x="5.5" y="5.5" width="2.6" height="13" rx="1.2"/>'),
    next: ico('<path class="f" d="M6.5 6.4v11.2c0 .8.9 1.2 1.5.7l7.4-5.6a.9.9 0 0 0 0-1.4L8 5.7c-.6-.5-1.5-.1-1.5.7z"/><rect class="f" x="15.9" y="5.5" width="2.6" height="13" rx="1.2"/>'),
    stop: ico('<rect class="f" x="6.5" y="6.5" width="11" height="11" rx="2.4"/>'),
    eq: ico('<path d="M5 20v-6M5 10V4M12 20v-9M12 7V4M19 20v-4M19 12V4"/><path d="M3 14h4M10 7h4M17 16h4"/>'),
    heart: ico('<path d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.8 6.4 4.8c2 0 3.3 1.1 4 2.3h3.2c.7-1.2 2-2.3 4-2.3 3.4 0 5.2 3.4 3.6 6.6C19 15.6 12 20 12 20z" transform="translate(0 0)"/>'),
    heartOn: ico('<path class="f" d="M12 20s-7-4.4-9.2-8.6C1.2 8.2 3 4.8 6.4 4.8c2 0 3.3 1.1 4 2.3h3.2c.7-1.2 2-2.3 4-2.3 3.4 0 5.2 3.4 3.6 6.6C19 15.6 12 20 12 20z"/>'),
    library: ico('<path d="M7 17V7l10 5z"/><path d="M4 4h16v16H4z" opacity=".0"/>'),
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9.5 12 15l5.5-5.5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    drive: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M5.5 13 8 5h8l2.5 8"/><circle cx="17" cy="16.5" r=".9" fill="currentColor"/></svg>'
  };
  // music.js réécrit le texte des boutons (▶, Ⅱ, ♡) : on remet l'icône dès qu'elle a disparu.
  const set = (btn, html) => { if (btn && (btn.dataset.jmhIcon !== html || !btn.querySelector('svg'))) { btn.innerHTML = html; btn.dataset.jmhIcon = html; } };

  /* ---------- Lecteur de musique et mini-lecteur ---------- */
  function player() {
    const audio = $('#musicAudio');
    set($('#musicPrevious'), I.prev); set($('#musicNext'), I.next); set($('#musicStop'), I.stop); set($('#musicEqualizerBtn'), I.eq);
    const play = $('#musicPlayPause'); if (play) set(play, audio && !audio.paused ? I.pause : I.play);
    const fav = $('#musicDockFavorite'); if (fav) set(fav, fav.getAttribute('aria-pressed') === 'true' ? I.heartOn : I.heart);
  }

  /* ---------- Connexion : flèche des comptes, œil du mot de passe, lignes de comptes ---------- */
  function login() {
    const arrow = $('#savedAccountToggle'); if (arrow && !arrow.querySelector('svg')) arrow.innerHTML = I.chevron;
    $$('#savedAccountList > button:not(.saved-account-option)').forEach(b => b.classList.add('saved-account-option'));
    const eye = $('#togglePassword'), pwd = $('#password');
    if (eye && pwd) { const shown = pwd.type === 'text', want = shown ? 'off' : 'on'; if (eye.dataset.jmhIcon !== want || !eye.querySelector('svg')) { eye.innerHTML = shown ? I.eyeOff : I.eye; eye.dataset.jmhIcon = want; eye.setAttribute('aria-pressed', String(shown)); eye.title = shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'; } }
  }

  /* ---------- Mes fichiers → Cet ordinateur : disques reconnaissables ---------- */
  function localFiles() {
    for (const row of $$('#localFilesList .local-file-row:not([data-jmh])')) {
      row.dataset.jmh = '1';
      const name = row.querySelector('span')?.textContent || '';
      if (/^[A-Z]:\\?$/i.test(name.trim()) || /^[A-Z]:\\$/i.test(row.dataset.path || '')) { row.classList.add('is-drive'); const icon = row.querySelector('svg'); if (icon) icon.outerHTML = I.drive; }
      row.title = name;
    }
  }

  let queued = false;
  const tick = () => { queued = false; player(); login(); localFiles(); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(tick); } }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed', 'type', 'class'] });
  document.addEventListener('play', tick, true); document.addEventListener('pause', tick, true);
  tick();

  /* ---------- Mode plein écran verrouillé ---------- */
  const bridge = window.jmhDesktop;
  if (!bridge?.kioskProtocol) return; // navigateur ou ancien client : rien à afficher
  let kiosk = { enabled: false };
  const refresh = async () => { try { const s = await bridge.kioskStatus(); if (s?.ok) kiosk = s; } catch {} renderPanel(); };

  // Fenêtre de saisie du code de sortie.
  const box = document.createElement('div'); box.className = 'jmh-kiosk-unlock'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Quitter le mode verrouillé');
  box.innerHTML = '<form><h2>Quitter le mode verrouillé</h2><p>Saisis ton code secret pour revenir en mode fenêtre.</p><input type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="Code secret"><div class="msg" role="status"></div><div class="row"><button type="button" class="cancel">Annuler</button><button type="submit" class="ok">Déverrouiller</button></div></form>';
  document.body.append(box);
  const input = box.querySelector('input'), msg = box.querySelector('.msg');
  const openUnlock = () => { if (!kiosk.enabled) return; box.hidden = false; msg.textContent = ''; input.value = ''; setTimeout(() => input.focus(), 30); };
  const closeUnlock = () => { box.hidden = true; input.value = ''; };
  box.querySelector('.cancel').onclick = closeUnlock;
  box.addEventListener('keydown', e => { if (e.key === 'Escape') closeUnlock(); });
  box.querySelector('form').onsubmit = async e => {
    e.preventDefault(); msg.textContent = '';
    const r = await bridge.kioskDisable(input.value).catch(() => ({ ok: false, error: 'Erreur inattendue.' }));
    input.value = '';
    if (r.ok) { kiosk = r; closeUnlock(); renderPanel(); window.toast?.('Mode fenêtre rétabli.'); } else msg.textContent = r.error || 'Code incorrect.';
  };
  bridge.onKioskUnlockRequest(openUnlock);
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === 'j') { e.preventDefault(); openUnlock(); } });

  // Paramètres → « Mode verrouillé » (administrateur, propre à ce PC).
  let panel = null;
  function renderPanel() {
    if (!panel) return;
    $('.jk-state', panel).textContent = kiosk.enabled ? 'Activé sur ce PC' : 'Désactivé';
    $('.jk-state', panel).classList.toggle('on', !!kiosk.enabled);
    // Premier code à créer, puis simple bouton de réactivation ; le changement de code reste toujours possible.
    $('.jk-enable', panel).hidden = !!kiosk.enabled || !!kiosk.hasPin;
    $('.jk-quick', panel).hidden = !!kiosk.enabled || !kiosk.hasPin;
    $('.jk-disable', panel).hidden = !kiosk.enabled;
    $('.jk-change', panel).hidden = !kiosk.hasPin;
  }
  function buildPanel() {
    const tabs = $('#settingsPage .preferences-tabs'), content = $('#settingsPage .preferences-content');
    const isAdmin = (() => { try { return typeof me !== 'undefined' && me?.role === 'admin'; } catch { return false; } })();
    if (!tabs || !content) return false;
    const existing = $('#jmhKioskTab'); if (existing) { existing.hidden = !isAdmin; return true; }
    if (!isAdmin) return false;
    const tab = document.createElement('button'); tab.type = 'button'; tab.id = 'jmhKioskTab'; tab.className = 'preference-tab'; tab.setAttribute('role', 'tab'); tab.dataset.preferenceTab = 'kiosk';
    tab.innerHTML = '<svg class="studio-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><rect x="9.5" y="8" width="5" height="4.5" rx="1"/><path d="M10.5 8V7a1.5 1.5 0 0 1 3 0v1"/></svg>Mode verrouillé';
    (($$('#settingsPage .preference-tab').find(t => t.textContent.trim() === 'Sécurité')) || tabs.lastElementChild).after(tab);
    panel = document.createElement('section'); panel.id = 'preference-kiosk'; panel.className = 'preference-panel studio-panel jmh-login-settings hidden';
    panel.innerHTML = '<h2>Mode plein écran verrouillé</h2><p class="muted-text">JMH occupe tout l’écran, reste au premier plan et ne peut être ni réduit ni fermé. Si une autre application passe devant, JMH reprend la main. Réglage propre à ce PC, conservé au redémarrage.</p>' +
      '<div class="jl-rows"><div class="jl-row"><div><strong>État</strong><small>Pour quitter : <b>Ctrl + Alt + Maj + J</b>, puis ton code secret.</small></div><span class="jk-state"></span></div></div>' +
      '<div class="jk-quick" hidden><h3>Activer</h3><div class="jl-rows"><div class="jl-row"><div><strong>Code secret enregistré</strong><small>Le même code servira pour quitter. Tu peux le changer plus bas.</small></div><button type="button" class="jmh-btn primary jk-activate">Activer le mode verrouillé</button></div></div><p class="jk-msg jk-msg-quick" role="status"></p></div>' +
      '<form class="jk-enable"><h3>Activer</h3><div class="jl-rows"><div class="jl-row"><div><strong>Code secret</strong><small>4 à 8 chiffres. 5 erreurs bloquent la saisie 5 minutes.</small></div><input class="jk-pin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" aria-label="Code secret"></div>' +
      '<div class="jl-row"><div><strong>Confirmer le code</strong><small>Retape le même code.</small></div><input class="jk-pin2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" aria-label="Confirmer le code"></div></div>' +
      '<p class="muted-text jk-note">Ctrl+Alt+Suppr et Windows+L restent toujours disponibles : c’est une protection de Windows.</p><div class="jl-actions"><button type="submit" class="jmh-btn primary">Activer le mode verrouillé</button></div><p class="jk-msg" role="status"></p></form>' +
      '<div class="jk-disable" hidden><div class="jl-actions"><button type="button" class="jmh-btn jk-exit">Quitter le mode verrouillé…</button></div></div>' +
      '<form class="jk-change" hidden><h3>Changer le code secret</h3><p class="muted-text">Réservé à l’administrateur : utile si le code est perdu ou oublié. L’ancien code n’est pas demandé.</p><div class="jl-rows"><div class="jl-row"><div><strong>Nouveau code</strong><small>4 à 8 chiffres.</small></div><input class="jk-new" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" aria-label="Nouveau code"></div>' +
      '<div class="jl-row"><div><strong>Confirmer le nouveau code</strong><small>Retape le même code.</small></div><input class="jk-new2" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" aria-label="Confirmer le nouveau code"></div></div>' +
      '<div class="jl-actions"><button type="submit" class="jmh-btn">Enregistrer le nouveau code</button></div><p class="jk-msg jk-msg-change" role="status"></p></form>';
    content.append(panel);
    const form = $('.jk-enable', panel), msgEl = $('.jk-msg', panel);
    form.onsubmit = async e => {
      e.preventDefault(); msgEl.textContent = '';
      const a = $('.jk-pin', panel).value, b = $('.jk-pin2', panel).value;
      if (!/^\d{4,8}$/.test(a)) { msgEl.textContent = 'Le code doit contenir 4 à 8 chiffres.'; return; }
      if (a !== b) { msgEl.textContent = 'Les deux codes ne correspondent pas.'; return; }
      if (!confirm('Activer le mode plein écran verrouillé sur ce PC ?\n\nPour en sortir : Ctrl + Alt + Maj + J, puis ton code.')) return;
      const r = await bridge.kioskEnable(a).catch(() => ({ ok: false, error: 'Erreur inattendue.' }));
      $('.jk-pin', panel).value = ''; $('.jk-pin2', panel).value = '';
      if (r.ok) { kiosk = r; renderPanel(); } else msgEl.textContent = r.error || 'Activation impossible.';
    };
    $('.jk-exit', panel).onclick = openUnlock;
    $('.jk-activate', panel).onclick = async () => {
      const m = $('.jk-msg-quick', panel); m.textContent = '';
      if (!confirm('Activer le mode plein écran verrouillé sur ce PC ?\n\nPour en sortir : Ctrl + Alt + Maj + J, puis ton code habituel.')) return;
      const r = await bridge.kioskEnable('').catch(() => ({ ok: false, error: 'Erreur inattendue.' }));
      if (r.ok) { kiosk = r; renderPanel(); } else m.textContent = r.error || 'Activation impossible.';
    };
    $('.jk-change', panel).onsubmit = async e => {
      e.preventDefault(); const m = $('.jk-msg-change', panel); m.textContent = ''; m.classList.remove('ok');
      const a = $('.jk-new', panel).value, b = $('.jk-new2', panel).value;
      if (!/^\d{4,8}$/.test(a)) { m.textContent = 'Le code doit contenir 4 à 8 chiffres.'; return; }
      if (a !== b) { m.textContent = 'Les deux codes ne correspondent pas.'; return; }
      if (!bridge.kioskChangePin) { m.textContent = 'Installe la dernière mise à jour de JMH pour changer le code.'; return; }
      const r = await bridge.kioskChangePin(a).catch(() => ({ ok: false, error: 'Erreur inattendue.' }));
      $('.jk-new', panel).value = ''; $('.jk-new2', panel).value = '';
      if (r.ok) { kiosk = r; renderPanel(); m.textContent = 'Nouveau code enregistré.'; m.classList.add('ok'); } else m.textContent = r.error || 'Changement impossible.';
    };
    tab.onclick = () => {
      for (const t of $$('#settingsPage .preference-tab')) { const on = t === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); }
      $$('#settingsPage .preference-panel').forEach(p => p.classList.toggle('hidden', p !== panel));
      $('#settingsPage .preferences-content form')?.classList.add('hidden');
      void refresh();
    };
    return true;
  }
  void refresh();
  setInterval(buildPanel, 1500); buildPanel();
})();
