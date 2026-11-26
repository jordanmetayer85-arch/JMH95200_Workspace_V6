export function shuffle(values, random = Math.random) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function memoryDeck(random) {
  return shuffle(['✦', '☾', '❖', '♬', '☀', '♡'].flatMap((symbol, pair) =>
    [0, 1].map(copy => ({ id: `${pair}-${copy}`, symbol, pair }))), random);
}
export function slide(board, index) {
  const empty = board.indexOf(0);
  if (!Number.isInteger(index) || index < 0 || index > 8) return board;
  const adjacent = Math.abs(Math.floor(empty / 3) - Math.floor(index / 3)) +
    Math.abs(empty % 3 - index % 3) === 1;
  if (!adjacent) return board;
  const next = [...board];
  [next[empty], next[index]] = [next[index], next[empty]];
  return next;
}
export function solved(board) { return board.every((n, i) => n === (i + 1) % 9); }
export function puzzle(random = Math.random) {
  let board = [1,2,3,4,5,6,7,8,0];
  for (let i = 0; i < 120; i++) {
    const moves = Array.from({length: 9}, (_, j) => slide(board, j)).filter(b => b !== board);
    board = moves[Math.floor(random() * moves.length)];
  }
  if (solved(board)) board = slide(board, 7);
  return board;
}
export function estimate({ users, requestsPerUser, displayRate, ecpm }) {
  for (const value of [users, requestsPerUser, displayRate, ecpm])
    if (!Number.isFinite(value) || value < 0) throw new Error('Valeur invalide');
  if (displayRate > 1) throw new Error('Le taux doit être entre 0 et 1');
  const impressions = users * requestsPerUser * displayRate;
  return { impressions, grossRevenue: impressions * ecpm / 1000 };
}
