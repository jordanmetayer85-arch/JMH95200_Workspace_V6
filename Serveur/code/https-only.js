'use strict';
// Audit T2 : sur le NAS, quand le HTTPS est configuré, le réseau local n'utilise plus le HTTP en clair.
// - Les pages et fichiers demandés en HTTP sont redirigés vers la même adresse en HTTPS (port JMH_TLS_PORT, 3443 par défaut).
// - Les appels d'API (connexion, données privées) en HTTP sont refusés : aucun identifiant ne transite sans chiffrement.
// Restent permis : la boucle locale (contrôle de santé du conteneur, accès à distance Tailscale qui chiffre lui-même) et /api/health.
// Retour arrière sans modifier le code : variable d'environnement JMH_ALLOW_HTTP=1.
const net = require('net');

function isLoopback(address) {
  const value = String(address || '').replace(/^::ffff:/, '');
  return value === '::1' || (net.isIPv4(value) && value.startsWith('127.'));
}

function safeHost(hostname) {
  const value = String(hostname || '').toLowerCase();
  return /^[a-z0-9]([a-z0-9-]{0,62}\.)*[a-z0-9-]{1,63}$/.test(value) || net.isIPv4(value) ? value : null;
}

function createHttpsOnly(environment = process.env) {
  const enabled = environment.JMH_SERVER_TYPE === 'nas' && !!environment.JMH_TLS_CERT && !!environment.JMH_TLS_KEY && environment.JMH_ALLOW_HTTP !== '1';
  const port = Number(environment.JMH_TLS_PORT || 3443);
  function httpsOnly(req, res, next) {
    // req.secure n'existe que dans Express ; les requêtes brutes (socket.io) indiquent le TLS par socket.encrypted.
    if (!enabled || req.secure || req.socket?.encrypted || isLoopback(req.socket?.remoteAddress)) return next();
    const url = String(req.originalUrl || req.url || '/');
    if (url === '/api/health' || url.startsWith('/api/health?')) return next();
    const host = safeHost(req.hostname || String(req.headers?.host || '').replace(/:\d+$/, ''));
    const target = host ? 'https://' + host + (port === 443 ? '' : ':' + port) + (url.startsWith('/') ? url : '/') : null;
    const body = { error: 'Connexion non chiffrée refusée. Ouvre JMH avec son adresse sécurisée' + (target ? ' : ' + target.replace(/^(https:\/\/[^/]+).*$/, '$1') : ' (HTTPS)') + '.', https: target };
    // Réponse Express ou réponse Node brute (socket.io) : les deux sont gérées.
    if (typeof res.status !== 'function') { res.writeHead(426, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Upgrade: 'TLS/1.2, HTTP/1.1' }); return res.end(JSON.stringify(body)); }
    res.set('Cache-Control', 'no-store');
    if (target && (req.method === 'GET' || req.method === 'HEAD') && !url.startsWith('/api/') && !url.startsWith('/socket.io')) return res.redirect(308, target);
    res.status(426).set('Upgrade', 'TLS/1.2, HTTP/1.1').json(body);
  }
  httpsOnly.enabled = enabled;
  return httpsOnly;
}

module.exports = { createHttpsOnly, isLoopback };
