// 7.5 : pochettes des musiques. Chaque titre, chaque album et le lecteur affichent la pochette trouvée par le NAS
// (outil YouTube) ; les titres visibles sans pochette sont signalés au NAS pour être cherchés en priorité.
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
  const say = message => (typeof toast === 'function' ? toast(message) : console.info(message));
  const json = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
  };
  const coverUrl = (id, bust) => '/api/music/tracks/' + encodeURIComponent(id) + '/cover' + (bust ? '?r=' + bust : '');
  let me = null;
  const isAdmin = () => me?.role === 'admin';

  /* ───────────── Pochettes dans la bibliothèque et le lecteur ───────────── */
  const missing = new Map(); // id du titre → éléments en attente de pochette
  let wantTimer = null, retryTimer = null, retries = 0;

  function attach(holder, id) {
    if (!holder || !id) return;
    const current = $(':scope > img.d75-art', holder);
    if (current && current.dataset.id === id) return;
    current?.remove(); holder.classList.remove('d75-has-art');
    const image = node('img', 'd75-art'); image.alt = ''; image.decoding = 'async'; image.loading = 'lazy'; image.dataset.id = id; image.draggable = false;
    image.addEventListener('load', () => { holder.classList.add('d75-has-art'); missing.delete(id); }, { once: true });
    image.addEventListener('error', () => {
      image.remove();
      if (!missing.has(id)) missing.set(id, new Set());
      missing.get(id).add(holder);
      scheduleWant();
    }, { once: true });
    image.src = coverUrl(id);
    holder.prepend(image);
  }

  function decorate() {
    const library = $('#musicLibrary'); if (!library) return;
    for (const row of $$('.music-track-row', library)) attach($('.music-mini-art', row), row.dataset.trackId);
    // Cartes d'album : l'image d'origine (cover.jpg du dossier) est remplacée par la même route, qui sait aussi trouver la pochette automatique.
    for (const button of $$('.music-album-art', library)) {
      const old = $(':scope > img.music-local-cover', button);
      const id = button.dataset.d75Id || /\/tracks\/([^/]+)\/cover/.exec(old?.getAttribute('src') || '')?.[1];
      if (!id) continue;
      button.dataset.d75Id = decodeURIComponent(id); old?.remove();
      attach(button, button.dataset.d75Id);
    }
    dock();
  }

  function dock() {
    const button = $('#musicDockArtwork'), id = window.JMHMusic?.current?.();
    if (!button) return;
    if (!id) { $(':scope > img.d75-art', button)?.remove(); button.classList.remove('d75-has-art'); return; }
    attach(button, String(id));
  }

  // Les titres visibles sans pochette passent en tête de la recherche du NAS, puis leurs images sont redemandées.
  function scheduleWant() {
    clearTimeout(wantTimer);
    wantTimer = setTimeout(async () => {
      const ids = [...missing.keys()].slice(0, 60); if (!ids.length) return;
      try { await json('/api/music/covers/want', { method: 'POST', body: JSON.stringify({ ids }) }); } catch { return; }
      retries = 0; scheduleRetry();
    }, 600);
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    if (retries >= 8 || !missing.size) return;
    retryTimer = setTimeout(() => {
      retries++;
      if ($('#musicPage')?.classList.contains('hidden')) return scheduleRetry();
      for (const [id, holders] of [...missing]) {
        for (const holder of holders) {
          if (!holder.isConnected || $(':scope > img.d75-art', holder)) continue;
          const image = node('img', 'd75-art'); image.alt = ''; image.decoding = 'async'; image.dataset.id = id; image.draggable = false;
          image.addEventListener('load', () => { holder.classList.add('d75-has-art'); missing.delete(id); }, { once: true });
          image.addEventListener('error', () => image.remove(), { once: true });
          image.src = coverUrl(id, Date.now()); holder.prepend(image);
        }
        if (![...holders].some(holder => holder.isConnected)) missing.delete(id);
      }
      scheduleRetry();
    }, 15000 + retries * 5000);
  }

  /* ───────────── Paramètres → Musique (administrateur) ───────────── */
  function buildSettings() {
    const main = $('#settingsPage .preferences-content'), tabs = main && $('.preferences-tabs', main);
    if (!tabs || $('#preference-music75')) return;
    const tab = node('button', 'preference-tab', 'Musique'); tab.type = 'button'; tab.id = 'jmhMusicCoverTab'; tab.dataset.preferenceTab = 'music75'; tab.setAttribute('role', 'tab'); tab.hidden = true;
    const glyph = window.JMHStudio?.icon('music'); if (glyph) tab.prepend(glyph);
    tabs.append(tab);
    const panel = node('section', 'preference-panel studio-panel d74-cinema-settings d75-music-settings hidden'); panel.id = 'preference-music75'; panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = '<h2>Pochettes des musiques</h2>' +
      '<p class="muted-text">Le NAS cherche la pochette de chaque titre avec l’outil YouTube, pour ta collection actuelle comme pour les titres que tu ajouteras. Un vrai album reçoit une seule pochette pour tous ses titres. Un titre importé avec un lien YouTube garde la miniature de sa vidéo. Une image posée dans le dossier de l’album (cover.jpg, folder.jpg…) reste toujours prioritaire.</p>' +
      '<div class="d74-stats"><div><strong data-k="covered">–</strong><span>titres avec pochette</span></div><div><strong data-k="notFound">–</strong><span>introuvables</span></div><div><strong data-k="tracks">–</strong><span>titres au total</span></div></div>' +
      '<div class="d75-progress" aria-hidden="true"><span></span></div>' +
      '<p class="d74-poster-state" role="status"></p>' +
      '<div class="d74-actions"><button type="button" class="jmh-btn primary" data-act="refresh">Rechercher les pochettes manquantes</button><button type="button" class="secondary" data-act="force">Réessayer les introuvables</button></div>' +
      '<h3>Une pochette ne correspond pas ?</h3><p class="muted-text">Ouvre la fiche du titre (bouton ⋯) : « Retirer la pochette » l’enlève pour de bon, « Chercher une autre pochette » relance la recherche.</p>';
    main.append(panel);
    const state = $('.d74-poster-state', panel), bar = $('.d75-progress span', panel);
    let timer = null;
    async function status() {
      try {
        const s = await json('/api/music/covers/status');
        for (const field of $$('[data-k]', panel)) field.textContent = s[field.dataset.k] == null ? '–' : Number(s[field.dataset.k]).toLocaleString('fr-FR');
        bar.style.width = s.tracks ? Math.round((s.covered || 0) / s.tracks * 100) + '%' : '0%';
        state.textContent = !s.enabled ? 'La recherche automatique fonctionne sur le serveur NAS.'
          : s.running ? 'Recherche en cours… ' + s.done.toLocaleString('fr-FR') + ' / ' + s.total.toLocaleString('fr-FR') + (s.current ? ' · ' + s.current : '')
          : s.pausedUntil ? 'YouTube demande une pause : reprise automatique vers ' + new Date(s.pausedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + '.'
          : s.offline ? 'Internet ne répond pas depuis le NAS : nouvel essai automatique dans 30 minutes.'
          : s.lastRun ? 'Dernière recherche : ' + new Date(s.lastRun).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + '. La recherche reprend toute seule toutes les 30 minutes.'
          : 'Recherche automatique active : elle démarre quelques secondes après le lancement du serveur.';
        clearTimeout(timer); if (s.running && !panel.classList.contains('hidden')) timer = setTimeout(status, 3000);
      } catch (error) { state.textContent = error.message; }
    }
    panel.addEventListener('click', async event => {
      const action = event.target.closest('[data-act]')?.dataset.act; if (!action) return;
      const button = event.target.closest('button'); button.disabled = true;
      try { await json('/api/music/covers/refresh', { method: 'POST', body: JSON.stringify({ force: action === 'force' }) }); say('Recherche des pochettes lancée.'); setTimeout(status, 800); }
      catch (error) { say(error.message); }
      finally { button.disabled = false; }
    });
    tab.onclick = () => {
      const search = $('.settings-search', main); if (search) search.value = '';
      $('form', main)?.classList.add('hidden');
      for (const other of $$('.preference-tab', main)) { const active = other === tab; other.classList.toggle('active', active); other.setAttribute('aria-selected', String(active)); }
      for (const section of $$('.preference-panel', main)) section.classList.toggle('hidden', section !== panel);
      void status();
    };
  }

  /* ───────────── Fiche d'un titre : pochette + correction (administrateur) ───────────── */
  function detailsCover() {
    const dialog = $('#musicDetailsDialog');
    if (!dialog?.open) return;
    const id = String(window.JMHMusic?.detail?.() || '');
    if (!id) return;
    attach($('#musicDetailsArt'), id);
    let actions = $('.d75-detail-actions', dialog);
    if (!actions) { actions = node('div', 'd75-detail-actions'); ($('.music-detail-actions', dialog) || $('#musicDetailsMeta', dialog))?.after(actions); }
    actions.hidden = !isAdmin();
    if (actions.dataset.id === id) return;
    actions.dataset.id = id; actions.replaceChildren();
    const again = node('button', 'music-text-button', 'Chercher une autre pochette'), remove = node('button', 'music-text-button', 'Retirer la pochette');
    again.type = remove.type = 'button';
    remove.onclick = async () => { try { await json('/api/music/tracks/' + encodeURIComponent(id) + '/cover', { method: 'DELETE' }); say('Pochette retirée.'); refreshEverywhere(id); } catch (error) { say(error.message); } };
    again.onclick = async () => { try { await json('/api/music/tracks/' + encodeURIComponent(id) + '/cover/retry', { method: 'POST', body: '{}' }); say('Recherche relancée : la pochette apparaîtra dans quelques secondes.'); setTimeout(() => refreshEverywhere(id, true), 9000); } catch (error) { say(error.message); } };
    actions.append(again, remove);
  }
  function refreshEverywhere(id, reload) {
    for (const image of $$('img.d75-art[data-id="' + CSS.escape(id) + '"]')) {
      const holder = image.parentElement; image.remove(); holder.classList.remove('d75-has-art');
      if (reload) { const fresh = node('img', 'd75-art'); fresh.alt = ''; fresh.dataset.id = id; fresh.onload = () => holder.classList.add('d75-has-art'); fresh.onerror = () => fresh.remove(); fresh.src = coverUrl(id, Date.now()); holder.prepend(fresh); }
    }
  }

  function applyRights() {
    const tab = $('#jmhMusicCoverTab'); if (tab) tab.hidden = !isAdmin();
    if (tab?.hidden && tab.classList.contains('active')) $('#settingsPage .preference-tab[data-preference-tab="display"]')?.click();
  }

  function start() {
    buildSettings();
    const library = $('#musicLibrary');
    if (library) new MutationObserver(decorate).observe(library, { childList: true, subtree: true });
    for (const id of ['musicDockTitle', 'musicDockArtist']) { const target = $('#' + id); if (target) new MutationObserver(dock).observe(target, { childList: true, characterData: true, subtree: true }); }
    new MutationObserver(detailsCover).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
    decorate();
    json('/api/me').then(data => { me = data.user || null; applyRights(); }).catch(() => {});
    const evolution = window.JMHEvolution;
    if (evolution && typeof evolution.permissions === 'function') {
      const original = evolution.permissions;
      evolution.permissions = user => { const result = original(user); me = user || null; applyRights(); return result; };
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  window.JMHDesign75 = { decorate, applyRights };
})();
