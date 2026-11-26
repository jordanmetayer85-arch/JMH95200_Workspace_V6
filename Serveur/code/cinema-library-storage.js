'use strict';
// 7.4 : « Ajouter un film ».
// - Envoi depuis le PC vers Medias/Films/Ajouts par morceaux de 32 Mo (un film de plusieurs Go passe sous la limite
//   de 2 minutes par requête du serveur HTTPS) ; le fichier n'apparaît sous son vrai nom qu'une fois complet.
// - Dossier surveillé : tout film déposé dans Medias/Films/Ajouts (Explorateur Windows, autre logiciel…) est ajouté
//   au Cinéma quand sa copie est terminée (taille stable entre deux passages).
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const CHUNK_MAX = 32 * 1024 * 1024;
const PART_PREFIX = '.jmh-envoi-';
const SYSTEM_USER = Object.freeze({ id: 'system', username: 'system', role: 'admin' });

function filmsFolder(storageRoot, create = true) {
  const root = path.resolve(storageRoot), folder = path.join(root, 'Medias', 'Films', 'Ajouts');
  for (const part of ['', 'Medias', 'Medias/Films', 'Medias/Films/Ajouts']) {
    const dir = path.join(root, part);
    if (!fs.existsSync(dir)) { if (!create) return null; fs.mkdirSync(dir, { recursive: true }); }
    if (fs.lstatSync(dir).isSymbolicLink() || fs.realpathSync(dir) !== dir) throw Error('Dossier de films redirigé.');
  }
  return folder;
}

const isReadOnly = error => ['EROFS', 'EACCES', 'EPERM'].includes(error?.code);
function readOnlyMessage(error) {
  return isReadOnly(error) ? 'Le NAS n’autorise pas encore JMH à écrire dans Medias/Films/Ajouts.' : null;
}
// Réponse d'erreur : « readonly » permet à l'application d'afficher une seule explication claire au lieu d'un message par film.
function storageFailure(res, error, fallback) {
  return res.status(503).json({ error: readOnlyMessage(error) || fallback, code: isReadOnly(error) ? 'readonly' : 'storage' });
}

const gb = bytes => (bytes / 1024 ** 3).toFixed(1).replace('.', ',') + ' Go';

function safeName(value, videoTypes) {
  if (typeof value !== 'string') return null;
  const name = path.basename(value.normalize('NFC')).replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/[ .]+$/, '').trim();
  if (!name || name.startsWith('.') || name.length > 200 || !Object.hasOwn(videoTypes, path.extname(name).toLowerCase())) return null;
  return name;
}

// Catégorie → nom de sous-dossier sûr (Medias/Films/Ajouts/<Catégorie>/).
function categoryFolder(folder, genre) {
  const name = String(genre || '').normalize('NFC').replace(/[\x00-\x1f<>:"/\\|?*]/g, ' ').replace(/[ .]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name || name.startsWith('.') || /^à classer$/i.test(name)) return folder;
  const target = path.join(folder, name);
  if (!fs.existsSync(target)) fs.mkdirSync(target);
  if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== target) throw Error('Dossier de catégorie redirigé.');
  return target;
}
function uniqueTarget(dir, name) {
  const extension = path.extname(name), stem = path.basename(name, extension);
  let target = path.join(dir, name);
  for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, stem + ' (' + i + ')' + extension);
  return target;
}

function createFilmUploadRouter({ express, requireAuth, requireAdmin, storageRoot, videoTypes, importFiles, classify = async () => null, maxBytes = 80 * 1024 ** 3, reserveBytes = 2 * 1024 ** 3, statfs = p => fs.statfsSync(p) }) {
  const router = express.Router(), uploads = new Map();
  const fail = (res, status, error) => res.status(status).json({ error });
  router.use(requireAuth, requireAdmin);

  // Espace réellement disponible pour un nouveau film : libre sur le NAS, moins la réserve de fonctionnement
  // et moins ce que les envois déjà en cours vont encore écrire.
  function space() {
    let dir = storageRoot; try { dir = filmsFolder(storageRoot, false) || storageRoot; } catch {}
    const stat = statfs(dir), free = Number(stat.bavail) * Number(stat.bsize), total = Number(stat.blocks) * Number(stat.bsize);
    let pending = 0; for (const upload of uploads.values()) pending += upload.size - upload.received;
    return { free, total: Number.isFinite(total) ? total : null, available: Math.max(0, free - reserveBytes - pending), reserve: reserveBytes };
  }
  // Le dossier accepte-t-il l'écriture ? (petit fichier caché créé puis supprimé aussitôt)
  function writable() {
    try {
      const folder = filmsFolder(storageRoot), probe = path.join(folder, PART_PREFIX + 'test-' + crypto.randomUUID() + '.part');
      fs.closeSync(fs.openSync(probe, 'wx', 0o666)); fs.unlinkSync(probe); return { writable: true };
    } catch (error) { return { writable: false, code: isReadOnly(error) ? 'readonly' : 'storage' }; }
  }
  router.get('/space', (req, res) => {
    try { res.set('Cache-Control', 'no-store').json({ ...space(), ...writable() }); } catch { fail(res, 503, 'Impossible de lire l’espace disponible sur le NAS.'); }
  });

  router.post('/', (req, res) => {
    const name = safeName(req.body?.name, videoTypes), size = Number(req.body?.size);
    if (!name) return fail(res, 400, 'Choisis un fichier vidéo (mp4, mkv, avi, mov…).');
    if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes) return fail(res, 400, 'Taille de film invalide (80 Go au plus).');
    let folder;
    try { folder = filmsFolder(storageRoot); } catch (error) { return storageFailure(res, error, 'Le dossier des films du NAS est inaccessible.'); }
    let room;
    try { room = space(); } catch { return fail(res, 503, 'Impossible de vérifier l’espace disponible sur le NAS : envoi annulé par prudence.'); }
    if (size > room.available) return res.status(507).json({ error: 'Le NAS n’a pas assez de place pour ce film : ' + gb(size) + ' nécessaires, ' + gb(room.available) + ' disponibles.', ...room });
    const id = crypto.randomUUID(), part = path.join(folder, PART_PREFIX + id + '.part');
    try { fs.closeSync(fs.openSync(part, 'wx', 0o666)); } catch (error) { return storageFailure(res, error, 'Impossible de créer le fichier sur le NAS.'); }
    uploads.set(id, { id, user: String(req.session.user.id), name, size, received: 0, part, folder, busy: false, at: Date.now() });
    res.status(201).json({ id, chunkSize: CHUNK_MAX });
  });

  function own(req, res) {
    const upload = uploads.get(req.params.id);
    if (!upload || upload.user !== String(req.session.user.id)) { fail(res, 404, 'Envoi introuvable ou expiré. Recommence l’ajout du film.'); return null; }
    return upload;
  }

  router.put('/:id', (req, res) => {
    const upload = own(req, res); if (!upload) return;
    const offset = Number(req.query.offset), length = Number(req.headers['content-length']);
    if (upload.busy) return fail(res, 409, 'Un morceau est déjà en cours d’envoi.');
    if (offset !== upload.received) return res.status(409).json({ error: 'Position d’envoi inattendue.', received: upload.received });
    if (!Number.isSafeInteger(length) || length <= 0 || length > CHUNK_MAX || offset + length > upload.size) return fail(res, 400, 'Morceau de fichier invalide.');
    upload.busy = true; upload.at = Date.now();
    const output = fs.createWriteStream(upload.part, { flags: 'r+', start: offset });
    let written = 0, done = false;
    const finish = (status, body) => { if (done) return; done = true; upload.busy = false; res.status(status).json(body); };
    req.on('data', chunk => { written += chunk.length; if (written > length) { req.destroy(); output.destroy(); finish(400, { error: 'Morceau trop long.' }); } });
    req.on('aborted', () => { output.destroy(); upload.busy = false; done = true; });
    output.on('error', error => finish(503, { error: readOnlyMessage(error) || 'Écriture impossible sur le NAS.', code: isReadOnly(error) ? 'readonly' : 'storage' }));
    output.on('finish', () => {
      if (written !== length) return finish(400, { error: 'Morceau incomplet, il sera renvoyé.', received: upload.received });
      upload.received += written; upload.at = Date.now();
      finish(200, { received: upload.received });
    });
    req.pipe(output);
  });

  router.post('/:id/finish', async (req, res, next) => {
    const upload = own(req, res); if (!upload) return;
    if (upload.busy || upload.received !== upload.size) return fail(res, 409, 'Le film n’est pas encore entièrement envoyé.');
    try {
      if (fs.statSync(upload.part).size !== upload.size) return fail(res, 409, 'Le fichier reçu n’a pas la bonne taille.');
      upload.busy = true;
      // Catégorie trouvée d'après le titre (genre du film) ; sans réponse, le film reste « À classer » à la racine d'Ajouts.
      const genre = (await classify(upload.name).catch(() => null)) || 'À classer';
      let dir = upload.folder; try { dir = categoryFolder(upload.folder, genre); } catch {}
      const target = uniqueTarget(dir, upload.name);
      fs.renameSync(upload.part, target);
      uploads.delete(upload.id);
      const result = importFiles([target], req.session.user, genre);
      res.json({ ...result, genre, filename: path.basename(target), destination: path.relative(path.resolve(storageRoot), target).split(path.sep).slice(0, -1).join('/') });
    } catch (error) { next(error); }
  });

  router.delete('/:id', (req, res) => {
    const upload = own(req, res); if (!upload) return;
    uploads.delete(upload.id);
    try { fs.unlinkSync(upload.part); } catch {}
    res.json({ ok: true });
  });

  // Envois abandonnés (onglet fermé, coupure) : retirés après 6 heures sans nouveau morceau.
  const sweep = setInterval(() => {
    for (const upload of uploads.values()) if (!upload.busy && Date.now() - upload.at > 6 * 3600 * 1000) { uploads.delete(upload.id); try { fs.unlinkSync(upload.part); } catch {} }
  }, 30 * 60 * 1000);
  sweep.unref?.();

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'L’ajout du film a échoué. Réessaie.' });
  });
  return router;
}

// Dossier surveillé : un film n'est ajouté qu'après deux passages où sa taille et sa date n'ont pas bougé.
// Rangement : un film posé à la racine d'Ajouts est classé (genre du film) puis déplacé dans Ajouts/<Catégorie>/ ;
// un film déjà rangé à la main dans un sous-dossier prend le nom de ce sous-dossier comme catégorie.
function createFilmWatcher({ storageRoot, videoTypes, knows, importFiles, classify = async () => null, intervalMs = 2 * 60 * 1000, log = () => {} }) {
  const seen = new Map();
  let timer = null, scanning = null;
  async function file(folder, full) {
    const relative = path.relative(folder, full).split(path.sep);
    if (relative.length > 1) return importFiles([full], SYSTEM_USER, relative[0]);
    const genre = (await classify(path.basename(full)).catch(() => null)) || 'À classer';
    let target = full;
    try { const dir = categoryFolder(folder, genre); if (dir !== folder) { target = uniqueTarget(dir, path.basename(full)); fs.renameSync(full, target); } }
    catch { target = full; }
    return importFiles([target], SYSTEM_USER, genre);
  }
  // Un seul passage à la fois (le classement interroge Internet et peut prendre quelques secondes par film).
  function scan() { return scanning || (scanning = run().finally(() => { scanning = null; })); }
  async function run() {
    let folder;
    try { folder = filmsFolder(storageRoot, false); } catch { return 0; }
    if (!folder) return 0;
    const found = [], pending = [{ dir: folder, depth: 0 }], present = new Set();
    let entries = 0;
    while (pending.length && entries < 3000) {
      const { dir, depth } = pending.shift();
      let list = [];
      try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of list) {
        if (++entries > 3000) break;
        const full = path.join(dir, entry.name);
        if (entry.name.startsWith(PART_PREFIX)) { try { if (Date.now() - fs.statSync(full).mtimeMs > 6 * 3600 * 1000) fs.unlinkSync(full); } catch {} continue; }
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) { if (depth < 4) pending.push({ dir: full, depth: depth + 1 }); continue; }
        if (!entry.isFile() || !Object.hasOwn(videoTypes, path.extname(entry.name).toLowerCase())) continue;
        present.add(full);
        if (knows(full)) continue;
        let stat; try { stat = fs.statSync(full); } catch { continue; }
        const stamp = stat.size + ':' + stat.mtimeMs, previous = seen.get(full);
        seen.set(full, stamp);
        if (previous === stamp && stat.size > 0 && Date.now() - stat.mtimeMs > 60 * 1000) found.push(full);
      }
    }
    for (const file of seen.keys()) if (!present.has(file)) seen.delete(file);
    let imported = 0;
    for (const full of found) {
      seen.delete(full);
      try { imported += (await file(folder, full)).imported || 0; }
      catch (error) { log('dossier Films/Ajouts : ' + error.message); }
    }
    return imported;
  }
  const tick = () => void scan().catch(error => log('dossier Films/Ajouts : ' + error.message));
  return {
    scan,
    start() { if (timer) return; setTimeout(tick, 15000).unref?.(); timer = setInterval(tick, intervalMs); timer.unref?.(); }
  };
}

module.exports = { filmsFolder, createFilmUploadRouter, createFilmWatcher, categoryFolder, CHUNK_MAX, PART_PREFIX };
