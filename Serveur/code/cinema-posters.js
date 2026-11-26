'use strict';
// 7.4 : pochettes de films automatiques.
// Pour chaque film sans image locale, le serveur cherche l'affiche sur Wikipédia (français puis anglais, sans compte),
// ou d'abord sur TMDB si l'administrateur a enregistré sa propre clé. L'image est vérifiée (JPEG/PNG, 5 Mo max,
// hôtes d'images connus uniquement) puis rangée dans les données du serveur : les dossiers de films ne sont jamais modifiés.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { readJsonSafe, writeJsonSafe } = require('./json-store');

const IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'image.tmdb.org']);
const USER_AGENT = 'JMH95200/7.4 (bibliotheque personnelle; serveur NAS prive)';
const RETRY_MISSING_MS = 7 * 24 * 3600 * 1000;
const NOISE = /\b(?:2160p|1080p|720p|480p|4k|uhd|hdr10?|dv|x26[45]|h\.?26[45]|hevc|avc|xvid|divx|bluray|blu-ray|brrip|bdrip|dvdrip|webrip|web-dl|webdl|hdtv|hdrip|remux|multi|vff|vfq|vf2|vfi|vostfr|vost|truefrench|subfrench|aac\d?|ac3|dts(?:-hd)?|ddp?5?\.?1|atmos|10bit|8bit|proper|repack|extended|unrated|remastered|imax)\b/gi;

function fold(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ').trim();
}

// « Movie.Name.2019.1080p.BluRay.x264-GRP » → { title: 'Movie Name', year: 2019 }
function cleanTitle(raw) {
  let text = String(raw || '').replace(/\[[^\]]*\]/g, ' ').replace(/[._]+/g, ' ');
  let year = null;
  const found = /(?:^|[\s(])((?:19|20)\d{2})(?:[\s)]|$)/.exec(text);
  if (found && found.index > 0 && Number(found[1]) <= new Date().getFullYear() + 1) { year = Number(found[1]); text = text.slice(0, found.index); }
  text = text.replace(NOISE, ' ').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return { title: text || String(raw || '').trim(), year };
}

function similarity(a, b) {
  const x = new Set(fold(a).split(' ').filter(Boolean)), y = new Set(fold(b).split(' ').filter(Boolean));
  if (!x.size || !y.size) return 0;
  let common = 0; for (const word of x) if (y.has(word)) common++;
  return common / (x.size + y.size - common);
}

function imageKind(bytes) {
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  return null;
}

function createPosterService({ DATA_DIR, movies, fetchImpl = globalThis.fetch, pauseMs = 2500, log = () => {} }) {
  const folder = path.join(DATA_DIR, 'cinema-posters');
  const indexFile = path.join(DATA_DIR, 'cinema_posters.json');
  const settingsFile = path.join(DATA_DIR, 'cinema_metadata.json');
  // Visuels TMDB déjà identifiés dans Jellyfin, partagés par chemin de fichier.
  const sharedFile = path.join(DATA_DIR, 'cinema_shared_posters.json');
  const sharedFolder = path.join(DATA_DIR, 'cinema-posters-shared');
  let sharedStamp = '', sharedIndex = {};
  function shared(movie) {
    try {
      const stat = fs.statSync(sharedFile), stamp = stat.mtimeMs + ':' + stat.size;
      if (stamp !== sharedStamp) { sharedIndex = readJsonSafe(sharedFile, {}); sharedStamp = stamp; }
      const entry = sharedIndex[movie.id];
      if (!entry || entry.key !== keyOf(movie) || entry.sourcePath !== movie.sourcePath || !/^[0-9a-f-]{36}\.(?:jpg|png)$/.test(entry.file || '')) return null;
      const full = path.join(sharedFolder, entry.file), image = fs.lstatSync(full);
      return image.isFile() && !image.isSymbolicLink() ? { path: full, mime: entry.file.endsWith('.png') ? 'image/png' : 'image/jpeg' } : null;
    } catch { return null; }
  }
  const state = { running: false, total: 0, done: 0, found: 0, missing: 0, offline: false, lastRun: null, current: null };
  let index = null, timer = null, again = false;

  const load = () => (index ||= readJsonSafe(indexFile, {}));
  const save = () => { fs.mkdirSync(DATA_DIR, { recursive: true }); writeJsonSafe(indexFile, index); };
  const settings = () => readJsonSafe(settingsFile, {});
  const keyOf = movie => crypto.createHash('sha1').update(fold(movie.title) + '|' + (movie.year || '')).digest('hex').slice(0, 16);

  let lastCall = 0;
  async function getJson(url, headers = {}, retry = true) {
    // Au moins 1,2 s entre deux appels : les services publics limitent les rafales.
    const wait = lastCall + 1200 - Date.now(); if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait)); lastCall = Date.now();
    const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(12000), redirect: 'error' });
    // Trop de demandes : on patiente une fois (30 s au plus) avant de réessayer.
    if (response.status === 429 && retry) {
      await new Promise(resolve => setTimeout(resolve, Math.min(30, Number(response.headers.get('retry-after')) || 10) * 1000));
      return getJson(url, headers, false);
    }
    if (!response.ok) { const error = new Error('HTTP ' + response.status); error.status = response.status; throw error; }
    return response.json();
  }

  async function download(url) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !IMAGE_HOSTS.has(u.hostname)) throw new Error('Hôte d’image refusé.');
    const response = await fetchImpl(u, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) throw new Error('Image trop grande.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024 || bytes.length < 2000) throw new Error('Taille d’image inattendue.');
    const kind = imageKind(bytes);
    if (!kind) throw new Error('Format d’image refusé.');
    return { bytes, kind };
  }

  const wiki = (lang, params) => getJson('https://' + lang + '.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', ...params }));
  const IMAGE_PARAMS = { piprop: 'thumbnail', pithumbsize: '500', pilicense: 'any' };

  // Article de film le plus probable dans une langue (titre proche, année concordante, description « film »).
  async function findFilmPage(lang, title, year) {
    const data = await wiki(lang, { generator: 'search', gsrnamespace: '0', gsrlimit: '6', gsrsearch: title + (year ? ' ' + year : '') + ' film',
      prop: 'pageimages|description|pageprops' + (lang === 'en' ? '' : '|langlinks'), ppprop: 'wikibase_item', lllang: 'en', ...IMAGE_PARAMS });
    let best = null;
    for (const page of data?.query?.pages || []) {
      const description = String(page.description || '');
      if (!/film|movie|long[- ]m[eé]trage/i.test(description)) continue;
      if (/s[ée]rie|series|franchise|saga|soundtrack|bande originale|novel|roman|jeu vid[ée]o|video game|album|chanson|song|personnage|character/i.test(description)) continue;
      const name = String(page.title || '').replace(/\s*\([^)]*\)\s*$/, '');
      const years = (description + ' ' + page.title).match(/\b(?:19|20)\d{2}\b/g)?.map(Number) || [];
      // Une suite ne doit jamais recevoir l'affiche du premier film : l'année connue doit concorder (à un an près).
      if (year && years.length && !years.some(found => Math.abs(found - year) <= 1)) continue;
      const yearMatch = Boolean(year && years.some(found => Math.abs(found - year) <= 1));
      const words = fold(title).split(' ').filter(word => word && !/^\d+$/.test(word)), candidate = new Set(fold(name).split(' '));
      const numbers = fold(title).split(' ').filter(word => /^\d+$/.test(word));
      let score = Math.max(similarity(title, name), fold(name) === fold(title) ? 1 : 0);
      // « The Conjuring 3 » (2021) → « The Conjuring: The Devil Made Me Do It » (2021) : mots du titre présents + même année.
      if (score < 0.5 && yearMatch && words.length && words.every(word => candidate.has(word))) score = 0.5;
      if (score < 0.5) continue;
      if (!yearMatch && numbers.length && !numbers.every(number => candidate.has(number))) continue;
      const total = score * 2 + (yearMatch ? 1 : 0) - (page.index || 0) * 0.05;
      if (!best || total > best.total) best = { total, thumb: page.thumbnail?.source || null, english: page.langlinks?.[0]?.title || null, item: /^Q\d+$/.test(page.pageprops?.wikibase_item || '') ? page.pageprops.wikibase_item : null };
    }
    return best;
  }

  // Sur Wikipédia en anglais, l'image principale d'un article de film est presque toujours l'affiche.
  // Le français n'héberge souvent pas les affiches (photo d'acteur, logo…) : il sert surtout à retrouver l'article anglais
  // d'un titre français (« Alvin et les Chipmunks 2 » → « Alvin and the Chipmunks: The Squeakquel »).
  async function fromWikipedia(title, year) {
    const english = await findFilmPage('en', title, year);
    if (english?.thumb) return { source: 'wikipedia-en', url: english.thumb };
    const french = await findFilmPage('fr', title, year);
    if (!french) return null;
    if (french.english) {
      const data = await wiki('en', { titles: french.english, prop: 'pageimages', ...IMAGE_PARAMS });
      const thumb = data?.query?.pages?.[0]?.thumbnail?.source;
      if (thumb) return { source: 'wikipedia-en', url: thumb };
    }
    const file = decodeURIComponent(String(french.thumb || '').split('/').pop() || '');
    const words = fold(title).split(' ').filter(word => word.length >= 4);
    if (french.thumb && !/logo|\(\d{6,}\)|portrait|signature/i.test(file) && (/affiche|poster/i.test(file) || words.some(word => fold(file).includes(word)))) return { source: 'wikipedia-fr', url: french.thumb };
    return null;
  }

  async function fromTmdb(key, title, year) {
    const query = new URLSearchParams({ query: title, language: 'fr-FR', include_adult: 'false' });
    if (year) query.set('year', String(year));
    const bearer = key.length > 40;
    if (!bearer) query.set('api_key', key);
    const data = await getJson('https://api.themoviedb.org/3/search/movie?' + query, bearer ? { Authorization: 'Bearer ' + key } : {});
    for (const item of (data?.results || []).slice(0, 5)) {
      if (!item.poster_path || !/^\/[A-Za-z0-9]+\.(?:jpg|png)$/.test(item.poster_path)) continue;
      if (Math.max(similarity(title, item.title), similarity(title, item.original_title)) >= 0.5) return 'https://image.tmdb.org/t/p/w500' + item.poster_path;
    }
    return null;
  }

  async function lookup(movie) {
    const cleaned = cleanTitle(movie.title), year = movie.year || cleaned.year;
    const key = String(settings().tmdbKey || '');
    if (key) {
      // Clé refusée (401) : on continue avec Wikipédia plutôt que d'échouer.
      const url = await fromTmdb(key, cleaned.title, year).catch(error => { if (error.status === 401) return null; throw error; });
      if (url) return { source: 'tmdb', url };
    }
    return fromWikipedia(cleaned.title, year);
  }

  // 7.4 : genres d'un film, pour le ranger dans la bonne catégorie. TMDB si une clé est enregistrée,
  // sinon la propriété « genre » (P136) de sa fiche Wikidata, retrouvée par l'article Wikipédia (anglais ou français).
  async function genres(rawTitle, knownYear = null) {
    const cleaned = cleanTitle(rawTitle), title = cleaned.title, year = knownYear || cleaned.year;
    const key = String(settings().tmdbKey || '');
    if (key) {
      const query = new URLSearchParams({ query: title, language: 'fr-FR', include_adult: 'false' });
      if (year) query.set('year', String(year));
      if (key.length <= 40) query.set('api_key', key);
      const data = await getJson('https://api.themoviedb.org/3/search/movie?' + query, key.length > 40 ? { Authorization: 'Bearer ' + key } : {}).catch(() => null);
      const item = (data?.results || []).slice(0, 5).find(result => Math.max(similarity(title, result.title), similarity(title, result.original_title)) >= 0.5);
      const found = (item?.genre_ids || []).map(id => TMDB_GENRES[id]).filter(Boolean);
      if (found.length) return { title, year, keys: genreKeys(found) };
    }
    const page = (await findFilmPage('en', title, year)) || (await findFilmPage('fr', title, year));
    if (!page?.item) return { title, year, keys: [] };
    const claims = await getJson('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: page.item, props: 'claims' }));
    const ids = (claims?.entities?.[page.item]?.claims?.P136 || []).map(claim => claim?.mainsnak?.datavalue?.value?.id).filter(id => /^Q\d+$/.test(id || '')).slice(0, 20);
    if (!ids.length) return { title, year, keys: [] };
    const labels = await getJson('https://www.wikidata.org/w/api.php?' + new URLSearchParams({ action: 'wbgetentities', format: 'json', ids: ids.join('|'), props: 'labels', languages: 'en' }));
    return { title, year, keys: genreKeys(ids.map(id => labels?.entities?.[id]?.labels?.en?.value || '')) };
  }

  function file(movie) {
    const entry = load()[movie.id];
    if (entry?.status === 'rejected' && entry.key === keyOf(movie)) return null;
    const synced = shared(movie); if (synced) return synced;
    // Titre ou année modifiés : l'ancienne affiche ne correspond peut-être plus, elle sera recherchée à nouveau.
    if (!entry || entry.status !== 'found' || entry.key !== keyOf(movie) || !/^[0-9a-f-]{36}\.(?:jpg|png)$/.test(entry.file || '')) return null;
    const full = path.join(folder, entry.file);
    try { const stat = fs.lstatSync(full); return stat.isFile() && !stat.isSymbolicLink() ? { path: full, mime: entry.file.endsWith('.png') ? 'image/png' : 'image/jpeg' } : null; } catch { return null; }
  }

  function needs(movie, entry) {
    if (!entry || entry.key !== keyOf(movie)) return true;
    if (entry.status === 'rejected' || entry.status === 'found') return false;
    return Date.now() - (Date.parse(entry.at) || 0) > RETRY_MISSING_MS;
  }

  async function fetchOne(movie, hasLocal) {
    const entries = load();
    if (await hasLocal(movie)) return;
    const result = await lookup(movie);
    const entry = { key: keyOf(movie), at: new Date().toISOString(), title: movie.title };
    if (result) {
      const image = await download(result.url);
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
      const name = movie.id + '.' + image.kind, temp = path.join(folder, name + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
      fs.writeFileSync(temp, image.bytes, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temp, path.join(folder, name));
      for (const other of ['jpg', 'png']) if (other !== image.kind) try { fs.unlinkSync(path.join(folder, movie.id + '.' + other)); } catch {}
      Object.assign(entry, { status: 'found', source: result.source, file: name });
      state.found++;
    } else { entry.status = 'missing'; state.missing++; }
    entries[movie.id] = entry; save();
  }

  // Une passe à la fois, un film à la fois, avec une pause entre deux recherches (politesse envers Wikipédia et TMDB).
  async function run({ force = false, hasLocal = async () => false } = {}) {
    if (state.running) { again = true; return; }
    Object.assign(state, { running: true, done: 0, found: 0, missing: 0, offline: false, current: null });
    try {
      const entries = load(), list = movies();
      if (force) for (const movie of list) if (entries[movie.id]?.status === 'missing') delete entries[movie.id];
      const todo = list.filter(movie => !shared(movie) && needs(movie, entries[movie.id]));
      state.total = todo.length;
      let failures = 0;
      for (const movie of todo) {
        state.current = movie.title;
        try { await fetchOne(movie, hasLocal); failures = 0; }
        catch (error) { log('pochette « ' + movie.title + ' » : ' + error.message); if (++failures >= 3) { state.offline = true; break; } }
        state.done++;
        await new Promise(resolve => setTimeout(resolve, pauseMs));
      }
    } finally {
      state.running = false; state.current = null; state.lastRun = new Date().toISOString();
      if (again) { again = false; setTimeout(() => void run({ hasLocal }), pauseMs).unref?.(); }
    }
  }

  function reject(movie) {
    const entries = load();
    for (const kind of ['jpg', 'png']) try { fs.unlinkSync(path.join(folder, movie.id + '.' + kind)); } catch {}
    entries[movie.id] = { key: keyOf(movie), status: 'rejected', at: new Date().toISOString(), title: movie.title };
    save();
  }

  function forget(movie) { const entries = load(); if (entries[movie.id]) { delete entries[movie.id]; save(); } }

  function summary() {
    const entries = load(), list = movies();
    const count = status => list.filter(movie => entries[movie.id]?.status === status && entries[movie.id].key === keyOf(movie)).length;
    return { ...state, movies: list.length, withPoster: list.filter(movie => Boolean(file(movie))).length, notFound: list.filter(movie => !shared(movie) && entries[movie.id]?.status === 'missing' && entries[movie.id].key === keyOf(movie)).length, rejected: count('rejected'), tmdb: Boolean(settings().tmdbKey) };
  }

  function setTmdbKey(value) {
    const key = String(value || '').trim();
    if (key && !/^[A-Za-z0-9._-]{20,400}$/.test(key)) { const error = new Error('Cette clé TMDB n’a pas un format valide.'); error.status = 400; throw error; }
    const next = { ...settings() }; if (key) next.tmdbKey = key; else delete next.tmdbKey;
    fs.mkdirSync(DATA_DIR, { recursive: true }); writeJsonSafe(settingsFile, next);
    // Une nouvelle source peut trouver ce que Wikipédia n'avait pas : les films « introuvables » sont recherchés à nouveau.
    const entries = load(); for (const id of Object.keys(entries)) if (entries[id].status === 'missing') delete entries[id]; save();
  }

  function start(hasLocal) {
    if (timer) return;
    const tick = () => void run({ hasLocal }).catch(error => log('pochettes : ' + error.message));
    setTimeout(tick, 8000).unref?.();
    timer = setInterval(tick, 15 * 60 * 1000); timer.unref?.();
  }

  return { run, file, reject, forget, summary, setTmdbKey, start, lookup, genres };
}

// Genres reconnus, du plus déterminant au plus général (un film d'animation comique va dans « Animation »).
const TMDB_GENRES = { 28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'thriller', 99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 27: 'horror', 10402: 'music', 9648: 'thriller', 10749: 'romance', 878: 'science-fiction', 53: 'thriller', 10752: 'action', 37: 'adventure' };
const GENRE_RULES = [
  ['animation', /anim|cartoon/], ['horror', /horror|slasher|zombie|supernatural|monster/], ['comedy', /comed|parody|satire/],
  ['romance', /romance|romantic/], ['science-fiction', /science fiction|science-fiction|cyberpunk|space opera/], ['fantasy', /fantasy|sword and sorcery/],
  ['action', /action|martial arts|war film|heist|superhero/], ['thriller', /thriller|crime|mystery|suspense|neo-noir|noir|detective|heist/],
  ['adventure', /adventure|western/], ['documentary', /documentary/], ['family', /family|children/], ['drama', /drama|biographical|historical/]
];
// Animation et horreur sont décisives ; sinon le genre cité le plus souvent l'emporte (« action comedy » ne fait pas
// de Terminator 2 une comédie), à égalité l'ordre de GENRE_RULES.
function genreKeys(labels) {
  const text = labels.map(label => String(label).toLowerCase()).filter(Boolean);
  const counts = GENRE_RULES.map(([key, rule], order) => ({ key, order, count: text.filter(label => rule.test(label)).length })).filter(entry => entry.count);
  const decisive = entry => (['animation', 'horror'].includes(entry.key) ? 1 : 0);
  return counts.sort((a, b) => decisive(b) - decisive(a) || b.count - a.count || a.order - b.order).map(entry => entry.key);
}

module.exports = { createPosterService, cleanTitle, similarity, fold, genreKeys, GENRE_RULES };
