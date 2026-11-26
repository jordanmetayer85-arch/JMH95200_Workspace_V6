// JMH 7.1 — Photos et Vidéos personnelles : barre de filtres compacte sur une ligne, dates repliables.
(() => {
  'use strict';
  const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

  // Le texte d'une étiquette (« Année », « Du »…) passe dans un <span> stylable ; le champ garde son aria-label.
  function wrapLabel(label) {
    for (const n of [...label.childNodes]) if (n.nodeType === 3 && n.textContent.trim()) { const s = document.createElement('span'); s.className = 'g71-lab'; s.textContent = n.textContent.trim(); n.replaceWith(s); }
  }
  function dress(bar) {
    if (bar.dataset.g71) return; bar.dataset.g71 = '1'; bar.classList.add('g71-bar');
    const labels = [...bar.querySelectorAll(':scope > label')];
    labels.forEach(wrapLabel);
    const search = bar.querySelector('.gallery-search');
    if (search) { search.classList.add('jmh-field', 'g71-search'); search.insertAdjacentHTML('afterbegin', SEARCH); }
    bar.querySelectorAll('select').forEach(s => s.classList.add('jmh-select'));
    // Du / Au dans une rangée repliable, ouverte par le bouton « Dates ».
    const from = bar.querySelector('[data-from]')?.closest('label'), to = bar.querySelector('[data-to]')?.closest('label');
    const reset = bar.querySelector('[data-reset]');
    if (from && to && reset) {
      const more = document.createElement('div'); more.className = 'g71-more'; more.append(from, to);
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'g71-toggle'; toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = CAL + '<span>Dates</span><b class="g71-dot" hidden></b>';
      const sync = () => { const used = !!(from.querySelector('input').value || to.querySelector('input').value); toggle.querySelector('.g71-dot').hidden = !used; if (used) open(true); };
      const open = on => { bar.classList.toggle('g71-open', on); toggle.setAttribute('aria-expanded', String(on)); };
      toggle.onclick = () => open(!bar.classList.contains('g71-open'));
      from.querySelector('input').addEventListener('change', sync); to.querySelector('input').addEventListener('change', sync);
      reset.addEventListener('click', () => setTimeout(() => { sync(); open(false); }, 0));
      reset.classList.add('g71-reset'); reset.before(toggle); bar.append(more); sync();
    }
  }
  const run = () => document.querySelectorAll('.gallery-filterbar').forEach(dress);
  // Audit N2 : seules les pages Photos et Vidéos personnelles sont observées.
  for (const id of ['photosPage', 'personalVideosPage']) { const page = document.getElementById(id); if (page) new MutationObserver(run).observe(page, { childList: true, subtree: true }); }
  run();
})();
