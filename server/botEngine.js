const engine = require('./gameEngine');

// Simple checkers AI with multiple difficulty levels

function getRandomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

// Count pieces
function countPieces(board, color) {
  let men = 0, kings = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (engine.ownerColor(p) === color) {
        if (engine.isKing(p)) kings++;
        else men++;
      }
    }
  }
  return { men, kings, total: men + kings };
}

// Evaluate board position for a color
function evaluate(board, color) {
  const opp = color === 'red' ? 'black' : 'red';
  const mine = countPieces(board, color);
  const theirs = countPieces(board, opp);
  // Kings worth more
  return (mine.men * 1 + mine.kings * 2.5) - (theirs.men * 1 + theirs.kings * 2.5);
}

// Minimax with alpha-beta pruning
function minimax(board, turn, depth, alpha, beta, maximizing, botColor) {
  const result = engine.getGameResult(board, turn);
  if (result) {
    if (result === `${botColor}_win`) return 1000 + depth;
    if (result === 'draw') return 0;
    return -1000 - depth;
  }
  if (depth === 0) return evaluate(board, botColor);

  const moves = engine.getLegalMoves(board, turn);
  const nextTurn = turn === 'red' ? 'black' : 'red';

  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const newBoard = engine.applyMove(board, move);
      const val = minimax(newBoard, nextTurn, depth - 1, alpha, beta, false, botColor);
      best = Math.max(best, val);
      alpha = Math.max(alpha, val);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const newBoard = engine.applyMove(board, move);
      const val = minimax(newBoard, nextTurn, depth - 1, alpha, beta, true, botColor);
      best = Math.min(best, val);
      beta = Math.min(beta, val);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBotMove(board, botColor, difficulty) {
  const moves = engine.getLegalMoves(board, botColor);
  if (!moves.length) return null;

  if (difficulty === 'easy') {
    // 70% random, 30% captures preferred
    if (Math.random() < 0.7) return getRandomMove(moves);
    const captures = moves.filter(m => m.captures.length > 0);
    return captures.length ? getRandomMove(captures) : getRandomMove(moves);
  }

  if (difficulty === 'medium') {
    // depth 3 minimax with some randomness
    if (Math.random() < 0.2) return getRandomMove(moves);
    let bestVal = -Infinity, bestMoves = [];
    const nextTurn = botColor === 'red' ? 'black' : 'red';
    for (const move of moves) {
      const newBoard = engine.applyMove(board, move);
      const val = minimax(newBoard, nextTurn, 3, -Infinity, Infinity, false, botColor);
      if (val > bestVal) { bestVal = val; bestMoves = [move]; }
      else if (val === bestVal) bestMoves.push(move);
    }
    return getRandomMove(bestMoves);
  }

  if (difficulty === 'hard') {
    // depth 6 minimax — strong
    let bestVal = -Infinity, bestMoves = [];
    const nextTurn = botColor === 'red' ? 'black' : 'red';
    for (const move of moves) {
      const newBoard = engine.applyMove(board, move);
      const val = minimax(newBoard, nextTurn, 6, -Infinity, Infinity, false, botColor);
      if (val > bestVal) { bestVal = val; bestMoves = [move]; }
      else if (val === bestVal) bestMoves.push(move);
    }
    return getRandomMove(bestMoves);
  }

  return getRandomMove(moves);
}

module.exports = { getBotMove };