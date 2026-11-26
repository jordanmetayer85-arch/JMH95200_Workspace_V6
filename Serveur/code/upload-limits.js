'use strict';
// Audit JMH-07 : un compte (autorisé ou compromis) ne peut plus monopoliser l'espace ni le traitement par des envois massifs.
// - envois simultanés limités par compte et pour tout le serveur, AVANT la réception du fichier ;
// - refus immédiat d'un envoi qui ne laisserait pas une réserve minimale d'espace (sessions, journaux, fonctionnement) ;
// - nettoyage régulier des fichiers temporaires laissés par des envois interrompus.
const fs = require('fs'), path = require('path');

function isUpload(req) {
  if (!['POST', 'PUT'].includes(req.method) || !req.path.toLowerCase().startsWith('/api/')) return false;
  const type = String(req.headers['content-type'] || '').toLowerCase();
  return type.startsWith('multipart/form-data') || type.startsWith('application/octet-stream');
}

function createUploadLimits({ perUser = 2, global = 4, reserveBytes = 2 * 1024 ** 3, diskPaths = [], statfs = p => fs.statfsSync(p) } = {}) {
  const active = new Map(); let total = 0;
  function freeBytes() {
    let min = Infinity;
    for (const p of diskPaths) { try { const s = statfs(p); min = Math.min(min, Number(s.bavail) * Number(s.bsize)); } catch {} }
    return min;
  }
  function middleware(req, res, next) {
    if (!isUpload(req)) return next();
    const who = req.session?.user?.id != null ? 'u:' + req.session.user.id : 'ip:' + (req.socket?.remoteAddress || '?');
    const mine = active.get(who) || 0;
    if (mine >= perUser || total >= global) {
      res.set('Retry-After', '5');
      return res.status(429).json({ error: 'Trop d’envois en même temps. Attends la fin de l’envoi en cours puis réessaie.' });
    }
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > 0 && freeBytes() - length < reserveBytes) {
      return res.status(507).json({ error: 'Espace insuffisant sur le NAS : l’envoi est refusé pour garder une réserve de fonctionnement.' });
    }
    active.set(who, mine + 1); total++;
    let released = false;
    const release = () => { if (released) return; released = true; total--; const n = (active.get(who) || 1) - 1; if (n > 0) active.set(who, n); else active.delete(who); };
    res.once('finish', release); res.once('close', release);
    next();
  }
  middleware.stats = () => ({ total, accounts: active.size });
  return middleware;
}

// Supprime les fichiers temporaires d'envoi plus vieux que maxAge (envois interrompus, plantages).
function cleanStaging(dirs, maxAge = 6 * 3600 * 1000, now = Date.now()) {
  let removed = 0;
  for (const dir of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      const file = path.join(dir, e.name);
      try { if (now - fs.statSync(file).mtimeMs > maxAge) { fs.unlinkSync(file); removed++; } } catch {}
    }
  }
  return removed;
}

module.exports = { createUploadLimits, cleanStaging, isUpload };
