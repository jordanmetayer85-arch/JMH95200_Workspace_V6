'use strict';
// Audit N4 / N6 : lectures et écritures JSON plus sûres.
// - readJsonSafe : fichier absent → valeur par défaut ; fichier illisible → dernière copie valide (.bak) si elle existe,
//   sinon erreur explicite (plus jamais de liste vide silencieuse qui serait réécrite par-dessus les vraies données).
// - writeJsonSafe : écriture dans un fichier temporaire unique, copie de la version précédente en .bak, puis remplacement atomique.
// - pathIndex : index chemin → identifiant pour les catalogues, reconstruit seulement quand le fichier change (date + taille).
const fs = require('fs'), path = require('path'), crypto = require('crypto');

class CorruptJsonError extends Error {
  constructor(file, cause) { super('Le fichier de données « ' + path.basename(file) + ' » est illisible. Aucune donnée n’a été écrasée ; restaure sa sauvegarde.'); this.code = 'JMH_JSON_CORRUPT'; this.file = file; this.cause = cause; }
}

function readJsonSafe(file, fallback = []) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return typeof fallback === 'function' ? fallback() : structuredClone(fallback); throw error; }
  // 7.3 (audit JMH-08) : un fichier métier vide n'est pas normal (JMH écrit toujours au moins « [] » ou « {} ») :
  // il est traité comme un fichier corrompu, jamais comme une liste vide silencieuse.
  try { if (!text.trim()) throw new Error('fichier vide'); return JSON.parse(text); }
  catch (error) {
    try {
      const value = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'));
      console.error('[JMH] ' + path.basename(file) + ' illisible : dernière sauvegarde valide utilisée (' + path.basename(file) + '.bak).');
      return value;
    } catch {}
    console.error('[JMH] ' + path.basename(file) + ' illisible et sans sauvegarde valide.');
    throw new CorruptJsonError(file, error);
  }
}

const written = new Set();
function writeJsonSafe(file, value) {
  const text = JSON.stringify(value, null, 2);
  if (text === undefined) throw new Error('Donnée impossible à enregistrer : ' + path.basename(file));
  const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    // Mode 600 : fichier lisible par le seul compte du serveur (audit NAS-06, défense supplémentaire).
    fs.writeFileSync(temp, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    // La version précédente n'est conservée que si elle est elle-même valide : la sauvegarde reste toujours exploitable.
    // (un fichier déjà écrit par ce processus est valide par construction : pas besoin de le relire).
    try { if (!written.has(file)) JSON.parse(fs.readFileSync(file, 'utf8')); fs.copyFileSync(file, file + '.bak'); } catch {}
    fs.renameSync(temp, file);
    written.add(file);
  } finally { try { fs.unlinkSync(temp); } catch {} }
}

const indexes = new Map();
function pathIndex(file, field) {
  let stamp = '';
  try { const s = fs.statSync(file); stamp = s.mtimeMs + ':' + s.size; } catch { return null; }
  const key = file + '#' + field, cached = indexes.get(key);
  if (cached && cached.stamp === stamp) return cached.map;
  const map = new Map();
  for (const item of readJsonSafe(file, {})[field] || []) if (item && typeof item.sourcePath === 'string') map.set(path.resolve(item.sourcePath), item.id);
  indexes.set(key, { stamp, map });
  return map;
}

module.exports = { readJsonSafe, writeJsonSafe, pathIndex, CorruptJsonError };
