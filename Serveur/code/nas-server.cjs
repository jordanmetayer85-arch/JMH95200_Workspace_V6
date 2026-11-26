"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function existingDirectory(value, label) {
  if (!value || !path.isAbsolute(value) || value.includes("\0")) throw new Error(label + " must be an explicit absolute mount path.");
  const absolute = path.resolve(value);
  const stat = fs.lstatSync(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(absolute) !== absolute) throw new Error(label + " must be a real mounted directory.");
  return absolute;
}

function configureNas(environment = process.env) {
  const runtime = existingDirectory(environment.JMH_RUNTIME_ROOT, "JMH_RUNTIME_ROOT");
  const storage = existingDirectory(environment.JMH_STORAGE_ROOT, "JMH_STORAGE_ROOT");
  const within = (parent, child) => { const relative = path.relative(parent, child); return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep)); };
  if (within(storage, runtime) || within(runtime, storage)) throw new Error("Runtime and shared storage mounts must be separate.");
  fs.accessSync(runtime, fs.constants.R_OK | fs.constants.W_OK);
  fs.accessSync(storage, fs.constants.R_OK | fs.constants.W_OK);
  const data = existingDirectory(path.join(runtime, "data"), "Migrated data directory");
  const readMigrated = file => {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024 || fs.realpathSync(file) !== path.resolve(file)) throw new Error("Invalid migrated runtime file: " + path.basename(file));
    return JSON.parse(fs.readFileSync(file, "utf8"));
  };
  const users = readMigrated(path.join(data, "users.json"));
  if (!Array.isArray(users) || !users.length || !users.every(user => user && typeof user.username === "string" && typeof user.passwordHash === "string") || !users.some(user => user.active && user.role === "admin")) {
    throw new Error("A migrated active administrator is required; no default account is created on NAS.");
  }
  for (const name of fs.readdirSync(data)) {
    if (!name.endsWith(".json")) continue;
    const value = readMigrated(path.join(data, name));
    if (["cinema_catalog.json", "music_catalog.json"].includes(name)) {
      const entries = name.startsWith("cinema") ? value.movies : value.tracks;
      if (value.version !== 1 || !Array.isArray(entries) || entries.some(item => !item || typeof item.sourcePath !== "string" || !path.isAbsolute(item.sourcePath) || !within(storage, path.resolve(item.sourcePath)))) {
        throw new Error("Media catalogue paths must be remapped to the NAS storage mount: " + name);
      }
    }
  }
  const secretFile = path.join(runtime, ".session-secret");
  let secret;
  try {
    const stat = fs.lstatSync(secretFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 64) throw new Error("Invalid persistent session secret.");
    secret = fs.readFileSync(secretFile, "utf8");
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid persistent session secret.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, secret, { flag: "wx", mode: 0o600 });
  }
  const port = environment.JMH_PORT === undefined ? 3000 : Number(environment.JMH_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid JMH_PORT.");
  Object.assign(environment, { JMH_RUNTIME_ROOT: runtime, JMH_STORAGE_ROOT: storage, JMH_NAS_STORAGE_ROOT: storage,
    JMH_SERVER_TYPE: "nas", JMH_ELECTRON: "0", JMH_SESSION_SECRET: secret, JMH_PORT: String(port),
    JMH_NAS_CLIENT_SHARE: environment.JMH_NAS_CLIENT_SHARE || "\\\\192.168.1.27\\JMH" });
  return { runtime, storage, port };
}

function startNas() {
  configureNas();
  const workspace = require("./server.js");
  workspace.startServer();
  let closing = false;
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    workspace.closeServer(() => { clearTimeout(timeout); process.exit(0); });
  });
  return workspace;
}
if (require.main === module) {
  try { startNas(); }
  catch (error) { console.error("JMH NAS startup refused:", error.message); process.exitCode = 1; }
}
module.exports = { configureNas, startNas };
