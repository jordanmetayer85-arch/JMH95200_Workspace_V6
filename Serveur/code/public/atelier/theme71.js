// JMH 7.1 — l'Atelier affiché dans JMH reprend les couleurs du thème JMH choisi.
(() => {
  'use strict';
  if (window.top === window) return;
  const VARS = ['--r-bg', '--r-surface', '--r-surface-strong', '--r-border', '--r-text', '--r-muted', '--r-accent', '--r-accent-2', '--r-accent-ink', '--r-input', '--r-radius'];
  function sync() {
    try {
      const body = parent.document.body, css = parent.getComputedStyle(body), root = document.documentElement;
      if (!css.getPropertyValue('--r-text').trim()) return;
      for (const name of VARS) root.style.setProperty(name, css.getPropertyValue(name).trim());
      root.style.colorScheme = css.colorScheme || '';
      root.classList.add('jmh-theme');
    } catch {}
  }
  sync();
  // Audit point 12 : l'état du moteur est lisible et coloré (prêt, en cours, à vérifier).
  const engine = document.getElementById('engine');
  const mark = () => { if (!engine) return; const t = engine.textContent; engine.dataset.state = /prêt|connecté/i.test(t) ? 'ok' : /démarrage|connexion/i.test(t) ? 'wait' : 'error'; };
  if (engine) { mark(); new MutationObserver(mark).observe(engine, { childList: true, characterData: true, subtree: true }); }
  try {
    const watch = new MutationObserver(() => requestAnimationFrame(sync));
    watch.observe(parent.document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    watch.observe(parent.document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  } catch {}
})();
