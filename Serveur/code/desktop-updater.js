const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const {pinnedAgent}=require("./secure-transport");
const { Transform } = require("stream");
const { pipeline } = require("stream/promises");
const { spawn } = require("child_process");
const { normalizeServerUrl, DEFAULT_SERVER_URL } = require("./desktop-connection");

const PRODUCT = "jmh95200-workspace-stable";
const MAX_INSTALLER = 2 * 1024 * 1024 * 1024;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUILD = /^\d{1,10}(?:\.\d{1,10}){1,7}$/;
function compareNumbers(a, b) {
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}
function validVersion(value) {
  return typeof value === "string" && value.length <= 64 && VERSION.test(value) &&
    value.split(".").every(part => Number.isSafeInteger(Number(part)));
}
function validBuild(value) { return typeof value === "string" && value.length <= 48 && BUILD.test(value); }
function manifest(info, platform, arch) {
  if (!info?.filename) return null;
  if (info.schema !== 1 || info.product !== PRODUCT || info.platform !== platform || info.arch !== arch ||
      platform !== "win32" || !validVersion(info.version) || !validBuild(info.build) ||
      typeof info.filename !== "string" || info.filename.length > 240 || !/^JMH95200-Workspace-Update-[A-Za-z0-9.-]+\.exe$/.test(info.filename) ||
      !Number.isSafeInteger(info.size) || info.size < 68 || info.size > MAX_INSTALLER ||
      typeof info.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(info.sha256) ||
      typeof info.publishedAt !== "string" || !Number.isFinite(Date.parse(info.publishedAt)) ||
      info.downloadUrl !== "/api/updates/download/" + encodeURIComponent(info.filename)) {
    throw new Error("L’installateur publié n’a pas de manifeste compatible et vérifiable. Aucune installation automatique.");
  }
  return info;
}
function createDesktopUpdater({ app, getMainWindow, readConnectionConfig,
  startedAt = Date.now(), platform = process.platform, arch = process.arch,
  build = require("./build-info.json").build, executeInstaller }) {
  if (!validBuild(build)) throw new Error("Invalid application build.");
  const checks = new Map();
  let installation;
  function configuredOrigin() {
    const config = readConnectionConfig();
    if (config.mode !== "client" || config.needsMigration) throw new Error("Configurez ce PC comme client du serveur JMH sur le NAS avant de rechercher une mise à jour.");
    const url = new URL(normalizeServerUrl(config.serverUrl || DEFAULT_SERVER_URL));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) throw new Error("Adresse du serveur JMH invalide.");
    return url.origin;
  }
  async function context(event) {
    const window = getMainWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents ||
        (event.senderFrame && window.webContents.mainFrame && event.senderFrame !== window.webContents.mainFrame)) {
      throw new Error("La mise à jour doit être demandée depuis la fenêtre principale de JMH.");
    }
    const origin = configuredOrigin();
    const frame = new URL(event.senderFrame?.url || event.sender.getURL());
    if (frame.origin !== origin || !["/", "/index.html"].includes(frame.pathname)) {
      throw new Error("Origine de mise à jour non autorisée.");
    }
    const cookies = await event.sender.session.cookies.get({ url: origin });
    const cookie = cookies.map(item => {
      if (/[\r\n;]/.test(item.name + item.value)) throw new Error("Session invalide.");
      return item.name + "=" + item.value;
    }).join("; ");
    if (!cookie || cookie.length > 16384) throw new Error("Connectez-vous à JMH avant de rechercher une mise à jour.");
    const base = new URL(origin);
    const ctx = { origin, base: base.origin, cookie };
    const auth = await json(ctx, "/api/me");
    if (!auth?.user) throw new Error("La session JMH a expiré. Reconnectez-vous.");
    return ctx;
  }
  function response(ctx, route, timeout = 15000, totalTimeout = timeout) {
    return new Promise((resolve, reject) => {
      const url = new URL(route, ctx.base);
      if (url.origin !== ctx.base || !route.startsWith("/api/")) return reject(new Error("Adresse de téléchargement interdite."));
      const client = url.protocol === "https:" ? https : http;
      const request = client.get(url, { agent:url.protocol==="https:"?pinnedAgent(readConnectionConfig().tlsPin):undefined,headers: { Cookie: ctx.cookie } }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(res.statusCode === 401 ? "La session JMH a expiré. Reconnectez-vous." :
            "Téléchargement refusé par le serveur JMH (" + res.statusCode + ")."));
        }
        resolve({ request, response: res });
      });
      request.setTimeout(timeout, () => request.destroy(new Error("Le serveur JMH ne répond pas dans le délai prévu.")));
      const deadline = setTimeout(() => request.destroy(new Error("Le téléchargement a dépassé sa durée maximale.")), totalTimeout);
      request.once("close", () => clearTimeout(deadline));
      request.on("error", reject);
    });
  }
  async function json(ctx, route) {
    const { response: res } = await response(ctx, route);
    const chunks = [];
    let length = 0;
    for await (const chunk of res) {
      length += chunk.length;
      if (length > 65536) { res.destroy(); throw new Error("Réponse de mise à jour trop volumineuse."); }
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  function newer(info) {
    const version = compareNumbers(info.version, app.getVersion());
    return version > 0 || (version === 0 && compareNumbers(info.build, build) > 0);
  }
  function attemptPath() { return path.join(app.getPath("userData"), "updater", "last-attempt.json"); }
  function attempted(info) {
    try {
      const previous = JSON.parse(fs.readFileSync(attemptPath(), "utf8"));
      return previous.state === "launched" && previous.sha256 === info.sha256;
    } catch { return false; }
  }
  async function executable(file, expectedSize) {
    const handle = await fs.promises.open(file, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== expectedSize) throw new Error("Taille d’installateur incorrecte.");
      const header = Buffer.alloc(64);
      if ((await handle.read(header, 0, 64, 0)).bytesRead !== 64 || header[0] !== 77 || header[1] !== 90) {
        throw new Error("Le fichier reçu n’est pas un programme Windows valide.");
      }
      const offset = header.readUInt32LE(60);
      if (offset < 64 || offset > Math.min(1024 * 1024, expectedSize - 4)) throw new Error("En-tête d’installateur invalide.");
      const signature = Buffer.alloc(4);
      if ((await handle.read(signature, 0, 4, offset)).bytesRead !== 4 || !signature.equals(Buffer.from([80, 69, 0, 0]))) {
        throw new Error("En-tête d’installateur invalide.");
      }
    } finally { await handle.close(); }
  }
  async function download(ctx, info) {
    const directory = path.join(app.getPath("userData"), "updater");
    await fs.promises.mkdir(directory, { recursive: true });
    const temporary = path.join(directory, "download-" + crypto.randomUUID() + ".part");
    const target = temporary.slice(0, -5) + ".exe";
    try {
      const { response: res } = await response(ctx, info.downloadUrl, 30000, 10 * 60 * 1000);
      const length = res.headers["content-length"];
      if (length !== undefined && Number(length) !== info.size) { res.destroy(); throw new Error("Taille annoncée différente du manifeste."); }
      let received = 0;
      const hash = crypto.createHash("sha256");
      const validate = new Transform({ transform(chunk, encoding, callback) {
        received += chunk.length;
        if (received > info.size) return callback(new Error("Installateur plus volumineux que prévu."));
        hash.update(chunk);
        callback(null, chunk);
      } });
      await pipeline(res, validate, fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      if (received !== info.size || hash.digest("hex") !== info.sha256.toLowerCase()) {
        throw new Error("Le SHA-256 de l’installateur ne correspond pas. Installation refusée.");
      }
      await executable(temporary, info.size);
      await fs.promises.rename(temporary, target);
      return target;
    } finally { await fs.promises.unlink(temporary).catch(() => {}); }
  }
  async function launch(ctx, info, automatic) {
    if (installation) return installation;
    installation = (async () => {
      const file = await download(ctx, info);
      const record = { state: "launched", sha256: info.sha256, version: info.version, build: info.build, attemptedAt: new Date().toISOString() };
      const temporary = attemptPath() + "." + crypto.randomUUID() + ".tmp";
      await fs.promises.writeFile(temporary, JSON.stringify(record), { flag: "wx", mode: 0o600 });
      await fs.promises.rename(temporary, attemptPath());
      try {
        if (executeInstaller) await executeInstaller(file);
        else await new Promise((resolve, reject) => {
          const child = spawn(file, [], { shell: false, detached: true, stdio: "ignore" });
          child.once("error", reject);
          child.once("spawn", () => { child.unref(); resolve(); });
        });
      } catch (error) {
        record.state = "failed";
        await fs.promises.writeFile(attemptPath(), JSON.stringify(record)).catch(() => {});
        throw error;
      }
      setTimeout(() => app.quit(), 500);
      return { ok: true, available: true, action: "install-launched", automatic, version: info.version, build: info.build };
    })().catch(error => { installation = null; throw error; });
    return installation;
  }
  async function inspect(event, automatic) {
    const ctx = await context(event);
    if(platform!=="win32")return{ok:true,available:false,manual:true,message:"Les paquets Linux sont disponibles dans les installateurs JMH du NAS. Aucun programme Windows ne sera exécuté.",currentVersion:app.getVersion(),currentBuild:build};
    const info = manifest(await json(ctx, "/api/updates/current"), platform, arch);
    const current = { currentVersion: app.getVersion(), currentBuild: build };
    if (!info || !newer(info)) return { ok: true, available: false, ...current };
    if (automatic && (Date.parse(info.publishedAt) > startedAt || attempted(info))) {
      return { ok: true, available: true, action: attempted(info) ? "already-attempted" : "next-launch", ...current,
        version: info.version, build: info.build };
    }
    return launch(ctx, info, automatic);
  }
  return {
    getBuild: () => build,
    check: async event => {
      try {
        const origin = configuredOrigin();
        // Validate every caller even when another window has already checked this server.
        await context(event);
        // A failed check (network, expired session) must not stick until the app restarts.
        if (!checks.has(origin)) checks.set(origin, inspect(event, true).catch(error => { checks.delete(origin); return { ok: false, error: error.message }; }));
        return await checks.get(origin);
      } catch (error) { return { ok: false, error: error.message }; }
    },
    install: async (event, suppliedUrl) => {
      if (suppliedUrl !== undefined) return { ok: false, error: "Les URL de mise à jour fournies par une page sont interdites." };
      try { return await inspect(event, false); }
      catch (error) { return { ok: false, error: error.message }; }
    }
  };
}
module.exports = { createDesktopUpdater, compareNumbers, manifest, PRODUCT };
