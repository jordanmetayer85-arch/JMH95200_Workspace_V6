'use strict';
// Audit N6 : les sessions survivent à un redémarrage du service (plus de reconnexion forcée de tous les appareils).
// Sessions gardées en mémoire et enregistrées sur disque (écriture groupée, atomique, fichier lisible par le seul compte serveur).
// Les sessions expirées sont écartées au chargement et toutes les 10 minutes.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function createFileStore(session, file) {
  class FileStore extends session.Store {
    constructor() {
      super();
      this.sessions = new Map();
      this.timer = null;
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [sid, value] of Object.entries(saved || {})) if (!this.expired(value)) this.sessions.set(sid, value);
      } catch (error) { if (error.code !== 'ENOENT') console.error('[JMH] Sessions enregistrées illisibles : reconnexion nécessaire.'); }
      setInterval(() => this.prune(), 10 * 60 * 1000).unref();
      // Enregistrement final à l'arrêt (nas-server.cjs termine proprement par process.exit) ; aucun signal n'est intercepté ici.
      process.on('exit', () => { if (this.timer) this.flush(); });
    }
    expired(value) { const expires = value?.cookie?.expires; return !value || (expires && Date.parse(expires) <= Date.now()); }
    prune() { let changed = false; for (const [sid, value] of this.sessions) if (this.expired(value)) { this.sessions.delete(sid); changed = true; } if (changed) this.schedule(); }
    schedule() { if (!this.timer) this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 1000); }
    flush() {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(temp, JSON.stringify(Object.fromEntries(this.sessions)), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.renameSync(temp, file);
      } catch (error) { console.error('[JMH] Enregistrement des sessions impossible : ' + error.code); }
      finally { try { fs.unlinkSync(temp); } catch {} }
    }
    get(sid, cb) { const value = this.sessions.get(sid); if (value && this.expired(value)) { this.sessions.delete(sid); this.schedule(); return cb(null, null); } cb(null, value ? JSON.parse(JSON.stringify(value)) : null); }
    set(sid, value, cb) { this.sessions.set(sid, JSON.parse(JSON.stringify(value))); this.schedule(); cb?.(null); }
    touch(sid, value, cb) { const current = this.sessions.get(sid); if (current) { current.cookie = value.cookie; this.schedule(); } cb?.(null); }
    destroy(sid, cb) { this.sessions.delete(sid); this.schedule(); cb?.(null); }
    all(cb) { cb(null, Object.fromEntries([...this.sessions].filter(([, v]) => !this.expired(v)))); }
    length(cb) { cb(null, this.sessions.size); }
    clear(cb) { this.sessions.clear(); this.schedule(); cb?.(null); }
  }
  return new FileStore();
};
