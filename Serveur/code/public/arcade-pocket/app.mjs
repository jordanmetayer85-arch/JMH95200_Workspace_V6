import { memoryDeck, puzzle, slide, solved } from './engine.mjs';
const $ = id => document.getElementById(id);
const KEY = 'arcade-pocket:prototype:v1';
let profile = { points: 0, completed: 0, best: null };
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) profile = {
    points: Number.isSafeInteger(saved.points) && saved.points >= 0 ? saved.points : 0,
    completed: Number.isSafeInteger(saved.completed) && saved.completed >= 0 ? saved.completed : 0,
    best: Number.isFinite(saved.best) && saved.best > 0 ? saved.best : null,
  };
} catch { storageAvailable = false; }
let timers = [], current = null, generation = 0;
function later(fn, delay) { const gen = generation; timers.push(setTimeout(() => { if (gen === generation) fn(); }, delay)); }
function cleanup() { timers.forEach(clearTimeout); timers = []; generation++; }
function update() {
  $('points').textContent = profile.points;
  $('wallet-points').textContent = profile.points;
  $('completed').textContent = profile.completed;
  $('best').textContent = profile.best ? `${profile.best} ms` : '—';
  $('level').textContent = `Niveau ${1 + Math.floor(profile.points / 100)}`;
  $('progress').style.width = `${profile.points % 100}%`;
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { storageAvailable = false; }
  if (!storageAvailable) document.querySelector('.prototype').textContent = 'Prototype · sauvegarde indisponible dans ce navigateur · points temporaires sans valeur monétaire';
}
function show(page) {
  cleanup();
  for (const id of ['home', 'play', 'wallet']) $(id).hidden = id !== page;
  window.scrollTo(0, 0);
}
function win(points, message) {
  profile.points += points; profile.completed++;
  update(); $('status').textContent = `${message} +${points} points ✦`;
}
function tile(label, fn, className = '') {
  const button = document.createElement('button');
  button.className = `tile ${className}`;
  button.textContent = label; button.onclick = fn;
  return button;
}
const definitions = {
  memory: ['Memory', 'Retourne les cartes et retrouve les six paires.', 20],
  reflex: ['Réflexe', 'Attends le signal vert, puis touche la grande zone. Un départ anticipé ne donne aucun point.', 10],
  puzzle: ['Le Taquin', 'Remets les nombres de 1 à 8 dans l’ordre. Touche une case voisine de la case vide pour la déplacer.', 30],
};
function start(name) {
  show('play'); current = name;
  const [title, help, reward] = definitions[name];
  $('game-title').textContent = title;
  $('game-help').textContent = help;
  $('reward-label').textContent = `+${reward} points`;
  $('status').textContent = '';
  $('arena').replaceChildren();
  ({ memory, reflex, puzzle: puzzleGame })[name]();
}
function memory() {
  const deck = memoryDeck(), open = [], matched = new Set();
  let busy = false, moves = 0, finished = false;
  const grid = document.createElement('div'); grid.className = 'memory-grid';
  const buttons = deck.map((card, i) => {
    const button = tile('✦', () => {
      if (busy || finished || matched.has(i) || open.includes(i)) return;
      open.push(i); button.textContent = card.symbol; button.classList.add('open');
      button.setAttribute('aria-label', `Carte ${i + 1} : ${card.symbol}`);
      if (open.length !== 2) return;
      moves++;
      const [a,b] = open;
      if (deck[a].pair === deck[b].pair) {
        for (const index of open) { matched.add(index); buttons[index].className = 'tile matched'; buttons[index].disabled = true; }
        open.length = 0;
        if (matched.size === deck.length) { finished = true; win(20, `Six paires retrouvées en ${moves} essais !`); }
        else $('status').textContent = `${matched.size / 2}/6 paires · ${moves} essais`;
      } else {
        busy = true;
        later(() => { for (const index of open) { buttons[index].textContent = '✦'; buttons[index].className = 'tile'; buttons[index].setAttribute('aria-label', `Carte ${index + 1} masquée`); } open.length = 0; busy = false; }, 800);
      }
    });
    button.setAttribute('aria-label', `Carte ${i + 1} masquée`);
    return button;
  });
  grid.append(...buttons); $('arena').append(grid);
}
function reflex() {
  let state = 'waiting', started = 0;
  const button = document.createElement('button'); button.className = 'reflex-target'; button.textContent = 'Patience…';
  button.onclick = () => {
    if (state === 'done') return;
    if (state === 'waiting') {
      state = 'done'; cleanup(); button.textContent = 'Un peu trop vite !';
      $('status').textContent = 'Aucun point perdu. Relance une partie.'; return;
    }
    const elapsed = Math.max(1, Math.round(performance.now() - started)); state = 'done';
    button.textContent = `${elapsed} ms`;
    if (!profile.best || elapsed < profile.best) profile.best = elapsed;
    win(10, 'Bien joué !');
  };
  $('arena').append(button);
  later(() => { state = 'ready'; button.classList.add('ready'); button.textContent = 'Maintenant !'; started = performance.now(); }, 1600 + Math.random() * 2600);
}
function puzzleGame() {
  let board = puzzle(), moves = 0, finished = false;
  const grid = document.createElement('div'); grid.className = 'puzzle-grid';
  function render() {
    grid.replaceChildren(...board.map((n, index) => {
      const button = tile(n || '', () => {
        if (finished) return;
        const next = slide(board, index);
        if (next === board) return;
        board = next; moves++;
        if (solved(board)) { finished = true; win(30, `Puzzle terminé en ${moves} déplacements !`); }
        else $('status').textContent = `${moves} déplacements`;
        render();
      }, n ? '' : 'empty');
      button.disabled = !n || finished;
      button.setAttribute('aria-label', n ? `Déplacer la case ${n}` : 'Case vide');
      return button;
    }));
  }
  render(); $('arena').append(grid);
}
document.querySelectorAll('[data-game]').forEach(button => button.onclick = () => start(button.dataset.game));
$('restart').onclick = () => start(current);
$('back').onclick = $('wallet-back').onclick = () => show('home');
document.querySelector('.brand').onclick = e => { e.preventDefault(); show('home'); };
$('balance').onclick = () => show('wallet');
$('reset').onclick = () => { if (confirm('Effacer les points et les records de ce prototype sur cet appareil ?')) { profile = { points:0, completed:0, best:null }; update(); } };
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !$('play').hidden) { cleanup(); $('arena').replaceChildren(); $('status').textContent = 'Partie interrompue. Relance-la quand tu es prêt.'; }
});
update();
