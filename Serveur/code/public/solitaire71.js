// JMH 7.1 — Solitaire : vraies faces de carte et piles calculées pour tenir sur le tapis. Les règles restent dans mini-games.js.
(() => {
  'use strict';
  const FACES = { V: 'V', D: 'D', R: 'R' };
  // Une carte « R ♠ » devient : coin haut, grand symbole central, coin bas retourné.
  function face(b) {
    if (b.dataset.s71 || b.classList.contains('card-back') || b.disabled && !b.getAttribute('aria-label')?.includes(' ')) return;
    const [rank, suit] = (b.getAttribute('aria-label') || '').split(' ');
    if (!suit) return;
    b.dataset.s71 = '1';
    const corner = `<span class="s71-rank">${rank}</span><span class="s71-suit">${suit}</span>`;
    b.innerHTML = `<span class="s71-corner">${corner}</span><span class="s71-mid${FACES[rank] ? ' s71-face' : ''}">${FACES[rank] ? rank + '<small>' + suit + '</small>' : suit}</span><span class="s71-corner s71-flip">${corner}</span>`;
  }
  function layout(table) {
    const styles = getComputedStyle(table), gap = Math.max(6, Math.min(14, table.clientWidth / 70));
    const inner = table.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight);
    const cw = Math.max(52, Math.min(118, Math.floor((inner - gap * 6) / 7)));
    table.style.setProperty('--cw', cw + 'px'); table.style.setProperty('--gap', gap + 'px');
    const ch = Math.round(cw * 1.4), down = Math.round(cw * 0.16), up = Math.round(cw * 0.32);
    for (const column of table.querySelectorAll('.solitaire-column')) {
      let top = 0;
      const cards = [...column.querySelectorAll('.playing-card')];
      cards.forEach((c, i) => { c.style.top = top + 'px'; c.style.zIndex = i + 1; if (i < cards.length - 1) top += c.classList.contains('card-back') ? down : up; });
      column.style.minHeight = (cards.length ? top + ch : ch) + 'px';
    }
  }
  function dress(table) {
    table.classList.add('s71');
    table.querySelectorAll('.playing-card').forEach(face);
    const stock = table.querySelector('.solitaire-upper > :first-child');
    if (stock) { stock.classList.toggle('s71-empty', !stock.textContent.includes('JMH')); if (stock.textContent.includes('JMH')) stock.textContent = ''; }
    layout(table);
  }
  function attach() {
    const table = document.getElementById('solitaireTable');
    if (!table || table.dataset.s71) return !!table;
    table.dataset.s71 = '1';
    new MutationObserver(() => dress(table)).observe(table, { childList: true });
    new ResizeObserver(() => layout(table)).observe(table);
    dress(table);
    return true;
  }
  if (!attach()) { const wait = new MutationObserver(() => { if (attach()) wait.disconnect(); }); wait.observe(document.body, { childList: true, subtree: true }); }
})();
