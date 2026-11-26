// JMH 7.1.1 — pose le fond choisi avant le premier affichage, pour éviter l'éclair du fond « Univers » au démarrage et à la déconnexion.
// Chargé de façon bloquante dans <head> ; finitions.js tient le cache à jour (jmh.fond.cache) et retire la classe une fois le vrai fond en place.
(() => {
  try {
    const cache = JSON.parse(localStorage.getItem('jmh.fond.cache') || 'null');
    if (!cache || !cache.bg) return;
    let bg = cache.bg;
    if (cache.photo) {
      const p = localStorage.getItem(cache.photo);
      if (!p || !/^data:image\/(jpeg|png|webp);base64,/.test(p)) return;
      bg = 'url("' + p + '") center/cover no-repeat';
    }
    const dim = Math.max(0, Math.min(.95, Number(cache.dim) || 0));
    const root = document.documentElement;
    // Même voile que .jmh-login-dim (finitions.css), pour que le passage au vrai fond soit invisible.
    root.style.setProperty('--jmh-early-bg', `radial-gradient(ellipse at 50% 40%,transparent 0 30%,rgba(0,0,0,${dim + .15}) 100%),linear-gradient(rgba(0,0,0,${dim}),rgba(0,0,0,${dim})),${bg}`);
    if (cache.color) root.style.setProperty('--jmh-early-color', cache.color);
    root.classList.add('jmh-early');
  } catch {}
})();
