// 7.4 : nouvelle présentation des Applications, des Paramètres et de l'Import (musique + films),
// pochettes en format affiche dans le Cinéma. Chargé en dernier : réorganise l'existant sans en changer les fonctions.
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const node = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
  const icon = name => { const svg = window.JMHStudio?.icon(name); return svg || node('span'); };
  const say = message => (typeof toast === 'function' ? toast(message) : console.info(message));
  const json = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'Une erreur est survenue.'); error.status = response.status; error.code = data.code; throw error; }
    return data;
  };
  let me = null;
  const isAdmin = () => me?.role === 'admin';
  const loadMe = async () => { try { me = (await json('/api/me')).user || null; } catch { me = null; } return me; };
  document.body.classList.add('jmh-d74');

  /* ───────────── Applications ───────────── */
  const APPS = {
    musicPage: ['#ff5f8f', '#8b3dff', 'music'], cinemaPage: ['#ff7a3d', '#d0254f', 'film'], photosPage: ['#ffb340', '#ff5e62', 'photo'],
    personalVideosPage: ['#3fa9ff', '#6a4dff', 'video'], storagePage: ['#22c3a6', '#1f7fd6', 'folder'], vpnPage: ['#35d07f', '#10856e', 'shield'],
    downloadsPage: ['#ffc23d', '#f0782a', 'download'], computerPage: ['#4cc9f0', '#4361ee', 'monitor'], audioPage: ['#b388ff', '#6c3cf0', 'audio'],
    gamesPage: ['#ff5d7d', '#b5179e', 'grid'], appearancePage: ['#f72585', '#7209b7', 'settings'], atelierPage: ['#8ec5ff', '#9b6bff', 'grid']
  };
  function buildApplications() {
    const page = $('#applicationsPage');
    if (!page || page.dataset.d74) return;
    page.dataset.d74 = '1';
    const head = $('.studio-heading', page);
    if (head) {
      head.classList.add('d74-hero');
      const copy = node('div', 'd74-hero-copy');
      copy.append(node('span', 'studio-eyebrow', 'TES APPLICATIONS'), node('h1', '', 'Tout JMH, en un coup d’œil.'), node('p', '', 'Ouvre une collection, lance un outil ou accorde-toi une pause.'));
      const search = node('label', 'd74-search');
      const input = node('input'); input.type = 'search'; input.placeholder = 'Rechercher une application'; input.setAttribute('aria-label', 'Rechercher une application'); input.autocomplete = 'off';
      const count = node('span', 'd74-search-count');
      search.append(icon('list'), input, count);
      head.replaceChildren(copy, search);
      input.addEventListener('input', () => filterApps(page, input.value, count));
      filterApps(page, '', count);
    }
    const downloads = $('[data-studio-nav="downloadsPage"]', page);
    if (downloads) {
      const [title, text] = $$(':scope > strong, :scope > span:not([class])', downloads);
      if (title) title.textContent = 'Imports';
      if (text) text.textContent = 'Musiques et films, directement sur ton NAS.';
    }
    decorateApps(page);
    // Cartes ajoutées plus tard (Atelier IA, mini-jeux…) : même habillage.
    new MutationObserver(() => decorateApps(page)).observe(page, { childList: true, subtree: true });
  }
  function decorateApps(page) {
    for (const card of $$('.studio-app-card:not([data-d74])', page)) {
      card.dataset.d74 = '1';
      const [one, two, glyph] = APPS[card.dataset.studioNav] || ['#9aa4ff', '#5b63d9', 'grid'];
      card.style.setProperty('--app-1', one); card.style.setProperty('--app-2', two);
      const mark = icon(glyph); mark.classList.add('d74-watermark'); mark.setAttribute('aria-hidden', 'true'); card.append(mark);
      const arrow = $('.studio-card-arrow', card) || $$(':scope > span', card).find(span => /→/.test(span.textContent));
      if (arrow) { arrow.classList.add('studio-card-arrow'); arrow.textContent = arrow.textContent.replace(/\s*→\s*$/, ''); }
    }
    for (const group of $$('.applications-group', page)) {
      const title = $('h2', group)?.textContent || '';
      group.classList.toggle('d74-featured', /collections/i.test(title));
      group.classList.toggle('d74-ai', /intelligence/i.test(title));
    }
  }
  function filterApps(page, query, count) {
    const words = String(query).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const group of $$('.applications-group', page)) {
      let shown = 0;
      for (const card of $$('.studio-app-card', group)) {
        const text = card.textContent.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const match = words.every(word => text.includes(word));
        card.classList.toggle('d74-out', !match);
        if (match) shown++;
      }
      group.classList.toggle('d74-out', !shown);
      if (!group.hidden) visible += shown;
    }
    count.textContent = query ? (visible ? visible + ' résultat' + (visible > 1 ? 's' : '') : 'Aucune application') : '';
  }

  /* ───────────── Paramètres ───────────── */
  const GROUPS = [
    ['Mon espace', ['account', 'privacy', 'security', 'kiosk']],
    ['Affichage', ['display', 'appearance', 'login-screen', 'home']],
    ['Médias', ['gallery', 'playback', 'cinema74', 'music75']],
    ['Système', ['updates', 'diagnostics', 'energy', 'users']]
  ];
  const HINTS = {
    account: 'Profil, avatar, mot de passe', privacy: 'Données et visibilité', security: 'Protection de tes accès', kiosk: 'Plein écran sur ce PC',
    display: 'Texte, animations, vignettes', appearance: 'Thèmes et couleurs', 'login-screen': 'Fond de l’écran d’accueil', home: 'Raccourcis de l’accueil',
    gallery: 'Photos et vidéos', playback: 'Son et lecture', cinema74: 'Pochettes des films', music75: 'Pochettes des musiques',
    updates: 'Version de JMH', diagnostics: 'NAS et outils', energy: 'Économie d’énergie', users: 'Comptes de la maison'
  };
  function arrangeSettings() {
    const main = $('#settingsPage .preferences-content'), tabs = main && $('.preferences-tabs', main);
    if (!tabs) return;
    main.classList.add('d74-settings');
    const heading = $('.studio-heading', main);
    if (heading && !heading.dataset.d74) {
      heading.dataset.d74 = '1';
      heading.replaceChildren(node('span', 'studio-eyebrow', 'PARAMÈTRES'), node('h1', '', 'Règle JMH à ta façon.'), node('p', '', 'Choisis une rubrique. Les changements s’appliquent tout de suite.'));
    }
    GROUPS.forEach(([title], index) => {
      let label = $('.d74-tab-group[data-group="' + index + '"]', tabs);
      if (!label) { label = node('div', 'd74-tab-group', title); label.dataset.group = String(index); label.setAttribute('aria-hidden', 'true'); tabs.append(label); }
      label.style.order = String((index + 1) * 100);
    });
    for (const tab of $$('.preference-tab', tabs)) {
      const id = tab.dataset.preferenceTab, group = GROUPS.findIndex(([, ids]) => ids.includes(id));
      const order = String(group < 0 ? 500 : (group + 1) * 100 + 1 + GROUPS[group][1].indexOf(id));
      if (tab.style.order !== order) tab.style.order = order;
      if (HINTS[id] && tab.dataset.d74Hint !== HINTS[id]) tab.dataset.d74Hint = HINTS[id];
    }
  }

  // Rubrique « Cinéma » : pochettes automatiques et clé TMDB facultative (administrateur).
  function buildCinemaSettings() {
    const main = $('#settingsPage .preferences-content'), tabs = main && $('.preferences-tabs', main);
    if (!tabs || $('#preference-cinema74')) return;
    const tab = node('button', 'preference-tab', 'Cinéma'); tab.type = 'button'; tab.id = 'jmhCinemaTab'; tab.dataset.preferenceTab = 'cinema74'; tab.setAttribute('role', 'tab'); tab.hidden = true;
    tab.prepend(icon('film')); tabs.append(tab);
    const panel = node('section', 'preference-panel studio-panel d74-cinema-settings hidden'); panel.id = 'preference-cinema74'; panel.setAttribute('role', 'tabpanel');
    panel.innerHTML = '<h2>Pochettes des films</h2>' +
      '<p class="muted-text">JMH trouve tout seul l’affiche de chaque film, pour ta collection actuelle comme pour les films que tu ajouteras. Une image posée à côté du film (poster.jpg, cover.jpg…) reste toujours prioritaire.</p>' +
      '<div class="d74-stats"><div><strong data-k="withPoster">–</strong><span>avec pochette</span></div><div><strong data-k="notFound">–</strong><span>introuvables</span></div><div><strong data-k="movies">–</strong><span>films au total</span></div></div>' +
      '<p class="d74-poster-state" role="status"></p>' +
      '<div class="d74-actions"><button type="button" class="jmh-btn primary" data-act="refresh">Rechercher les pochettes manquantes</button><button type="button" class="secondary" data-act="force">Réessayer les introuvables</button></div>' +
      '<h3>Source TMDB (facultative)</h3>' +
      '<p class="muted-text">Sans clé, les pochettes viennent de Wikipédia. Avec ta clé gratuite TMDB (themoviedb.org → Paramètres → API), JMH trouve aussi les films moins connus, avec l’affiche française. La clé reste sur ton NAS.</p>' +
      '<div class="d74-key"><input type="password" autocomplete="off" spellcheck="false" placeholder="Colle ta clé API ou ton jeton de lecture TMDB" aria-label="Clé TMDB"><button type="button" class="jmh-btn primary" data-act="save">Enregistrer</button><button type="button" class="secondary" data-act="clear">Retirer</button></div>' +
      '<p class="d74-key-state" role="status"></p>' +
      '<h3>Vérifier les pochettes</h3><p class="muted-text">Une affiche ne correspond pas ? Retire-la : JMH n’en remettra pas d’autre automatiquement pour ce film. « Chercher » relance la recherche.</p>' +
      '<div class="d74-poster-grid" aria-live="polite"></div>';
    main.append(panel);
    const state = $('.d74-poster-state', panel), keyState = $('.d74-key-state', panel), key = $('.d74-key input', panel), grid = $('.d74-poster-grid', panel);
    let timer = null;
    async function status() {
      try {
        const s = await json('/api/cinema/posters/status');
        for (const field of $$('[data-k]', panel)) field.textContent = String(s[field.dataset.k] ?? '–');
        state.textContent = !s.enabled ? 'La recherche automatique fonctionne sur le serveur NAS.' : s.running ? 'Recherche en cours… ' + s.done + ' / ' + s.total + (s.current ? ' · ' + s.current : '') : s.offline ? 'Internet ne répond pas depuis le NAS : nouvel essai automatique dans quelques minutes.' : s.lastRun ? 'Dernière recherche : ' + new Date(s.lastRun).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) + '.' : 'Recherche automatique active.';
        keyState.textContent = s.tmdb ? '✓ Clé TMDB enregistrée sur le NAS.' : 'Aucune clé : Wikipédia est utilisé.';
        clearTimeout(timer); if (s.running && !panel.classList.contains('hidden')) timer = setTimeout(status, 3000);
        return s;
      } catch (error) { state.textContent = error.message; return null; }
    }
    async function posters() {
      grid.replaceChildren(node('p', 'muted-text', 'Chargement…'));
      try {
        const { movies } = await json('/api/cinema/catalog');
        grid.replaceChildren();
        for (const movie of movies.sort((a, b) => a.title.localeCompare(b.title, 'fr'))) {
          const tile = node('figure', 'd74-poster-tile'), frame = node('div', 'd74-poster-frame'), image = node('img');
          image.alt = ''; image.loading = 'lazy'; image.src = '/api/cinema/movies/' + encodeURIComponent(movie.id) + '/cover?v=' + Date.now();
          frame.append(node('span', 'd74-poster-empty', movie.title.slice(0, 1).toUpperCase()), image);
          const button = node('button', 'secondary', 'Chercher'); button.type = 'button';
          image.addEventListener('load', () => { tile.classList.add('has-image'); button.textContent = 'Retirer'; }, { once: true });
          image.addEventListener('error', () => image.remove(), { once: true });
          button.onclick = async () => {
            button.disabled = true;
            try {
              if (tile.classList.contains('has-image')) { await json('/api/cinema/movies/' + encodeURIComponent(movie.id) + '/poster', { method: 'DELETE' }); say('Pochette retirée pour « ' + movie.title + ' ».'); }
              else { await json('/api/cinema/movies/' + encodeURIComponent(movie.id) + '/poster/retry', { method: 'POST', body: '{}' }); say('Recherche relancée pour « ' + movie.title + ' ».'); }
              setTimeout(posters, tile.classList.contains('has-image') ? 300 : 6000); void status();
            } catch (error) { say(error.message); button.disabled = false; }
          };
          const caption = node('figcaption'); caption.append(node('span', '', movie.title), button);
          tile.append(frame, caption); grid.append(tile);
        }
        if (!movies.length) grid.append(node('p', 'muted-text', 'Aucun film dans le Cinéma pour l’instant.'));
      } catch (error) { grid.replaceChildren(node('p', 'muted-text', error.message)); }
    }
    panel.addEventListener('click', async event => {
      const action = event.target.closest('[data-act]')?.dataset.act; if (!action) return;
      const button = event.target.closest('button'); button.disabled = true;
      try {
        if (action === 'refresh' || action === 'force') { await json('/api/cinema/posters/refresh', { method: 'POST', body: JSON.stringify({ force: action === 'force' }) }); say('Recherche des pochettes lancée.'); setTimeout(status, 800); }
        if (action === 'save' || action === 'clear') {
          if (action === 'save' && !key.value.trim()) throw new Error('Colle d’abord ta clé TMDB.');
          await json('/api/cinema/posters/settings', { method: 'PUT', body: JSON.stringify({ tmdbKey: action === 'save' ? key.value.trim() : '' }) });
          key.value = ''; say(action === 'save' ? 'Clé TMDB enregistrée. Les films sans pochette vont être recherchés.' : 'Clé TMDB retirée.'); setTimeout(status, 800);
        }
      } catch (error) { say(error.message); }
      finally { button.disabled = false; }
    });
    key.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('[data-act="save"]', panel).click(); } });
    tab.onclick = () => {
      const search = $('.settings-search', main); if (search) search.value = '';
      $('form', main)?.classList.add('hidden');
      for (const other of $$('.preference-tab', main)) { const active = other === tab; other.classList.toggle('active', active); other.setAttribute('aria-selected', String(active)); }
      for (const section of $$('.preference-panel', main)) section.classList.toggle('hidden', section !== panel);
      void status(); void posters();
    };
    loadMe().then(applyRights);
  }

  /* ───────────── Cinéma : affiche du film à la une ───────────── */
  function heroPoster() {
    const hero = $('#cinemaHero'); if (!hero) return;
    const id = hero.dataset.movieId || '';
    if (hero.dataset.d74Poster === id) return;
    hero.dataset.d74Poster = id;
    hero.classList.remove('d74-has-poster'); $('.d74-hero-poster', hero)?.remove(); $('.d74-hero-backdrop', hero)?.remove();
    if (!id) return;
    const image = new Image(); image.className = 'd74-hero-poster'; image.alt = ''; image.decoding = 'async';
    image.onload = () => {
      if (hero.dataset.movieId !== id) return image.remove();
      const backdrop = node('div', 'd74-hero-backdrop'); backdrop.style.backgroundImage = 'url("' + image.src + '")'; backdrop.setAttribute('aria-hidden', 'true');
      hero.prepend(backdrop); hero.classList.add('d74-has-poster');
    };
    image.onerror = () => image.remove();
    image.src = '/api/cinema/movies/' + encodeURIComponent(id) + '/cover';
    hero.append(image);
  }

  /* ───────────── Import : musique + films ───────────── */
  function buildImports() {
    const page = $('#downloadsPage'); if (!page || page.dataset.d74) return;
    page.dataset.d74 = '1';
    // WORKSPACE_PAGES est une constante globale (pas une propriété de window).
    if (typeof WORKSPACE_PAGES === 'object' && WORKSPACE_PAGES) WORKSPACE_PAGES.downloadsPage = ['Importer', 'Musiques et films, directement sur ton NAS.'];
    const choices = $('.studio-import-choices', page), youtube = $('#downloadForm', page)?.closest('.panel');
    // Pas de balise <header> : styles.css impose 78 px à toutes les balises header.
    const hero = node('div', 'studio-heading d74-hero d74-import-hero');
    const copy = node('div', 'd74-hero-copy'); copy.append(node('span', 'studio-eyebrow', 'IMPORTS & TÉLÉCHARGEMENTS'), node('h1', '', 'Ajoute à ta bibliothèque.'), node('p', '', 'Tes musiques et tes films arrivent directement sur le NAS, prêts à être lus sur tous tes appareils.'));
    hero.append(copy);
    const section = (kind, title, text, glyph) => {
      const box = node('section', 'd74-import-section d74-' + kind), head = node('div', 'd74-section-head'), badge = node('span', 'd74-section-icon');
      badge.append(icon(glyph)); const words = node('div'); words.append(node('h2', '', title), node('p', '', text));
      head.append(badge, words); const body = node('div', 'd74-import-body'); box.append(head, body); return { box, body };
    };
    const music = section('music', 'Musique', 'Depuis ce PC ou depuis un lien YouTube.', 'music');
    const local = node('div', 'd74-import-local');
    if (choices) local.append(...$$('.studio-import-card', choices));
    music.body.append(local);
    if (youtube) {
      youtube.classList.add('d74-youtube');
      const eyebrow = $('.eyebrow', youtube); if (eyebrow) eyebrow.textContent = 'LIEN YOUTUBE';
      const status = $('#downloadStatus', youtube), refresh = $('#downloadRefresh', youtube);
      if (status && refresh) { const line = node('div', 'd74-status-line'); status.before(line); line.append(status, refresh); }
      music.body.append(youtube);
    }
    choices?.remove();
    const films = section('films', 'Films', 'Ils rejoignent le Cinéma avec leur pochette, trouvée automatiquement.', 'film');
    films.box.hidden = true;
    films.body.append(buildFilmDrop(), buildFilmFolder());
    page.prepend(hero, music.box, films.box);
  }

  function buildFilmFolder() {
    const card = node('div', 'panel d74-film-folder');
    card.innerHTML = '<span class="eyebrow">DOSSIER SURVEILLÉ</span><h3>Glisse, c’est rangé.</h3>' +
      '<p>Tout film copié dans ce dossier du NAS apparaît dans le Cinéma quelques minutes après la fin de la copie, sans rien faire de plus.</p>' +
      '<div class="d74-path"><code>\\\\192.168.1.27\\JMH\\Medias\\Films\\Ajouts</code><button type="button" class="secondary">Copier</button></div>' +
      '<ul class="d74-steps"><li>Formats : mp4, mkv, avi, mov, m4v, webm, ts…</li><li>Le titre et l’année sont lus dans le nom du fichier.</li><li>Le film est déplacé dans le dossier de sa catégorie.</li><li>Déjà rangé dans un sous-dossier ? Son nom devient la catégorie.</li><li>La pochette est cherchée automatiquement.</li></ul>';
    $('.d74-path button', card).onclick = async () => {
      try { await navigator.clipboard.writeText($('.d74-path code', card).textContent); say('Chemin copié.'); } catch { say('Copie impossible : sélectionne le chemin à la main.'); }
    };
    return card;
  }

  const FILM_TYPES = ['.mp4', '.m4v', '.webm', '.ogv', '.mkv', '.avi', '.mov', '.mpeg', '.mpg', '.wmv', '.flv', '.ts', '.m2ts'];
  function buildFilmDrop() {
    const card = node('div', 'panel d74-film-drop');
    card.innerHTML = '<span class="eyebrow">DEPUIS CE PC</span><h3>Ajouter un film</h3>' +
      '<div class="d74-dropzone" tabindex="0" role="button" aria-label="Choisir des films sur ce PC"><strong>Dépose tes films ici</strong><span>ou clique pour les choisir · jusqu’à 80 Go par film</span></div>' +
      '<input type="file" multiple hidden accept="' + FILM_TYPES.join(',') + ',video/*">' +
      '<div class="d74-space" aria-live="polite"><div class="d74-space-bar"><span></span></div><p>Vérification de l’espace du NAS…</p></div>' +
      '<p class="d74-sort-note">Chaque film est rangé sur le NAS dans le dossier de sa catégorie (Horreur, Comédie, Action…), trouvée d’après son titre.</p>' +
      '<div class="d74-alert" role="alert" hidden><strong>Une dernière étape dans TrueNAS</strong>' +
      '<p>Le NAS n’autorise pas encore JMH à écrire dans le dossier des films. Il faut ajouter une ligne à l’application jmh95200 dans TrueNAS (une seule fois). Une fois fait, redépose tes films : ils partiront normalement.</p>' +
      '<p class="d74-alert-tip">En attendant, tu peux copier tes films dans <code>\\\\192.168.1.27\\JMH\\Medias\\Films\\Ajouts</code> avec l’Explorateur : ils seront ajoutés au Cinéma automatiquement.</p></div>' +
      '<ul class="d74-queue" aria-live="polite"></ul>';
    const zone = $('.d74-dropzone', card), input = $('input[type=file]', card), queue = $('.d74-queue', card);
    const spaceBox = $('.d74-space', card), alertBox = $('.d74-alert', card);
    // Espace libre du NAS : affiché en permanence et vérifié avant chaque film (le serveur le revérifie aussi).
    async function refreshSpace() {
      try {
        const room = await json('/api/cinema-upload/space');
        const used = room.total ? Math.min(100, Math.max(0, (1 - room.free / room.total) * 100)) : 0;
        $('span', spaceBox).style.width = used.toFixed(1) + '%';
        spaceBox.classList.toggle('is-low', room.available < 20 * 1024 ** 3);
        $('p', spaceBox).textContent = 'Espace disponible pour tes films : ' + size(room.available) + (room.total ? ' (NAS rempli à ' + Math.round(used) + ' %)' : '') + '.';
        alertBox.hidden = room.code !== 'readonly';
        zone.classList.toggle('is-blocked', room.code === 'readonly');
        return room;
      } catch (error) { $('p', spaceBox).textContent = [401, 403].includes(error.status) ? '' : 'Espace du NAS impossible à vérifier pour l’instant.'; return null; }
    }
    card.refreshSpace = refreshSpace;
    void refreshSpace();
    zone.prepend(icon('download'));
    const open = () => input.click();
    zone.addEventListener('click', open);
    zone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('is-over'); enqueue([...event.dataTransfer.files]); });
    input.addEventListener('change', () => { enqueue([...input.files]); input.value = ''; });
    // Deux films à la fois : c'est la limite d'envois simultanés par compte côté NAS (upload-limits.js).
    const PARALLEL = 2, pending = [], active = new Set();
    const summary = node('p', 'd74-sort-note'); summary.hidden = true; queue.before(summary);
    function enqueue(files) {
      for (const file of files) {
        const ok = FILM_TYPES.includes(('.' + file.name.split('.').pop()).toLowerCase());
        const row = node('li', 'd74-job'), name = node('strong', '', file.name), info = node('span', '', ok ? 'En attente…' : 'Format non pris en charge'), bar = node('div', 'd74-bar'), fill = node('span');
        const cancel = node('button', 'secondary', ok ? 'Annuler' : 'Retirer'); cancel.type = 'button';
        bar.append(fill); row.append(name, info, bar, cancel); queue.prepend(row);
        const job = { file, row, info, fill, cancel, cancelled: false, id: null };
        cancel.onclick = () => { job.cancelled = true; if (!ok || job.done) row.remove(); else info.textContent = 'Annulation…'; };
        if (!ok) { row.classList.add('is-error'); continue; }
        pending.push(job);
      }
      pump();
    }
    function pump() {
      while (active.size < PARALLEL && pending.length) {
        const job = pending.shift();
        if (job.cancelled) { job.row.remove(); continue; }
        active.add(job); void run(job);
      }
    }
    async function run(job) {
      try { await upload(job); }
      catch (error) {
        if (error.code === 'readonly') alertBox.hidden = false;
        job.row.classList.add('is-error'); job.cancel.textContent = 'Retirer'; job.done = true;
        job.info.textContent = job.cancelled ? 'Envoi annulé.' : error.code === 'readonly' ? 'Pas envoyé : le réglage TrueNAS ci-dessus est nécessaire.' : error.message;
        if (job.id) fetch('/api/cinema-upload/' + job.id, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
      }
      finally { active.delete(job); job.speed = 0; showTotal(); pump(); }
    }
    // Débit cumulé, affiché seulement quand plusieurs films partent en même temps.
    function showTotal() {
      const sending = [...active].filter(job => job.speed > 0);
      summary.hidden = sending.length < 2;
      if (!summary.hidden) summary.textContent = sending.length + ' films envoyés en même temps · ' + bitrate(sending.reduce((sum, job) => sum + job.speed, 0)) + ' au total';
    }
    async function upload(job) {
      const { file } = job, started = Date.now();
      job.info.textContent = 'Vérification de l’espace du NAS…';
      const room = await refreshSpace();
      if (!room) throw new Error('Impossible de vérifier l’espace du NAS : envoi annulé par prudence.');
      if (room.code === 'readonly') { const error = new Error('readonly'); error.code = 'readonly'; throw error; }
      if (file.size > room.available) throw new Error('Pas assez de place sur le NAS : ' + size(file.size) + ' nécessaires, ' + size(room.available) + ' disponibles.');
      const { id, chunkSize } = await json('/api/cinema-upload', { method: 'POST', body: JSON.stringify({ name: file.name, size: file.size }) });
      job.id = id;
      // Débit affiché : moyenne glissante sur les derniers morceaux, plus réactive que la moyenne depuis le début.
      let offset = 0, attempts = 0, waits = 0, rate = 0, mark = { at: Date.now(), offset: 0 };
      while (offset < file.size) {
        if (job.cancelled) throw new Error('Envoi annulé.');
        const end = Math.min(file.size, offset + chunkSize);
        const response = await fetch('/api/cinema-upload/' + id + '?offset=' + offset, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(offset, end) }).catch(() => null);
        const data = response ? await response.json().catch(() => ({})) : {};
        if (response && response.status === 429 && ++waits <= 120) {
          // Trop d'envois en même temps (une musique en plus des deux films, par ex.) : on attend une place sans compter d'échec.
          job.info.textContent = 'En attente d’une place libre sur le NAS…'; await new Promise(resolve => setTimeout(resolve, 5000)); continue;
        }
        if (!response || !response.ok) {
          // Coupure ou NAS occupé : on reprend là où le NAS s'est arrêté (5 essais).
          if (++attempts > 5 || (response && ![409, 429, 500, 502, 503].includes(response.status))) throw new Error(data.error || 'Connexion au NAS perdue pendant l’envoi.');
          if (Number.isSafeInteger(data.received)) offset = data.received;
          job.info.textContent = 'Connexion instable, nouvel essai…'; await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); continue;
        }
        attempts = 0; offset = data.received;
        const now = Date.now(), sent = offset - mark.offset, elapsed = (now - mark.at) / 1000;
        if (sent > 0 && elapsed > 0) { const current = sent / elapsed; rate = rate ? rate * 0.7 + current * 0.3 : current; }
        mark = { at: now, offset };
        const percent = offset / file.size, speed = rate || offset / Math.max(1, (now - started) / 1000), left = (file.size - offset) / Math.max(1, speed);
        job.fill.style.width = (percent * 100).toFixed(1) + '%';
        job.info.textContent = Math.floor(percent * 100) + ' % · ' + size(offset) + ' sur ' + size(file.size) + (offset < file.size ? ' · ' + bitrate(speed) + ' · encore ' + duration(left) : '');
        job.speed = offset < file.size ? speed : 0; showTotal();
      }
      job.info.textContent = 'Recherche de la catégorie et rangement sur le NAS…';
      const result = await json('/api/cinema-upload/' + id + '/finish', { method: 'POST', body: '{}' });
      job.done = true; job.row.classList.add('is-done'); job.cancel.textContent = 'Retirer';
      const title = result.movies?.[0]?.title || file.name, average = ' · moyenne ' + bitrate(file.size / Math.max(1, (Date.now() - started) / 1000));
      job.info.textContent = result.imported ? '✓ « ' + title + ' » rangé dans « ' + result.genre + ' » · ' + result.destination + average : '✓ Déjà présent dans le Cinéma.';
      say('Film ajouté : ' + title + ' (' + result.genre + ')');
      void refreshSpace();
    }
    return card;
  }
  const size = bytes => bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1).replace('.', ',') + ' Go' : Math.max(1, Math.round(bytes / 1024 ** 2)) + ' Mo';
  // Débit réseau en bits par seconde (1 octet = 8 bits), comme les débits annoncés par les box et le Wi-Fi.
  const bitrate = bytesPerSecond => { const mbit = bytesPerSecond * 8 / 1e6; return mbit >= 1000 ? (mbit / 1000).toFixed(2).replace('.', ',') + ' Gbit/s' : mbit >= 100 ? Math.round(mbit) + ' Mbit/s' : mbit.toFixed(1).replace('.', ',') + ' Mbit/s'; };
  const duration = seconds => seconds > 3600 ? Math.floor(seconds / 3600) + ' h ' + Math.round(seconds % 3600 / 60) + ' min' : seconds > 60 ? Math.round(seconds / 60) + ' min' : Math.max(1, Math.round(seconds)) + ' s';

  /* ───────────── Démarrage ───────────── */
  function start() {
    try { buildApplications(); } catch (error) { console.error('[JMH 7.4] applications', error); }
    try { buildImports(); } catch (error) { console.error('[JMH 7.4] import', error); }
    try { buildCinemaSettings(); arrangeSettings(); } catch (error) { console.error('[JMH 7.4] paramètres', error); }
    const tabs = $('#settingsPage .preferences-tabs');
    // Onglets ajoutés après coup (Mode verrouillé, Utilisateurs…) : rangés dans leur groupe.
    if (tabs) new MutationObserver(() => arrangeSettings()).observe(tabs, { childList: true });
    const hero = $('#cinemaHero');
    if (hero) { new MutationObserver(heroPoster).observe(hero, { attributes: true, attributeFilter: ['data-movie-id'] }); heroPoster(); }
    // Après une connexion ou un changement de compte, JMH appelle JMHEvolution.permissions(user) : droits relus ici aussi.
    const evolution = window.JMHEvolution;
    if (evolution && typeof evolution.permissions === 'function') {
      const original = evolution.permissions;
      evolution.permissions = user => { const result = original(user); me = user || null; applyRights(); return result; };
    }
  }
  function applyRights() {
    const tab = $('#jmhCinemaTab'); if (tab) tab.hidden = !isAdmin();
    const films = $('#downloadsPage .d74-films'); if (films) films.hidden = !isAdmin();
    if (isAdmin()) void $('#downloadsPage .d74-film-drop')?.refreshSpace?.();
    if (tab?.hidden && tab.classList.contains('active')) $('#settingsPage .preference-tab[data-preference-tab="display"]')?.click();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  window.JMHDesign74 = { arrangeSettings, filterApps, applyRights };
})();
