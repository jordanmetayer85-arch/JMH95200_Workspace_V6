"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), http = require("http"), https = require("https");
const {defaults,normalizeProfile,defaultProfile}=require("./installation-profile");
const {pinnedAgent}=require("./secure-transport");
const DEFAULT_SERVER_URL = defaults.serverUrl, PRODUCT = "jmh95200-workspace-stable";

function normalizeServerUrl(input) {
  let text = String(input || DEFAULT_SERVER_URL).trim();
  if (!text.includes("://")) text = "https://" + text + (text.includes(":")||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)?"":":3443");
  let url;
  try { url = new URL(text); } catch { throw new Error("Adresse JMH invalide. Exemple : " + DEFAULT_SERVER_URL); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || !url.hostname) throw new Error("Indiquez seulement l’adresse HTTP ou HTTPS du serveur JMH et son port.");
  return url.origin;
}

function readClientConfig(file) {
  let previous;
  try { previous = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return defaultProfile(); }
  if (previous?.mode === "client") {
    try {
      // Upgrade only this installation's known legacy NAS address. The caller
      // probes the pinned HTTPS server before loading any login form or secret.
      const legacy=normalizeServerUrl(previous.serverUrl)===defaults.legacyServerUrl;
      return normalizeProfile(legacy?{...previous,serverUrl:defaults.serverUrl,tlsPin:defaults.tlsPin}:previous,normalizeServerUrl);
    }
    catch { return { mode: "client", serverUrl: DEFAULT_SERVER_URL, needsMigration: true, previousMode: "client" }; }
  }
  return { mode: "client", serverUrl: DEFAULT_SERVER_URL, needsMigration: true, previousMode: previous?.mode || "unknown" };
}

function saveClientConfig(file, input) {
  if (input?.mode !== "client") throw new Error("JMH est hébergé sur le NAS. Ce PC fonctionne en mode client.");
  const config = normalizeProfile(input,normalizeServerUrl);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let backup;
  if (fs.existsSync(file)) { backup = path.join(path.dirname(file), "connection-config.before-nas-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID() + ".json"); fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL); }
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try { fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { flag: "wx", mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { try { fs.unlinkSync(temporary); } catch {} }
  return { config, backup };
}

function probeNasServer(input, { timeoutMs = 6000, requestTimeout = 2000, retryMs = 300, tlsPin = "" } = {}) {
  const origin = normalizeServerUrl(input), deadline = Date.now() + timeoutMs,agent=new URL(origin).protocol==="https:"?pinnedAgent(tlsPin||(origin===defaults.serverUrl?defaults.tlsPin:"")):undefined;
  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const finish = (error, info) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve({ origin, ...info }); };
    const retry = () => { if (settled) return; if (Date.now() >= deadline) finish(new Error("Le NAS JMH ne répond pas à " + origin + ". Vérifiez le NAS et la connexion réseau.")); else timer = setTimeout(attempt, Math.min(retryMs, Math.max(1, deadline - Date.now()))); };
    const attempt = () => {
      if (settled) return;
      const target = new URL("/api/health", origin), client = target.protocol === "https:" ? https : http;
      const request = client.get(target, { agent,headers: { Accept: "application/json" } }, response => {
        if (response.statusCode !== 200) { response.resume(); return finish(new Error("Service indisponible (HTTP " + response.statusCode + "). Utilisez l’adresse JMH du NAS, par exemple " + DEFAULT_SERVER_URL + ".")); }
        let bytes = 0, body = "";
        response.on("data", chunk => { bytes += chunk.length; if (bytes > 16384) { response.destroy(); finish(new Error("Le service à cette adresse n’est pas le serveur JMH.")); } else body += chunk.toString("utf8"); });
        response.on("end", () => { if (settled) return; try { const info = JSON.parse(body); if (info.ok !== true || info.product !== PRODUCT || info.serverType !== "nas") throw new Error(); finish(null, { product: PRODUCT, serverType: "nas", version: typeof info.version === "string" ? info.version : null }); } catch { finish(new Error("Cette adresse ne correspond pas au serveur JMH du NAS. Adresse habituelle : " + DEFAULT_SERVER_URL)); } });
        response.on("error", retry);
      });
      request.setTimeout(Math.min(requestTimeout, Math.max(1, deadline - Date.now())), () => request.destroy(new Error("Délai réseau dépassé.")));
      request.on("error", error => { if(error.code?.startsWith("JMH_TLS_"))return finish(error);if (["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(error.code)) finish(new Error("Le certificat HTTPS de JMH n’est pas reconnu. Configurez un certificat valide ou utilisez l’adresse HTTP du réseau local.")); else retry(); });
    };
    attempt();
  });
}
module.exports = { DEFAULT_SERVER_URL, PRODUCT, normalizeServerUrl, readClientConfig, saveClientConfig, probeNasServer };
