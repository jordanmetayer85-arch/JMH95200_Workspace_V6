// JMH 7.2 — points d'interface de l'audit du 25/10/2026 (lisibilité, navigation, connexion, compte, VPN), sans changer le design.
// Chaque observateur est limité à la zone qu'il surveille (audit N2).
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const watch = (node, fn, options = { childList: true, subtree: true }) => { if (node) new MutationObserver(fn).observe(node, options); };

  // 9 — Paramètres atteignables depuis la barre du haut, sans faire défiler la barre latérale.
  const actions = $('.topbar-actions');
  if (actions && !$('#topSettingsBtn')) {
    const b = el('button', 'icon-button a72-top-settings'); b.id = 'topSettingsBtn'; b.type = 'button'; b.title = 'Paramètres'; b.setAttribute('aria-label', 'Ouvrir les paramètres');
    b.innerHTML = icon('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>');
    b.onclick = () => navigateWorkspace('settingsPage');
    $('#themeToggle')?.after(b) ?? actions.append(b);
  }

  // 4 — Connexion : « Effacer » et « Tout oublier » rangés dans un menu secondaire ; priorité au choix du compte et à Se connecter.
  function loginMenu() {
    const box = $('#localLoginControls .local-login-actions'); if (!box || $('#a72Forget')) return;
    const menu = el('details', 'a72-forget'); menu.id = 'a72Forget';
    const summary = el('summary', '', 'Gérer les identifiants enregistrés'); const list = el('div', 'a72-forget-list');
    menu.append(summary, list); box.after(menu);
    const move = () => { for (const id of ['clearSavedLogin', 'clearAllSavedLogins']) { const b = $('#' + id); if (b && b.parentElement !== list) list.append(b); } menu.hidden = ![...list.children].some(b => !b.classList.contains('hidden')); };
    move(); watch(box, move); watch(list, move, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }
  loginMenu(); watch($('#localLoginControls'), loginMenu, { childList: true });

  // 5 — Paramètres : dire clairement ce qui est immédiat et ce qui attend « Appliquer ».
  function preferencesNote() {
    const p = $('#preferencesFeedback');
    if (p && p.textContent.trim() === 'Les changements sont enregistrés immédiatement.') p.textContent = 'Les réglages s’enregistrent dès que tu les changes, sauf ceux qui montrent un aperçu : ils attendent « Appliquer » (ou « Annuler »).';
  }
  preferencesNote(); watch($('#settingsPage'), preferencesNote, { childList: true, subtree: true });

  // 10 — Mon compte : le profil d'abord, les informations de supervision juste après (toujours visibles).
  function accountOrder() {
    const notice = $('#accountPage #authorityUserNotice'), profile = $('#accountPage .profile-panel');
    if (notice && profile && notice.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING) profile.after(notice);
  }
  accountOrder(); watch($('#accountPage'), accountOrder, { childList: true });

  // 8 — Galeries : intitulé lisible pour les dossiers techniques ou anciennes vignettes (les originaux ne sont ni renommés ni déplacés).
  const TECH = [[/^@?eadir$/i, 'Vignettes du NAS'], [/^\.?thumb(s|nails)?$/i, 'Anciennes vignettes'], [/^\.?(cache|tmp|temp)$/i, 'Fichiers temporaires'], [/^dcim$/i, 'Appareil photo'], [/^\d{3}[a-z]{5}$/i, 'Appareil photo']];
  function prettyAlbum(name) {
    const base = String(name || '').split('/').filter(Boolean).pop() || '';
    for (const [re, label] of TECH) if (re.test(base)) return label + ' (' + base + ')';
    if (/[_]/.test(base) || /^[a-z0-9]+(-[a-z0-9]+){2,}$/i.test(base)) { const t = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
    return null;
  }
  function galleryNames(root = document) {
    for (const option of root.querySelectorAll('.gallery-filterbar select[data-album] option')) {
      if (!option.value || option.dataset.a72) continue; option.dataset.a72 = '1';
      const label = prettyAlbum(option.textContent.trim()); if (label) { option.title = option.textContent; option.textContent = label; }
    }
  }
  for (const id of ['photosPage', 'personalVideosPage']) { galleryNames($('#' + id) || document); watch($('#' + id), () => galleryNames($('#' + id))); }

  // VPN (audit VPN A, B, E, I et point 11) : états regroupés, portée exacte, persistance après fermeture, conflit de réglages.
  function vpnPanel() {
    const page = $('#vpnPage'), state = $('#vpnState'), badge = $('#vpnLocalBadge'), local = $('#vpnLocal');
    if (!page || !state || !badge || $('#a72VpnSummary')) return;
    const grid = el('div', 'a72-vpn-summary'); grid.id = 'a72VpnSummary'; grid.setAttribute('aria-label', 'États du VPN');
    const cell = (title, hint) => { const c = el('div', 'a72-vpn-cell'); c.append(el('span', 'a72-vpn-k', title), el('strong'), el('small', '', hint)); grid.append(c); return c; };
    const tunnel = cell('Tunnel du NAS', 'Partagé par tous les appareils'), pc = cell('Ce PC', 'Proxy appliqué à ce PC'), out = cell('Sortie vérifiée', 'Adresse réellement utilisée par JMH');
    state.before(grid);
    const sync = () => {
      const t = state.textContent.trim(), b = badge.textContent.trim(), l = local.textContent.trim();
      tunnel.dataset.state = /connecté/i.test(t) ? 'on' : /arrêté|ne répond/i.test(t) ? 'off' : 'wait'; tunnel.querySelector('strong').textContent = t || 'Vérification…';
      pc.dataset.state = badge.dataset.state || 'wait'; pc.querySelector('strong').textContent = b ? b.charAt(0) + b.slice(1).toLowerCase() : 'Vérification…';
      const verified = /vérifiée|IP utilisée par JMH/i.test(b + ' ' + l) && !/non vérifi|à vérifier/i.test(b + ' ' + l);
      out.dataset.state = verified ? (/ne correspondent pas/i.test(l) ? 'warn' : 'on') : 'wait';
      out.querySelector('strong').textContent = verified ? (l.match(/IP utilisée par JMH : [\d.]+/)?.[0].replace('IP utilisée par JMH : ', '') || 'Vérifiée') : 'Pas encore vérifiée';
    };
    for (const n of [state, badge, local]) watch(n, sync, { childList: true, characterData: true, subtree: true, attributes: true });
    sync();
    // Portée exacte (A), CANAL+ en direct (B), persistance après fermeture (E).
    const scope = el('details', 'a72-vpn-scope');
    scope.innerHTML = '<summary>Ce que couvre le VPN</summary><ul>'
      + '<li><b>Mode JMH</b> : seule la navigation de l’application JMH passe par le NAS.</li>'
      + '<li><b>Mode Windows</b> : les logiciels qui suivent le proxy de Windows (la plupart des navigateurs) passent par le NAS. Les jeux, les appels audio ou vidéo et les logiciels qui ont leur propre réglage peuvent continuer en direct.</li>'
      + '<li>Ce n’est pas un VPN de tout l’ordinateur : pas de coupure automatique d’Internet si le tunnel tombe, et l’UDP n’est pas couvert.</li>'
      + '<li><b>CANAL+</b> refuse les connexions par VPN : ses adresses restent en accès direct.</li>'
      + '<li>En mode Windows, <b>fermer JMH ne désactive pas le proxy</b>. Clique sur « Désactiver sur ce PC » avant de quitter si tu veux retrouver ta connexion habituelle.</li></ul>';
    page.querySelector('.vpn-location-explanation')?.before(scope);
    // Conflit à la désactivation (D) : rien n'est écrasé ; restauration de la sauvegarde seulement sur choix explicite.
    const restore = el('button', 'secondary a72-vpn-restore hidden', 'Restaurer la sauvegarde Windows'); restore.type = 'button'; restore.id = 'a72VpnRestore';
    restore.onclick = async () => {
      if (!confirm('Revenir aux réglages proxy de Windows d’avant l’activation par JMH ? Les changements faits depuis par un autre logiciel seront remplacés.')) return;
      restore.disabled = true;
      try { const r = await window.jmhDesktop.vpnProxy('Restore'); if (!r.ok) throw Error(r.error); restore.classList.add('hidden'); toast('Réglages proxy de Windows restaurés.'); await window.JMHVPNVerification?.verify(); }
      catch (e) { toast(e.message); } finally { restore.disabled = false; }
    };
    $('#vpnDisable')?.parentElement.append(restore);
    // Le bouton apparaît uniquement quand Windows signale un conflit de réglages (message « CONFLIT » affiché par la page VPN).
    const toastBox = $('#toast');
    watch(toastBox, () => { if (/^CONFLIT/.test(toastBox.textContent.trim()) && window.jmhDesktop?.vpnProxy) restore.classList.remove('hidden'); }, { childList: true, characterData: true, subtree: true });
    // Changement de pays (I) : tous les appareils sont concernés.
    $('#vpnChoose')?.addEventListener('click', e => {
      if (!confirm('Changer d’emplacement redémarre le tunnel du NAS : tous les appareils qui utilisent ce VPN seront coupés quelques secondes. Continuer ?')) { e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }
  vpnPanel(); if (!$('#a72VpnSummary')) watch($('#vpnPage'), vpnPanel, { childList: true });

  // 7.2.1 — listes déroulantes : un choix trop long pour la liste est coupé ; son nom complet s'affiche au survol.
  document.addEventListener('pointerdown', e => { const s = e.target.closest?.('select'); if (!s) return; for (const o of s.options) if (!o.title && o.textContent.length > 22) o.title = o.textContent.trim(); }, true);
})();
