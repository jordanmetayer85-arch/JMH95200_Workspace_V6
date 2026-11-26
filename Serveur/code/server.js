const crypto = require('crypto');
const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const session = require("express-session");
const bcrypt = require("bcryptjs");
// Empreinte factice (même coût que les vrais comptes) : un identifiant inconnu coûte le même temps qu'un mauvais mot de passe.
const LOGIN_DUMMY_HASH = bcrypt.hashSync(require("crypto").randomBytes(24).toString("hex"), 12);
const multer = require("multer");
const { Server } = require("socket.io");

const app = express();
app.disable('x-powered-by');
if (process.env.JMH_TRUST_PROXY) app.set('trust proxy', process.env.JMH_TRUST_PROXY.split(',').map(value=>value.trim()).filter(Boolean));
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 25e6 });
const onlineUsers = new Map();

const PORT = Number(process.env.JMH_PORT || 3000);
const RUNTIME_ROOT = process.env.JMH_RUNTIME_ROOT || __dirname;
const DATA_DIR = path.join(RUNTIME_ROOT, "data");
const UPLOAD_DIR = path.join(RUNTIME_ROOT, "uploads");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const AUDIT_FILE = path.join(DATA_DIR, "audit.json");
const CONFIG_FILE = path.join(RUNTIME_ROOT, "config.json");
const TRASH_FILE = path.join(DATA_DIR, "storage_trash.json");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, "announcements.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");
const APP_SETTINGS_FILE = path.join(DATA_DIR, "app_settings.json");
const UPDATE_INFO_FILE = path.join(DATA_DIR, "update_info.json");
const UPDATES_DIR = path.join(RUNTIME_ROOT, "updates");
const DEFAULT_STORAGE_DIR = path.join(RUNTIME_ROOT, "shared_storage");

for (const dir of [DATA_DIR, UPLOAD_DIR, DEFAULT_STORAGE_DIR, UPDATES_DIR]) fs.mkdirSync(dir, { recursive: true });
for (const [file, initial] of [[USERS_FILE, []], [MESSAGES_FILE, []], [AUDIT_FILE, []], [TRASH_FILE, []]]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial, null, 2), "utf8");
}

const credentialVault=require('./admin-credentials').createCredentialVault(DATA_DIR);
const {isPending:isPasswordPending,markTemporary,validatePersonalPassword,createPasswordFlow}=require('./password-onboarding');
const privateVault=require('./private-vault-server').createPrivateVault({runtime:RUNTIME_ROOT,requireAuth,supervisionPolicy:()=>authority.supervisionPolicy(),validateSupervised:value=>authority.validateSupervised(value),vaultModeration:(uid,id)=>authority.vaultModeration(uid,id)});
const authority=require('./authority-server').createAuthority({express,DATA_DIR,readUsers:()=>readJson(USERS_FILE),writeUsers:value=>writeJson(USERS_FILE,value),bcrypt,publicUser,requireAuth,getStorageRoot,resolveStoragePath,io,credentialVault,canReadUnmoderated:(user,relative)=>canAccessStorage(user,relative,true)});

// Audit N6 : un fichier absent vaut une liste vide, mais un fichier corrompu n'est plus confondu avec une liste vide.
const jsonStore = require("./json-store");
function readJson(file) {
  return jsonStore.readJsonSafe(file, []);
}

function writeJson(file, value) {
  jsonStore.writeJsonSafe(file, value);
}

function loadConfig() {
  if (process.env.JMH_STORAGE_ROOT) return { storageRoot: process.env.JMH_STORAGE_ROOT };
  if (!fs.existsSync(CONFIG_FILE)) {
    const initial = { storageRoot: DEFAULT_STORAGE_DIR };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return { storageRoot: parsed.storageRoot || DEFAULT_STORAGE_DIR };
  } catch {
    return { storageRoot: DEFAULT_STORAGE_DIR };
  }
}

function getStorageRoot() {
  const configured = path.resolve(loadConfig().storageRoot);
  fs.mkdirSync(configured, { recursive: true });
  return configured;
}

function resolveStoragePath(relativePath = "") {
  const root = getStorageRoot();
  const clean = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(root, clean);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("Chemin non autorisé.");
  }
  if (process.env.JMH_SERVER_TYPE === "nas") {
    // Reject an existing symlink at any level, including a parent of a new upload.
    const components = path.relative(root, resolved).split(path.sep).filter(Boolean);
    let current = root;
    for (const component of ["", ...components]) {
      if (component) current = path.join(current, component);
      try {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || fs.realpathSync(current) !== current) throw new Error("Lien non autorisé dans le stockage.");
      } catch (error) { if (error.code !== "ENOENT") throw error; break; }
    }
  }
  return resolved;
}

function storageRelative(absolutePath) {
  return path.relative(getStorageRoot(), absolutePath).split(path.sep).join("/");
}

function fileInfo(absolutePath) {
  const stat = fs.statSync(absolutePath);
  return {
    name: path.basename(absolutePath),
    path: storageRelative(absolutePath),
    type: stat.isDirectory() ? "folder" : "file",
    size: stat.isDirectory() ? 0 : stat.size,
    modifiedAt: stat.mtime.toISOString(),
    extension: stat.isDirectory() ? "" : path.extname(absolutePath).toLowerCase()
  };
}

function normalizeStoragePath(value = "") {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function ensureUserFolder(username) {
  const folder = resolveStoragePath(`Utilisateurs/${username}`);
  fs.mkdirSync(folder, { recursive: true });
}

function ensureAllUserFolders() {
  fs.mkdirSync(resolveStoragePath("Utilisateurs"), { recursive: true });
  for (const user of readJson(USERS_FILE).filter(u => u.active&&u.role!=='owner')) ensureUserFolder(user.username);
}

function canAccessStorage(user, relativePath, ignoreModeration=false) {
  if (!user||user.role==="owner") return false;
  if(!ignoreModeration&&authority.blocked(relativePath))return false;
  const p=normalizeStoragePath(relativePath),parts=p.split('/'),lower=p.toLocaleLowerCase('fr');
  if(parts.some(part=>part==='.'||part==='..')||lower==='.jmh_trash'||lower.startsWith('.jmh_trash/')||lower==='.authority-trash'||lower.startsWith('.authority-trash/'))return false;
  if(user.role==='admin')return true;
  if(!hasPermission(user,'canAccessStorage'))return false;
  if(/^(outils|archives de médias techniques)(?:\/|$)/i.test(p)||/(?:^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$|\.(?:conf|key|pem|pfx|p12)$/i.test(p))return false;
  for(const [folder,permission]of [['musique','canAccessMusic'],['films','canAccessCinema'],['photos','canAccessPhotos'],['videos personnelles','canAccessVideos']])if((lower==='medias/'+folder||lower.startsWith('medias/'+folder+'/'))&&!hasPermission(user,permission))return false;
  if(lower==='utilisateurs')return true;
  if(lower.startsWith('utilisateurs/')){const own='utilisateurs/'+user.username.toLocaleLowerCase('fr');return lower===own||lower.startsWith(own+'/');}
  return true;
}

function ensureTrashDir() {
  const dir = path.join(getStorageRoot(), ".jmh_trash");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}



function createNotification(username, type, title, message, linkPage = "") {
  const notifications = readJson(NOTIFICATIONS_FILE);
  const item = {
    id: Date.now() + Math.random(),
    username,
    type,
    title,
    message,
    linkPage,
    read: false,
    createdAt: new Date().toISOString()
  };
  notifications.push(item);
  writeJson(NOTIFICATIONS_FILE, notifications.slice(-10000));
  io.to(`user:${username}`).emit("notification", item);
  return item;
}

function notifyUsers(usernames, type, title, message, linkPage = "") {
  const unique = [...new Set(usernames.filter(Boolean))];
  for (const username of unique) {
    createNotification(username, type, title, message, linkPage);
  }
}

function audit(type, details, username = "system") {
  authority.journal.append(type,details,username);
}


const DEFAULT_PERMISSIONS = {
  canUseGames: false, canUsePcTools: false,
  canAccessMusic: true, canAccessCinema: true, canAccessPhotos: true, canAccessVideos: true, canUseVpn: true,
  canSendMessages: true,
  canSendChatFiles: true,
  canUsePrivateMessages: true,
  canAccessStorage: true,
  canUploadStorage: true,
  canDownloadStorage: true,
  canCreateStorageFolders: true
};

function normalizePermissions(value) {
  const input = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.keys(DEFAULT_PERMISSIONS).map(key => [key, ["canUseGames","canUsePcTools"].includes(key)?input[key]===true:input[key] !== false])
  );
}

function effectivePermissions(user) {
  if (!user) return normalizePermissions({});
  if(user.role==="owner")return Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(key=>[key,false]));
  if (user.role === "admin") {
    return Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(key => [key, true]));
  }
  return normalizePermissions(user.permissions);
}

function hasPermission(user, key) {
  return user?.role === "admin" || effectivePermissions(user)[key] === true;
}

function requirePermission(key, message) {
  return (req, res, next) => {
    if (!refreshSession(req)) return res.status(401).json({ error: "Non connecté." });
    const current = readJson(USERS_FILE).find(user => String(user.id) === String(req.session.user.id));
    if (!current || !current.active) return res.status(401).json({ error: "Compte désactivé ou introuvable." });
    req.session.user = publicUser(current);
    if (!hasPermission(current, key)) {
      return res.status(403).json({ error: message || "Cette fonctionnalité n’est pas autorisée pour votre compte." });
    }
    next();
  };
}

function backfillUserPermissions() {
  const currentUsers = readJson(USERS_FILE);
  let changed = false;
  for (const user of currentUsers) {
    const normalized = normalizePermissions(user.permissions);
    if (JSON.stringify(user.permissions || {}) !== JSON.stringify(normalized)) {
      user.permissions = normalized;
      changed = true;
    }
  }
  if (changed) writeJson(USERS_FILE, currentUsers);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin || null,
    displayName: user.displayName || user.username, avatar: user.avatar || null,
    permissions: effectivePermissions(user), passwordState:isPasswordPending(user)?user.passwordState:'personal', temporaryPasswordExpiresAt:isPasswordPending(user)?user.temporaryPasswordExpiresAt:null
  };
}

function generatePassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let output = "";
  for (let i = 0; i < length; i++) output += chars[crypto.randomInt(chars.length)];
  return output;
}

let users = readJson(USERS_FILE);
if (!users.length) {
  if (process.env.JMH_SERVER_TYPE === "nas") throw new Error("Migrated NAS accounts are required.");
  users.push({
    id: 1,
    username: "admin",
    passwordHash: bcrypt.hashSync("JMH-95200!", 12),
    role: "admin",
    permissions: normalizePermissions({}),
    active: true,
    createdAt: new Date().toISOString()
  });
  writeJson(USERS_FILE, users);
  audit("system", "Compte administrateur initial créé");
}
backfillUserPermissions();
credentialVault.purgePersonal(readJson(USERS_FILE));
ensureAllUserFolders();
for(const user of readJson(USERS_FILE).filter(user=>user.active&&user.role!=='owner'))privateVault.reserve(user.id);

const sessionMiddleware = session({
  // Audit N6 : sessions conservées après un redémarrage du service.
  store: require("./session-file-store")(session, path.join(DATA_DIR, "sessions.store")),
  secret: require("./request-security").sessionSecret(DATA_DIR,process.env.JMH_SESSION_SECRET),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000, sameSite: "lax", secure: 'auto' }
});

const requestSecurity=require("./request-security").createRequestSecurity();
app.disable("x-powered-by");
app.use(requestSecurity.headers);
// Audit T2 : HTTPS obligatoire depuis le réseau local quand le NAS a son certificat.
const httpsOnly=require('./https-only').createHttpsOnly();
app.use(httpsOnly);
io.engine.use(httpsOnly);
app.use("/api",requestSecurity.sameOrigin);
// Audit T1 : aucun client JMH n'envoie de corps compressé ; la décompression des requêtes est donc refusée.
app.use('/api/atelier/inference',express.json({limit:'16mb',inflate:false}));
app.use('/api/atelier/chat',express.json({limit:'8mb',inflate:false}));
app.use(express.json({ limit: "2mb", inflate: false }));
app.use(express.urlencoded({ extended: true, inflate: false }));
app.use(sessionMiddleware);
// Audit JMH-07 : envois simultanés limités (2 par compte, 4 en tout) et réserve d'espace vérifiée avant réception.
{const limits=require('./upload-limits'),staging=[UPLOAD_DIR,path.join(DATA_DIR,'nas_temp'),path.join(DATA_DIR,'update_temp'),path.join(DATA_DIR,'gallery-staging')];
 app.use(limits.createUploadLimits({diskPaths:[DATA_DIR,getStorageRoot()]}));
 limits.cleanStaging(staging);setInterval(()=>limits.cleanStaging(staging),3600*1000).unref();}
app.use((req,res,next)=>req.path.toLowerCase().startsWith('/api/')?authority.guard(req,res,next):next());
app.use('/api/authority',authority.router);
app.use('/api/recovery-requests',authority.recoveryRouter);
app.use('/api/moderation-appeals',authority.appealsRouter);
app.use((req,res,next)=>req.path.toLowerCase().startsWith('/api/')?authority.gateMedia(req,res,next):next());
app.use(authority.logMutations);
const passwordFlow=createPasswordFlow({readUsers:()=>readJson(USERS_FILE),writeUsers:value=>writeJson(USERS_FILE,value),credentialVault,bcrypt,audit,io,publicUser});
app.post('/api/auth/password/complete',requestSecurity.loginLimit,passwordFlow.complete);
app.use('/api/private-vault',privateVault.router);
app.use(['/api/messages','/api/tasks','/api/events','/api/announcements','/api/export/messages.csv','/api/upload'],requireAuth,(_req,res)=>res.status(410).json({error:'Cette ancienne fonction a été retirée de JMH.'}));
app.use("/uploads",requireAuth,requirePermission('canDownloadStorage'),(req,res,next)=>{
 if(req.session.user.role==='admin')return next();
 if(!hasPermission(req.session.user,'canSendMessages'))return res.status(403).json({error:'Accès à cette pièce jointe refusé.'});
 let name;try{name=decodeURIComponent(req.path.slice(1));}catch{return res.status(400).end();}
 if(!name||name.includes('/')||name.includes('\\')||!readJson(MESSAGES_FILE).some(m=>m.file?.url==='/uploads/'+encodeURIComponent(name)&&canViewMessage(req.session.user,m)))return res.status(403).json({error:'Accès à cette pièce jointe refusé.'});
 next();
},express.static(UPLOAD_DIR,{setHeaders(res){res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition','attachment');}}));
const atelier=require('./atelier-server').createAtelierRouter({express,runtime:RUNTIME_ROOT,requireAuth,requirePermission,requireAdmin,readUsers:()=>readJson(USERS_FILE),eligibleUser:user=>user.active&&!isPasswordPending(user)&&!authority.restriction(user)&&!authority.owner(user)&&(user.role==='admin'||user.permissions?.canUsePcTools===true)});
app.use('/api/atelier',atelier.router);
app.use('/atelier',requireAuth,requirePermission('canUsePcTools'),(req,res,next)=>{if(process.env.JMH_SERVER_TYPE==='nas'&&!req.secure)return res.status(426).send('Atelier IA nécessite la connexion HTTPS de JMH. Configure l’adresse HTTPS du NAS dans les paramètres de connexion.');next();});
app.use(express.static(path.join(__dirname, "public"), {setHeaders(res,file){if(file.endsWith('sw.js')||file.endsWith('manifest.webmanifest'))res.setHeader('Cache-Control','no-cache');}}));

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 500 * 1024 * 1024 }
});

const updateUpload = multer({
  dest: path.join(DATA_DIR, "update_temp"),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

const nasUpload = multer({
  dest: path.join(DATA_DIR, "nas_temp"),
  limits: { fileSize: 1024 * 1024 * 1024 }
});

function refreshSession(req) {
  if(!req.session.user)return null;if(req.session.idleUntil&&Date.now()>req.session.idleUntil){delete req.session.user;return null;}const user=readJson(USERS_FILE).find(u=>String(u.id)===String(req.session.user.id));
  if(authority.restriction(user)){req.restrictionDenied=authority.restriction(user);delete req.session.user;return null;}
  if(!user||!user.active||isPasswordPending(user)||!authority.isVerified(req,user)||Number(req.session.authVersion||0)!==Number(user.authVersion||0)){delete req.session.user;return null;}
  req.session.user=publicUser(user);return user;
}
function requireAuth(req,res,next){if(!refreshSession(req)){if(req.restrictionDenied)return res.status(423).json({error:'Ton accès est temporairement restreint : '+req.restrictionDenied.reason,restriction:req.restrictionDenied});return res.status(401).json({error:'Reconnecte-toi à JMH.'});}next();}
function requireAdmin(req,res,next){if(!refreshSession(req)||req.session.user.role!=='admin')return res.status(403).json({error:'Accès administrateur requis.'});const target=req.params?.id&&readJson(USERS_FILE).find(u=>String(u.id)===String(req.params.id));if(target&&(authority.owner(target)||authority.restriction(target)))return res.status(403).json({error:'Compte protégé : seul le Propriétaire peut gérer cet accès.'});next();}

const browserTranscoder = require("./browser-transcoder").createBrowserTranscoder({cacheRoot:path.join(DATA_DIR,'playback-cache')});
const cinemaRouter = require("./cinema-server").createCinemaRouter({
  express, DATA_DIR, requireAuth, requireAdmin, requirePermission, browserTranscoder, isModerated:file=>Boolean(authority.blocked(authority.sourceRelative(file)))
});
app.use("/api/cinema", requireAuth, (req,res,next)=>/\/(stream|browser-stream|prepared-stream|prepare|cover|poster)$/.test(req.path)?requirePermission("canDownloadStorage")(req,res,next):next(), requirePermission("canAccessCinema"), cinemaRouter);
// 7.4 : « Ajouter un film » (envoi par morceaux vers Medias/Films/Ajouts) et dossier surveillé.
{const films=require('./cinema-library-storage'),{VIDEO_TYPES}=require('./cinema-server');
 app.use('/api/cinema-upload',requireAuth,requirePermission('canAccessCinema'),films.createFilmUploadRouter({express,requireAuth,requireAdmin,storageRoot:getStorageRoot(),videoTypes:VIDEO_TYPES,importFiles:cinemaRouter.importFiles,classify:cinemaRouter.classify}));
 if(process.env.JMH_SERVER_TYPE==='nas'||process.env.JMH_FILM_WATCH==='on')films.createFilmWatcher({storageRoot:getStorageRoot(),videoTypes:VIDEO_TYPES,knows:cinemaRouter.knows,importFiles:cinemaRouter.importFiles,classify:cinemaRouter.classify,log:message=>console.warn('[JMH] '+message)}).start();}
const musicRouter = require("./music-server").createMusicRouter({
  express, DATA_DIR, requireAuth, requireAdmin, requirePermission, browserTranscoder, isModerated:file=>Boolean(authority.blocked(authority.sourceRelative(file)))
});
function requireMediaRead(req,res,next){if(/\/(stream|browser-stream|prepared-stream|prepare|cover|poster)$/.test(req.path))return requirePermission('canDownloadStorage')(req,res,next);next();}
app.use('/api/music',requireAuth,requireMediaRead);app.use('/api/cinema',requireAuth,requireMediaRead);
app.use("/api/music",requireAuth,requirePermission("canAccessMusic"),musicRouter);
app.use("/api/gallery",require("./gallery-server").createGalleryRouter({express,DATA_DIR,storageRoot:getStorageRoot(),requireAuth,requirePermission,canAccessStorage,browserTranscoder,moderationRevision:()=>{try{return fs.statSync(path.join(DATA_DIR,'authority/moderation.json')).mtimeMs;}catch{return 0;}}}));
app.use('/api/music-upload',require('./music-library-storage').createMusicUploadRouter({express,DATA_DIR,requireAuth,requireAdmin,requirePermission,storageRoot:getStorageRoot(),importFile:musicRouter.importDownloadedFile}));
app.get('/api/storage/media-info',requireAuth,requirePermission('canDownloadStorage'),(req,res)=>{try{const relative=normalizeStoragePath(req.query.path||'');if(!canAccessStorage(req.session.user,relative))return res.status(403).json({error:'Accès refusé.'});const absolute=resolveStoragePath(relative);/* Audit N4 : index chemin → média gardé en mémoire, reconstruit seulement quand le catalogue change. */for(const [kind,name,field]of [['music','music_catalog.json','tracks'],['cinema','cinema_catalog.json','movies']]){const id=jsonStore.pathIndex(path.join(DATA_DIR,name),field)?.get(absolute);if(id!==undefined)return res.json({kind,id});}res.json({kind:null});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/storage/open-info',requireAuth,requirePermission('canDownloadStorage'),(req,res)=>{
 try{const relative=normalizeStoragePath(req.query.path||'');if(!canAccessStorage(req.session.user,relative))return res.status(403).json({error:'Accès refusé.'});const file=resolveStoragePath(relative);if(!fs.statSync(file).isFile())return res.status(404).json({error:'Fichier introuvable.'});const share=process.env.JMH_NAS_CLIENT_SHARE;res.set('Cache-Control','no-store').json({path:storageRelative(file),name:path.basename(file),size:fs.statSync(file).size,clientPath:share?share+'\\'+storageRelative(file).replace(/\//g,'\\'):null});}catch(e){res.status(400).json({error:e.message})}
});
app.use("/api/music-downloads",require("./music-downloads").createDownloadRouter({express,DATA_DIR,requireAuth,requireAdmin,storageRoot:getStorageRoot(),importFile:musicRouter.importDownloadedFile,covers:musicRouter.covers}));

app.use('/api/native-notes',require('./native-tools-server').createNativeToolsRouter({express,DATA_DIR,requireAuth}));
app.use('/api/vpn',requireAuth,requirePermission('canUseVpn'),require('./vpn-server').createVpnRouter({express,DATA_DIR,requireAuth,requireAdmin,requirePermission}));
app.use('/api/remote-access',require('./remote-access-server').createRemoteAccessRouter({express,DATA_DIR,requireAuth,requireAdmin}));
app.use('/api/client-diagnostics',require('./client-diagnostics-server').createClientDiagnosticsRouter({express,DATA_DIR,requireAuth,requireAdmin}));
app.get("/api/media-transfer", requireAuth, requirePermission("canAccessStorage"), (req, res) => {
  const empty = { status: "none", phase: "", totalBytes: 0, copiedBytes: 0, startedAt: null, updatedAt: null, films: 0, music: 0 };
  const nasStatus = process.env.JMH_SERVER_TYPE === "nas" ? path.join(getStorageRoot(), "Medias", "JMH-transfer-status.json") : null;
  const file = nasStatus && fs.existsSync(nasStatus) ? nasStatus : path.join(DATA_DIR, "media_transfer_status.json");
  try {
    if (!fs.existsSync(file)) return res.json(empty);
    if (fs.statSync(file).size > 65536) throw new Error("Oversized transfer status.");
    const input = JSON.parse(fs.readFileSync(file, "utf8"));
    const number = value => Number.isFinite(value) && value >= 0 ? value : 0;
    const date = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
    const status = typeof input.status === "string" && /^[a-z_-]{1,40}$/.test(input.status) ? input.status : "none";
    const phase = typeof input.phase === "string" && !/[\\/:\u0000-\u001f]/.test(input.phase) ? input.phase.slice(0, 120) : "Transfert des médias";
    res.set("Cache-Control", "no-store").json({ status, phase, totalBytes: number(input.totalBytes),
      copiedBytes: number(input.copiedBytes), startedAt: date(input.startedAt), updatedAt: date(input.updatedAt),
      films: number(input.films), music: number(input.music),
      ...(input.error ? { error: "Le transfert a rencontré une erreur. Le diagnostic est disponible dans Codex." } : {}) });
  } catch { res.status(500).json({ error: "L’état du transfert est temporairement indisponible." }); }
});

function normalizeRecipient(value) {
  const recipient = String(value || "all").trim();
  return recipient || "all";
}

function validateRecipientForUser(user, recipient) {
  if (recipient !== "all" && !hasPermission(user, "canUsePrivateMessages")) {
    return "Votre compte n’est pas autorisé à envoyer des messages privés.";
  }
  return null;
}

function recipientExists(recipient) {
  if (recipient === "all") return true;
  return readJson(USERS_FILE).some(user => user.active && user.username === recipient);
}

function canViewMessage(user, message) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const to = message.to || "all";
  return to === "all" || message.username === user.username || to === user.username;
}

function emitMessage(message) {
  for (const socket of io.sockets.sockets.values()) {
    const connectedUser = socket.request.session?.user;
    if (canViewMessage(connectedUser, message)) socket.emit("message", message);
  }
}

app.get("/api/games/access",requireAuth,requirePermission("canUseGames"),(req,res)=>res.json({ok:true}));
app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store").json({ ok: true, schema: 1, product: "jmh95200-workspace-stable",
    serverType: process.env.JMH_SERVER_TYPE === "nas" ? "nas" : "desktop", version: require("./package.json").version,
    /* Audit N5 : la version et le build du serveur sont annoncés distinctement de ceux du client. */ build: (() => { try { return require("./build-info.json").build; } catch { return null; } })() });
});

app.post("/api/login", requestSecurity.loginLimit, async (req, res, next) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if(username.length>128||password.length>1024)return res.status(401).json({error:"Identifiant ou mot de passe incorrect."});
  const initialRecords=readJson(USERS_FILE),candidate=initialRecords.find(item => item.username.toLowerCase() === username.toLowerCase());
  const passwordMatches=await bcrypt.compare(password,typeof candidate?.passwordHash==="string"?candidate.passwordHash:LOGIN_DUMMY_HASH);
  if (!candidate||!candidate.active||!passwordMatches) {audit("login_failed",`Échec de connexion pour ${username||"inconnu"}`);return res.status(401).json({error:"Identifiant ou mot de passe incorrect."});}
  const records=readJson(USERS_FILE),user=records.find(item=>String(item.id)===String(candidate.id));
  if (!user || !user.active || user.passwordHash!==candidate.passwordHash) {
    audit("login_failed", `Échec de connexion pour ${username || "inconnu"}`);
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }

  if(authority.restriction(user))return res.status(423).json({error:'Ton accès est restreint jusqu’au '+new Date(user.restriction.until).toLocaleString('fr-FR')+' : '+user.restriction.reason,restriction:user.restriction});
  if(authority.owner(user))return authority.begin(req,res,user).catch(next);
  if(isPasswordPending(user))return passwordFlow.begin(req,res,user).catch(next);

  try { await new Promise((resolve,reject)=>req.session.regenerate(error=>error?reject(error):resolve())); } catch(error) { return next(error); }
  user.lastLogin = new Date().toISOString();
  writeJson(USERS_FILE, records);
  req.session.user = publicUser(user);
  req.session.authVersion=Number(user.authVersion||0);
  audit("login", "Connexion réussie", user.username);
  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  const user=refreshSession(req);if(user)audit("logout", "Déconnexion", user.username);
  for(const socket of io.sockets.sockets.values())if(socket.request.sessionID===req.sessionID)socket.disconnect(true);
  res.clearCookie('connect.sid',{path:'/'});
  req.session.destroy(() => res.json({ ok: true }));
});

app.post('/api/session/activity',requireAuth,(req,res)=>{const minutes=req.body?.minutes;if(![0,5,15,30,60,120].includes(minutes))return res.status(400).json({error:'Durée invalide.'});req.session.idleUntil=minutes?Date.now()+minutes*60000:0;res.json({ok:true});});
app.get("/api/me", (req, res) => {
  refreshSession(req);res.json({ user: req.session.user || null, passwordSetup:passwordFlow.status(req), restriction:req.restrictionDenied||null });
});

app.get('/api/moderation/notices',requireAuth,(req,res)=>{const rules=JSON.parse(require('fs').existsSync(path.join(DATA_DIR,'authority/moderation.json'))?require('fs').readFileSync(path.join(DATA_DIR,'authority/moderation.json'),'utf8'):'[]');res.json({items:rules.filter(rule=>rule.scope==='vault'?String(rule.userId)===String(req.session.user.id):canAccessStorage(req.session.user,rule.path,true)).map(rule=>({id:rule.id,scope:rule.scope||'storage',path:rule.scope==='vault'?'Élément de ton coffre sensible':rule.path,reason:rule.reason,at:rule.at})),notice:'Les connexions et actions sur les fichiers sont journalisées pendant la supervision. Les coffres supervisés sont consultables par le Propriétaire.'});});

app.get("/api/users", requireAdmin, (req, res) => {
  users = readJson(USERS_FILE);
  res.json(users.filter(user => user.active&&user.role!=="owner").map(publicUser));
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  users = readJson(USERS_FILE);
  res.json(users.filter(user=>user.role!=="owner").map(publicUser));
});

function validNewUsername(username,res){
 if(!/^[a-zA-Z0-9._-]{3,30}$/.test(username)){res.status(400).json({error:'Le nom doit contenir 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore.'});return false;}
 if(readJson(USERS_FILE).some(u=>u.username.toLowerCase()===username.toLowerCase())){res.status(409).json({error:'Ce nom d’utilisateur existe déjà.'});return false;}return true;
}
app.post('/api/admin/users/draft',requireAdmin,(req,res)=>{
 const username=String(req.body.username||'').trim();if(!validNewUsername(username,res))return;
 const draft={id:crypto.randomUUID(),username,password:generatePassword(),expires:Date.now()+10*60*1000};req.session.userDraft=draft;
 res.set('Cache-Control','no-store').json({draftId:draft.id,username,password:draft.password,expiresAt:new Date(draft.expires).toISOString()});
});
app.delete('/api/admin/users/draft',requireAdmin,(req,res)=>{if(req.session.userDraft?.id===req.body?.draftId)delete req.session.userDraft;res.json({ok:true});});
app.get('/api/admin/credentials',requireAdmin,(req,res)=>res.set('Cache-Control','no-store').json(credentialVault.list(readJson(USERS_FILE))));
app.post('/api/admin/credentials/:id/reveal',requireAdmin,(req,res)=>{
 try{const user=readJson(USERS_FILE).find(u=>String(u.id)===req.params.id);if(!user)return res.status(404).json({error:'Compte introuvable.'});const value=credentialVault.reveal(user);if(!value)return res.status(404).json({error:'Aucun identifiant enregistré. Tu peux générer un nouveau mot de passe depuis la fiche du compte.'});audit('credentials_viewed','Identifiants consultés pour '+user.username,req.session.user.username);res.set('Cache-Control','no-store').json(value);}catch{res.status(500).json({error:'Les identifiants chiffrés ne peuvent pas être lus.'});}
});
app.post('/api/admin/users',requireAdmin,async(req,res)=>{
 try{
 const username=String(req.body.username||'').trim();if(!validNewUsername(username,res))return;
 let password=generatePassword();
 if(req.body.draftId){const draft=req.session.userDraft;if(!draft||draft.id!==req.body.draftId||draft.username!==username||draft.expires<Date.now())return res.status(409).json({error:'Les identifiants préparés ont expiré. Retourne à l’étape précédente puis réessaie.'});password=draft.password;delete req.session.userDraft;}
 const passwordHash=await bcrypt.hash(password,12);if(!validNewUsername(username,res))return;
 users=readJson(USERS_FILE);const role=req.body.role==='admin'?'admin':'employee';
 const restricted=Object.fromEntries(Object.keys(DEFAULT_PERMISSIONS).map(k=>[k,false]));
 const user={id:crypto.randomUUID(),username,passwordHash,role,permissions:normalizePermissions(role==='admin'?{}:{...restricted,...req.body.permissions}),active:true,createdAt:new Date().toISOString()};markTemporary(user,'activation');
 // Persist the encrypted credential first; failed account writes leave no usable account.
 credentialVault.store(user,password);users.push(user);writeJson(USERS_FILE,users);ensureUserFolder(username);privateVault.reserve(user.id);audit('user_created','Compte '+username+' créé',req.session.user.username);
 res.set('Cache-Control','no-store').json({user:publicUser(user),generatedPassword:password,activationRequired:true,expiresAt:user.temporaryPasswordExpiresAt});
 }catch{res.status(500).json({error:'La création du compte a échoué. Vérifie la connexion au NAS et actualise les comptes avant de réessayer.'});}
});


app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  users = readJson(USERS_FILE);
  const user = users.find(item => String(item.id) === req.params.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  const oldUsername = user.username;
  const newUsername = String(req.body.username ?? oldUsername).trim();
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(newUsername)) {
    return res.status(400).json({
      error: "Le nom doit contenir 3 à 30 caractères : lettres, chiffres, point, tiret ou underscore."
    });
  }
  if (users.some(item => item.id !== user.id && item.username.toLowerCase() === newUsername.toLowerCase())) {
    return res.status(409).json({ error: "Ce nom d’utilisateur existe déjà." });
  }

  const requestedRole = req.body.role === undefined ? user.role : req.body.role === "admin" ? "admin" : "employee";
  if (user.username === req.session.user.username && requestedRole !== "admin") {
    return res.status(400).json({ error: "Vous ne pouvez pas retirer votre propre rôle administrateur." });
  }

  user.username = newUsername;
  user.role = requestedRole;
  user.permissions = normalizePermissions(req.body.permissions ?? user.permissions);

  if (oldUsername !== newUsername) {
    const oldFolder = resolveStoragePath(`Utilisateurs/${oldUsername}`);
    const newFolder = resolveStoragePath(`Utilisateurs/${newUsername}`);
    if (fs.existsSync(oldFolder) && !fs.existsSync(newFolder)) {
      fs.renameSync(oldFolder, newFolder);
    } else {
      fs.mkdirSync(newFolder, { recursive: true });
    }

    const messages = readJson(MESSAGES_FILE);
    for (const message of messages) {
      if (message.username === oldUsername) message.username = newUsername;
      if (message.to === oldUsername) message.to = newUsername;
    }
    writeJson(MESSAGES_FILE, messages);
  }

  writeJson(USERS_FILE, users);
  audit(
    "user_updated",
    `Compte modifié : ${oldUsername} → ${newUsername}, rôle ${requestedRole}`,
    req.session.user.username
  );

  if (String(user.id) === String(req.session.user.id)) {
    req.session.user = publicUser(user);
  }

  res.json({ user: publicUser(user) });
});

app.patch("/api/admin/users/:id/toggle", requireAdmin, (req, res) => {
  users = readJson(USERS_FILE);
  const user = users.find(item => String(item.id) === req.params.id);

  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  if (user.username === req.session.user.username) {
    return res.status(400).json({ error: "Vous ne pouvez pas désactiver votre propre compte." });
  }

  user.active = !user.active;
  writeJson(USERS_FILE, users);
  audit("user_toggled", `${user.username} : ${user.active ? "activé" : "désactivé"}`, req.session.user.username);
  res.json({ user: publicUser(user) });
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
  users = readJson(USERS_FILE);
  const user = users.find(item => String(item.id) === req.params.id);

  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  if(String(user.id)===String(req.session.user.id))return res.status(400).json({error:'Pour ton propre compte, utilise Mon compte → Modifier mon mot de passe.'});
  const password = generatePassword();
  const hash=await bcrypt.hash(password,12);
  users=readJson(USERS_FILE);const fresh=users.find(item=>String(item.id)===req.params.id);if(!fresh)return res.status(404).json({error:'Utilisateur introuvable.'});
  fresh.passwordHash=hash;markTemporary(fresh,'temporary');
  credentialVault.store(fresh,password);
  writeJson(USERS_FILE, users);
  audit("password_reset", `Mot de passe réinitialisé pour ${user.username}`, req.session.user.username);
  for(const socket of io.sockets.sockets.values())if(String(socket.request.session?.user?.id)===String(fresh.id))socket.disconnect(true);
  res.set('Cache-Control','no-store').json({generatedPassword:password,temporary:true,expiresAt:fresh.temporaryPasswordExpiresAt});
});

app.post('/api/messages',requireAuth,requirePermission('canSendMessages'),(req,res)=>{
 const user=readJson(USERS_FILE).find(item=>String(item.id)===String(req.session.user.id));if(!user?.active||!hasPermission(user,'canSendMessages'))return res.status(403).json({error:'Compte non autorisé.'});const text=String(req.body?.text||'').trim().slice(0,4000),to=normalizeRecipient(req.body?.to),error=validateRecipientForUser(user,to);
 if(error)return res.status(403).json({error});if(!text)return res.status(400).json({error:'Message vide.'});if(!recipientExists(to))return res.status(400).json({error:'Destinataire introuvable.'});
 const message={id:Date.now()+Math.random(),username:user.username,to,text,at:new Date().toISOString()},messages=readJson(MESSAGES_FILE);messages.push(message);writeJson(MESSAGES_FILE,messages.slice(-5000));audit('message_sent','Message envoyé à '+to,user.username);emitMessage(message);res.status(201).json(message);
});
app.get("/api/messages", requireAuth, (req, res) => {
  const visible = readJson(MESSAGES_FILE).filter(message => canViewMessage(req.session.user, message));
  res.json(visible.slice(-500));
});

app.post("/api/upload", requireAuth, requirePermission("canSendChatFiles", "Votre compte n’est pas autorisé à envoyer des fichiers dans la messagerie."), upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });

  const to = normalizeRecipient(req.body.to);
  const recipientError = validateRecipientForUser(req.session.user, to);
  if (recipientError) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(403).json({ error: recipientError });
  }
  if (!recipientExists(to)) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Le destinataire n’existe pas ou n’est plus actif." });
  }

  const safeName = req.file.originalname.replace(/[^\w.\- ()À-ÿ]/g, "_");
  const finalName = `${Date.now()}-${safeName}`;
  fs.renameSync(req.file.path, path.join(UPLOAD_DIR, finalName));

  const message = {
    id: Date.now() + Math.random(),
    username: req.session.user.username,
    to,
    text: String(req.body.text || "").slice(0, 4000),
    file: {
      name: safeName,
      url: `/uploads/${encodeURIComponent(finalName)}`,
      size: req.file.size
    },
    at: new Date().toISOString()
  };

  const messages = readJson(MESSAGES_FILE);
  messages.push(message);
  writeJson(MESSAGES_FILE, messages.slice(-5000));
  audit("file_sent", `Fichier envoyé à ${to === "all" ? "tous" : to} : ${safeName}`, req.session.user.username);
  emitMessage(message);
  res.json(message);
});


const storageSummaryScopes=new Map();
function storageSummaryFor(user){const key=JSON.stringify([user.id,user.role,user.username,effectivePermissions(user)]);if(!storageSummaryScopes.has(key)){if(storageSummaryScopes.size>=16)storageSummaryScopes.delete(storageSummaryScopes.keys().next().value);const frozen=JSON.parse(JSON.stringify(user));storageSummaryScopes.set(key,require('./storage-usage').createStorageUsage({accept:relative=>canAccessStorage(frozen,relative)}));}return storageSummaryScopes.get(key).get(getStorageRoot());}
app.get('/api/storage/info',requireAuth,requirePermission('canAccessStorage'),(req,res)=>{const value=storageSummaryFor(req.session.user);res.set('Cache-Control','private, no-store').json({root:'NAS JMH',totalFiles:value.files,totalFolders:value.folders,totalBytes:value.bytes,maxUploadBytes:1024**3,calculating:value.scanning,approximate:value.truncated,updatedAt:value.at});});

// File metadata is read asynchronously with a bounded queue, never a synchronous
// stat for every file while all other clients are waiting on the Node event loop.
app.get('/api/storage/list',requireAuth,requirePermission('canAccessStorage'),async(req,res)=>{
 try{
  const requested=normalizeStoragePath(req.query.path||'');
  if(!canAccessStorage(req.session.user,requested))return res.status(403).json({error:'Accès refusé.'});
  const current=resolveStoragePath(requested),root=getStorageRoot();
  if(!(await fs.promises.stat(current)).isDirectory())return res.status(400).json({error:'Ce chemin n’est pas un dossier.'});
  const entries=await fs.promises.readdir(current,{withFileTypes:true}),items=[];let cursor=0;
  await Promise.all(Array.from({length:Math.min(8,entries.length)},async()=>{
   while(cursor<entries.length&&!req.aborted){
    const entry=entries[cursor++],relative=requested?requested+'/'+entry.name:entry.name;
    if(entry.name==='.jmh_trash'||entry.isSymbolicLink()||!canAccessStorage(req.session.user,relative))continue;
    let stat;try{stat=await fs.promises.lstat(path.join(current,entry.name));}catch(error){if(['ENOENT','EACCES','EPERM'].includes(error.code))continue;throw error;}
    if(stat.isSymbolicLink()||!stat.isFile()&&!stat.isDirectory())continue;
    items.push({name:entry.name,path:relative,type:stat.isDirectory()?'folder':'file',size:stat.isDirectory()?0:stat.size,modifiedAt:stat.mtime.toISOString(),extension:stat.isDirectory()?'':path.extname(entry.name).toLowerCase()});
   }
  }));
  items.sort((a,b)=>(a.type===b.type?0:a.type==='folder'?-1:1)||a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));
  res.set('Cache-Control','private, no-store').json({currentPath:requested,parentPath:current===root?null:requested.split('/').slice(0,-1).join('/'),items});
 }catch(error){res.status(error.code==='ENOENT'?404:400).json({error:error.code==='ENOENT'?'Dossier introuvable.':error.message});}
});

app.use('/api/storage',(req,res,next)=>{
 if(['POST','PATCH','DELETE','PUT'].includes(req.method))res.on('finish',()=>{if(res.statusCode<400)storageSearchIndex.invalidate();});next();
});
app.post("/api/storage/folder", requireAuth, requirePermission("canCreateStorageFolders", "Votre compte n’est pas autorisé à créer des dossiers."), (req, res) => {
  try {
    const relativeParent = normalizeStoragePath(req.body.path || "");
    if (!canAccessStorage(req.session.user, relativeParent)) return res.status(403).json({ error: "Accès refusé." });
    const parent = resolveStoragePath(relativeParent);
    const name = String(req.body.name || "").trim();

    if (!name || /[<>:"/\\\\|?*]/.test(name) || name === "." || name === "..") {
      return res.status(400).json({ error: "Nom de dossier invalide." });
    }

    const folder = resolveStoragePath(path.join(storageRelative(parent), name));
    if (fs.existsSync(folder)) return res.status(409).json({ error: "Ce dossier existe déjà." });

    fs.mkdirSync(folder, { recursive: false });
    audit("storage_folder_created", `Dossier créé : ${storageRelative(folder)}`, req.session.user.username);
    res.json({ item: fileInfo(folder) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// SMB_UPLOAD_FALLBACK_START
function moveNasUpload(source, target) {
  try {
    fs.renameSync(source, target);
    return;
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
  }

  let stagingDir;
  let stagedFile;
  let reservedTarget = false;
  let committed = false;
  let reservationFd;
  try {
    stagingDir = fs.mkdtempSync(path.join(path.dirname(target), ".jmh-upload-"));
    stagedFile = path.join(stagingDir, "content");
    fs.copyFileSync(source, stagedFile, fs.constants.COPYFILE_EXCL);

    // Reserve only a new name; never overwrite an existing document.
    reservationFd = fs.openSync(target, "wx");
    reservedTarget = true;
    fs.closeSync(reservationFd);
    reservationFd = undefined;
    fs.renameSync(stagedFile, target);
    committed = true;
    fs.unlinkSync(source);
  } catch (error) {
    // The API must retain the local upload if the SMB fallback fails.
    error.jmhPreserveNasUploadSource = source;
    throw error;
  } finally {
    if (reservationFd !== undefined) {
      try { fs.closeSync(reservationFd); } catch {}
    }
    if (reservedTarget && !committed) {
      try { fs.unlinkSync(target); } catch {}
    }
    if (stagedFile) {
      try { fs.unlinkSync(stagedFile); } catch {}
    }
    if (stagingDir) {
      try { fs.rmdirSync(stagingDir); } catch {}
    }
  }
}
// SMB_UPLOAD_FALLBACK_END

app.post("/api/storage/upload", requireAuth, requirePermission("canUploadStorage", "Votre compte n’est pas autorisé à ajouter des fichiers au NAS."), nasUpload.array("files", 50), (req, res) => {
  try {
    const relativeDestination = normalizeStoragePath(req.body.path || "");
    if (!canAccessStorage(req.session.user, relativeDestination)) { for(const file of req.files||[])try{fs.unlinkSync(file.path);}catch{} return res.status(403).json({ error: "Accès refusé." }); }
    const destination = resolveStoragePath(relativeDestination);
    if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory()) {
      for (const file of req.files || []) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
      return res.status(400).json({ error: "Dossier de destination invalide." });
    }

    const saved = [];
    for (const uploaded of req.files || []) {
      const safeName = path.basename(uploaded.originalname).replace(/[<>:"/\\\\|?*]/g, "_");
      let target = path.join(destination, safeName);
      const ext = path.extname(safeName);
      const stem = path.basename(safeName, ext);
      let index = 1;

      while (fs.existsSync(target)) {
        target = path.join(destination, `${stem} (${index})${ext}`);
        index++;
      }

      moveNasUpload(uploaded.path, target);
      saved.push(fileInfo(target));
      audit("storage_file_uploaded", `Fichier ajouté : ${storageRelative(target)}`, req.session.user.username);
    }

    res.json({ items: saved });
  } catch (error) {
    for (const file of req.files || []) {
      if (file.path === error.jmhPreserveNasUploadSource) continue;
      try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch {}
    }
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/storage/download", requireAuth, requirePermission("canDownloadStorage", "Votre compte n’est pas autorisé à télécharger des fichiers du NAS."), (req, res) => {
  try {
    const relativeTarget = normalizeStoragePath(req.query.path || "");
    if (!canAccessStorage(req.session.user, relativeTarget)) return res.status(403).json({ error: "Accès refusé." });
    const target = resolveStoragePath(relativeTarget);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }
    audit("storage_file_downloaded", `Fichier téléchargé : ${storageRelative(target)}`, req.session.user.username);
    res.download(target, path.basename(target));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/storage/preview", requireAuth, requirePermission("canDownloadStorage", "Votre compte n’est pas autorisé à afficher les fichiers du NAS."), (req, res) => {
  try {
    const relativeTarget = normalizeStoragePath(req.query.path || "");
    if (!canAccessStorage(req.session.user, relativeTarget)) return res.status(403).send("Accès refusé.");
    const target = resolveStoragePath(relativeTarget);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return res.status(404).send("Fichier introuvable.");
    }
    if (![".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".txt", ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".mp4", ".m4v", ".webm", ".mov"].includes(path.extname(target).toLowerCase())) {
      return res.status(415).send("Ce format doit être téléchargé pour être ouvert.");
    }
    res.set({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    if (path.extname(target).toLowerCase() === ".txt") res.type("text/plain");
    res.sendFile(target);
  } catch (error) {
    res.status(400).send(error.message);
  }
});

app.patch("/api/storage/rename", requireAdmin, (req, res) => {
  try {
    const target = resolveStoragePath(req.body.path || "");
    const newName = String(req.body.newName || "").trim();

    if (!fs.existsSync(target)) return res.status(404).json({ error: "Élément introuvable." });
    if (!newName || /[<>:"/\\\\|?*]/.test(newName) || newName === "." || newName === "..") {
      return res.status(400).json({ error: "Nouveau nom invalide." });
    }

    const renamed = path.join(path.dirname(target), newName);
    resolveStoragePath(storageRelative(renamed));
    if (fs.existsSync(renamed)) return res.status(409).json({ error: "Ce nom existe déjà." });

    fs.renameSync(target, renamed);
    audit("storage_item_renamed", `Renommé : ${storageRelative(target)} → ${storageRelative(renamed)}`, req.session.user.username);
    res.json({ item: fileInfo(renamed) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/storage/item", requireAdmin, (req, res) => {
  try {
    const target = resolveStoragePath(req.body.path || "");
    if (!fs.existsSync(target)) return res.status(404).json({ error: "Élément introuvable." });
    if (target === getStorageRoot()) return res.status(400).json({ error: "Impossible de supprimer la racine." });
    const originalPath = storageRelative(target);
    const trashDir = ensureTrashDir();
    const trashTarget = path.join(trashDir, `${Date.now()}-${path.basename(target)}`);
    fs.renameSync(target, trashTarget);
    const trash = readJson(TRASH_FILE);
    trash.push({ id: Date.now()+Math.random(), originalPath, trashPath: storageRelative(trashTarget), name:path.basename(target), deletedBy:req.session.user.username, deletedAt:new Date().toISOString(), type:fs.statSync(trashTarget).isDirectory()?"folder":"file" });
    writeJson(TRASH_FILE, trash);
    audit("storage_item_trashed", `Mis à la corbeille : ${originalPath}`, req.session.user.username);
    res.json({ok:true});
  } catch(error) { res.status(400).json({error:error.message}); }
});

const storageSearchIndex=require('./storage-search').createStorageSearch();
app.get('/api/storage/search',requireAuth,requirePermission('canAccessStorage'),async(req,res)=>{
 try{
  const result=await storageSearchIndex.search(getStorageRoot(),String(req.query.q||'').slice(0,200),relative=>canAccessStorage(req.session.user,relative),()=>req.aborted);
  res.set('Cache-Control','private, no-store').set('X-JMH-Search-Partial',String(result.partial)).json(result.items);
 }catch(error){res.status(400).json({error:error.message});}
});

app.get("/api/storage/trash", requireAdmin, (req,res)=>res.json(readJson(TRASH_FILE).slice().reverse()));
app.post("/api/storage/trash/:id/restore", requireAdmin, (req,res)=>{
  try{
    const trash=readJson(TRASH_FILE), i=trash.findIndex(x=>String(x.id)===req.params.id);
    if(i<0) return res.status(404).json({error:"Élément introuvable."});
    const item=trash[i], source=resolveStoragePath(item.trashPath); let dest=resolveStoragePath(item.originalPath);
    if(!fs.existsSync(source)) return res.status(404).json({error:"Fichier de corbeille introuvable."});
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    if(fs.existsSync(dest)) dest=path.join(path.dirname(dest),`${path.basename(dest)}-restaure-${Date.now()}`);
    fs.renameSync(source,dest); trash.splice(i,1); writeJson(TRASH_FILE,trash);
    audit("storage_item_restored",`Restauré : ${storageRelative(dest)}`,req.session.user.username); res.json({ok:true});
  }catch(error){res.status(400).json({error:error.message});}
});
app.delete("/api/storage/trash/:id", requireAdmin, (req,res)=>{
  try{
    const trash=readJson(TRASH_FILE), i=trash.findIndex(x=>String(x.id)===req.params.id);
    if(i<0) return res.status(404).json({error:"Élément introuvable."});
    const item=trash[i], source=resolveStoragePath(item.trashPath); if(fs.existsSync(source)) fs.rmSync(source,{recursive:true,force:true});
    trash.splice(i,1); writeJson(TRASH_FILE,trash); audit("storage_item_deleted_permanently",`Suppression définitive : ${item.originalPath}`,req.session.user.username); res.json({ok:true});
  }catch(error){res.status(400).json({error:error.message});}
});



app.get("/api/system/status", requireAuth, requirePermission("canUsePcTools"), (req, res) => {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const uptime = os.uptime();
  const storage = getStorageRoot();

  const usage=storageSummaryFor(req.session.user);
  const storageBytes=usage.bytes,storageFiles=usage.files;

  res.json({
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    cpuModel: cpus[0]?.model || "Inconnu",
    cpuCores: cpus.length,
    totalMemory,
    freeMemory,
    usedMemory: totalMemory - freeMemory,
    uptime,
    storageRoot: storage,
    storageBytes,
    storageFiles,
    nodeVersion: process.version,
    storageScanPending:usage.scanning,storageScannedAt:usage.at,storageScanTruncated:usage.truncated,
    appVersion: require("./package.json").version,
    port: PORT
  });
});


app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  users = readJson(USERS_FILE);
  const index = users.findIndex(item => String(item.id) === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Utilisateur introuvable." });
  const user = users[index];
  if (String(user.id) === String(req.session.user.id)) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
  }
  credentialVault.remove(user.id);
  users.splice(index, 1);
  writeJson(USERS_FILE, users);
  audit("user_deleted", `Compte supprimé : ${user.username}`, req.session.user.username);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/set-password",requireAdmin,(_req,res)=>res.status(410).json({error:'Les mots de passe personnels sont confidentiels. Utilise Générer un mot de passe provisoire.'}));

app.post("/api/account/change-password", requireAuth, async (req, res) => {
  users = readJson(USERS_FILE);
  const user = users.find(item => String(item.id) === String(req.session.user.id));
  if (!user) return res.status(404).json({ error: "Compte introuvable." });
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Le mot de passe actuel est incorrect." });
  }
  const validation=validatePersonalPassword(newPassword,req.body.confirmPassword);
  if(validation)return res.status(400).json({error:validation});
  const expectedHash=user.passwordHash,hash=await bcrypt.hash(newPassword,12);
  users=readJson(USERS_FILE);const fresh=users.find(u=>String(u.id)===String(user.id));
  if(!fresh?.active||fresh.passwordHash!==expectedHash||isPasswordPending(fresh))return res.status(409).json({error:'Le compte a changé. Reconnecte-toi avant de réessayer.'});
  fresh.passwordHash=hash;fresh.passwordState='personal';delete fresh.temporaryPasswordExpiresAt;
  fresh.authVersion=Number(fresh.authVersion||0)+1;req.session.authVersion=fresh.authVersion;
  credentialVault.remove(user.id);
  writeJson(USERS_FILE, users);
  audit("password_changed", "Mot de passe personnel modifié", user.username);
  res.json({ ok: true });
});

// Published installers are immutable copies. Only the manifest's active filename
// is downloadable; previous publications remain available for an administrator's rollback.
const UPDATE_PRODUCT = "jmh95200-workspace-stable";
const UPDATE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
let updatePublicationBusy = false;

function updateFilenameSafe(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.exe$/.test(value);
}

function updateVersionSafe(value) {
  return typeof value === "string" && value.length <= 48 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
    && value.split(".").every(part => Number.isSafeInteger(Number(part)));
}

function updateBuildSafe(value) {
  return typeof value === "string" && value.length <= 48 && /^\d+(?:\.\d+){1,7}$/.test(value)
    && value.split(".").every(part => Number.isSafeInteger(Number(part)));
}

function readUpdateManifest() {
  // Legacy metadata remains visible, but it is never upgraded with invented hashes.
  let saved;
  try { saved = JSON.parse(fs.readFileSync(UPDATE_INFO_FILE, "utf8")); } catch { return {}; }
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const info = {};
  for (const key of ["schema", "product", "platform", "arch", "version", "build", "size", "sha256", "notes", "publishedAt", "publishedBy", "expiresAt", "keyId", "signature"]) {
    if (Object.prototype.hasOwnProperty.call(saved, key)) info[key] = saved[key];
  }
  if (updateFilenameSafe(saved.filename)) info.filename = saved.filename;
  return info;
}

function updatePublicManifest(info) {
  return { ...info, downloadUrl: info.filename ? `/api/updates/download/${encodeURIComponent(info.filename)}` : "" };
}

function updatePathEqual(first, second) {
  const normalize = value => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
  return normalize(first) === normalize(second);
}

async function openRegularUpdate(file, directory) {
  const folder = await fs.promises.lstat(directory);
  if (!folder.isDirectory() || folder.isSymbolicLink() || !updatePathEqual(await fs.promises.realpath(directory), directory)) {
    throw new Error("Update directory must be an ordinary local directory");
  }
  if (!updatePathEqual(path.dirname(file), directory)) throw new Error("Update path outside directory");
  const stat = await fs.promises.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || !updatePathEqual(await fs.promises.realpath(file), file)) {
    throw new Error("Update must be an ordinary file");
  }
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size) {
      throw new Error("Update file changed while opening");
    }
    return { handle, stat: opened };
  } catch (error) { await handle.close(); throw error; }
}

async function hashUpdateHandle(handle) {
  const hash = require("crypto").createHash("sha256");
  const stream = fs.createReadStream(null, { fd: handle.fd, autoClose: false, start: 0 });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function validateUpdateExecutable(handle, size) {
  if (!Number.isSafeInteger(size) || size < 88 || size > UPDATE_MAX_BYTES) return false;
  const dos = Buffer.alloc(64);
  if ((await handle.read(dos, 0, dos.length, 0)).bytesRead !== dos.length || dos[0] !== 0x4d || dos[1] !== 0x5a) return false;
  const offset = dos.readUInt32LE(0x3c);
  if (offset < 64 || offset > size - 24) return false;
  const pe = Buffer.alloc(24);
  return (await handle.read(pe, 0, pe.length, offset)).bytesRead === pe.length
    && pe[0] === 0x50 && pe[1] === 0x45 && pe[2] === 0 && pe[3] === 0;
}

async function cleanupUpdateTemporary(file) {
  if (!file || !updatePathEqual(path.dirname(file), path.join(DATA_DIR, "update_temp"))) return;
  try { await fs.promises.unlink(file); } catch (error) { if (error.code !== "ENOENT") console.error("JMH update temporary cleanup failed:", error.code); }
}

function receiveUpdateInstaller(req, res, next) {
  updateUpload.single("installer")(req, res, error => {
    if (!error) return next();
    cleanupUpdateTemporary(req.file?.path).finally(() => {
      res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "L’installateur n’a pas pu être reçu (limite : 2 Gio)." });
    });
  });
}

app.get("/api/updates/current", requireAuth, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(updatePublicManifest(readUpdateManifest()));
});

app.get("/api/updates/download/:filename", requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const info = readUpdateManifest();
  if (!info.filename || !updateFilenameSafe(req.params.filename) || req.params.filename !== info.filename) {
    return res.status(404).json({ error: "Mise à jour introuvable." });
  }
  let opened;
  try {
    opened = await openRegularUpdate(path.join(UPDATES_DIR, info.filename), UPDATES_DIR);
    if (opened.stat.size < 1 || opened.stat.size > UPDATE_MAX_BYTES) throw new Error("Invalid installer size");
    if (info.schema === 1) {
      if (!Number.isSafeInteger(info.size) || info.size !== opened.stat.size || !/^[a-f0-9]{64}$/.test(info.sha256 || "")) {
        return res.status(409).json({ error: "L’installateur ne correspond plus à la publication." });
      }
      const hash = await hashUpdateHandle(opened.handle);
      const after = await opened.handle.stat();
      if (hash !== info.sha256 || after.size !== opened.stat.size || after.mtimeMs !== opened.stat.mtimeMs) {
        return res.status(409).json({ error: "L’installateur a changé depuis sa publication." });
      }
    }
    res.set("Content-Type", "application/octet-stream");
    res.set("Content-Disposition", `attachment; filename="${info.filename}"`);
    res.set("Content-Length", String(opened.stat.size));
    const stream = fs.createReadStream(null, { fd: opened.handle.fd, autoClose: false, start: 0 });
    await new Promise((resolve, reject) => {
      stream.once("error", reject);
      res.once("finish", resolve);
      res.once("close", () => { stream.destroy(); resolve(); });
      stream.pipe(res);
    });
  } catch {
    if (!res.headersSent) res.status(404).json({ error: "Fichier de mise à jour absent ou inaccessible." });
    else res.destroy();
  } finally { if (opened) await opened.handle.close().catch(() => {}); }
});

app.post("/api/admin/updates", requireAuth, requireAdmin, receiveUpdateInstaller, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!req.file) return res.status(400).json({ error: "Sélectionnez un installateur .exe." });
  if (updatePublicationBusy) {
    await cleanupUpdateTemporary(req.file.path);
    return res.status(409).json({ error: "Une publication est déjà en cours. Réessayez dans un instant." });
  }
  updatePublicationBusy = true;
  let opened, target, staging, manifestTemporary, committed = false, outcome;
  const invalid = message => Object.assign(new Error(message), { status: 400 });
  try {
    const version = typeof req.body.version === "string" ? req.body.version.trim() : "";
    const build = typeof req.body.build === "string" ? req.body.build.trim() : "";
    if (!updateVersionSafe(version)) throw invalid("Version invalide. Exemple : 5.2.0");
    if (!updateBuildSafe(build)) throw invalid("Build invalide. Exemple : 2026.10.01.1");
    if (!/\.exe$/i.test(req.file.originalname)) throw invalid("Le fichier doit être un installateur .exe.");
    opened = await openRegularUpdate(req.file.path, path.join(DATA_DIR, "update_temp"));
    if (!(await validateUpdateExecutable(opened.handle, opened.stat.size))) {
      throw invalid("Le fichier ne contient pas un exécutable Windows MZ/PE valide.");
    }
    const sha256 = await hashUpdateHandle(opened.handle);
    const after = await opened.handle.stat();
    if (after.size !== opened.stat.size || after.mtimeMs !== opened.stat.mtimeMs) throw new Error("Uploaded installer changed");
    const nonce = require("crypto").randomBytes(8).toString("hex");
    const filename = `JMH95200-Workspace-Update-${version}-build-${build}-${nonce}.exe`;
    if (!updateFilenameSafe(filename)) throw new Error("Invalid generated installer filename");
    const updateFolder = await fs.promises.lstat(UPDATES_DIR);
    if (!updateFolder.isDirectory() || updateFolder.isSymbolicLink() || !updatePathEqual(await fs.promises.realpath(UPDATES_DIR), UPDATES_DIR)) {
      throw new Error("Unsafe updates directory");
    }
    target = path.join(UPDATES_DIR, filename);
    staging = `${target}.pending`;
    await fs.promises.copyFile(req.file.path, staging, fs.constants.COPYFILE_EXCL);
    const copied = await openRegularUpdate(staging, UPDATES_DIR);
    try {
      if (copied.stat.size !== opened.stat.size || await hashUpdateHandle(copied.handle) !== sha256) throw new Error("Installer copy verification failed");
    } finally { await copied.handle.close(); }
    await fs.promises.rename(staging, target);
    staging = undefined;
    const info = {
      schema: 1, product: UPDATE_PRODUCT, platform: "win32", arch: "x64", version, build,
      filename, size: opened.stat.size, sha256,
      notes: String(req.body.notes || "").trim().slice(0, 5000),
      publishedAt: new Date().toISOString(), publishedBy: req.session.user.username
    };
    manifestTemporary = `${UPDATE_INFO_FILE}.${nonce}.tmp`;
    await fs.promises.writeFile(manifestTemporary, JSON.stringify(info, null, 2), { encoding: "utf8", flag: "wx" });
    await fs.promises.rename(manifestTemporary, UPDATE_INFO_FILE);
    manifestTemporary = undefined;
    committed = true;
    try { audit("update_published", `Mise à jour publiée : ${version} (${build})`, req.session.user.username); } catch {}
    io.emit("update_available", updatePublicManifest(info));
    outcome = { status: 200, body: updatePublicManifest(info) };
  } catch (error) {
    outcome = { status: error.status === 400 ? 400 : 500, body: { error: error.status === 400 ? error.message : "La mise à jour n’a pas été publiée. La publication précédente est conservée." } };
  } finally {
    if (opened) await opened.handle.close().catch(() => {});
    await cleanupUpdateTemporary(req.file.path);
    for (const file of [staging, manifestTemporary, committed ? undefined : target]) {
      if (file) await fs.promises.unlink(file).catch(() => {});
    }
    updatePublicationBusy = false;
  }
  if (!res.headersSent) res.status(outcome.status).json(outcome.body);
});

app.patch('/api/account/profile',requireAuth,(req,res)=>{
 const list=readJson(USERS_FILE),user=list.find(u=>String(u.id)===String(req.session.user.id));
 const name=String(req.body.displayName??user.displayName??user.username).trim();if(!name||name.length>60)return res.status(400).json({error:'Pseudo de 1 à 60 caractères requis.'});
 const avatar=req.body.avatar===undefined?user.avatar:req.body.avatar;
 /* 7.2.1 : toute icône présente dans public/avatars, ou « theme » (assortie au thème choisi sur l'appareil). */if(avatar!==null&&avatar!==undefined&&avatar!=='theme'&&!(typeof avatar==='string'&&/^[a-z0-9-]{1,40}$/.test(avatar)&&fs.existsSync(path.join(__dirname,'public','avatars',avatar+'.svg'))))return res.status(400).json({error:'Avatar invalide.'});
 user.displayName=name;user.avatar=avatar||null;writeJson(USERS_FILE,list);req.session.user=publicUser(user);res.set('Cache-Control','no-store').json({user:req.session.user});
});
app.get("/api/settings", requireAuth, (req, res) => {
  res.json(readJson(APP_SETTINGS_FILE));
});

app.put("/api/settings", requireAdmin, (req, res) => {
  const current = readJson(APP_SETTINGS_FILE);
  const next = {
    companyName: String(req.body.companyName || current.companyName || "JMH95200").trim().slice(0, 80),
    workspaceName: String(req.body.workspaceName || current.workspaceName || "JMH95200 Workspace").trim().slice(0, 120),
    slogan: String(req.body.slogan || current.slogan || "").trim().slice(0, 200),
    accent: ["blue", "violet", "green", "orange"].includes(req.body.accent) ? req.body.accent : (current.accent || "blue"),
    defaultTheme: ["dark", "light"].includes(req.body.defaultTheme) ? req.body.defaultTheme : (current.defaultTheme || "dark")
  };
  writeJson(APP_SETTINGS_FILE, next);
  audit("settings_updated", "Paramètres généraux modifiés", req.session.user.username);
  io.emit("settings_updated", next);
  res.json(next);
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  const allUsers = readJson(USERS_FILE);
  const messages = readJson(MESSAGES_FILE);
  const tasks = readJson(TASKS_FILE);
  const announcements = readJson(ANNOUNCEMENTS_FILE);
  const visibleTasks = req.session.user.role === "admin" ? tasks : tasks.filter(task => task.assignedTo === req.session.user.username || task.createdBy === req.session.user.username);
  res.json({
    totalUsers: allUsers.filter(user => user.active).length,
    onlineUsers: [...onlineUsers.keys()].length,
    messagesToday: messages.filter(message => new Date(message.at).toDateString() === new Date().toDateString()).length,
    pendingTasks: visibleTasks.filter(task => task.status !== "done").length,
    completedTasks: visibleTasks.filter(task => task.status === "done").length,
    latestAnnouncements: announcements.slice(-5).reverse(),
    currentOnlineUsers: [...onlineUsers.keys()],
    upcomingEvents: readJson(EVENTS_FILE)
      .filter(event => req.session.user.role === "admin" || event.visibility === "all" ||
        event.createdBy === req.session.user.username ||
        (Array.isArray(event.attendees) && event.attendees.includes(req.session.user.username)))
      .filter(event => new Date(event.endAt) >= new Date())
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
      .slice(0, 5),
    latestTasks: visibleTasks.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 5)
  });
});

app.get("/api/tasks", requireAuth, (req, res) => {
  const tasks = readJson(TASKS_FILE);
  const visible = req.session.user.role === "admin" ? tasks : tasks.filter(task => task.assignedTo === req.session.user.username || task.createdBy === req.session.user.username);
  res.json(visible.slice().reverse());
});

app.post("/api/tasks", requireAuth, (req, res) => {
  const title = String(req.body.title || "").trim();
  const assignedTo = String(req.body.assignedTo || req.session.user.username).trim();
  const priority = ["low","normal","high"].includes(req.body.priority) ? req.body.priority : "normal";
  if (!title) return res.status(400).json({ error: "Le titre de la tache est obligatoire." });
  const allUsers = readJson(USERS_FILE);
  if (!allUsers.some(user => user.active && user.username === assignedTo)) return res.status(400).json({ error: "Utilisateur assigne introuvable." });
  const task = { id: Date.now()+Math.random(), title, description:String(req.body.description||"").trim().slice(0,4000), assignedTo, createdBy:req.session.user.username, dueDate:String(req.body.dueDate||"")||null, priority, status:"todo", createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
  const tasks=readJson(TASKS_FILE); tasks.push(task); writeJson(TASKS_FILE,tasks); audit("task_created",`Tache creee pour ${assignedTo} : ${title}`,req.session.user.username); io.emit("task_created",task); res.json(task);
});

app.patch("/api/tasks/:id", requireAuth, (req, res) => {
  const tasks=readJson(TASKS_FILE); const task=tasks.find(item=>String(item.id)===req.params.id); if(!task) return res.status(404).json({error:"Tache introuvable."});
  const allowed=req.session.user.role==="admin"||task.assignedTo===req.session.user.username||task.createdBy===req.session.user.username; if(!allowed) return res.status(403).json({error:"Modification non autorisee."});
  if(["todo","doing","done"].includes(req.body.status)) task.status=req.body.status; task.updatedAt=new Date().toISOString(); writeJson(TASKS_FILE,tasks); audit("task_updated",`Tache modifiee : ${task.title}`,req.session.user.username); io.emit("task_updated",task); res.json(task);
});

app.delete("/api/tasks/:id", requireAdmin, (req, res) => {
  const tasks=readJson(TASKS_FILE); const index=tasks.findIndex(item=>String(item.id)===req.params.id); if(index<0) return res.status(404).json({error:"Tache introuvable."}); const [removed]=tasks.splice(index,1); writeJson(TASKS_FILE,tasks); audit("task_deleted",`Tache supprimee : ${removed.title}`,req.session.user.username); io.emit("task_deleted",{id:removed.id}); res.json({ok:true});
});

app.get("/api/announcements", requireAuth, (req, res) => res.json(readJson(ANNOUNCEMENTS_FILE).slice().reverse()));
app.post("/api/announcements", requireAdmin, (req, res) => {
  const title=String(req.body.title||"").trim(); const content=String(req.body.content||"").trim().slice(0,5000); if(!title||!content) return res.status(400).json({error:"Le titre et le contenu sont obligatoires."});
  const item={id:Date.now()+Math.random(),title,content,createdBy:req.session.user.username,createdAt:new Date().toISOString()}; const list=readJson(ANNOUNCEMENTS_FILE); list.push(item); writeJson(ANNOUNCEMENTS_FILE,list.slice(-500)); audit("announcement_created",`Annonce publiee : ${title}`,req.session.user.username); io.emit("announcement",item); res.json(item);
});
app.delete("/api/announcements/:id", requireAdmin, (req, res) => { const list=readJson(ANNOUNCEMENTS_FILE); const i=list.findIndex(x=>String(x.id)===req.params.id); if(i<0) return res.status(404).json({error:"Annonce introuvable."}); list.splice(i,1); writeJson(ANNOUNCEMENTS_FILE,list); res.json({ok:true}); });


app.get("/api/events", requireAuth, (req, res) => {
  const events = readJson(EVENTS_FILE);
  const visible = req.session.user.role === "admin"
    ? events
    : events.filter(event =>
        event.visibility === "all" ||
        event.createdBy === req.session.user.username ||
        (Array.isArray(event.attendees) && event.attendees.includes(req.session.user.username))
      );
  res.json(visible.sort((a, b) => new Date(a.startAt) - new Date(b.startAt)));
});

app.post("/api/events", requireAuth, (req, res) => {
  const title = String(req.body.title || "").trim();
  const startAt = String(req.body.startAt || "").trim();
  const endAt = String(req.body.endAt || "").trim();
  const location = String(req.body.location || "").trim().slice(0, 300);
  const description = String(req.body.description || "").trim().slice(0, 5000);
  const visibility = req.body.visibility === "all" ? "all" : "selected";
  let attendees = Array.isArray(req.body.attendees) ? req.body.attendees.map(String) : [];

  if (!title || !startAt || !endAt) {
    return res.status(400).json({ error: "Le titre, le début et la fin sont obligatoires." });
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return res.status(400).json({ error: "La fin doit être postérieure au début." });
  }

  if (req.session.user.role !== "admin") {
    attendees = [req.session.user.username];
  }

  const event = {
    id: Date.now() + Math.random(),
    title,
    startAt,
    endAt,
    location,
    description,
    visibility: req.session.user.role === "admin" ? visibility : "selected",
    attendees,
    createdBy: req.session.user.username,
    createdAt: new Date().toISOString()
  };

  const events = readJson(EVENTS_FILE);
  events.push(event);
  writeJson(EVENTS_FILE, events);

  const allUsers = readJson(USERS_FILE).filter(user => user.active).map(user => user.username);
  const recipients = event.visibility === "all" ? allUsers : event.attendees;
  notifyUsers(
    recipients,
    "calendar",
    "Nouvel événement",
    `${event.title} — ${new Date(event.startAt).toLocaleString("fr-FR")}`,
    "calendarPage"
  );

  audit("event_created", `Événement créé : ${title}`, req.session.user.username);
  io.emit("event_created", event);
  res.json(event);
});

app.patch("/api/events/:id", requireAuth, (req, res) => {
  const events = readJson(EVENTS_FILE);
  const event = events.find(item => String(item.id) === req.params.id);
  if (!event) return res.status(404).json({ error: "Événement introuvable." });

  const allowed = req.session.user.role === "admin" || event.createdBy === req.session.user.username;
  if (!allowed) return res.status(403).json({ error: "Modification non autorisée." });

  if (typeof req.body.title === "string" && req.body.title.trim()) event.title = req.body.title.trim();
  if (typeof req.body.startAt === "string" && req.body.startAt) event.startAt = req.body.startAt;
  if (typeof req.body.endAt === "string" && req.body.endAt) event.endAt = req.body.endAt;
  if (typeof req.body.location === "string") event.location = req.body.location.trim().slice(0, 300);
  if (typeof req.body.description === "string") event.description = req.body.description.trim().slice(0, 5000);
  if (req.session.user.role === "admin") {
    event.visibility = req.body.visibility === "all" ? "all" : "selected";
    if (Array.isArray(req.body.attendees)) event.attendees = req.body.attendees.map(String);
  }

  if (new Date(event.endAt) <= new Date(event.startAt)) {
    return res.status(400).json({ error: "La fin doit être postérieure au début." });
  }

  event.updatedAt = new Date().toISOString();
  writeJson(EVENTS_FILE, events);
  audit("event_updated", `Événement modifié : ${event.title}`, req.session.user.username);
  io.emit("event_updated", event);
  res.json(event);
});

app.delete("/api/events/:id", requireAuth, (req, res) => {
  const events = readJson(EVENTS_FILE);
  const index = events.findIndex(item => String(item.id) === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Événement introuvable." });

  const event = events[index];
  const allowed = req.session.user.role === "admin" || event.createdBy === req.session.user.username;
  if (!allowed) return res.status(403).json({ error: "Suppression non autorisée." });

  events.splice(index, 1);
  writeJson(EVENTS_FILE, events);
  audit("event_deleted", `Événement supprimé : ${event.title}`, req.session.user.username);
  io.emit("event_deleted", { id: event.id });
  res.json({ ok: true });
});

app.get("/api/notifications", requireAuth, (req, res) => {
  const notifications = readJson(NOTIFICATIONS_FILE)
    .filter(item => item.username === req.session.user.username)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(notifications.slice(0, 300));
});

app.patch("/api/notifications/:id/read", requireAuth, (req, res) => {
  const notifications = readJson(NOTIFICATIONS_FILE);
  const item = notifications.find(notification =>
    String(notification.id) === req.params.id &&
    notification.username === req.session.user.username
  );
  if (!item) return res.status(404).json({ error: "Notification introuvable." });
  item.read = true;
  writeJson(NOTIFICATIONS_FILE, notifications);
  res.json(item);
});

app.post("/api/notifications/read-all", requireAuth, (req, res) => {
  const notifications = readJson(NOTIFICATIONS_FILE);
  for (const item of notifications) {
    if (item.username === req.session.user.username) item.read = true;
  }
  writeJson(NOTIFICATIONS_FILE, notifications);
  res.json({ ok: true });
});

app.delete("/api/notifications", requireAuth, (req, res) => {
  const notifications = readJson(NOTIFICATIONS_FILE)
    .filter(item => item.username !== req.session.user.username);
  writeJson(NOTIFICATIONS_FILE, notifications);
  res.json({ ok: true });
});

app.get("/api/export/messages.csv", requireAuth, (req, res) => {
  const visible = readJson(MESSAGES_FILE).filter(message => canViewMessage(req.session.user, message));
  const csv = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Date", "Expéditeur", "Destinataire", "Message", "Fichier"].map(csv).join(";"),
    ...visible.map(message => [
      new Date(message.at).toLocaleString("fr-FR"),
      message.username,
      message.to === "all" || !message.to ? "Toute l'équipe" : message.to,
      message.text || "",
      message.file?.name || ""
    ].map(csv).join(";"))
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="jmh95200-messages.csv"');
  res.send("\ufeff" + rows.join("\n"));
});

app.get("/api/admin/audit", requireAdmin, (req, res) => {
  res.status(403).json({error:"Le journal de supervision est réservé au Propriétaire."});
});

io.engine.use(sessionMiddleware);
io.use((socket,next)=>refreshSession(socket.request)?next():next(Error('Non connecté.')));

io.on("connection", socket => {
  const user = socket.request.session?.user;
  if (!user) return socket.disconnect(true);

  if (!onlineUsers.has(user.username)) onlineUsers.set(user.username, new Set());
  onlineUsers.get(user.username).add(socket.id);
  socket.join(`user:${user.username}`);
  socket.emit("connected", { username: user.username });
  io.emit("presence_list", [...onlineUsers.keys()]);

  socket.on("message", payload => {
    socket.emit("message_error","La messagerie a été retirée de JMH.");return;
    const currentUser = readJson(USERS_FILE).find(item => String(item.id) === String(user.id));
    if (!currentUser || !currentUser.active || !hasPermission(currentUser, "canSendMessages")) {
      socket.emit("message_error", "Votre compte n’est pas autorisé à envoyer des messages.");
      return;
    }
    const text = String(payload?.text || "").trim().slice(0, 4000);
    const to = normalizeRecipient(payload?.to);
    const recipientError = validateRecipientForUser(currentUser, to);
    if (recipientError) {
      socket.emit("message_error", recipientError);
      return;
    }

    if (!text) return;
    if (!recipientExists(to)) {
      socket.emit("message_error", "Le destinataire n’existe pas ou n’est plus actif.");
      return;
    }

    const message = {
      id: Date.now() + Math.random(),
      username: user.username,
      to,
      text,
      at: new Date().toISOString()
    };

    const messages = readJson(MESSAGES_FILE);
    messages.push(message);
    writeJson(MESSAGES_FILE, messages.slice(-5000));
    audit("message_sent", `Message envoyé à ${to === "all" ? "tous" : to}`, user.username);
    emitMessage(message);
  });

  socket.on("disconnect", () => {
    const sockets = onlineUsers.get(user.username);
    if (sockets) { sockets.delete(socket.id); if (!sockets.size) onlineUsers.delete(user.username); }
    io.emit("presence_list", [...onlineUsers.keys()]);
  });
});

function getLocalIps() {
  const ips = [];
  const networks = os.networkInterfaces();

  for (const name of Object.keys(networks)) {
    for (const net of networks[name] || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }

  return ips;
}

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error("\nLe port 3000 est déjà utilisé.");
    console.error("Fermez l'ancienne fenêtre JMH95200 ou utilisez le lanceur stable.\n");
    process.exit(2);
  }
  console.error(error);
  process.exit(1);
});

let secureServer=null;
function startServer() {
  if (server.listening) return server;
  if(!secureServer)secureServer=require('./secure-server').startSecureServer({app,attach:secure=>{io.attach(secure);io.engine.use(sessionMiddleware);}});
  server.listen(PORT, "0.0.0.0", () => {
    storageSearchIndex.warm(getStorageRoot()).promise.catch(()=>storageSearchIndex.invalidate());
    console.log("\n====================================================");
    console.log(" JMH95200 Workspace Enterprise V5.1 centralisé est démarré");
    console.log(` Sur ce PC : http://localhost:${PORT}`);
    for (const ip of getLocalIps()) console.log(` Sur un autre PC : http://${ip}:${PORT}`);
    console.log("====================================================\n");
  });
  return server;
}

function closeServer(callback) {
  if(secureServer?.listening){secureServer.close();secureServer.closeAllConnections();}
  io.close(() => {
    if (server.listening) server.close(callback);
    else if (callback) callback();
  });
}

if (require.main === module || process.env.JMH_ELECTRON === "1") startServer();
module.exports = { startServer, closeServer, server, PORT, getLocalIps, get secureServer(){return secureServer;} };
