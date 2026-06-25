// Convert row/col to board notation (a1-h8 style)
export function toNotation(row, col) {
  const letters = 'abcdefgh';
  return `${letters[col]}${8 - row}`;
}

export function moveToString(move) {
  const from = toNotation(move.from[0], move.from[1]);
  const to = toNotation(move.to[0], move.to[1]);
  if (move.captures && move.captures.length > 0) {
    return `${from}×${to}`;
  }
  return `${from}-${to}`;
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}
