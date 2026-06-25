const EMPTY = 0;
const RED = 1;
const RED_KING = 2;
const BLACK = 3;
const BLACK_KING = 4;

function createBoard() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 0) board[r][c] = BLACK;
  for (let r = 5; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if ((r + c) % 2 === 0) board[r][c] = RED;
  return board;
}

function cloneBoard(board) { return board.map(row => [...row]); }
function isRed(piece) { return piece === RED || piece === RED_KING; }
function isBlack(piece) { return piece === BLACK || piece === BLACK_KING; }
function isKing(piece) { return piece === RED_KING || piece === BLACK_KING; }
function ownerColor(piece) {
  if (isRed(piece)) return 'red';
  if (isBlack(piece)) return 'black';
  return null;
}
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function isOpponent(piece, color) {
  return color === 'red' ? isBlack(piece) : isRed(piece);
}

function getMoveDirections(piece) {
  const dirs = [];
  if (piece === RED || piece === RED_KING || piece === BLACK_KING) dirs.push([-1, -1], [-1, 1]);
  if (piece === BLACK || piece === BLACK_KING || piece === RED_KING) dirs.push([1, -1], [1, 1]);
  return dirs;
}

function getSimpleMoves(board, r, c) {
  const piece = board[r][c];
  if (piece === EMPTY) return [];
  const moves = [];
  for (const [dr, dc] of getMoveDirections(piece)) {
    const nr = r + dr, nc = c + dc;
    if (inBounds(nr, nc) && board[nr][nc] === EMPTY) {
      moves.push({ from: [r, c], to: [nr, nc], captures: [], path: [[r, c], [nr, nc]] });
    }
  }
  return moves;
}

function getCaptureSequences(board, r, c, color, isKingPiece) {
  const sequences = [];
  const originalPiece = board[r][c];

  function dfs(curBoard, cr, cc, path, captures, crowned) {
    const dirs = crowned || isKingPiece
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : getMoveDirections(originalPiece);

    let foundMore = false;

    for (const [dr, dc] of dirs) {
      const mr = cr + dr, mc = cc + dc;
      const lr = cr + 2 * dr, lc = cc + 2 * dc;
      if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;
      if (!isOpponent(curBoard[mr][mc], color)) continue;
      if (curBoard[lr][lc] !== EMPTY) continue;

      const capKey = `${mr},${mc}`;
      if (captures.some(cap => `${cap[0]},${cap[1]}` === capKey)) continue;

      foundMore = true;
      const newBoard = cloneBoard(curBoard);
      newBoard[lr][lc] = newBoard[cr][cc];
      newBoard[cr][cc] = EMPTY;
      newBoard[mr][mc] = EMPTY;

      const justCrowned = !crowned && !isKingPiece && (
        (color === 'red' && lr === 0) || (color === 'black' && lr === 7)
      );
      if (justCrowned) {
        newBoard[lr][lc] = color === 'red' ? RED_KING : BLACK_KING;
      }

      const newPath = [...path, [lr, lc]];
      const newCaptures = [...captures, [mr, mc]];

      if (justCrowned) {
        sequences.push({ from: [r, c], to: [lr, lc], captures: newCaptures, path: newPath });
      } else {
        dfs(newBoard, lr, lc, newPath, newCaptures, crowned);
      }
    }

    if (!foundMore && captures.length > 0) {
      sequences.push({ from: [r, c], to: [cr, cc], captures: [...captures], path: [...path] });
    }
  }

  dfs(board, r, c, [[r, c]], [], false);
  return sequences;
}

function getLegalMoves(board, color) {
  let allCaptures = [];
  let allSimple = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece === EMPTY || ownerColor(piece) !== color) continue;

      const captures = getCaptureSequences(board, r, c, color, isKing(piece));
      if (captures.length > 0) allCaptures.push(...captures);
      else allSimple.push(...getSimpleMoves(board, r, c));
    }
  }

  if (allCaptures.length > 0) {
    const maxLen = Math.max(...allCaptures.map(m => m.captures.length));
    return allCaptures.filter(m => m.captures.length === maxLen);
  }
  return allSimple;
}

function applyMove(board, move) {
  const newBoard = cloneBoard(board);
  const piece = newBoard[move.from[0]][move.from[1]];
  const color = ownerColor(piece);

  newBoard[move.from[0]][move.from[1]] = EMPTY;

  for (const [cr, cc] of move.captures) {
    newBoard[cr][cc] = EMPTY;
  }

  let finalPiece = piece;
  const dest = move.to;
  if (!isKing(piece)) {
    if ((color === 'red' && dest[0] === 0) || (color === 'black' && dest[0] === 7)) {
      finalPiece = color === 'red' ? RED_KING : BLACK_KING;
    }
  }
  newBoard[dest[0]][dest[1]] = finalPiece;

  return newBoard;
}

function getGameResult(board, currentTurn) {
  const moves = getLegalMoves(board, currentTurn);
  if (moves.length === 0) {
    return currentTurn === 'red' ? 'black_win' : 'red_win';
  }

  let redCount = 0, blackCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isRed(board[r][c])) redCount++;
      if (isBlack(board[r][c])) blackCount++;
    }
  }
  if (redCount === 0) return 'black_win';
  if (blackCount === 0) return 'red_win';

  return null;
}

function findMatchingMove(legalMoves, from, to) {
  return legalMoves.find(m =>
    m.from[0] === from[0] && m.from[1] === from[1] &&
    m.to[0] === to[0] && m.to[1] === to[1]
  );
}

module.exports = {
  EMPTY, RED, RED_KING, BLACK, BLACK_KING,
  createBoard, cloneBoard, getLegalMoves, applyMove,
  getGameResult, findMatchingMove, isRed, isBlack, isKing, ownerColor
};