// JMH 7.1 — Mes fichiers (NAS) en tuiles : icône selon le type, tuile entière cliquable, actions en pastilles.
(() => {
  'use strict';
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    folder: icon('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
    audio: icon('<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>'),
    image: icon('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17 4.8-4.6 3.4 3.1 2.6-2.4 4.2 3.9"/>'),
    video: icon('<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3z"/>'),
    doc: icon('<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4M9 12h6M9 15.5h6"/>'),
    archive: icon('<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M12 4v4M12 10v2M12 14v2"/>'),
    file: icon('<path d="M6.5 3.5h7l4 4v13h-11z"/><path d="M13.5 3.5v4h4"/>')
  };
  const KINDS = [
    ['audio', /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|aiff?)$/i],
    ['image', /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i],
    ['video', /\.(mp4|m4v|webm|mov|avi|mkv|wmv)$/i],
    ['doc', /\.(pdf|docx?|odt|xlsx?|ods|pptx?|odp|txt|csv|rtf|md)$/i],
    ['archive', /\.(zip|7z|rar|tar|gz)$/i]
  ];

  function dress() {
    for (const row of $$('#storageTableBody tr:not([data-f71])')) {
      row.dataset.f71 = '1';
      const path = row.dataset.path;
      if (!path) { row.classList.add('f71-empty'); continue; }
      const folder = (row.children[1]?.textContent || '').trim() === 'Dossier';
      const kind = folder ? 'folder' : (KINDS.find(([, re]) => re.test(path)) || ['file'])[0];
      row.dataset.kind = kind; row.classList.add('f71-tile');
      const badge = row.querySelector('.storage-name > span');
      if (badge) { badge.innerHTML = ICONS[kind]; badge.classList.add('f71-icon'); }
      row.title = row.dataset.fileName || '';
      // Audit point 3 : tuile atteignable au clavier, avec un libellé explicite.
      row.tabIndex = 0; row.setAttribute('role', 'button');
      row.setAttribute('aria-label', (kind === 'folder' ? 'Ouvrir le dossier ' : 'Ouvrir ') + (row.dataset.fileName || path.split('/').pop()));
      row.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); row.querySelector('.storage-file-name')?.click(); } });
      // La tuile entière ouvre le dossier ou lit / ouvre le fichier ; les pastilles gardent leur propre action.
      row.addEventListener('click', e => { if (e.target.closest('button,a,input')) return; row.querySelector('.storage-file-name')?.click(); });
    }
  }
  // Audit N2 : seule la liste de Mes fichiers est observée.
  const list = document.getElementById('storageTableBody');
  if (list) new MutationObserver(dress).observe(list, { childList: true });
  dress();
})();
