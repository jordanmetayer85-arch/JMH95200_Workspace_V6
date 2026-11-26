const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createNasMediaPolicy } = require("./media-paths");

const { readMusicMetadata } = require("./music-tags");
const AUDIO_TYPES = Object.freeze({
  ".mp3": "audio/mpeg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".wav": "audio/wav", ".wma": "audio/x-ms-wma",
  ".aiff": "audio/aiff", ".aif": "audio/aiff", ".amr": "audio/amr", ".mpc": "audio/x-musepack"
});
const INLINE_TYPES = new Set([".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus", ".wav"]);
const DEFAULT_LIMITS = Object.freeze({
  maxPaths: 1000, maxScanEntries: 100000, maxScanVideos: 50000,
  maxScanDepth: 16, maxScanDirectories: 10000, maxScanMilliseconds: 300000
});

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function createMusicRouter({ express = require("express"), DATA_DIR, requireAuth, requireAdmin, requirePermission, limits = {}, browserTranscoder , isModerated=()=>false, coverSearch=null}) {
  if (!DATA_DIR || !path.isAbsolute(DATA_DIR)) throw new Error("Music DATA_DIR must be absolute.");
  const router = express.Router();
  const mediaPolicy = createNasMediaPolicy();
  const catalogFile = path.join(DATA_DIR, "music_catalog.json");
  const preferencesFile = path.join(DATA_DIR, "music_preferences.json");
  const bounds = { ...DEFAULT_LIMITS, ...limits };
  const availabilityCache = new Map();
  const catalogResponse=require("./catalog-response").createCatalogResponder();
  let availabilityRefreshPending=null;
  const availabilityTtl=5*60*1000;
  const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  async function concurrentMap(items, handler, count = 4) {
    const results = new Array(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(count, items.length) }, async () => {
      while (cursor < items.length) { const index = cursor++; results[index] = await handler(items[index]); }
    }));
    return results;
  }
  let availabilityRevision=0;
  async function refreshAvailability(tracks,force=false) {
    // Resolve each album directory once instead of resolving thousands of sibling paths.
    // Individual file types/sizes are still checked here and again when a track is served.
    const parents = new Map();
    function safeParent(file) {
      const parent = path.dirname(file);
      if (!parents.has(parent)) parents.set(parent, fs.promises.realpath(parent).then(actual => sourceKey(actual) === sourceKey(parent), () => false));
      return parents.get(parent);
    }
    await concurrentMap(tracks, async track => {
      const cached = availabilityCache.get(track.sourcePath);
      if (!force && cached && Date.now() - cached.at < availabilityTtl) return;
      let stat = null;
      try {
        const current = await fs.promises.lstat(track.sourcePath);
        if (mediaPolicy.allows(track.sourcePath) && current.isFile() && !current.isSymbolicLink() && await safeParent(track.sourcePath)) stat = current;
      } catch {}
      if(Boolean(cached?.stat)!==Boolean(stat)||cached?.stat?.size!==stat?.size)availabilityRevision++;
      availabilityCache.set(track.sourcePath, { at: Date.now(), stat });
    });
  }
  for (const value of Object.values(bounds)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid music limit.");
  }

  function readStore(file, initial, valid) {
    let raw;
    try { raw = fs.readFileSync(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return initial(); throw error; }
    const value = JSON.parse(raw);
    if (!valid(value)) throw new Error("Invalid music data.");
    return value;
  }

  function catalog() {
    return readStore(catalogFile, () => ({ version: 1, tracks: [] }), value =>
      value && value.version === 1 && Array.isArray(value.tracks) && value.tracks.every(track =>
        track && typeof track.id === "string" && typeof track.sourcePath === "string" &&
        path.isAbsolute(track.sourcePath) && typeof track.title === "string" &&
        Object.hasOwn(AUDIO_TYPES, track.extension)));
  }

  function preferences() {
    return readStore(preferencesFile, () => ({ version: 1, users: {} }), value =>
      value && value.version === 1 && value.users && typeof value.users === "object" && !Array.isArray(value.users));
  }

  function writeAtomic(file, value) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporary = file + "." + crypto.randomUUID() + ".tmp";
    let fd;
    try {
      fd = fs.openSync(temporary, "wx", 0o600);
      fs.writeFileSync(fd, JSON.stringify(value, null, 2), "utf8");
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(temporary, file);
    } finally {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
      try { fs.unlinkSync(temporary); } catch {}
    }
  }

  function absoluteExisting(value, expectDirectory = false) {
    if (typeof value !== "string" || !value || value.length > 32767 || value.includes("\0") || !path.isAbsolute(value) || !mediaPolicy.allows(value)) {
      fail(400, "Indiquez un chemin absolu valide sur l’ordinateur principal ou le NAS.");
    }
    try {
      const first = fs.lstatSync(value);
      if (first.isSymbolicLink() || (expectDirectory ? !first.isDirectory() : !first.isFile())) {
        fail(400, expectDirectory ? "Le dossier doit être accessible et ne pas être un lien." : "Le fichier doit être accessible et ne pas être un lien.");
      }
      const absolute = fs.realpathSync(value);
      if (!mediaPolicy.allows(absolute) || sourceKey(absolute) !== sourceKey(path.resolve(value))) fail(400, "Le chemin doit rester dans le stockage autorisé et ne pas contenir de lien.");
      const extension = path.extname(absolute).toLowerCase();
      if (!expectDirectory && !Object.hasOwn(AUDIO_TYPES, extension)) fail(400, "Ce format audio n’est pas accepté.");
      return { sourcePath: absolute, extension, size: first.size };
    } catch (error) {
      if (error.status) throw error;
      fail(400, expectDirectory ? "Ce dossier est introuvable ou inaccessible." : "Ce fichier est introuvable ou inaccessible.");
    }
  }

  function sourceKey(sourcePath) {
    return process.platform === "win32" ? sourcePath.toLowerCase() : sourcePath;
  }

  function availableFile(track) {
    if (!mediaPolicy.allows(track.sourcePath)) return null;
    try {
      const stat = fs.lstatSync(track.sourcePath);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      if (process.env.JMH_SERVER_TYPE === "nas" && typeof track.size === "number" && stat.size < track.size) return null;
      if (sourceKey(fs.realpathSync(track.sourcePath)) !== sourceKey(track.sourcePath)) return null;
      return stat;
    } catch { return null; }
  }

  function preferenceKey(user) {
    return "user:" + String(user.id ?? user.username);
  }

  // 7.5 : pochettes automatiques avec l'outil YouTube du NAS (yt-dlp). Désactivables avec JMH_MUSIC_COVERS=off.
  const ytBinary=path.join(__dirname,"vendor","yt-dlp_linux");
  const search=coverSearch||(process.env.JMH_MUSIC_COVERS!=="off"&&process.env.JMH_SERVER_TYPE==="nas"&&process.platform==="linux"&&fs.existsSync(ytBinary)?require("./music-covers").youtubeSearch({binary:ytBinary,home:path.join(path.dirname(DATA_DIR),"download-cache")}):null);
  const covers=search?require("./music-covers").createMusicCoverService({DATA_DIR,search,tracks:()=>{try{return catalog().tracks.filter(track=>!isModerated(track.sourcePath));}catch{return [];}},log:message=>console.warn("[musique] "+message)}):null;
  if(covers)covers.start();
  const durationIndex=require("./music-durations").createMusicDurationIndex({file:path.join(DATA_DIR,"music-durations.json"),enabled:browserTranscoder?.available===true,describe:file=>browserTranscoder.describe(file),valid:track=>Boolean(availableFile(track))});

  function publicTrack(track, user, allPreferences = preferences(), refreshedBatch = false) {
    const cached = availabilityCache.get(track.sourcePath);
    const candidate = refreshedBatch ? (cached ? cached.stat : (mediaPolicy.allows(track.sourcePath)?{size:track.size}:null)) : availableFile(track);
    const stat = candidate && process.env.JMH_SERVER_TYPE === "nas" && typeof track.size === "number" && candidate.size < track.size ? null : candidate;
    const own = allPreferences.users[preferenceKey(user)]?.tracks?.[track.id] || {};
    const result = {
      id: track.id, title: track.title, artist: track.artist || "Artiste inconnu", album: track.album || "Album inconnu", genre: track.genre || "À classer",
      year: track.year ?? null, description: track.description || "", addedAt: track.addedAt,
      searchHint: [path.basename(track.sourcePath),path.basename(path.dirname(track.sourcePath)),path.basename(path.dirname(path.dirname(track.sourcePath)))].join(' '),
      duration: durationIndex.duration(track) || Number(own.duration) || 0, durationPending:durationIndex.pending(track),
      size: stat ? stat.size : track.size, extension: track.extension,
      playable: INLINE_TYPES.has(track.extension), available: Boolean(stat),
      favorite: own.favorite === true,
      progress: { position: Number(own.position) || 0, duration: Number(own.duration) || 0 }
    };
    if (browserTranscoder?.available) {
      result.browserPlayable = Boolean(stat);
      result.browserStreamUrl = "/api/music/tracks/" + encodeURIComponent(track.id) + "/browser-stream";
    }
    if (user.role === "admin") result.sourcePath = track.sourcePath;
    return result;
  }

  function findTrack(id, store = catalog()) {
    const track = store.tracks.find(item => item.id === id);
    if (!track) fail(404, "Morceau introuvable.");
    if(isModerated(track.sourcePath))fail(451,'Cet élément a été censuré par le Propriétaire. Consulte le motif dans Mon compte.');
    return track;
  }

  function deriveMetadata(file) {
    const tags = file.tags || {};
    const filename = path.basename(file.sourcePath, path.extname(file.sourcePath)).replace(/[._]+/g, " ").trim();
    const split = /^(.*?)\s+-\s+(.+)$/.exec(filename);
    const folder = path.basename(path.dirname(file.sourcePath));
    const genericFolder = /^(?:music|musique|musiques|audio|medias|médias|tracks|titres|test|nas)$/i.test(folder);
    return {
      title: (tags.title || (split ? split[2] : filename) || "Sans titre").slice(0, 180),
      artist: (tags.artist || (split ? split[1] : "Artiste inconnu")).slice(0, 180),
      album: (tags.album || (!genericFolder && folder ? folder : "Album inconnu")).slice(0, 180),
      genre: tags.genre || "À classer", year: tags.year || null
    };
  }

  async function importReferences(files, user) {
    const known = new Set(catalog().tracks.map(track => sourceKey(track.sourcePath)));
    const taggedFiles = await concurrentMap(files, async file => ({ ...file, tags: known.has(sourceKey(file.sourcePath)) ? {} : await readMusicMetadata(file.sourcePath) }));
    const store = catalog();
    const existing = new Map(store.tracks.map(track => [sourceKey(track.sourcePath), track]));
    const selected = new Map();
    let imported = 0;
    let duplicates = 0;
    for (const file of taggedFiles) {
      availabilityCache.set(file.sourcePath, { at: Date.now(), stat: { size: file.size } });
      const key = sourceKey(file.sourcePath);
      let track = existing.get(key);
      if (track) duplicates++;
      else {
        track = {
          id: crypto.randomUUID(), sourcePath: file.sourcePath,
          ...deriveMetadata(file),
          description: "",
          addedAt: new Date().toISOString(), size: file.size, extension: file.extension
        };
        store.tracks.push(track);
        existing.set(key, track);
        imported++;
      }
      selected.set(track.id, track);
    }
    if (imported) writeAtomic(catalogFile, store);
    const own = preferences();
    return { imported, duplicates, tracks: [...selected.values()].map(track => publicTrack(track, user, own)) };
  }

  async function scanFolder(folder) {
    const files = [];
    const pending = [{ folder, depth: 0 }];
    const started = Date.now();
    let scanned = 0;
    let directories = 0;
    let skipped = 0;
    let truncated = false;
    outer: while (pending.length) {
      if (directories >= bounds.maxScanDirectories || Date.now() - started >= bounds.maxScanMilliseconds) { truncated = true; break; }
      const current = pending.shift();
      directories++;
      let entries;
      try { entries = (await fs.promises.readdir(current.folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name)); }
      catch { skipped++; continue; }
      for (const entry of entries) {
        if (scanned >= bounds.maxScanEntries || files.length >= bounds.maxScanVideos || Date.now() - started >= bounds.maxScanMilliseconds) { truncated = true; break outer; }
        scanned++;
        if(/sensible/i.test(entry.name)) { skipped++; continue; }
        const full = path.join(current.folder, entry.name);
        let stat;
        try { stat = await fs.promises.lstat(full); } catch { skipped++; continue; }
        if (stat.isSymbolicLink()) { skipped++; continue; }
        if (stat.isDirectory()) {
          if (current.depth < bounds.maxScanDepth && pending.length < bounds.maxScanDirectories) pending.push({ folder: full, depth: current.depth + 1 });
          else { skipped++; truncated = true; }
        } else if (stat.isFile() && Object.hasOwn(AUDIO_TYPES, path.extname(entry.name).toLowerCase())) {
          try { files.push({ sourcePath: await fs.promises.realpath(full), extension: path.extname(full).toLowerCase(), size: stat.size }); } catch { skipped++; }
        } else skipped++;
      }
    }
    return { files, scanned, skipped, truncated };
  }

  router.use(requireAuth);
  if (requirePermission) router.use(requirePermission("canAccessStorage", "Votre compte n’a pas accès à la bibliothèque musicale."));
  else router.use((req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "Non connecté." });
    if (user.role !== "admin" && user.permissions?.canAccessStorage === false) return res.status(403).json({ error: "Accès à la musique non autorisé." });
    next();
  });

  router.get("/catalog", asyncRoute(async (req, res) => {
    const store = catalog();durationIndex.schedule(store.tracks);
    if(req.query.refresh==='1'){if(availabilityRefreshPending)await availabilityRefreshPending;await refreshAvailability(store.tracks,true);}else if(!availabilityRefreshPending)availabilityRefreshPending=refreshAvailability(store.tracks).catch(()=>{}).finally(()=>{availabilityRefreshPending=null;});
    const own = preferences();
    const tracks = store.tracks.filter(track=>!isModerated(track.sourcePath)).map(track => publicTrack(track, req.session.user, own, true));
    const unique = field => [...new Set(tracks.map(track => track[field]))].sort((a, b) => a.localeCompare(b, "fr"));
    const stamp=file=>{try{const st=fs.statSync(file);return st.mtimeMs+":"+st.size;}catch{return "missing";}};
    await catalogResponse(req,res,{key:[req.session.user.id,req.session.user.role,stamp(catalogFile),crypto.createHash("sha256").update(JSON.stringify(own.users[preferenceKey(req.session.user)]||{})).digest("hex"),durationIndex.revision(),availabilityRevision,Math.floor(Date.now()/availabilityTtl)].join(":"),data:{tracks,genres:unique("genre"),artists:unique("artist"),albums:unique("album"),playlists:own.users[preferenceKey(req.session.user)]?.playlists||[]}});
  }));

  router.get("/durations",asyncRoute(async(req,res)=>{const ids=String(req.query.ids||'').split(',').filter(Boolean).slice(0,60),byId=new Map(catalog().tracks.map(t=>[String(t.id),t])),tracks=ids.map(id=>byId.get(id)).filter(Boolean);durationIndex.schedule(tracks,true);const own=preferences();res.set('Cache-Control','private, no-store').json({durations:Object.fromEntries(tracks.map(t=>[t.id,durationIndex.duration(t)||Number(own.users[preferenceKey(req.session.user)]?.tracks?.[t.id]?.duration)||0])),pending:tracks.some(t=>durationIndex.pending(t))});}));
  router.get("/tracks/:id", asyncRoute(async (req, res) => {
    const registered=findTrack(req.params.id),track = publicTrack(registered, req.session.user);
    if(track.available&&browserTranscoder?.available)track.mediaDuration=(await browserTranscoder.describe(registered.sourcePath)).duration;
    if (req.session.user.role === "admin" && track.available) {
      const clientPath = mediaPolicy.clientPath(track.sourcePath);
      if (clientPath) track.clientPath = clientPath;
    }
    if(track.mediaDuration)durationIndex.remember(registered,track.mediaDuration);res.json({ track });
  }));

  router.post("/import", requireAdmin, asyncRoute(async (req, res) => {
    const paths = req.body?.paths;
    if (!Array.isArray(paths) || !paths.length || paths.length > bounds.maxPaths) fail(400, "Sélectionnez entre 1 et " + bounds.maxPaths + " fichiers audio.");
    const files = paths.map(value => absoluteExisting(value));
    res.json(await importReferences(files, req.session.user));
  }));

  router.post("/import-folder", requireAdmin, asyncRoute(async (req, res) => {
    const folder = absoluteExisting(req.body?.path, true).sourcePath;
    const result = await scanFolder(folder);
    res.json({ ...await importReferences(result.files, req.session.user), scanned: result.scanned, skipped: result.skipped, truncated: result.truncated });
  }));

  router.patch("/tracks/:id", requireAdmin, (req, res) => {
    const fields = req.body;
    if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length ||
        Object.keys(fields).some(key => !["title", "artist", "album", "genre", "year", "description"].includes(key))) fail(400, "Métadonnées invalides.");
    const next = {};
    for (const [key, maxLength] of [["title", 180], ["artist", 180], ["album", 180], ["genre", 80], ["description", 4000]]) {
      if (!Object.hasOwn(fields, key)) continue;
      if (typeof fields[key] !== "string" || fields[key].trim().length > maxLength || (key === "title" && !fields[key].trim())) fail(400, "Le champ " + key + " est invalide.");
      next[key] = fields[key].trim();
      if (!next[key]) { if (key === "genre") next[key] = "À classer"; if (key === "artist") next[key] = "Artiste inconnu"; if (key === "album") next[key] = "Album inconnu"; }
    }
    if (Object.hasOwn(fields, "year")) {
      if (fields.year !== null && (!Number.isInteger(fields.year) || fields.year < 1888 || fields.year > 2100)) fail(400, "L’année doit être un nombre entre 1888 et 2100.");
      next.year = fields.year;
    }
    const store = catalog();
    const track = findTrack(req.params.id, store);
    Object.assign(track, next);
    writeAtomic(catalogFile, store);
    res.json({ track: publicTrack(track, req.session.user) });
  });

  function updatePreference(req, res, update) {
    const track = findTrack(req.params.id);
    const store = preferences();
    const key = preferenceKey(req.session.user);
    if (!Object.hasOwn(store.users, key)) store.users[key] = { tracks: {} };
    const account = store.users[key];
    if (!account.tracks || typeof account.tracks !== "object" || Array.isArray(account.tracks)) throw new Error("Invalid music preferences.");
    const previous = Object.hasOwn(account.tracks, track.id) ? account.tracks[track.id] : {};
    account.tracks[track.id] = { ...previous, ...update, updatedAt: new Date().toISOString() };
    writeAtomic(preferencesFile, store);
    res.json({ track: publicTrack(track, req.session.user, store) });
  }

  router.post("/tracks/:id/favorite", (req, res) => {
    if (typeof req.body?.favorite !== "boolean") fail(400, "Indiquez si le morceau est favori.");
    updatePreference(req, res, { favorite: req.body.favorite });
  });

  router.put("/tracks/:id/progress", (req, res) => {
    const { position, duration } = req.body || {};
    if (!Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration < 0 ||
        position > duration || duration > 7 * 24 * 60 * 60) fail(400, "La position de lecture est invalide.");
    updatePreference(req, res, { position, duration });
  });

  function ownAccount(store, user) {
    const key = preferenceKey(user);
    if (!Object.hasOwn(store.users, key)) store.users[key] = { tracks: {}, playlists: [] };
    const account = store.users[key];
    if (!Array.isArray(account.playlists)) account.playlists = [];
    return account;
  }
  function playlistName(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 100) fail(400, "Le nom de playlist doit contenir entre 1 et 100 caractères.");
    return value.trim();
  }
  router.post("/playlists", (req, res) => {
    const name = playlistName(req.body?.name);
    const store = preferences();
    const account = ownAccount(store, req.session.user);
    if (account.playlists.length >= 200) fail(400, "La limite de playlists est atteinte.");
    const playlist = { id: crypto.randomUUID(), name, trackIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    account.playlists.push(playlist);
    writeAtomic(preferencesFile, store);
    res.status(201).json({ playlist });
  });
  router.patch("/playlists/:id", (req, res) => {
    const fields = req.body;
    if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length || Object.keys(fields).some(key => !["name", "trackIds"].includes(key))) fail(400, "Playlist invalide.");
    const next = {};
    if (Object.hasOwn(fields, "name")) next.name = playlistName(fields.name);
    if (Object.hasOwn(fields, "trackIds")) {
      if (!Array.isArray(fields.trackIds) || fields.trackIds.length > 50000 || fields.trackIds.some(id => typeof id !== "string")) fail(400, "Liste de morceaux invalide.");
      const existing = new Set(catalog().tracks.map(track => track.id));
      if (fields.trackIds.some(id => !existing.has(id))) fail(400, "Un morceau de cette playlist est introuvable.");
      next.trackIds = [...new Set(fields.trackIds)];
    }
    const store = preferences();
    const playlist = ownAccount(store, req.session.user).playlists.find(item => item.id === req.params.id);
    if (!playlist) fail(404, "Playlist introuvable.");
    Object.assign(playlist, next, { updatedAt: new Date().toISOString() });
    writeAtomic(preferencesFile, store);
    res.json({ playlist });
  });
  router.delete("/playlists/:id", (req, res) => {
    const store = preferences();
    const account = ownAccount(store, req.session.user);
    const index = account.playlists.findIndex(item => item.id === req.params.id);
    if (index < 0) fail(404, "Playlist introuvable.");
    account.playlists.splice(index, 1);
    writeAtomic(preferencesFile, store);
    res.json({ ok: true });
  });

  router.get("/tracks/:id/browser-stream", (req, res, next) => {
    const track = findTrack(req.params.id);
    if (!availableFile(track)) fail(404, "Ce fichier audio n’est plus accessible.");
    if (!browserTranscoder) return res.status(503).json({ error: "Le transcodage du NAS n’est pas configuré." });
    return browserTranscoder.stream(req, res, { kind: "music", file: track.sourcePath }).catch(next);
  });

  router.post('/tracks/:id/prepare',(req,res,next)=>{(async()=>{const track=findTrack(req.params.id);if(!availableFile(track))fail(404,'Musique inaccessible.');if(!browserTranscoder?.cache)return res.status(503).json({error:'Préparation indisponible.'});const input=require('./playback-cache').options(req.body,'music'),job=await browserTranscoder.cache.prepare(track.sourcePath,'music',{...input,retry:req.body?.retry===true}),query=new URLSearchParams({quality:input.quality,audio:input.audio,dialogue:input.dialogue?'1':'0',eq:JSON.stringify(input.eq)});res.set('Cache-Control','no-store').status(job.ready?200:202).json({...job,streamUrl:job.ready?'/api/music/tracks/'+encodeURIComponent(track.id)+'/prepared-stream?'+query:null});})().catch(next);});
  router.get('/tracks/:id/prepared-stream',(req,res,next)=>{(async()=>{const track=findTrack(req.params.id);if(!availableFile(track))fail(404,'Musique inaccessible.');if(!browserTranscoder?.cache)return res.status(503).json({error:'Préparation indisponible.'});const input={...req.query};if(input.eq!==undefined){if(typeof input.eq!=='string'||input.eq.length>300)fail(400,'Égaliseur invalide.');try{input.eq=JSON.parse(input.eq);}catch{fail(400,'Égaliseur invalide.');}}await browserTranscoder.cache.stream(req,res,{file:track.sourcePath,kind:'music',input});})().catch(next);});

  router.get("/tracks/:id/stream", (req, res) => {
    const track = findTrack(req.params.id);
    const stat = availableFile(track);
    if (!stat) fail(404, "Ce fichier audio n’est plus accessible.");
    const size = stat.size;
    res.set({ "Accept-Ranges": "bytes", "Content-Type": AUDIO_TYPES[track.extension],
      "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
    let start = 0;
    let end = size - 1;
    const range = req.headers.range;
    if (range !== undefined) {
      const match = typeof range === "string" && /^bytes=(\d*)-(\d*)$/.exec(range);
      let valid = Boolean(match && (match[1] || match[2]) && size > 0);
      if (valid && !match[1]) {
        const suffix = Number(match[2]);
        valid = Number.isSafeInteger(suffix) && suffix > 0;
        start = Math.max(0, size - suffix);
      } else if (valid) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : size - 1;
        valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < size && end >= start;
        end = Math.min(end, size - 1);
      }
      if (!valid) return res.status(416).set("Content-Range", "bytes */" + size).end();
      res.status(206).set("Content-Range", "bytes " + start + "-" + end + "/" + size);
    }
    res.set("Content-Length", String(size ? end - start + 1 : 0));
    if (req.method === "HEAD" || !size) return res.end();
    const stream = fs.createReadStream(track.sourcePath, { start, end });
    stream.on("error", () => {
      if (res.headersSent) res.destroy();
      else { res.removeHeader("Content-Length"); res.status(404).end(); }
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });

  router.get("/tracks/:id/download", (req, res) => {
    const track = findTrack(req.params.id);
    if (!availableFile(track)) fail(404, "Ce fichier audio n’est plus accessible.");
    res.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
    res.download(track.sourcePath, path.basename(track.sourcePath), error => {
      if (!error) return;
      if (res.headersSent) res.destroy();
      else res.status(404).end();
    });
  });

  router.get("/tracks/:id/cover", asyncRoute(async (req, res) => {
    const track = findTrack(req.params.id);
    const send = (file, type) => {
      res.set({ "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" });
      return res.sendFile(file, error => { if (error) { if (res.headersSent) res.destroy(); else res.status(404).end(); } });
    };
    // Une image posée dans le dossier de l'album (cover.jpg, folder.jpg…) reste prioritaire.
    const folder = path.dirname(track.sourcePath);
    const directory = availableFile(track) ? await fs.promises.lstat(folder).catch(() => null) : null;
    if (directory && directory.isDirectory() && !directory.isSymbolicLink() &&
        sourceKey(await fs.promises.realpath(folder).catch(() => "")) === sourceKey(folder)) {
      for (const name of ["cover.jpg", "cover.jpeg", "cover.png", "folder.jpg", "folder.png", "front.jpg", "front.png"]) {
        const file = path.join(folder, name);
        const stat = await fs.promises.lstat(file).catch(() => null);
        if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024) continue;
        return send(file, path.extname(file).toLowerCase() === ".png" ? "image/png" : "image/jpeg");
      }
    }
    const automatic = covers?.file(track);
    if (automatic) return send(automatic.path, automatic.mime);
    res.status(404).end();
  }));

  // Pochettes automatiques : état, relance et correction (administrateur) ; les titres visibles passent en priorité.
  router.get("/covers/status", requireAdmin, (req, res) => res.set("Cache-Control", "no-store").json(covers ? covers.summary() : { enabled: false }));
  router.post("/covers/refresh", requireAdmin, (req, res) => {
    if (!covers) return res.status(503).json({ error: "La recherche des pochettes fonctionne sur le serveur NAS." });
    void covers.run({ force: req.body?.force === true }).catch(() => {});
    res.status(202).json({ ok: true });
  });
  router.post("/covers/want", (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length > 60 || ids.some(id => typeof id !== "string" || id.length > 80)) fail(400, "Liste de titres invalide.");
    if (covers) covers.want(ids);
    res.status(202).json({ ok: true });
  });
  router.delete("/tracks/:id/cover", requireAdmin, (req, res) => {
    if (!covers) fail(503, "La recherche des pochettes fonctionne sur le serveur NAS.");
    covers.reject(findTrack(req.params.id)); res.json({ ok: true });
  });
  router.post("/tracks/:id/cover/retry", requireAdmin, (req, res) => {
    if (!covers) fail(503, "La recherche des pochettes fonctionne sur le serveur NAS.");
    covers.retry(findTrack(req.params.id)); res.status(202).json({ ok: true });
  });

  router.get('/overview', (req, res) => {
    const store=catalog(), all=preferences(), account=all.users[preferenceKey(req.session.user)]||{}, own=account.tracks||{};
    store.tracks=store.tracks.filter(track=>!isModerated(track.sourcePath));
    const recent=[...store.tracks].sort((a,b)=>(Date.parse(b.addedAt)||0)-(Date.parse(a.addedAt)||0));
    const clean=item=>{const {sourcePath,...safe}=publicTrack(item,req.session.user,all);return safe;};
    res.json({total:store.tracks.length,artists:new Set(store.tracks.map(x=>x.artist)).size,albums:new Set(store.tracks.map(x=>(x.artist||'')+'\0'+(x.album||''))).size,
      favorites:store.tracks.filter(x=>own[x.id]?.favorite).length,playlists:(account.playlists||[]).length,
      recent:recent.slice(0,6).map(clean),favoriteTracks:recent.filter(x=>own[x.id]?.favorite).slice(0,6).map(clean)});
  });
  const equalizerDefaults=()=>({enabled:false,bass:0,mid:0,treble:0});
  router.get('/equalizer', (req,res)=>{const value=preferences().users[preferenceKey(req.session.user)]?.equalizer;res.json({configured:Boolean(value),equalizer:value||equalizerDefaults()});});
  router.put('/equalizer', (req,res)=>{
    const values=req.body;
    if(!values||typeof values.enabled!=='boolean'||['bass','mid','treble'].some(key=>typeof values[key]!=='number'||!Number.isFinite(values[key])||values[key]<-12||values[key]>12))return res.status(400).json({error:'Réglages audio invalides.'});
    const store=preferences(), account=ownAccount(store,req.session.user);account.equalizer={enabled:values.enabled,bass:values.bass,mid:values.mid,treble:values.treble};writeAtomic(preferencesFile,store);res.json({equalizer:account.equalizer});
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : "La bibliothèque musicale est inaccessible. Réessayez après vérification du stockage." });
  });
  router.importDownloadedFile=(file,user)=>importReferences([absoluteExisting(file)],user);
  router.covers=covers;
  return router;
}

module.exports = { createMusicRouter, AUDIO_TYPES, DEFAULT_LIMITS };
