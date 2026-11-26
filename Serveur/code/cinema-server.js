const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createNasMediaPolicy } = require("./media-paths");
const { createPosterService, cleanTitle } = require("./cinema-posters");

const VIDEO_TYPES = Object.freeze({
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
  ".ogv": "video/ogg", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
  ".mov": "video/quicktime", ".mpeg": "video/mpeg", ".mpg": "video/mpeg",
  ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv", ".ts": "video/mp2t", ".m2ts": "video/mp2t"
});
const INLINE_TYPES = new Set([".mp4", ".m4v", ".webm", ".ogv"]);
const DEFAULT_LIMITS = Object.freeze({
  maxPaths: 200, maxScanEntries: 5000, maxScanVideos: 500,
  maxScanDepth: 8, maxScanDirectories: 300, maxScanMilliseconds: 10000
});

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function createCinemaRouter({ express = require("express"), DATA_DIR, requireAuth, requireAdmin, requirePermission, limits = {}, browserTranscoder , isModerated=()=>false, posterFetch, autoPosters = process.env.JMH_SERVER_TYPE === "nas" || process.env.JMH_POSTERS === "on"}) {
  if (!DATA_DIR || !path.isAbsolute(DATA_DIR)) throw new Error("Cinema DATA_DIR must be absolute.");
  const router = express.Router();
  const mediaPolicy = createNasMediaPolicy();
  const catalogFile = path.join(DATA_DIR, "cinema_catalog.json");
  const preferencesFile = path.join(DATA_DIR, "cinema_preferences.json");
  const bounds = { ...DEFAULT_LIMITS, ...limits };
  for (const value of Object.values(bounds)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid cinema limit.");
  }

  function readStore(file, initial, valid) {
    let raw;
    try { raw = fs.readFileSync(file, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return initial(); throw error; }
    const value = JSON.parse(raw);
    if (!valid(value)) throw new Error("Invalid cinema data.");
    return value;
  }

  function catalog() {
    return readStore(catalogFile, () => ({ version: 1, movies: [] }), value =>
      value && value.version === 1 && Array.isArray(value.movies) && value.movies.every(movie =>
        movie && typeof movie.id === "string" && typeof movie.sourcePath === "string" &&
        path.isAbsolute(movie.sourcePath) && typeof movie.title === "string" &&
        Object.hasOwn(VIDEO_TYPES, movie.extension)));
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
      if (!expectDirectory && !Object.hasOwn(VIDEO_TYPES, extension)) fail(400, "Ce format vidéo n’est pas accepté.");
      return { sourcePath: absolute, extension, size: first.size };
    } catch (error) {
      if (error.status) throw error;
      fail(400, expectDirectory ? "Ce dossier est introuvable ou inaccessible." : "Ce fichier est introuvable ou inaccessible.");
    }
  }

  function sourceKey(sourcePath) {
    return process.platform === "win32" ? sourcePath.toLowerCase() : sourcePath;
  }

  function availableFile(movie) {
    if (!mediaPolicy.allows(movie.sourcePath)) return null;
    try {
      const stat = fs.lstatSync(movie.sourcePath);
      if (!stat.isFile() || stat.isSymbolicLink()) return null;
      if (process.env.JMH_SERVER_TYPE === "nas" && typeof movie.size === "number" && stat.size < movie.size) return null;
      if (sourceKey(fs.realpathSync(movie.sourcePath)) !== sourceKey(movie.sourcePath)) return null;
      return stat;
    } catch { return null; }
  }

  function preferenceKey(user) {
    return "user:" + String(user.id ?? user.username);
  }

  const movieAvailability=new Map();let movieRefreshPending=null;
  function publicMovie(movie, user, allPreferences = preferences(),optimistic=false) {
    const cached=movieAvailability.get(movie.sourcePath);const stat = optimistic ? (cached ? cached.stat : (mediaPolicy.allows(movie.sourcePath)?{size:movie.size}:null)) : availableFile(movie);
    const own = allPreferences.users[preferenceKey(user)]?.movies?.[movie.id] || {};
    const result = {
      id: movie.id, title: movie.title, genre: movie.genre || "À classer",
      year: movie.year ?? null, description: movie.description || "", addedAt: movie.addedAt,
      size: stat ? stat.size : movie.size, extension: movie.extension,
      playable: INLINE_TYPES.has(movie.extension), available: Boolean(stat),
      favorite: own.favorite === true,
      progress: { position: Number(own.position) || 0, duration: Number(own.duration) || 0 }
    };
    if (browserTranscoder?.available) {
      result.browserPlayable = Boolean(stat);
      result.browserStreamUrl = "/api/cinema/movies/" + encodeURIComponent(movie.id) + "/browser-stream";
    }
    if (user.role === "admin") result.sourcePath = movie.sourcePath;
    return result;
  }

  function findMovie(id, store = catalog()) {
    const movie = store.movies.find(item => item.id === id);
    if (!movie) fail(404, "Film introuvable.");
    if(isModerated(movie.sourcePath))fail(451,'Cet élément a été censuré par le Propriétaire. Consulte le motif dans Mon compte.');
    return movie;
  }

  // 7.4 : pochettes automatiques (voir cinema-posters.js). Une image posée à côté du film reste toujours prioritaire.
  const LOCAL_POSTER_NAMES = ["poster", "cover", "folder", "backdrop"];
  async function hasLocalPoster(movie) {
    const folder = path.dirname(movie.sourcePath), stem = path.basename(movie.sourcePath, path.extname(movie.sourcePath));
    for (const name of [stem, ...LOCAL_POSTER_NAMES]) for (const extension of [".jpg", ".jpeg", ".png"]) {
      try { const stat = await fs.promises.lstat(path.join(folder, name + extension)); if (stat.isFile() && !stat.isSymbolicLink()) return true; } catch {}
    }
    return false;
  }
  const posters = createPosterService({ DATA_DIR, movies: () => catalog().movies.filter(movie => !isModerated(movie.sourcePath)), fetchImpl: posterFetch || globalThis.fetch,
    log: message => console.warn("[JMH] " + message) });
  const searchPosters = (options = {}) => { if (autoPosters) void posters.run({ ...options, hasLocal: hasLocalPoster }).catch(error => console.warn("[JMH] pochettes : " + error.message)); };
  if (autoPosters) posters.start(hasLocalPoster);

  function importReferences(files, user, genre = "À classer") {
    const store = catalog();
    const existing = new Map(store.movies.map(movie => [sourceKey(movie.sourcePath), movie]));
    const selected = new Map();
    let imported = 0;
    let duplicates = 0;
    for (const file of files) {
      const key = sourceKey(file.sourcePath);
      let movie = existing.get(key);
      if (movie) duplicates++;
      else {
        // « Le.Film.2019.1080p.BluRay.x264 » devient « Le Film » (2019) : titre propre pour l'affichage et la pochette.
        const named = cleanTitle(path.basename(file.sourcePath, path.extname(file.sourcePath)));
        movie = {
          id: crypto.randomUUID(), sourcePath: file.sourcePath,
          title: named.title.slice(0, 180) || "Sans titre",
          genre, year: named.year, description: "",
          addedAt: new Date().toISOString(), size: file.size, extension: file.extension
        };
        store.movies.push(movie);
        existing.set(key, movie);
        imported++;
      }
      selected.set(movie.id, movie);
    }
    if (imported) { writeAtomic(catalogFile, store); searchPosters(); }
    const own = preferences();
    return { imported, duplicates, movies: [...selected.values()].map(movie => publicMovie(movie, user, own)) };
  }

  function scanFolder(folder) {
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
      try { entries = fs.readdirSync(current.folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
      catch { skipped++; continue; }
      for (const entry of entries) {
        if (scanned >= bounds.maxScanEntries || files.length >= bounds.maxScanVideos || Date.now() - started >= bounds.maxScanMilliseconds) { truncated = true; break outer; }
        scanned++;
        if(/sensible/i.test(entry.name)) { skipped++; continue; }
        const full = path.join(current.folder, entry.name);
        let stat;
        try { stat = fs.lstatSync(full); } catch { skipped++; continue; }
        if (stat.isSymbolicLink()) { skipped++; continue; }
        if (stat.isDirectory()) {
          if (current.depth < bounds.maxScanDepth && pending.length < bounds.maxScanDirectories) pending.push({ folder: full, depth: current.depth + 1 });
          else { skipped++; truncated = true; }
        } else if (stat.isFile() && Object.hasOwn(VIDEO_TYPES, path.extname(entry.name).toLowerCase())) {
          try { files.push(absoluteExisting(full)); } catch { skipped++; }
        } else skipped++;
      }
    }
    return { files, scanned, skipped, truncated };
  }

  router.use(requireAuth);
  if (requirePermission) router.use(requirePermission("canAccessStorage", "Votre compte n’a pas accès à la bibliothèque cinéma."));
  else router.use((req, res, next) => {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: "Non connecté." });
    if (user.role !== "admin" && user.permissions?.canAccessStorage === false) return res.status(403).json({ error: "Accès cinéma non autorisé." });
    next();
  });

  const warmState={enabled:process.env.JMH_SERVER_TYPE==='nas',checked:0,total:0,ready:0,direct:0,failed:0,current:null};let warmIndex=0;
  async function warmNext(){if(!warmState.enabled||!browserTranscoder?.available||!browserTranscoder.cache||browserTranscoder.cache.isBusy())return;const movies=catalog().movies;warmState.total=movies.length;if(warmIndex>=movies.length){warmIndex=0;warmState.checked=0;warmState.ready=0;warmState.direct=0;warmState.failed=0;}if(!movies.length)return;const movie=movies[warmIndex++];warmState.checked=warmIndex;warmState.current=movie.title;try{if(!availableFile(movie))return;const media=await browserTranscoder.describe(movie.sourcePath);const direct=INLINE_TYPES.has(movie.extension)&&((media.codec==='h264'&&(!media.audio?.[0]?.codec||['aac','mp3'].includes(media.audio[0].codec)))||(['vp8','vp9','av1'].includes(media.codec)&&(!media.audio?.[0]?.codec||['opus','vorbis','aac'].includes(media.audio[0].codec))));if(direct){warmState.direct++;return;}const quality=media.height>1080?'720':'original',input={quality,audio:0,dialogue:false};const status=await browserTranscoder.cache.status(movie.sourcePath,'cinema',input);if(status.ready){warmState.ready++;return;}if(status.status==='failed'){warmState.failed++;return;}await browserTranscoder.cache.prepare(movie.sourcePath,'cinema',{...input,background:true});}catch{warmState.failed++;}}
  if(warmState.enabled){const timer=setInterval(()=>void warmNext(),15000);timer.unref();const first=setTimeout(()=>void warmNext(),5000);first.unref();}
  router.get('/preparation',requireAdmin,(req,res)=>res.set('Cache-Control','no-store').json(warmState));
  async function refreshMovies(movies,force=false){let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<movies.length){const movie=movies[cursor++],previous=movieAvailability.get(movie.sourcePath);if(!force&&previous&&Date.now()-previous.at<300000)continue;let stat=null;try{const candidate=await fs.promises.lstat(movie.sourcePath);if(candidate.isFile()&&!candidate.isSymbolicLink()&&mediaPolicy.allows(movie.sourcePath)&&await fs.promises.realpath(movie.sourcePath)===movie.sourcePath&&candidate.size>=movie.size)stat=candidate;}catch{}movieAvailability.set(movie.sourcePath,{at:Date.now(),stat});}}));}
  router.get('/catalog',(req,res,next)=>{(async()=>{
    const own=preferences(),store=catalog();if(req.query.refresh==='1'){if(movieRefreshPending)await movieRefreshPending;await refreshMovies(store.movies,true);}else if(!movieRefreshPending)movieRefreshPending=refreshMovies(store.movies).catch(()=>{}).finally(()=>{movieRefreshPending=null;});
    const movies=store.movies.filter(movie=>!isModerated(movie.sourcePath)).map(movie=>publicMovie(movie,req.session.user,own,true));res.json({movies,genres:[...new Set(movies.map(movie=>movie.genre))].sort((a,b)=>a.localeCompare(b,'fr'))});
  })().catch(next);});

  router.get("/movies/:id", (req, res, next) => { (async()=>{
    const registered=findMovie(req.params.id),movie = publicMovie(registered, req.session.user);
    if(movie.available&&browserTranscoder?.available){const media=await browserTranscoder.describe(registered.sourcePath);movie.mediaDuration=media.duration;movie.playback={width:media.width,height:media.height,codec:media.codec,qualities:media.qualities||[],audio:media.audio||[]};}
    if (req.session.user.role === "admin" && movie.available) {
      const clientPath = mediaPolicy.clientPath(movie.sourcePath);
      if (clientPath) movie.clientPath = clientPath;
    }
    res.json({ movie });
  })().catch(next); });

  router.post("/import", requireAdmin, (req, res) => {
    const paths = req.body?.paths;
    if (!Array.isArray(paths) || !paths.length || paths.length > bounds.maxPaths) fail(400, "Sélectionnez entre 1 et " + bounds.maxPaths + " fichiers vidéo.");
    const files = paths.map(value => absoluteExisting(value));
    res.json(importReferences(files, req.session.user));
  });

  router.post("/import-folder", requireAdmin, (req, res) => {
    const folder = absoluteExisting(req.body?.path, true).sourcePath;
    const result = scanFolder(folder);
    res.json({ ...importReferences(result.files, req.session.user), scanned: result.scanned, skipped: result.skipped, truncated: result.truncated });
  });

  router.patch("/movies/:id", requireAdmin, (req, res) => {
    const fields = req.body;
    if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length ||
        Object.keys(fields).some(key => !["title", "genre", "year", "description"].includes(key))) fail(400, "Métadonnées invalides.");
    const next = {};
    for (const [key, maxLength] of [["title", 180], ["genre", 80], ["description", 4000]]) {
      if (!Object.hasOwn(fields, key)) continue;
      if (typeof fields[key] !== "string" || fields[key].trim().length > maxLength || (key === "title" && !fields[key].trim())) fail(400, "Le champ " + key + " est invalide.");
      next[key] = fields[key].trim();
      if (key === "genre" && !next[key]) next[key] = "À classer";
    }
    if (Object.hasOwn(fields, "year")) {
      if (fields.year !== null && (!Number.isInteger(fields.year) || fields.year < 1888 || fields.year > 2100)) fail(400, "L’année doit être un nombre entre 1888 et 2100.");
      next.year = fields.year;
    }
    const store = catalog();
    const movie = findMovie(req.params.id, store);
    Object.assign(movie, next);
    writeAtomic(catalogFile, store);
    if (Object.hasOwn(next, "title") || Object.hasOwn(next, "year")) searchPosters();
    res.json({ movie: publicMovie(movie, req.session.user) });
  });

  // Pochettes automatiques : état, relance, clé TMDB facultative, et « ce n'est pas la bonne image ».
  router.get("/posters/status", requireAdmin, (req, res) => res.set("Cache-Control", "no-store").json({ ...posters.summary(), enabled: autoPosters }));
  router.post("/posters/refresh", requireAdmin, (req, res) => {
    if (!autoPosters) return res.status(503).json({ error: "La recherche de pochettes fonctionne sur le serveur NAS." });
    searchPosters({ force: req.body?.force === true });
    res.status(202).json({ ok: true });
  });
  router.put("/posters/settings", requireAdmin, (req, res) => {
    if (typeof req.body?.tmdbKey !== "string") fail(400, "Indiquez une clé TMDB ou laissez le champ vide.");
    posters.setTmdbKey(req.body.tmdbKey);
    searchPosters();
    res.json(posters.summary());
  });
  router.delete("/movies/:id/poster", requireAdmin, (req, res) => {
    posters.reject(findMovie(req.params.id));
    res.json({ ok: true });
  });
  router.post("/movies/:id/poster/retry", requireAdmin, (req, res) => {
    posters.forget(findMovie(req.params.id));
    searchPosters();
    res.status(202).json({ ok: true });
  });

  function updatePreference(req, res, update) {
    const movie = findMovie(req.params.id);
    const store = preferences();
    const key = preferenceKey(req.session.user);
    if (!Object.hasOwn(store.users, key)) store.users[key] = { movies: {} };
    const account = store.users[key];
    if (!account.movies || typeof account.movies !== "object" || Array.isArray(account.movies)) throw new Error("Invalid cinema preferences.");
    const previous = Object.hasOwn(account.movies, movie.id) ? account.movies[movie.id] : {};
    account.movies[movie.id] = { ...previous, ...update, updatedAt: new Date().toISOString() };
    writeAtomic(preferencesFile, store);
    res.json({ movie: publicMovie(movie, req.session.user, store) });
  }

  router.post("/movies/:id/favorite", (req, res) => {
    if (typeof req.body?.favorite !== "boolean") fail(400, "Indiquez si le film est favori.");
    updatePreference(req, res, { favorite: req.body.favorite });
  });

  router.put("/movies/:id/progress", (req, res) => {
    const { position, duration } = req.body || {};
    if (!Number.isFinite(position) || !Number.isFinite(duration) || position < 0 || duration < 0 ||
        position > duration || duration > 7 * 24 * 60 * 60) fail(400, "La position de lecture est invalide.");
    updatePreference(req, res, { position, duration });
  });

  router.get("/movies/:id/browser-stream", (req, res, next) => {
    const movie = findMovie(req.params.id);
    if (!availableFile(movie)) fail(404, "Ce fichier vidéo n’est plus accessible.");
    if (!browserTranscoder) return res.status(503).json({ error: "Le transcodage du NAS n’est pas configuré." });
    return browserTranscoder.stream(req, res, { kind: "cinema", file: movie.sourcePath }).catch(next);
  });

  router.post('/movies/:id/prepare',(req,res,next)=>{(async()=>{const movie=findMovie(req.params.id);if(!availableFile(movie))fail(404,'Film inaccessible.');if(!browserTranscoder?.cache)return res.status(503).json({error:'La préparation stable n’est pas disponible sur ce serveur.'});const input=require('./playback-cache').options(req.body,'cinema'),job=await browserTranscoder.cache.prepare(movie.sourcePath,'cinema',{...input,retry:req.body?.retry===true}),query=new URLSearchParams({quality:input.quality,audio:input.audio,dialogue:input.dialogue?'1':'0'});res.set('Cache-Control','no-store').status(job.ready?200:202).json({...job,streamUrl:job.ready?'/api/cinema/movies/'+encodeURIComponent(movie.id)+'/prepared-stream?'+query:null});})().catch(next);});
  router.get('/movies/:id/prepared-stream',(req,res,next)=>{(async()=>{const movie=findMovie(req.params.id);if(!availableFile(movie))fail(404,'Film inaccessible.');if(!browserTranscoder?.cache)return res.status(503).json({error:'Préparation indisponible.'});await browserTranscoder.cache.stream(req,res,{file:movie.sourcePath,kind:'cinema',input:req.query});})().catch(next);});

  router.get("/movies/:id/stream", (req, res) => {
    const movie = findMovie(req.params.id);
    const stat = availableFile(movie);
    if (!stat) fail(404, "Ce fichier vidéo n’est plus accessible.");
    const size = stat.size;
    res.set({ "Accept-Ranges": "bytes", "Content-Type": VIDEO_TYPES[movie.extension],
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
    const stream = fs.createReadStream(movie.sourcePath, { start, end });
    stream.on("error", () => {
      if (res.headersSent) res.destroy();
      else { res.removeHeader("Content-Length"); res.status(404).end(); }
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  });

  router.get("/movies/:id/download", (req, res) => {
    const movie = findMovie(req.params.id);
    if (!availableFile(movie)) fail(404, "Ce fichier vidéo n’est plus accessible.");
    res.set({ "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
    res.download(movie.sourcePath, path.basename(movie.sourcePath), error => {
      if (!error) return;
      if (res.headersSent) res.destroy();
      else res.status(404).end();
    });
  });

  router.get("/movies/:id/cover", (req, res, next) => {
    (async () => {
      const movie = findMovie(req.params.id);
      // Sans image locale : affiche trouvée automatiquement (données du serveur), sinon 404 et le dégradé habituel.
      const automatic = async () => {
        const found = posters.file(movie);
        const bytes = found && await fs.promises.readFile(found.path).catch(() => null);
        if (!bytes) return res.status(404).end();
        res.set({ "Content-Type": found.mime, "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" });
        res.end(bytes);
      };
      if (!availableFile(movie)) return automatic();
      const folder = path.dirname(movie.sourcePath);
      const directory = await fs.promises.lstat(folder).catch(() => null);
      if (!directory || !directory.isDirectory() || directory.isSymbolicLink() ||
          sourceKey(await fs.promises.realpath(folder)) !== sourceKey(folder)) return automatic();

      const imageTypes = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
      const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      async function readImage(file) {
        let handle;
        try {
          const mime = imageTypes[path.extname(file).toLowerCase()];
          if (!mime || sourceKey(path.dirname(file)) !== sourceKey(folder)) return null;
          const stat = await fs.promises.lstat(file);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 3 || stat.size > 16 * 1024 * 1024 ||
              sourceKey(await fs.promises.realpath(file)) !== sourceKey(file)) return null;
          handle = await fs.promises.open(file, "r");
          const opened = await handle.stat();
          if (!opened.isFile() || opened.size !== stat.size || opened.dev !== stat.dev || opened.ino !== stat.ino ||
              sourceKey(await fs.promises.realpath(file)) !== sourceKey(file)) return null;
          const bytes = Buffer.alloc(stat.size);
          let offset = 0;
          while (offset < bytes.length) {
            const chunk = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (!chunk.bytesRead) return null;
            offset += chunk.bytesRead;
          }
          const valid = mime === "image/png" ? bytes.subarray(0, 8).equals(pngSignature) :
            bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
          return valid ? { mime, bytes } : null;
        } catch { return null; }
        finally { if (handle) await handle.close().catch(() => {}); }
      }
      function sendImage(image) {
        res.set({ "Content-Type": image.mime, "Content-Length": String(image.bytes.length),
          "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" });
        res.end(image.bytes);
      }
      const stem = path.basename(movie.sourcePath, path.extname(movie.sourcePath));
      for (const name of [stem, ...LOCAL_POSTER_NAMES]) {
        for (const extension of Object.keys(imageTypes)) {
          const image = await readImage(path.join(folder, name + extension));
          if (image) return sendImage(image);
        }
      }

      // A loose image is safe to associate only in an unambiguous single-film folder.
      const entries = await fs.promises.opendir(folder);
      let scanned = 0;
      let videos = 0;
      const images = [];
      for await (const entry of entries) {
        if (++scanned > 5000) return automatic();
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        const extension = path.extname(entry.name).toLowerCase();
        if (Object.hasOwn(VIDEO_TYPES, extension)) videos++;
        if (Object.hasOwn(imageTypes, extension)) images.push(path.join(folder, entry.name));
      }
      if (videos === 1 && images.length === 1) {
        const image = await readImage(images[0]);
        if (image) return sendImage(image);
      }
      return automatic();
    })().catch(next);
  });

  router.get('/overview', (req,res)=>{
    const store=catalog(), all=preferences(), own=all.users[preferenceKey(req.session.user)]?.movies||{};
    store.movies=store.movies.filter(movie=>!isModerated(movie.sourcePath));
    const recent=[...store.movies].sort((a,b)=>(Date.parse(b.addedAt)||0)-(Date.parse(a.addedAt)||0));
    const clean=item=>{const {sourcePath,...safe}=publicMovie(item,req.session.user,all);return safe;};
    res.json({total:store.movies.length,favorites:store.movies.filter(x=>own[x.id]?.favorite).length,
      continueWatching:recent.filter(x=>Number(own[x.id]?.position)>5&&(!Number(own[x.id]?.duration)||Number(own[x.id]?.position)<Number(own[x.id]?.duration)-15)).slice(0,6).map(clean),
      recent:recent.slice(0,6).map(clean),favoriteMovies:recent.filter(x=>own[x.id]?.favorite).slice(0,6).map(clean)});
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ error: error.status ? error.message : "La bibliothèque cinéma est inaccessible. Réessayez après vérification du stockage." });
  });
  // 7.4 : utilisés par « Ajouter un film » et le dossier surveillé Medias/Films/Ajouts (cinema-library-storage.js).
  router.importFiles = (paths, user, genre) => {
    const files = [];
    for (const value of paths) { try { files.push(absoluteExisting(value)); } catch {} }
    return files.length ? importReferences(files, user, genre) : { imported: 0, duplicates: 0, movies: [] };
  };
  router.knows = file => { const key = sourceKey(file); return catalog().movies.some(movie => sourceKey(movie.sourcePath) === key); };
  // 7.4 : catégorie d'un nouveau film. Les genres trouvés (Wikidata ou TMDB) sont rattachés aux catégories qui existent
  // déjà dans le Cinéma ; un genre sans catégorie se replie sur la plus proche (science-fiction → Action…).
  router.classify = async (fileName, timeoutMs = 25000) => {
    const stem = path.basename(fileName, path.extname(fileName));
    let found;
    try { found = await Promise.race([posters.genres(stem), new Promise((_, reject) => setTimeout(() => reject(new Error("délai")), timeoutMs).unref?.())]); }
    catch { return null; }
    return resolveGenre(found.keys, [...new Set(catalog().movies.map(movie => movie.genre).filter(Boolean))]);
  };
  return router;
}

// Genre → catégories existantes reconnues (expression), libellé créé si aucune n'existe, replis dans l'ordre.
const GENRE_CATEGORIES = {
  animation: [/anim|dessin/i, "Animation", ["family", "comedy"]], horror: [/horr|[ée]pouvante/i, "Horreur", ["thriller"]],
  comedy: [/com[ée]d|dr[oô]le|humour/i, "Comédie", []], romance: [/roman|amour/i, "Romance", ["drama"]],
  "science-fiction": [/science|\bsf\b|anticipation/i, "Science-fiction", ["fantasy", "action"]], fantasy: [/fantas|fantastique|myth/i, "Fantastique", ["science-fiction", "adventure", "action"]],
  action: [/action|violent/i, "Action", ["thriller"]], thriller: [/thrill|polar|suspense|policier/i, "Thriller", ["action"]],
  adventure: [/aventure/i, "Aventure", ["action"]], documentary: [/docu/i, "Documentaire", []], family: [/famil|enfant/i, "Famille", ["animation", "comedy"]],
  drama: [/drame|dramatique/i, "Drame", ["romance"]]
};
function resolveGenre(keys, existing) {
  const usable = existing.filter(name => !/^(à classer|nouveaut[ée]s?|autres?)$/i.test(name));
  const match = key => { const rule = GENRE_CATEGORIES[key]; return rule ? usable.find(name => rule[0].test(name)) : null; };
  for (const key of keys.slice(0, 2)) {
    const direct = match(key); if (direct) return direct;
    for (const fallback of GENRE_CATEGORIES[key]?.[2] || []) { const near = match(fallback); if (near) return near; }
  }
  return keys.length && GENRE_CATEGORIES[keys[0]] ? GENRE_CATEGORIES[keys[0]][1] : null;
}

module.exports = { createCinemaRouter, VIDEO_TYPES, DEFAULT_LIMITS, resolveGenre };
