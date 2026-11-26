"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Run only on the migrated runtime copy with JMH stopped. Media files are never opened.
function remapPath(original, root = "/storage") {
  if (typeof original !== "string" || original.includes("\0") || !path.posix.isAbsolute(root) || root.includes("\\") || path.posix.normalize(root) !== root || root === "/") throw new Error("Invalid catalogue path or target root.");
  if (original === root || original.startsWith(root + "/")) {
    if (path.posix.normalize(original) !== original) throw new Error("Non-canonical NAS path.");
    return original;
  }
  const mappings = [
    ["E:\\Films", "Medias/Films"], ["E:\\Music", "Medias/Musique"],
    ["\\\\192.168.1.27\\JMH", ""], ["J:\\", ""]
  ];
  if (!path.win32.isAbsolute(original)) throw new Error("Unrecognised catalogue source root.");
  for (const [from, target] of mappings) {
    const relative = path.win32.relative(from, original);
    if (path.win32.isAbsolute(relative) || relative === ".." || relative.startsWith("..\\")) continue;
    const components = relative.split("\\").filter(Boolean);
    if (components.some(component => component === "." || component === ".." || /[/:\x00-\x1f]/.test(component))) throw new Error("Invalid relative catalogue path.");
    return path.posix.join(root, target, ...components);
  }
  throw new Error("Unrecognised catalogue source root.");
}

function planRemap(runtimeRoot, storageRoot = "/storage") {
  if (!path.isAbsolute(runtimeRoot)) throw new Error("Runtime copy must be an absolute path.");
  const files = [];
  for (const [name, key] of [["cinema_catalog.json", "movies"], ["music_catalog.json", "tracks"]]) {
    const file = path.join(runtimeRoot, "data", name);
    if (!fs.existsSync(file)) continue;
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024 || fs.realpathSync(file) !== path.resolve(file)) throw new Error("Unsafe runtime catalogue: " + name);
    const bytes = fs.readFileSync(file);
    const value = JSON.parse(bytes);
    if (value.version !== 1 || !Array.isArray(value[key])) throw new Error("Invalid catalogue: " + name);
    let changed = 0;
    const known = new Map();
    let aliases = 0;
    for (const item of value[key]) {
      const mapped = remapPath(item.sourcePath, storageRoot);
      if (known.has(mapped)) {
        const previous = known.get(mapped);
        if (!Number.isSafeInteger(item.size) || item.size < 0 || item.size !== previous.size || item.extension !== previous.extension) {
          throw new Error("Divergent catalogue aliases map to the same NAS file; resolve them before migration.");
        }
        aliases++;
      } else known.set(mapped, item);
      if (mapped !== item.sourcePath) { item.sourcePath = mapped; changed++; }
    }
    files.push({ name, file, bytes, value, total: value[key].length, changed, aliases });
  }
  return files;
}

function applyRemap(planned) {
  // Validate all input bytes again before touching any copied catalogue.
  for (const entry of planned) if (!fs.readFileSync(entry.file).equals(entry.bytes)) throw new Error("Runtime changed during migration; stop JMH first.");
  const suffix = ".before-nas-" + Date.now() + "-" + crypto.randomUUID();
  const staged = [];
  try {
    for (const entry of planned.filter(item => item.changed)) {
      const temporary = entry.file + "." + crypto.randomUUID() + ".tmp";
      const backup = entry.file + suffix;
      fs.writeFileSync(backup, entry.bytes, { flag: "wx", mode: 0o600 });
      staged.push({ ...entry, temporary, backup });
      const fd = fs.openSync(temporary, "wx", 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(entry.value, null, 2), "utf8"); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
    }
    for (const entry of staged) fs.renameSync(entry.temporary, entry.file);
  } finally {
    for (const entry of staged) { try { fs.unlinkSync(entry.temporary); } catch {} }
  }
  return staged.map(entry => ({ name: entry.name, backup: path.basename(entry.backup) }));
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const apply = args.includes("--apply");
    const positional = args.filter(argument => argument !== "--apply");
    if (!positional.length || positional.length > 2 || args.some(argument => argument.startsWith("--") && argument !== "--apply")) throw new Error("Usage: node nas-remap-catalogues.cjs ABSOLUTE_RUNTIME_COPY [/storage] [--apply]");
    const planned = planRemap(positional[0], positional[1] || "/storage");
    const backups = apply ? applyRemap(planned) : [];
    console.log(JSON.stringify({ applied: apply, catalogues: planned.map(({ name, total, changed, aliases }) => ({ name, total, changed, aliases })), backups }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { remapPath, planRemap, applyRemap };
