// JMH mobile : interface iPhone installable (écran d'accueil), même API et mêmes droits que JMH sur PC.
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const IOS_AUDIO = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.aif', '.aiff', '.caf']);
const IOS_VIDEO = new Set(['.mp4', '.m4v', '.mov']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif']);
const OPENABLE = new Set(['.pdf', '.txt']);
const state = { user: null, tab: 'home', stack: [], cache: {}, queue: [], queueIndex: -1, filmQuality: '720', playing: null, saveTimer: 0 };

async function api(url, options = {}) {
  const init = { credentials: 'same-origin', cache: 'no-store', ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } };
  const res = await fetch(url, init);
  if (res.status === 401) { showLogin(); throw Object.assign(Error('Reconnecte-toi à JMH.'), { silent: true }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(data.error || 'Le NAS ne répond pas (' + res.status + ').');
  return data;
}
async function cached(key, url, maxAge = 60000) {
  const hit = state.cache[key];
  if (hit && Date.now() - hit.at < maxAge) return hit.data;
  const data = await api(url);
  state.cache[key] = { at: Date.now(), data };
  return data;
}
const size = bytes => { if (!bytes) return ''; const u = ['o', 'Ko', 'Mo', 'Go', 'To']; let i = 0, n = bytes; while (n >= 1024 && i < 4) { n /= 1024; i++; } return n.toFixed(n < 10 && i ? 1 : 0).replace('.', ',') + ' ' + u[i]; };
const clock = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); };
const fileIcon = item => item.type === 'folder' ? '📁' : IMAGE.has(item.extension) ? '🖼' : IOS_VIDEO.has(item.extension) || ['.mkv', '.avi', '.webm'].includes(item.extension) ? '🎬' : IOS_AUDIO.has(item.extension) || ['.ogg', '.opus', '.wma'].includes(item.extension) ? '🎵' : item.extension === '.pdf' ? '📕' : '📄';
function fallbackImage(img, text) { img.addEventListener('error', () => { const div = document.createElement('div'); div.className = img.className; div.textContent = text; img.replaceWith(div); }, { once: true }); }

/* Connexion */
function showLogin() { $('app').hidden = true; $('login').hidden = false; $('username').focus(); }
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter || $('loginForm').querySelector('button');
  button.disabled = true; $('loginError').textContent = '';
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: $('username').value.trim(), password: $('password').value }) });
    if (!data.user) throw Error(data.message || 'Termine d’abord la connexion de ce compte sur JMH (PC).');
    $('password').value = '';
    start(data.user);
  } catch (error) { if (!error.silent) $('loginError').textContent = error.message; }
  finally { button.disabled = false; }
});

function start(user) {
  state.user = user; state.cache = {};
  $('login').hidden = true; $('app').hidden = false;
  $('accountButton').textContent = (user.displayName || user.username || '?').slice(0, 1).toUpperCase();
  go(state.tab, true);
}

/* Navigation */
const titles = { home: 'Accueil', files: 'Fichiers', cinema: 'Films', music: 'Musique', photos: 'Photos', account: 'Mon compte' };
const renderers = {};
function go(tab, reset = false) {
  if (reset || tab !== state.tab) state.stack = [];
  state.tab = tab;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  render();
}
function push(view) { state.stack.push(view); render(); }
function render() {
  const view = state.stack[state.stack.length - 1];
  $('backButton').hidden = !state.stack.length;
  $('title').textContent = view?.title || titles[state.tab];
  $('view').innerHTML = '<div class="loading">Chargement…</div>';
  window.scrollTo(0, 0);
  const run = view ? view.render : renderers[state.tab];
  Promise.resolve(run()).catch(error => { if (!error.silent) $('view').innerHTML = '<div class="empty">' + esc(error.message) + '</div>'; });
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab, true)));
$('backButton').addEventListener('click', () => { state.stack.pop(); render(); });
$('accountButton').addEventListener('click', () => go('account', true));

/* Accueil */
renderers.home = async () => {
  const [info, films, gallery] = await Promise.all([
    cached('storage', '/api/storage/info', 300000).catch(() => null),
    cached('films', '/api/cinema/catalog').catch(() => null),
    cached('galleryOverview', '/api/gallery/overview', 300000).catch(() => null)
  ]);
  const hour = new Date().getHours();
  let html = '<p class="hello">' + (hour < 18 ? 'Bonjour' : 'Bonsoir') + ' ' + esc(state.user.displayName || state.user.username) + '</p>';
  html += '<div class="stats">';
  if (films) html += '<button class="stat" data-go="cinema"><strong>' + films.movies.length + '</strong><span>films</span></button>';
  if (gallery) html += '<button class="stat" data-go="photos"><strong>' + gallery.photos + '</strong><span>photos</span></button>';
  if (info) html += '<button class="stat wide" data-go="files"><strong>' + (info.totalBytes ? size(info.totalBytes) : 'NAS') + '</strong><span>' + (info.totalFiles == null ? 'Calcul de l’espace en cours…' : 'sur le NAS · ' + Number(info.totalFiles).toLocaleString('fr-FR') + ' fichiers') + '</span></button>';
  html += '</div>';
  if (films) {
    const resume = films.movies.filter(m => m.available && m.progress.position > 60 && m.progress.position < m.progress.duration - 120).slice(0, 12);
    if (resume.length) html += '<div class="section-title"><h2>Reprendre</h2></div><div class="row-scroll">' + resume.map(posterHtml).join('') + '</div>';
    const recent = films.movies.filter(m => m.available).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))).slice(0, 12);
    if (recent.length) html += '<div class="section-title"><h2>Ajoutés récemment</h2><button data-go="cinema">Tout voir</button></div><div class="row-scroll">' + recent.map(posterHtml).join('') + '</div>';
  }
  if (gallery?.memories?.length) html += '<div class="section-title"><h2>' + esc(gallery.memoryLabel || 'Souvenirs') + '</h2></div><div class="row-scroll">' + gallery.memories.slice(0, 12).map(p => '<button class="memory" data-photo="' + esc(p.id) + '"><img src="' + esc(p.thumbnail) + '" alt="" loading="lazy" style="width:150px;height:150px;border-radius:14px;object-fit:cover"></button>').join('') + '</div>';
  $('view').innerHTML = html;
  bindPosters(films?.movies || []);
  $('view').querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go, true)));
  $('view').querySelectorAll('[data-photo]').forEach(b => b.addEventListener('click', () => { const p = gallery.memories.find(x => x.id === b.dataset.photo); openMedia(p.url, p.kind === 'video' ? 'video' : 'image', p.name); }));
};

/* Fichiers */
renderers.files = () => filesView('');
function filesView(path) {
  return api('/api/storage/list?path=' + enc(path)).then(data => {
    const crumb = path ? 'NAS / ' + path.split('/').join(' / ') : 'NAS JMH';
    let html = '<p class="breadcrumb">' + esc(crumb) + '</p>';
    html += data.items.length ? '<div class="list">' + data.items.map((item, i) => '<button class="item" data-i="' + i + '"><div class="thumb">' + fileIcon(item) + '</div><div class="text"><strong>' + esc(item.name) + '</strong><span>' + (item.type === 'folder' ? 'Dossier' : size(item.size)) + ' · ' + new Date(item.modifiedAt).toLocaleDateString('fr-FR') + '</span></div><span class="side">›</span></button>').join('') + '</div>' : '<div class="empty">Dossier vide.</div>';
    $('view').innerHTML = html;
    $('view').querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => openFile(data.items[Number(b.dataset.i)], data.items)));
  });
}
function openFile(item, siblings) {
  if (item.type === 'folder') return push({ title: item.name, render: () => filesView(item.path) });
  const preview = '/api/storage/preview?path=' + enc(item.path), download = '/api/storage/download?path=' + enc(item.path);
  if (IMAGE.has(item.extension)) return openMedia(preview, 'image', item.name);
  if (IOS_VIDEO.has(item.extension)) return openMedia(preview, 'video', item.name);
  if (IOS_AUDIO.has(item.extension)) {
    const tracks = siblings.filter(x => x.type === 'file' && IOS_AUDIO.has(x.extension)).map(x => ({ id: null, title: x.name.replace(/\.[^.]+$/, ''), artist: 'Fichiers du NAS', src: '/api/storage/preview?path=' + enc(x.path) }));
    return playQueue(tracks, tracks.findIndex(t => t.title === item.name.replace(/\.[^.]+$/, '')));
  }
  if (OPENABLE.has(item.extension)) return window.open(preview, '_blank');
  window.location.href = download;
}

/* Films */
function posterHtml(m) {
  const pct = m.progress.duration ? Math.min(100, m.progress.position / m.progress.duration * 100) : 0;
  return '<button class="poster" data-movie="' + esc(m.id) + '"><div class="art">🎬<img src="/api/cinema/movies/' + enc(m.id) + '/cover" alt="" loading="lazy">' + (pct > 1 ? '<div class="bar"><i style="width:' + pct.toFixed(0) + '%"></i></div>' : '') + '</div><strong>' + esc(m.title) + '</strong><span>' + esc(m.year || m.genre || '') + '</span></button>';
}
function bindPosters(movies) {
  $('view').querySelectorAll('.poster img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  $('view').querySelectorAll('[data-movie]').forEach(b => b.addEventListener('click', () => { const m = movies.find(x => x.id === b.dataset.movie); if (m) playMovie(m); }));
}
renderers.cinema = async () => {
  const data = await cached('films', '/api/cinema/catalog');
  let genre = '', query = '';
  const draw = () => {
    const list = data.movies.filter(m => m.available && (!genre || m.genre === genre) && (!query || m.title.toLocaleLowerCase('fr').includes(query))).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    $('filmGrid').innerHTML = list.length ? list.map(posterHtml).join('') : '<div class="empty">Aucun film.</div>';
    bindPosters(data.movies);
  };
  $('view').innerHTML = '<input class="search" id="filmSearch" type="search" placeholder="Rechercher un film">' +
    '<div class="chips"><button class="chip active" data-genre="">Tous</button>' + data.genres.map(g => '<button class="chip" data-genre="' + esc(g) + '">' + esc(g) + '</button>').join('') + '</div><div class="posters" id="filmGrid"></div>';
  $('filmSearch').addEventListener('input', e => { query = e.target.value.trim().toLocaleLowerCase('fr'); draw(); });
  $('view').querySelectorAll('[data-genre]').forEach(b => b.addEventListener('click', () => { genre = b.dataset.genre; $('view').querySelectorAll('[data-genre]').forEach(x => x.classList.toggle('active', x === b)); draw(); }));
  draw();
};

/* Lecteur vidéo (films) */
const video = $('video');
let playRequest = 0;
async function playMovie(movie) {
  pauseAudio();
  state.playing = movie;
  $('player').hidden = false; $('playerTitle').textContent = movie.title;
  // Un MP4/MOV se lit tout de suite en original ; les autres formats (MKV…) passent par une préparation unique sur le NAS.
  const direct = IOS_VIDEO.has(movie.extension);
  state.filmQuality = direct ? 'original' : state.filmQuality === 'original' ? '720' : state.filmQuality;
  document.querySelectorAll('[data-quality]').forEach(b => { b.hidden = b.dataset.quality === 'original' && !direct; b.classList.toggle('active', b.dataset.quality === state.filmQuality); });
  await loadMovie(movie);
}
async function loadMovie(movie) {
  const request = ++playRequest, resume = movie.progress.position > 30 && movie.progress.position < movie.progress.duration - 60 ? movie.progress.position : 0;
  video.removeAttribute('src'); video.load();
  const begin = src => { video.src = src; video.addEventListener('loadedmetadata', () => { if (resume) video.currentTime = resume; }, { once: true }); video.play().catch(() => { $('playerStatus').textContent = 'Touche lecture pour commencer.'; }); };
  if (state.filmQuality === 'original') { $('playerStatus').textContent = resume ? 'Reprise à ' + clock(resume) : ''; return begin('/api/cinema/movies/' + enc(movie.id) + '/stream'); }
  $('playerStatus').textContent = 'Préparation du film sur le NAS…';
  try {
    while (request === playRequest && !$('player').hidden) {
      const job = await api('/api/cinema/movies/' + enc(movie.id) + '/prepare', { method: 'POST', body: JSON.stringify({ quality: state.filmQuality }) });
      if (request !== playRequest) return;
      if (job.status === 'failed') throw Error(job.error || 'La préparation a échoué.');
      if (job.ready) { $('playerStatus').textContent = resume ? 'Reprise à ' + clock(resume) : ''; return begin(job.streamUrl); }
      $('playerStatus').textContent = job.status === 'queued' ? 'En attente sur le NAS…' : 'Préparation unique sur le NAS : ' + job.percent + ' %. Elle sera gardée pour la prochaine fois.';
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch (error) { if (request === playRequest && !error.silent) $('playerStatus').textContent = 'Lecture impossible : ' + error.message; }
}
document.querySelectorAll('[data-quality]').forEach(b => b.addEventListener('click', () => {
  if (!state.playing) return;
  state.filmQuality = b.dataset.quality;
  document.querySelectorAll('[data-quality]').forEach(x => x.classList.toggle('active', x === b));
  saveMovieProgress(); state.playing.progress.position = video.currentTime || state.playing.progress.position;
  loadMovie(state.playing);
}));
function saveMovieProgress() {
  const m = state.playing;
  if (!m || !video.duration || !isFinite(video.duration)) return;
  const position = Math.min(video.currentTime, video.duration), duration = video.duration;
  m.progress = { position, duration };
  api('/api/cinema/movies/' + enc(m.id) + '/progress', { method: 'PUT', body: JSON.stringify({ position, duration }) }).catch(() => {});
}
video.addEventListener('timeupdate', () => { if (Date.now() - state.saveTimer > 15000) { state.saveTimer = Date.now(); saveMovieProgress(); } });
video.addEventListener('pause', saveMovieProgress);
$('playerClose').addEventListener('click', () => { saveMovieProgress(); playRequest++; video.pause(); video.removeAttribute('src'); video.load(); $('player').hidden = true; state.playing = null; delete state.cache.films; if (state.tab === 'home' && !state.stack.length) render(); });

/* Musique */
renderers.music = async () => {
  const data = await cached('music', '/api/music/catalog');
  const tracks = data.tracks.filter(t => t.available);
  let mode = 'titles', query = '';
  const draw = () => {
    const q = query, match = t => !q || (t.title + ' ' + t.artist + ' ' + t.album).toLocaleLowerCase('fr').includes(q);
    let html = '';
    if (mode === 'albums' && !q) {
      const albums = new Map();
      tracks.forEach(t => { const key = t.album + '\u0000' + t.artist; if (!albums.has(key)) albums.set(key, []); albums.get(key).push(t); });
      html = '<div class="posters">' + [...albums.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([key, list], i) => '<button class="poster" data-album="' + i + '"><div class="art" style="aspect-ratio:1">♪<img src="/api/music/tracks/' + enc(list[0].id) + '/cover" alt="" loading="lazy"></div><strong>' + esc(list[0].album) + '</strong><span>' + esc(list[0].artist) + '</span></button>').join('') + '</div>';
      $('musicList').innerHTML = html;
      const entries = [...albums.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
      $('musicList').querySelectorAll('.poster img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
      $('musicList').querySelectorAll('[data-album]').forEach(b => b.addEventListener('click', () => { const list = entries[Number(b.dataset.album)][1]; push({ title: list[0].album, render: () => trackList(list) }); }));
      return;
    }
    const list = (mode === 'favorites' ? tracks.filter(t => t.favorite) : tracks).filter(match).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    $('musicList').innerHTML = list.length ? '<button class="more" id="shuffle">Lecture aléatoire</button>' + trackRows(list) : '<div class="empty">Aucun morceau.</div>';
    bindTracks(list);
    $('shuffle')?.addEventListener('click', () => { const mixed = list.slice().sort(() => Math.random() - .5); playQueue(mixed.map(trackSource), 0); });
  };
  $('view').innerHTML = '<input class="search" id="musicSearch" type="search" placeholder="Titre, artiste, album"><div class="chips"><button class="chip active" data-mode="titles">Titres</button><button class="chip" data-mode="albums">Albums</button><button class="chip" data-mode="favorites">Favoris</button></div><div id="musicList"></div>';
  $('musicSearch').addEventListener('input', e => { query = e.target.value.trim().toLocaleLowerCase('fr'); draw(); });
  $('view').querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; $('view').querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === b)); draw(); }));
  draw();
};
function trackRows(list) {
  return '<div class="list">' + list.map((t, i) => '<button class="item' + (state.queue[state.queueIndex]?.id === t.id ? ' playing' : '') + '" data-t="' + i + '"><img class="thumb" src="/api/music/tracks/' + enc(t.id) + '/cover" alt="" loading="lazy"><div class="text"><strong>' + esc(t.title) + '</strong><span>' + esc(t.artist) + ' · ' + esc(t.album) + '</span></div><span class="side">' + (t.duration ? clock(t.duration) : '') + '</span></button>').join('') + '</div>';
}
function bindTracks(list) {
  document.querySelectorAll('.item img.thumb').forEach(img => fallbackImage(img, '♪'));
  document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => playQueue(list.map(trackSource), Number(b.dataset.t))));
}
function trackList(list) { $('view').innerHTML = trackRows(list); bindTracks(list); }
function trackSource(t) { return { id: t.id, title: t.title, artist: t.artist, album: t.album, extension: t.extension, cover: '/api/music/tracks/' + enc(t.id) + '/cover' }; }

/* Lecteur audio (avec contrôles sur l'écran verrouillé) */
const audio = $('audio');
let audioRequest = 0;
function pauseAudio() { audio.pause(); }
async function playQueue(tracks, index) {
  if (!tracks.length) return;
  state.queue = tracks; state.queueIndex = Math.max(0, index);
  await playCurrent();
}
async function sourceFor(track, request) {
  if (track.src) return track.src;
  if (IOS_AUDIO.has(track.extension)) return '/api/music/tracks/' + enc(track.id) + '/stream';
  while (request === audioRequest) {
    const job = await api('/api/music/tracks/' + enc(track.id) + '/prepare', { method: 'POST', body: '{}' });
    if (job.status === 'failed') throw Error(job.error || 'Morceau illisible.');
    if (job.ready) return job.streamUrl;
    $('miniArtist').textContent = 'Préparation… ' + job.percent + ' %';
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}
async function playCurrent() {
  const track = state.queue[state.queueIndex], request = ++audioRequest;
  if (!track) return;
  $('miniPlayer').hidden = false;
  $('miniTitle').textContent = track.title; $('miniArtist').textContent = track.artist || '';
  $('miniCover').src = track.cover || '/assets/jmh-app-192.png';
  try {
    const src = await sourceFor(track, request);
    if (!src || request !== audioRequest) return;
    $('miniArtist').textContent = track.artist || '';
    audio.src = src;
    await audio.play();
  } catch (error) { if (!error.silent) $('miniArtist').textContent = error.name === 'NotAllowedError' ? 'Touche ▶ pour lancer la lecture.' : error.name === 'NotSupportedError' ? 'Ce morceau ne peut pas être lu.' : error.message; }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist || '', album: track.album || '', artwork: track.cover ? [{ src: track.cover, sizes: '512x512', type: 'image/jpeg' }] : [] });
  }
  document.querySelectorAll('.item.playing').forEach(x => x.classList.remove('playing'));
}
function step(delta) { const next = state.queueIndex + delta; if (next < 0 || next >= state.queue.length) return; state.queueIndex = next; playCurrent(); }
audio.addEventListener('ended', () => step(1));
audio.addEventListener('play', () => { $('miniToggle').textContent = '❚❚'; });
audio.addEventListener('pause', () => { $('miniToggle').textContent = '▶'; });
$('miniToggle').addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
$('miniNext').addEventListener('click', () => step(1));
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', () => audio.currentTime > 5 ? (audio.currentTime = 0) : step(-1));
  navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
}

/* Photos */
renderers.photos = async () => {
  let kind = 'photo', offset = 0, items = [];
  const load = async () => {
    const data = await api('/api/gallery/catalog?kind=' + kind + '&limit=120&offset=' + offset);
    items = items.concat(data.items); offset = data.offset + data.limit;
    $('photoGrid').innerHTML = items.length ? items.map((p, i) => '<button data-p="' + i + '"><img src="' + esc(p.thumbnail) + '" alt="" loading="lazy">' + (kind === 'video' ? '<span class="badge">▶</span>' : '') + '</button>').join('') : '<div class="empty">Aucun élément.</div>';
    $('photoGrid').querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { const p = items[Number(b.dataset.p)]; openMedia(p.url, kind === 'video' ? 'video' : 'image', p.name + ' · ' + new Date(p.date).toLocaleDateString('fr-FR')); }));
    $('photoMore').hidden = offset >= data.total;
  };
  $('view').innerHTML = '<div class="chips"><button class="chip active" data-kind="photo">Photos</button><button class="chip" data-kind="video">Vidéos personnelles</button></div><div class="grid-photos" id="photoGrid"></div><button class="more" id="photoMore" hidden>Afficher plus</button>';
  $('view').querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.kind; offset = 0; items = []; $('view').querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('active', x === b)); load(); }));
  $('photoMore').addEventListener('click', load);
  await load();
};

/* Visionneuse photo / vidéo */
function openMedia(url, kind, caption) {
  pauseAudio();
  $('viewer').hidden = false; $('viewerCaption').textContent = caption || '';
  $('viewerImage').hidden = kind !== 'image'; $('viewerVideo').hidden = kind !== 'video';
  if (kind === 'image') $('viewerImage').src = url; else { $('viewerVideo').src = url; $('viewerVideo').play().catch(() => {}); }
}
$('viewerClose').addEventListener('click', () => { $('viewer').hidden = true; $('viewerImage').removeAttribute('src'); $('viewerVideo').pause(); $('viewerVideo').removeAttribute('src'); $('viewerVideo').load(); });

/* Compte */
renderers.account = async () => {
  $('view').innerHTML = '<div class="account"><div class="card"><strong>' + esc(state.user.displayName || state.user.username) + '</strong><p class="muted">' + esc(state.user.role === 'admin' ? 'Administrateur' : 'Membre') + '</p></div>' +
    '<div class="card muted">Hors de chez toi, active le VPN dans Réglages → VPN avant d’ouvrir JMH.</div>' +
    '<a class="card" href="/" style="color:inherit;text-decoration:none">Ouvrir la version complète de JMH ›</a>' +
    '<button class="danger" id="logout">Se déconnecter</button></div>';
  $('logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); audio.pause(); state.user = null; showLogin(); });
};

/* Démarrage */
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
api('/api/me').then(data => data.user ? start(data.user) : showLogin()).catch(error => { if (!error.silent) { showLogin(); $('loginError').textContent = 'NAS injoignable. Hors de chez toi, active le VPN.'; } });
})();
