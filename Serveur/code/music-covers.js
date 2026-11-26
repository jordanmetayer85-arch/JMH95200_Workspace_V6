'use strict';
// 7.5 : pochettes de musique automatiques, trouvées avec l'outil YouTube du NAS (yt-dlp, recherche seule, rien n'est téléchargé
// à part l'image). Un vrai album (au moins deux titres) reçoit une seule pochette partagée ; un titre isolé (dossier Ajouts,
// single…) reçoit la sienne. Un titre importé avec un lien YouTube garde la miniature exacte de sa vidéo.
// Les images (JPEG, 3 Mo max, i.ytimg.com uniquement) sont rangées dans les données du serveur : les dossiers de musique ne sont jamais modifiés.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
const { readJsonSafe, writeJsonSafe } = require('./json-store');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const RETRY_MISSING_MS = 14 * 24 * 3600 * 1000;
const BLOCKED_PAUSE_MS = 45 * 60 * 1000;
// Dossiers « fourre-tout » : ce n'est pas un album, chaque titre cherche sa propre pochette.
const GENERIC_ALBUM = /^(?:ajouts?|album inconnu|unknown album|sans album|music|musique|musiques|audio|mp3|divers|various|singles?|titres?|t[ée]l[ée]chargements?|downloads?|youtube|playlist|nouveaut[ée]s|favoris)$/i;
// Mots de mise en forme des vidéos : ils ne décrivent pas le morceau et gênent la comparaison.
const NOISE = /\b(?:official|officiel(?:le)?|video|vid[ée]o|clip|lyrics?|paroles|audio|visuali[sz]er|hd|hq|4k|1080p|720p|mp3|320kbps|128kbps|ft|feat|featuring|prod|by)\b/gi;

function fold(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}
const words = text => [...new Set(fold(String(text || '').replace(NOISE, ' ')).split(' ').filter(word => word.length > 1 || /\d/.test(word)))];
const knownArtist = artist => artist && !/^(?:artiste inconnu|unknown artist|various artists?|divers)$/i.test(String(artist).trim());

// « 03 - Mange ta main (Clip Officiel) [HD] » → « Mange ta main »
function cleanTrackTitle(raw) {
  return String(raw || '').replace(/^\s*\d{1,3}\s*[-._)]\s*/, '').replace(/[\[(][^\])]*(?:official|officiel|clip|lyrics?|paroles|audio|video|vid[ée]o|hd|4k)[^\])]*[\])]/gi, ' ')
    .replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Une pochette par album réel, sinon par titre.
function groupsOf(tracks) {
  const albums = new Map();
  for (const track of tracks) {
    if (!knownArtist(track.artist) || !track.album || GENERIC_ALBUM.test(String(track.album).trim())) continue;
    const key = 'a:' + crypto.createHash('sha1').update(fold(track.artist) + '|' + fold(track.album)).digest('hex').slice(0, 20);
    if (!albums.has(key)) albums.set(key, { key, kind: 'album', artist: track.artist, album: track.album, tracks: [] });
    albums.get(key).tracks.push(track);
  }
  const shared = new Map([...albums].filter(([, group]) => group.tracks.length >= 2));
  const albumOf = new Map(), groups = [...shared.values()];
  for (const group of shared.values()) for (const track of group.tracks) albumOf.set(track.id, group.key);
  for (const track of tracks) if (!albumOf.has(track.id)) groups.push({ key: 't:' + track.id, kind: 'track', artist: track.artist, title: track.title, tracks: [track] });
  return { groups, albumOf };
}

// « Costantino Luca, Vera ai, Costantino Luca » → « Costantino Luca, Vera ai » (doublons retirés, deux noms au plus).
function artistsOf(value) {
  const seen = new Set();
  return String(value).split(/\s*[,;]\s*/).filter(name => name && !seen.has(fold(name)) && seen.add(fold(name))).slice(0, 2).join(', ');
}

function queryOf(group) {
  const artist = knownArtist(group.artist) ? artistsOf(group.artist) : '';
  if (group.kind === 'album') return (artist + ' ' + group.album).trim();
  const title = cleanTrackTitle(group.title);
  // Le titre contient souvent déjà l'artiste (« OSIREK - Poupée de cire… ») : inutile de le répéter.
  return (artist && !fold(title).includes(fold(artist)) ? artist + ' - ' + title : title).trim();
}
const signature = group => crypto.createHash('sha1').update(fold(queryOf(group))).digest('hex').slice(0, 16);

// Choisit le meilleur résultat YouTube : le morceau (ou l'album) doit y être reconnaissable.
function pickResult(group, results) {
  const main = group.kind === 'album' ? words(group.album) : words(cleanTrackTitle(group.title));
  const artist = knownArtist(group.artist) ? words(group.artist) : [];
  if (!main.length) return null;
  let best = null;
  results.slice(0, 5).forEach((result, index) => {
    if (!VIDEO_ID.test(result.id || '')) return;
    const text = new Set(fold(result.title + ' ' + (result.channel || '')).split(' '));
    const cover = list => (list.length ? list.filter(word => text.has(word)).length / list.length : 1);
    const mainScore = cover(main), artistScore = cover(artist);
    if (mainScore < 0.6 || (artist.length && artistScore < 0.5 && mainScore < 1)) return;
    const title = fold(result.title), wanted = fold(queryOf(group));
    let score = mainScore * 2 + artistScore - index * 0.08;
    // Les chaînes « Artiste - Topic » de YouTube Music affichent la vraie pochette de l'album.
    if (/ - topic$/i.test(result.channel || '')) score += 0.6;
    if (/official audio|audio officiel|provided to youtube/i.test(result.title)) score += 0.2;
    for (const bad of ['live', 'karaoke', 'reaction', 'tutorial', 'tuto', 'cover', 'instrumental', 'remix', 'nightcore', 'slowed', 'reverb', 'speed up', 'sped up'])
      if (title.includes(bad) && !wanted.includes(bad)) score -= 0.5;
    if (group.kind === 'track' && Number(result.duration) > 20 * 60) score -= 1;
    if (!best || score > best.score) best = { ...result, score };
  });
  return best;
}

// Recherche par l'outil YouTube du NAS : yt-dlp ne lit que la page de résultats (aucun téléchargement de vidéo).
function youtubeSearch({ binary, home, spawnImpl = spawn, timeoutMs = 30000 }) {
  return query => new Promise((resolve, reject) => {
    const text = String(query).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 160);
    if (!text) return resolve([]);
    const args = ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-update', '--no-warnings', '--flat-playlist', '--skip-download',
      '--socket-timeout', '15', '--print', '%(id)s\t%(title)s\t%(channel,uploader)s\t%(duration)s', '--', 'ytsearch5:' + text];
    let child;
    try { child = spawnImpl(binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: home, LANG: 'C.UTF-8' } }); }
    catch (error) { return reject(error); }
    let out = '', err = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('Recherche YouTube trop longue.')); }, timeoutMs);
    child.stdout?.on('data', chunk => { out = (out + chunk).slice(-20000); });
    child.stderr?.on('data', chunk => { err = (err + chunk).slice(-4000); });
    child.once('error', error => finish(error));
    child.once('close', code => {
      if (code !== 0) {
        const error = new Error('yt-dlp a échoué (' + code + ').');
        if (/sign in|bot|429|too many|rate.?limit/i.test(err)) error.code = 'blocked';
        return finish(error);
      }
      finish(null, out.split('\n').map(line => line.split('\t')).filter(parts => parts.length >= 2)
        .map(([id, title, channel, duration]) => ({ id: id.trim(), title, channel: channel === 'NA' ? '' : channel, duration: Number(duration) || 0 })));
    });
  });
}

function createMusicCoverService({ DATA_DIR, tracks, search, fetchImpl = globalThis.fetch, pauseMs = 3000, log = () => {} }) {
  const folder = path.join(DATA_DIR, 'music-covers');
  const indexFile = path.join(DATA_DIR, 'music_covers.json');
  const state = { running: false, total: 0, done: 0, found: 0, missing: 0, offline: false, blocked: false, lastRun: null, current: null };
  let index = null, timer = null, again = false, blockedUntil = 0;
  const priority = new Set();

  const load = () => (index ||= readJsonSafe(indexFile, {}));
  const save = () => { fs.mkdirSync(DATA_DIR, { recursive: true }); writeJsonSafe(indexFile, index); };
  const imageName = key => crypto.createHash('sha1').update(key).digest('hex').slice(0, 24) + '.jpg';

  async function thumbnail(video) {
    if (!VIDEO_ID.test(video)) throw new Error('Identifiant de vidéo invalide.');
    // hq720 / maxres : 16:9 sans bandes noires (l'interface recadre au carré) ; mqdefault en dernier recours.
    for (const size of ['hq720', 'maxresdefault', 'mqdefault']) {
      const response = await fetchImpl('https://i.ytimg.com/vi/' + video + '/' + size + '.jpg', { signal: AbortSignal.timeout(15000), redirect: 'error' }).catch(() => null);
      if (!response?.ok) continue;
      if (Number(response.headers.get('content-length')) > 3 * 1024 * 1024) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 2500 || bytes.length > 3 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) continue;
      return bytes;
    }
    throw new Error('Miniature YouTube indisponible.');
  }

  function store(key, entry, bytes) {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const name = imageName(key), temp = path.join(folder, name + '.' + crypto.randomBytes(4).toString('hex') + '.tmp');
    fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, path.join(folder, name));
    load()[key] = { ...entry, status: 'found', file: name, at: new Date().toISOString() };
    save();
  }

  // Regroupement par album recalculé au plus toutes les 30 s (une page affiche des dizaines de pochettes à la fois).
  let grouped = null, groupedAt = 0;
  function grouping() {
    if (!grouped || Date.now() - groupedAt > 30000) { grouped = groupsOf(tracks()); groupedAt = Date.now(); }
    return grouped;
  }
  const keyOf = track => grouping().albumOf.get(track.id) || 't:' + track.id;

  function file(track) {
    const entries = load();
    for (const key of [...new Set(['t:' + track.id, keyOf(track)])]) {
      const entry = entries[key];
      if (entry?.status !== 'found' || !/^[0-9a-f]{24}\.jpg$/.test(entry.file || '')) continue;
      // La pochette d'un titre importé depuis YouTube ne dépend pas de son nom ; les autres sont recherchées à nouveau si le titre change.
      if (entry.source !== 'youtube-import' && key.startsWith('t:') && entry.sig !== signature({ kind: 'track', artist: track.artist, title: track.title })) continue;
      const full = path.join(folder, entry.file);
      try { const stat = fs.lstatSync(full); if (stat.isFile() && !stat.isSymbolicLink()) return { path: full, mime: 'image/jpeg' }; } catch {}
    }
    return null;
  }

  function needs(group, entry) {
    if (!entry) return true;
    if (entry.status === 'rejected' || entry.source === 'youtube-import') return false;
    if (entry.sig !== signature(group)) return true;
    if (entry.status === 'found') return false;
    return Date.now() - (Date.parse(entry.at) || 0) > RETRY_MISSING_MS;
  }

  async function fetchOne(group) {
    const sig = signature(group), results = await search(queryOf(group)), best = pickResult(group, results);
    if (!best) { load()[group.key] = { status: 'missing', sig, at: new Date().toISOString(), query: queryOf(group) }; save(); state.missing++; return; }
    store(group.key, { sig, source: 'youtube', video: best.id, query: queryOf(group) }, await thumbnail(best.id));
    state.found++;
  }

  // Un titre importé par un lien YouTube : la miniature de cette vidéo, sans recherche.
  async function remember(trackId, video) {
    if (!trackId || !VIDEO_ID.test(video || '')) return false;
    try { store('t:' + trackId, { source: 'youtube-import', video }, await thumbnail(video)); return true; }
    catch (error) { log('pochette de l’import YouTube : ' + error.message); return false; }
  }

  // Les titres affichés à l'écran passent devant le reste de la file.
  function want(ids) {
    for (const id of ids.slice(0, 60)) priority.add(String(id));
    if (!state.running && Date.now() >= blockedUntil) void run().catch(error => log('pochettes musique : ' + error.message));
  }

  // Une recherche à la fois, avec une pause entre deux recherches pour rester discret envers YouTube.
  async function run({ force = false } = {}) {
    if (state.running) { again = true; return; }
    if (Date.now() < blockedUntil && !force) return;
    Object.assign(state, { running: true, done: 0, found: 0, missing: 0, offline: false, blocked: false, current: null });
    try {
      const entries = load(), all = tracks(), { groups, albumOf } = groupsOf(all);
      if (force) for (const key of Object.keys(entries)) if (entries[key].status === 'missing') delete entries[key];
      const added = new Map(all.map(track => [track.id, Date.parse(track.addedAt) || 0]));
      const newest = group => Math.max(...group.tracks.map(track => added.get(track.id) || 0));
      let todo = groups.filter(group => needs(group, entries[group.key])).sort((a, b) => newest(b) - newest(a));
      state.total = todo.length;
      let failures = 0;
      while (todo.length) {
        // Priorité : un titre visible à l'écran (ou son album).
        const wanted = [...priority].map(id => albumOf.get(id) || 't:' + id);
        priority.clear();
        const at = todo.findIndex(group => wanted.includes(group.key));
        const [group] = todo.splice(at >= 0 ? at : 0, 1);
        state.current = group.kind === 'album' ? group.artist + ' — ' + group.album : cleanTrackTitle(group.title);
        try { await fetchOne(group); failures = 0; }
        catch (error) {
          log('pochette « ' + state.current + ' » : ' + error.message);
          if (error.code === 'blocked') { state.blocked = true; blockedUntil = Date.now() + BLOCKED_PAUSE_MS; break; }
          if (++failures >= 3) { state.offline = true; break; }
        }
        state.done++;
        await new Promise(resolve => setTimeout(resolve, pauseMs));
      }
    } finally {
      state.running = false; state.current = null; state.lastRun = new Date().toISOString();
      if (again) { again = false; setTimeout(() => void run().catch(() => {}), pauseMs).unref?.(); }
    }
  }

  function reject(track) {
    const entries = load();
    for (const key of [...new Set(['t:' + track.id, keyOf(track)])]) {
      const old = entries[key]; if (!old) continue;
      if (old.file) try { fs.unlinkSync(path.join(folder, old.file)); } catch {}
      entries[key] = { status: 'rejected', at: new Date().toISOString() };
    }
    entries[keyOf(track)] ||= { status: 'rejected', at: new Date().toISOString() };
    save();
  }
  function retry(track) {
    const entries = load();
    for (const key of [...new Set(['t:' + track.id, keyOf(track)])]) delete entries[key];
    save(); want([track.id]);
  }

  function summary() {
    const entries = load(), all = tracks(), { groups } = groupsOf(all);
    let withCover = 0, notFound = 0, rejected = 0, covered = 0;
    for (const group of groups) {
      const entry = entries[group.key];
      const ok = entry?.status === 'found' && (entry.source === 'youtube-import' || entry.sig === signature(group));
      if (ok) { withCover++; covered += group.tracks.length; }
      else if (entry?.status === 'missing' && entry.sig === signature(group)) notFound++;
      else if (entry?.status === 'rejected') rejected++;
    }
    return { ...state, enabled: true, tracks: all.length, groups: groups.length, withCover, covered, notFound, rejected, pausedUntil: blockedUntil > Date.now() ? new Date(blockedUntil).toISOString() : null };
  }

  function start() {
    if (timer) return;
    const tick = () => void run().catch(error => log('pochettes musique : ' + error.message));
    setTimeout(tick, 20000).unref?.();
    timer = setInterval(tick, 30 * 60 * 1000); timer.unref?.();
  }

  return { run, file, remember, want, reject, retry, summary, start };
}

module.exports = { createMusicCoverService, youtubeSearch, pickResult, groupsOf, queryOf, cleanTrackTitle, fold };
