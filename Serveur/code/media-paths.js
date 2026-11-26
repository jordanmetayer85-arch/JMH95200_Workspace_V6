"use strict";
const path = require("node:path");

// NAS paths are explicit container mount paths. No Windows drive is consulted.
function createNasMediaPolicy({ root = process.env.JMH_NAS_STORAGE_ROOT || "", clientShare = process.env.JMH_NAS_CLIENT_SHARE || "", pathApi = path } = {}) {
  const resolvedRoot = root ? pathApi.resolve(root) : "";
  if (root && (!pathApi.isAbsolute(root) || root.includes("\0"))) throw new Error("Invalid NAS media root.");
  const share = clientShare === "\\\\192.168.1.27\\JMH" ? clientShare : "";
  function allows(file) {
    if (typeof file !== "string" || file.includes("\0") || !pathApi.isAbsolute(file)) return false;
    if (!resolvedRoot) return true;
    const relative = pathApi.relative(resolvedRoot, pathApi.resolve(file));
    return relative === "" || (!pathApi.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + pathApi.sep));
  }
  function clientPath(file) {
    if (!resolvedRoot || !share || !allows(file)) return undefined;
    const components = pathApi.relative(resolvedRoot, pathApi.resolve(file)).split(pathApi.sep);
    if (!components.length || components.some(part => !part || part === "." || part === ".." || /[\\/:*?"<>|\x00-\x1f]/.test(part) || /[ .]$/.test(part))) return undefined;
    return share + "\\" + components.join("\\");
  }
  return { allows, clientPath, root: resolvedRoot };
}
module.exports = { createNasMediaPolicy };
