const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { prepare, saveNow, dbGet, dbAll, dbRun } = require('./database');
const engine = require('./gameEngine');
const { calculateNewRatings } = require('./elo');
const { JWT_SECRET } = require('./auth');
const { seedBotAccounts, findMatchingBot, isBot, getFakeOnlineCount } = require('./botManager');

const activeGames   = new Map();
const matchQueue    = [];
const userSockets   = new Map();
const socketUsers   = new Map();
const botGameTimers = new Map();

const TIME_CONTROLS = {
  bullet1: { name: 'Bullet', time: 60000  },
  blitz3:  { name: 'Blitz',  time: 180000 },
  blitz5:  { name: 'Blitz',  time: 300000 },
};

const EMPTY = 0, RED = 1, RED_KING = 2, BLACK = 3, BLACK_KING = 4;
function isRed(p)      { return p === RED   || p === RED_KING;   }
function isBlack(p)    { return p === BLACK || p === BLACK_KING; }
function isKing(p)     { return p === RED_KING || p === BLACK_KING; }
function ownerColor(p) { return isRed(p) ? 'red' : isBlack(p) ? 'black' : null; }

function evaluateBoard(board, botColor) {
  const oppColor = botColor === 'red' ? 'black' : 'red';
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === EMPTY) continue;
      const color = ownerColor(p), king = isKing(p), isBotP = color === botColor, mult = isBotP ? 1 : -1;
      score += mult * (king ? 5.0 : 1.0);
      if (king) { const cd = Math.abs(r - 3.5) + Math.abs(c - 3.5); score += mult * (3.5 - cd) * 0.2; }
      if (!king) {
        const advance = isBotP ? (botColor === 'red' ? (7 - r) : r) : (oppColor === 'red' ? (7 - r) : r);
        score += mult * advance * 0.15;
        const backRow = isBotP ? (botColor === 'red' ? r === 7 : r === 0) : (oppColor === 'red' ? r === 7 : r === 0);
        if (backRow) score += mult * 0.6;
      }
      if (c === 0 || c === 7) score += mult * -0.25;
      if (r >= 2 && r <= 5 && c >= 2 && c <= 5) score += mult * 0.12;
    }
  }
  const botMoves = engine.getLegalMoves(board, botColor).length;
  const oppMoves = engine.getLegalMoves(board, oppColor).length;
  score += (botMoves - oppMoves) * 0.1;
  let bp = 0, op = 0, bk = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c]; if (!p) continue;
    if (ownerColor(p) === botColor) { bp++; if (isKing(p)) bk++; } else op++;
  }
  if (bp > op) score += (bp - op) * 0.5;
  if (bk > 0 && op <= 3) score += bk * 1.5;
  return score;
}

function minimax(board, turn, depth, alpha, beta, maxing, botColor) {
  const res = engine.getGameResult(board, turn);
  if (res) return res === `${botColor}_win` ? 10000 + depth : -10000 - depth;
  if (depth === 0) return evaluateBoard(board, botColor);
  const moves = engine.getLegalMoves(board, turn);
  const next  = turn === 'red' ? 'black' : 'red';
  const ordered = [...moves].sort((a, b) => b.captures.length - a.captures.length);
  if (maxing) {
    let best = -Infinity;
    for (const m of ordered) { const v = minimax(engine.applyMove(board, m), next, depth - 1, alpha, beta, false, botColor); best = Math.max(best, v); alpha = Math.max(alpha, v); if (beta <= alpha) break; }
    return best;
  } else {
    let best = Infinity;
    for (const m of ordered) { const v = minimax(engine.applyMove(board, m), next, depth - 1, alpha, beta, true, botColor); best = Math.min(best, v); beta = Math.min(beta, v); if (beta <= alpha) break; }
    return best;
  }
}

function getBotMove(board, botColor, difficulty) {
  const moves = engine.getLegalMoves(board, botColor);
  if (!moves.length) return null;
  const rand = () => moves[Math.floor(Math.random() * moves.length)];
  const next = botColor === 'red' ? 'black' : 'red';
  if (difficulty === 'easy') {
    if (Math.random() < 0.65) return rand();
    const caps = moves.filter(m => m.captures.length > 0);
    return caps.length ? caps[Math.floor(Math.random() * caps.length)] : rand();
  }
  const depth = difficulty === 'medium' ? 4 : difficulty === 'hard' ? 8 : 10;
  if (difficulty === 'medium' && Math.random() < 0.15) return rand();
  let bestVal = -Infinity, bestMoves = [];
  const ordered = [...moves].sort((a, b) => b.captures.length - a.captures.length);
  for (const m of ordered) {
    const v = minimax(engine.applyMove(board, m), next, depth, -Infinity, Infinity, false, botColor);
    if (v > bestVal) { bestVal = v; bestMoves = [m]; } else if (v === bestVal) bestMoves.push(m);
  }
  return difficulty === 'elite' ? (bestMoves[0] || rand()) : bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

class GameState {
  constructor(gameId, redPlayer, blackPlayer, timeControl, timeControlId, isVsBot = false, botColor = null, botDifficulty = null, isRated = true) {
    this.id = gameId; this.board = engine.createBoard(); this.turn = 'red';
    this.redPlayer = redPlayer; this.blackPlayer = blackPlayer; this.moves = [];
    this.boardHistory = [engine.cloneBoard(engine.createBoard())];
    this.startedAt = Date.now(); this.status = 'active'; this.result = null;
    this.movesSinceCapture = 0; this.timeControl = timeControl; this.timeControlId = timeControlId;
    this.redTime = timeControl.time; this.blackTime = timeControl.time; this.lastMoveTime = Date.now();
    this.timerInterval = null; this._disconnectTimer = null; this._disconnectGrace = null;
    this.isVsBot = isVsBot; this.botColor = botColor; this.botDifficulty = botDifficulty;
    this.isRated = isRated;
  }
  getCurrentTimes() {
    if (this.status !== 'active') return { redTime: this.redTime, blackTime: this.blackTime };
    const elapsed = Date.now() - this.lastMoveTime;
    return {
      redTime:   this.turn === 'red'   ? Math.max(0, this.redTime   - elapsed) : this.redTime,
      blackTime: this.turn === 'black' ? Math.max(0, this.blackTime - elapsed) : this.blackTime,
    };
  }
  toJSON(forUserId) {
    const t = this.getCurrentTimes();
    return {
      id: this.id, board: this.board, turn: this.turn,
      redPlayer: this.redPlayer, blackPlayer: this.blackPlayer,
      moves: this.moves, status: this.status, result: this.result,
      myColor: forUserId === this.redPlayer.id ? 'red' : 'black',
      legalMoves: this.status === 'active' ? engine.getLegalMoves(this.board, this.turn) : [],
      redTime: t.redTime, blackTime: t.blackTime,
      timeControl: this.timeControl, timeControlId: this.timeControlId,
      isRated: this.isRated,
    };
  }
}

async function updateStreak(userId, won) {
  try {
    const u = await dbGet('SELECT current_streak, best_streak FROM users WHERE id = ?', [userId]);
    if (!u) return;
    let cur = u.current_streak || 0, best = u.best_streak || 0;
    if (won) { cur++; if (cur > best) best = cur; } else cur = 0;
    await dbRun('UPDATE users SET current_streak=?, best_streak=? WHERE id=?', [cur, best, userId]);
  } catch (err) { console.error('Streak error:', err); }
}

function getBotDifficultyFromElo(playerElo, botElo) {
  const avg = (playerElo + botElo) / 2;
  if (avg < 1050) return 'easy';
  if (avg < 1400) return 'medium';
  if (avg < 1700) return 'hard';
  return 'elite';
}

function scheduleBotMove(io, game) {
  if (!game.isVsBot || game.status !== 'active' || game.turn !== game.botColor) return;
  const thinkTime = game.botDifficulty === 'easy' ? 500 : game.botDifficulty === 'medium' ? 1000 : game.botDifficulty === 'hard' ? 1800 : 2500;
  const timer = setTimeout(async () => {
    if (game.status !== 'active') return;
    const move = getBotMove(game.board, game.botColor, game.botDifficulty);
    if (!move) { await finishGame(io, game, game.botColor === 'red' ? 'black_win' : 'red_win'); return; }
    const now = Date.now(), elapsed = now - game.lastMoveTime;
    if (game.botColor === 'red') game.redTime = Math.max(0, game.redTime - elapsed);
    else game.blackTime = Math.max(0, game.blackTime - elapsed);
    game.lastMoveTime = now;
    game.board = engine.applyMove(game.board, move);
    game.moves.push({ color: game.botColor, from: move.from, to: move.to, captures: move.captures, path: move.path });
    game.boardHistory.push(engine.cloneBoard(game.board));
    if (move.captures.length > 0) game.movesSinceCapture = 0; else game.movesSinceCapture++;
    game.turn = game.turn === 'red' ? 'black' : 'red';
    const result = engine.getGameResult(game.board, game.turn);
    if (result) await finishGame(io, game, result);
    else if (game.movesSinceCapture >= 80) await finishGame(io, game, 'draw');
    else {
      const realId = game.botColor === 'red' ? game.blackPlayer.id : game.redPlayer.id;
      const sock = userSockets.get(realId);
      if (sock) sock.emit('game_update', game.toJSON(realId));
    }
  }, thinkTime);
  botGameTimers.set(game.id, timer);
}

function setupSocket(io) {
  seedBotAccounts().catch(console.error);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await dbGet('SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country FROM users WHERE id = ?', [decoded.id]);
      if (!user) return next(new Error('User not found'));
      socket.userId = user.id; socket.userInfo = user; next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`Connected: ${socket.userInfo.username}`);
    userSockets.set(userId, socket);
    socketUsers.set(socket.id, userId);
    io.emit('online_count', getFakeOnlineCount(userSockets.size));
    broadcastFriendPresence(userId, true);

    socket.on('join_queue', async ({ timeControlId } = {}) => {
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) matchQueue.splice(idx, 1);
      for (const [, g] of activeGames) {
        if (g.status === 'active' && (g.redPlayer.id === userId || g.blackPlayer.id === userId)) {
          socket.emit('error_msg', 'Already in an active game'); socket.emit('game_started', g.toJSON(userId)); return;
        }
      }
      const tcId = TIME_CONTROLS[timeControlId] ? timeControlId : 'blitz5';
      matchQueue.push({ userId, elo: socket.userInfo.elo, timeControlId: tcId });
      socket.emit('queue_joined', { timeControlId: tcId });
      const matched = tryMatch(io);
      if (!matched) {
        const botTimer = setTimeout(async () => {
          const still = matchQueue.findIndex(q => q.userId === userId);
          if (still === -1) return;
          matchQueue.splice(still, 1);
          const pd = await dbGet('SELECT id, username, elo FROM users WHERE id = ?', [userId]);
          if (!pd) return;
          const bot = await findMatchingBot(pd.elo);
          if (!bot) return;
          await createBotGame(io, pd, bot, tcId, getBotDifficultyFromElo(pd.elo, bot.elo));
        }, 10000);
        socket.once('leave_queue',  () => clearTimeout(botTimer));
        socket.once('game_started', () => clearTimeout(botTimer));
        socket.once('disconnect',   () => clearTimeout(botTimer));
      }
    });

    socket.on('leave_queue', () => {
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) { matchQueue.splice(idx, 1); socket.emit('queue_left'); }
    });

    socket.on('make_move', async ({ gameId, from, to }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return socket.emit('error_msg', 'Game not found');
      const pc = game.redPlayer.id === userId ? 'red' : game.blackPlayer.id === userId ? 'black' : null;
      if (!pc) return socket.emit('error_msg', 'Not in this game');
      if (game.turn !== pc) return socket.emit('error_msg', 'Not your turn');
      const legal = engine.getLegalMoves(game.board, game.turn);
      const move  = engine.findMatchingMove(legal, from, to);
      if (!move) return socket.emit('error_msg', 'Illegal move');
      const now = Date.now(), elapsed = now - game.lastMoveTime;
      if (pc === 'red') game.redTime = Math.max(0, game.redTime - elapsed); else game.blackTime = Math.max(0, game.blackTime - elapsed);
      game.lastMoveTime = now;
      game.board = engine.applyMove(game.board, move);
      game.moves.push({ color: pc, from, to, captures: move.captures, path: move.path });
      game.boardHistory.push(engine.cloneBoard(game.board));
      if (move.captures.length > 0) game.movesSinceCapture = 0; else game.movesSinceCapture++;
      game.turn = game.turn === 'red' ? 'black' : 'red';
      const result = engine.getGameResult(game.board, game.turn);
      if (result) await finishGame(io, game, result);
      else if (game.movesSinceCapture >= 80) await finishGame(io, game, 'draw');
      else { emitToGame(io, game, 'game_update', (uid) => game.toJSON(uid)); if (game.isVsBot) scheduleBotMove(io, game); }
    });

    socket.on('resign', async ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return;
      const col = game.redPlayer.id === userId ? 'red' : game.blackPlayer.id === userId ? 'black' : null;
      if (!col) return;
      await finishGame(io, game, col === 'red' ? 'black_win' : 'red_win');
    });

    socket.on('offer_draw', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return;
      if (game.isVsBot) { socket.emit('draw_declined', { gameId }); return; }
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('draw_offered', { gameId, from: socket.userInfo.username });
    });

    socket.on('accept_draw', async ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active' || game.isVsBot) return;
      if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) return;
      await finishGame(io, game, 'draw');
    });

    socket.on('decline_draw', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return;
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('draw_declined', { gameId });
    });

    socket.on('request_rematch', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      if (game.isVsBot) { socket.emit('rematch_declined'); return; }
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('rematch_offered', { gameId, from: socket.userInfo.username });
    });

    socket.on('accept_rematch', async ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      const tcId = game.timeControlId || 'blitz5';
      if (game.isVsBot) {
        const pd = await dbGet('SELECT id, username, elo FROM users WHERE id = ?', [userId]);
        const bot = await findMatchingBot(pd.elo);
        await createBotGame(io, pd, bot, tcId, getBotDifficultyFromElo(pd.elo, bot.elo));
        return;
      }
      if (userSockets.get(game.redPlayer.id) && userSockets.get(game.blackPlayer.id)) {
        createGame(io,
          { userId: game.redPlayer.id, elo: game.redPlayer.elo, timeControlId: tcId },
          { userId: game.blackPlayer.id, elo: game.blackPlayer.elo, timeControlId: tcId },
          game.isRated
        );
      }
    });

    socket.on('decline_rematch', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('rematch_declined');
    });

    // ── Friend challenges ─────────────────────────────────────────────────
    socket.on('challenge_friend', async ({ friendId, timeControlId, rated }) => {
      const fs = userSockets.get(friendId);
      if (!fs) { socket.emit('challenge_failed', { reason: 'Friend is offline' }); return; }
      const f = await dbGet(
        `SELECT id FROM friendships WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`,
        [userId, friendId, friendId, userId]
      );
      if (!f) { socket.emit('challenge_failed', { reason: 'Not friends' }); return; }
      const tcId = TIME_CONTROLS[timeControlId] ? timeControlId : 'blitz5';
      const tc   = TIME_CONTROLS[tcId];
      fs.emit('challenge_received', {
        challengerId: userId, challengerName: socket.userInfo.username, challengerElo: socket.userInfo.elo,
        timeControlId: tcId, timeControlName: `${tc.name} ${tc.time / 60000}min`, rated: !!rated,
      });
      socket.emit('challenge_sent', { friendId });
    });

    socket.on('challenge_accept', async ({ challengerId, timeControlId, rated }) => {
      const cs = userSockets.get(challengerId);
      if (!cs) { socket.emit('challenge_failed', { reason: 'Challenger went offline' }); return; }
      const tcId = TIME_CONTROLS[timeControlId] ? timeControlId : 'blitz5';
      for (const uid of [userId, challengerId]) {
        const idx = matchQueue.findIndex(q => q.userId === uid);
        if (idx !== -1) matchQueue.splice(idx, 1);
      }
      await createGame(io,
        { userId: challengerId, elo: cs.userInfo.elo, timeControlId: tcId },
        { userId, elo: socket.userInfo.elo, timeControlId: tcId },
        !!rated
      );
    });

    socket.on('challenge_decline', ({ challengerId }) => {
      const cs = userSockets.get(challengerId);
      if (cs) cs.emit('challenge_declined', { by: socket.userInfo.username });
    });

    socket.on('get_online_friends', async () => {
      const friends = await dbAll(
        `SELECT u.id FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
         WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'`,
        [userId, userId, userId]
      );
      socket.emit('online_friends', { onlineIds: friends.filter(f => userSockets.has(f.id)).map(f => f.id) });
    });

    socket.on('game_chat', ({ gameId, message }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) return;
      if (game.isVsBot) {
        const replies = ['Good move!', 'Interesting...', 'I see your strategy.', 'Well played.', 'Let me think...', '🤔', 'Nice!', 'Hmm...', "You're good!", 'Careful now...'];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        setTimeout(() => {
          const bn = game.botColor === 'red' ? game.redPlayer.username : game.blackPlayer.username;
          socket.emit('game_chat_msg', { from: bn, message: reply, timestamp: Date.now() });
        }, 800);
        return;
      }
      emitToGameBroadcast(io, game, 'game_chat_msg', { from: socket.userInfo.username, message: message.slice(0, 200), timestamp: Date.now() });
    });

    socket.on('disconnect', async () => {
      console.log(`Disconnected: ${socket.userInfo.username}`);
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) matchQueue.splice(idx, 1);
      for (const [, game] of activeGames) {
        if (game.status !== 'active') continue;
        if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) continue;
        if (game.isVsBot) {
          const pc = game.redPlayer.id === userId ? 'red' : 'black';
          await finishGame(io, game, pc === 'red' ? 'black_win' : 'red_win');
          continue;
        }
        const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
        const opp = userSockets.get(oppId);
        if (opp) opp.emit('opponent_disconnected', { gameId: game.id });
        game._disconnectGrace = setTimeout(async () => {
          if (game.status !== 'active') return;
          if (userSockets.has(userId)) return;
          const pc = game.redPlayer.id === userId ? 'red' : 'black';
          console.log(`${socket.userInfo.username} disconnected — awarding loss`);
          await finishGame(io, game, pc === 'red' ? 'black_win' : 'red_win');
        }, 10000);
      }
      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      io.emit('online_count', getFakeOnlineCount(userSockets.size));
      broadcastFriendPresence(userId, false);
    });
  });
}

async function broadcastFriendPresence(userId, online) {
  try {
    const friends = await dbAll(
      `SELECT u.id FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'`,
      [userId, userId, userId]
    );
    for (const f of friends) {
      const s = userSockets.get(f.id);
      if (s) s.emit('friend_presence', { userId, online });
    }
  } catch {}
}

function tryMatch(io) {
  if (matchQueue.length < 2) return false;
  for (let i = 0; i < matchQueue.length; i++) {
    for (let j = i + 1; j < matchQueue.length; j++) {
      if (matchQueue[i].timeControlId === matchQueue[j].timeControlId) {
        const p1 = matchQueue.splice(j, 1)[0], p2 = matchQueue.splice(i, 1)[0];
        createGame(io, p1, p2, true);
        return true;
      }
    }
  }
  return false;
}

async function createGame(io, p1, p2, rated = true) {
  const s1 = userSockets.get(p1.userId), s2 = userSockets.get(p2.userId);
  if (!s1 || !s2) { if (s1) matchQueue.unshift(p1); if (s2) matchQueue.unshift(p2); return; }
  const flip = Math.random() < 0.5;
  const redInfo = flip ? s1.userInfo : s2.userInfo, blackInfo = flip ? s2.userInfo : s1.userInfo;
  const tcId = p1.timeControlId || 'blitz5', tc = TIME_CONTROLS[tcId] || TIME_CONTROLS['blitz5'];
  const gameId = uuidv4();
  const game = new GameState(gameId,
    { id: redInfo.id, username: redInfo.username, elo: redInfo.elo },
    { id: blackInfo.id, username: blackInfo.username, elo: blackInfo.elo },
    tc, tcId, false, null, null, rated
  );
  activeGames.set(gameId, game);
  await dbRun('INSERT INTO games (id, player_red_id, player_black_id, red_elo_before, black_elo_before, is_rated) VALUES (?, ?, ?, ?, ?, ?)',
    [gameId, redInfo.id, blackInfo.id, redInfo.elo, blackInfo.elo, rated]);
  game.timerInterval = setInterval(async () => {
    if (game.status !== 'active') { clearInterval(game.timerInterval); game.timerInterval = null; return; }
    const t = game.getCurrentTimes();
    if (t.redTime <= 0) { clearInterval(game.timerInterval); game.timerInterval = null; game.redTime = 0; await finishGame(io, game, 'black_win'); }
    else if (t.blackTime <= 0) { clearInterval(game.timerInterval); game.timerInterval = null; game.blackTime = 0; await finishGame(io, game, 'red_win'); }
    else emitToGame(io, game, 'timer_update', () => ({ redTime: t.redTime, blackTime: t.blackTime }));
  }, 500);
  const rs = userSockets.get(redInfo.id), bs = userSockets.get(blackInfo.id);
  if (rs) rs.emit('game_started', game.toJSON(redInfo.id));
  if (bs) bs.emit('game_started', game.toJSON(blackInfo.id));
  console.log(`Game: ${redInfo.username} vs ${blackInfo.username} [${tc.name}] ${rated ? 'RATED' : 'CASUAL'}`);
}

async function createBotGame(io, playerData, botData, tcId, difficulty) {
  const tc = TIME_CONTROLS[tcId] || TIME_CONTROLS['blitz5'];
  const flip = Math.random() < 0.5;
  const redPlayer = flip ? playerData : botData, blackPlayer = flip ? botData : playerData, botColor = flip ? 'black' : 'red';
  const gameId = uuidv4();
  const game = new GameState(gameId,
    { id: redPlayer.id, username: redPlayer.username, elo: redPlayer.elo },
    { id: blackPlayer.id, username: blackPlayer.username, elo: blackPlayer.elo },
    tc, tcId, true, botColor, difficulty, true
  );
  activeGames.set(gameId, game);
  await dbRun('INSERT INTO games (id, player_red_id, player_black_id, red_elo_before, black_elo_before, is_rated) VALUES (?, ?, ?, ?, ?, ?)',
    [gameId, redPlayer.id, blackPlayer.id, redPlayer.elo, botData.elo, true]);
  game.timerInterval = setInterval(async () => {
    if (game.status !== 'active') { clearInterval(game.timerInterval); game.timerInterval = null; return; }
    const t = game.getCurrentTimes();
    if (t.redTime <= 0) { clearInterval(game.timerInterval); game.timerInterval = null; game.redTime = 0; await finishGame(io, game, 'black_win'); }
    else if (t.blackTime <= 0) { clearInterval(game.timerInterval); game.timerInterval = null; game.blackTime = 0; await finishGame(io, game, 'red_win'); }
    else { const realId = botColor === 'red' ? blackPlayer.id : redPlayer.id; const s = userSockets.get(realId); if (s) s.emit('timer_update', { redTime: t.redTime, blackTime: t.blackTime }); }
  }, 500);
  const ps = userSockets.get(playerData.id);
  if (ps) ps.emit('game_started', game.toJSON(playerData.id));
  console.log(`Bot game: ${playerData.username} vs ${botData.username} [${difficulty}]`);
  if (botColor === 'red') scheduleBotMove(io, game);
}

async function finishGame(io, game, result) {
  if (game.status === 'finished') return;
  game.status = 'finished'; game.result = result;
  if (game.timerInterval)    { clearInterval(game.timerInterval);   game.timerInterval    = null; }
  if (game._disconnectTimer) { clearTimeout(game._disconnectTimer); game._disconnectTimer = null; }
  if (game._disconnectGrace) { clearTimeout(game._disconnectGrace); game._disconnectGrace = null; }
  const bt = botGameTimers.get(game.id); if (bt) { clearTimeout(bt); botGameTimers.delete(game.id); }
  console.log(`Finishing game ${game.id} — result: ${result} [${game.isRated ? 'RATED' : 'CASUAL'}]`);

  let redEloBefore = game.redPlayer.elo, blackEloBefore = game.blackPlayer.elo;
  let redEloAfter = redEloBefore, blackEloAfter = blackEloBefore;

  try {
    const redUser = await dbGet('SELECT * FROM users WHERE id = ?', [game.redPlayer.id]);
    const blackUser = await dbGet('SELECT * FROM users WHERE id = ?', [game.blackPlayer.id]);
    if (!redUser || !blackUser) throw new Error('Users not found');
    redEloBefore = redUser.elo; blackEloBefore = blackUser.elo;
    redEloAfter = redEloBefore; blackEloAfter = blackEloBefore;
    const rated = game.isRated !== false;

    if (result === 'red_win') {
      if (rated) { const r = calculateNewRatings(redEloBefore, blackEloBefore, redUser.games_played, blackUser.games_played, false); redEloAfter = r.newWinnerElo; blackEloAfter = r.newLoserElo; }
      await dbRun('UPDATE users SET elo=?, wins=wins+1, games_played=games_played+1 WHERE id=?', [redEloAfter, redUser.id]);
      await dbRun('UPDATE users SET elo=?, losses=losses+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      await updateStreak(redUser.id, true); await updateStreak(blackUser.id, false);
    } else if (result === 'black_win') {
      if (rated) { const r = calculateNewRatings(blackEloBefore, redEloBefore, blackUser.games_played, redUser.games_played, false); blackEloAfter = r.newWinnerElo; redEloAfter = r.newLoserElo; }
      await dbRun('UPDATE users SET elo=?, wins=wins+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      await dbRun('UPDATE users SET elo=?, losses=losses+1, games_played=games_played+1 WHERE id=?', [redEloAfter, redUser.id]);
      await updateStreak(blackUser.id, true); await updateStreak(redUser.id, false);
    } else if (result === 'draw') {
      if (rated) { const r = calculateNewRatings(redEloBefore, blackEloBefore, redUser.games_played, blackUser.games_played, true); redEloAfter = r.newWinnerElo; blackEloAfter = r.newLoserElo; }
      await dbRun('UPDATE users SET elo=?, draws=draws+1, games_played=games_played+1 WHERE id=?', [redEloAfter, redUser.id]);
      await dbRun('UPDATE users SET elo=?, draws=draws+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      await updateStreak(redUser.id, false); await updateStreak(blackUser.id, false);
    } else {
      await dbRun('UPDATE users SET games_played=games_played+1 WHERE id=?', [redUser.id]);
      await dbRun('UPDATE users SET games_played=games_played+1 WHERE id=?', [blackUser.id]);
    }

    let movesJson = null;
    try {
      movesJson = JSON.stringify({ moves: game.moves, boardHistory: game.boardHistory });
      if (movesJson.length > 2000000) movesJson = JSON.stringify({ moves: game.moves, boardHistory: [] });
    } catch (e) { console.error('Serialization error:', e); }

    const winnerId = result === 'red_win' ? game.redPlayer.id : result === 'black_win' ? game.blackPlayer.id : null;
    await dbRun(
      `UPDATE games SET winner_id=?, result=?, red_elo_after=?, black_elo_after=?, moves_count=?, moves_json=?, completed_at=NOW() WHERE id=?`,
      [winnerId, result, redEloAfter, blackEloAfter, game.moves.length, movesJson, game.id]
    );
    console.log(`ELO: red ${redEloBefore}→${redEloAfter} | black ${blackEloBefore}→${blackEloAfter}`);
  } catch (err) { console.error('finishGame error:', err); }

  const resultData = { result, redEloChange: redEloAfter - redEloBefore, blackEloChange: blackEloAfter - blackEloBefore, redEloAfter, blackEloAfter, isRated: game.isRated };
  emitToGame(io, game, 'game_over', (uid) => ({ ...game.toJSON(uid), resultData }));
  setTimeout(() => activeGames.delete(game.id), 300000);
}

function emitToGame(io, game, event, dataFn) {
  const rs = userSockets.get(game.redPlayer.id), bs = userSockets.get(game.blackPlayer.id);
  if (rs) rs.emit(event, dataFn(game.redPlayer.id));
  if (bs) bs.emit(event, dataFn(game.blackPlayer.id));
}

function emitToGameBroadcast(io, game, event, data) {
  const rs = userSockets.get(game.redPlayer.id), bs = userSockets.get(game.blackPlayer.id);
  if (rs) rs.emit(event, data);
  if (bs) bs.emit(event, data);
}

module.exports = { setupSocket };