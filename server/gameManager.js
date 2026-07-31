const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { prepare, saveNow, dbGet, dbAll, dbRun } = require('./database');
const engine = require('./gameEngine');
const { calculateNewRatings } = require('./elo');
const { JWT_SECRET } = require('./auth');
const { seedBotAccounts, findMatchingBot, getBotDifficulty, isBot, getFakeOnlineCount } = require('./botManager');

const activeGames  = new Map();
const matchQueue   = [];
const userSockets  = new Map();
const socketUsers  = new Map();
const botGameTimers = new Map(); // gameId -> bot move timeout

const TIME_CONTROLS = {
  bullet1: { name: 'Bullet', time: 60000  },
  blitz3:  { name: 'Blitz',  time: 180000 },
  blitz5:  { name: 'Blitz',  time: 300000 },
};

// ── Checkers engine (server-side for bot moves) ───────────────────────────────
const EMPTY = 0, RED = 1, RED_KING = 2, BLACK = 3, BLACK_KING = 4;
function isRed(p)      { return p === RED   || p === RED_KING;   }
function isBlack(p)    { return p === BLACK || p === BLACK_KING; }
function isKing(p)     { return p === RED_KING || p === BLACK_KING; }
function ownerColor(p) { return isRed(p) ? 'red' : isBlack(p) ? 'black' : null; }

function countPieces(board, color) {
  let men = 0, kings = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (ownerColor(p) === color) { if (isKing(p)) kings++; else men++; }
    }
  return men + kings * 2.5;
}

function minimax(board, turn, depth, alpha, beta, maxing, botColor) {
  const res = engine.getGameResult(board, turn);
  if (res) return res === `${botColor}_win` ? 1000 + depth : -1000 - depth;
  if (depth === 0) return countPieces(board, botColor) - countPieces(board, botColor === 'red' ? 'black' : 'red');
  const moves = engine.getLegalMoves(board, turn);
  const next  = turn === 'red' ? 'black' : 'red';
  if (maxing) {
    let best = -Infinity;
    for (const m of moves) {
      const v = minimax(engine.applyMove(board, m), next, depth - 1, alpha, beta, false, botColor);
      best = Math.max(best, v); alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const v = minimax(engine.applyMove(board, m), next, depth - 1, alpha, beta, true, botColor);
      best = Math.min(best, v); beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBotMove(board, botColor, difficulty) {
  const moves = engine.getLegalMoves(board, botColor);
  if (!moves.length) return null;
  const rand = () => moves[Math.floor(Math.random() * moves.length)];

  if (difficulty === 'easy') {
    if (Math.random() < 0.7) return rand();
    const caps = moves.filter(m => m.captures.length > 0);
    return caps.length ? caps[Math.floor(Math.random() * caps.length)] : rand();
  }

  const depth = difficulty === 'hard' ? 6 : 3;
  if (difficulty === 'medium' && Math.random() < 0.2) return rand();

  let bestVal = -Infinity, bestMoves = [];
  const next = botColor === 'red' ? 'black' : 'red';
  for (const m of moves) {
    const v = minimax(engine.applyMove(board, m), next, depth, -Infinity, Infinity, false, botColor);
    if (v > bestVal) { bestVal = v; bestMoves = [m]; }
    else if (v === bestVal) bestMoves.push(m);
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// ── Game state ────────────────────────────────────────────────────────────────
class GameState {
  constructor(gameId, redPlayer, blackPlayer, timeControl, timeControlId, isVsBot = false, botColor = null, botDifficulty = null) {
    this.id            = gameId;
    this.board         = engine.createBoard();
    this.turn          = 'red';
    this.redPlayer     = redPlayer;
    this.blackPlayer   = blackPlayer;
    this.moves         = [];
    this.boardHistory  = [engine.cloneBoard(engine.createBoard())];
    this.startedAt     = Date.now();
    this.status        = 'active';
    this.result        = null;
    this.movesSinceCapture = 0;
    this.timeControl   = timeControl;
    this.timeControlId = timeControlId;
    this.redTime       = timeControl.time;
    this.blackTime     = timeControl.time;
    this.lastMoveTime  = Date.now();
    this.timerInterval = null;
    this._disconnectTimer = null;
    this._disconnectGrace = null;
    this.isVsBot       = isVsBot;
    this.botColor      = botColor;
    this.botDifficulty = botDifficulty;
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
    const times = this.getCurrentTimes();
    return {
      id: this.id, board: this.board, turn: this.turn,
      redPlayer: this.redPlayer, blackPlayer: this.blackPlayer,
      moves: this.moves, status: this.status, result: this.result,
      myColor: forUserId === this.redPlayer.id ? 'red' : 'black',
      legalMoves: this.status === 'active' ? engine.getLegalMoves(this.board, this.turn) : [],
      redTime: times.redTime, blackTime: times.blackTime,
      timeControl: this.timeControl, timeControlId: this.timeControlId,
    };
  }
}

// ── Streak update ─────────────────────────────────────────────────────────────
async function updateStreak(userId, won) {
  try {
    const user = await dbGet('SELECT current_streak, best_streak FROM users WHERE id = ?', [userId]);
    if (!user) return;
    let cur  = user.current_streak || 0;
    let best = user.best_streak    || 0;
    if (won) { cur++; if (cur > best) best = cur; } else cur = 0;
    await dbRun('UPDATE users SET current_streak=?, best_streak=? WHERE id=?', [cur, best, userId]);
  } catch (err) { console.error('Streak error:', err); }
}

// ── Schedule bot move ─────────────────────────────────────────────────────────
function scheduleBotMove(io, game) {
  if (!game.isVsBot || game.status !== 'active') return;
  if (game.turn !== game.botColor) return;

  const thinkTime = game.botDifficulty === 'easy' ? 600
                  : game.botDifficulty === 'medium' ? 1200 : 2000;

  const timer = setTimeout(async () => {
    if (game.status !== 'active') return;
    const move = getBotMove(game.board, game.botColor, game.botDifficulty);
    if (!move) { await finishGame(io, game, game.botColor === 'red' ? 'black_win' : 'red_win'); return; }

    const now = Date.now();
    const elapsed = now - game.lastMoveTime;
    if (game.botColor === 'red') game.redTime   = Math.max(0, game.redTime   - elapsed);
    else                         game.blackTime  = Math.max(0, game.blackTime - elapsed);
    game.lastMoveTime = now;

    game.board = engine.applyMove(game.board, move);
    game.moves.push({ color: game.botColor, from: move.from, to: move.to, captures: move.captures, path: move.path });
    game.boardHistory.push(engine.cloneBoard(game.board));

    if (move.captures.length > 0) game.movesSinceCapture = 0;
    else game.movesSinceCapture++;

    game.turn = game.turn === 'red' ? 'black' : 'red';
    const result = engine.getGameResult(game.board, game.turn);

    if (result) await finishGame(io, game, result);
    else if (game.movesSinceCapture >= 80) await finishGame(io, game, 'draw');
    else {
      const realPlayerId = game.botColor === 'red' ? game.blackPlayer.id : game.redPlayer.id;
      const sock = userSockets.get(realPlayerId);
      if (sock) sock.emit('game_update', game.toJSON(realPlayerId));
    }
  }, thinkTime);

  botGameTimers.set(game.id, timer);
}

// ── Socket setup ──────────────────────────────────────────────────────────────
function setupSocket(io) {
  // Seed bots on startup
  seedBotAccounts().catch(console.error);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await dbGet(
        'SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country FROM users WHERE id = ?',
        [decoded.id]
      );
      if (!user) return next(new Error('User not found'));
      socket.userId   = user.id;
      socket.userInfo = user;
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`Connected: ${socket.userInfo.username}`);
    userSockets.set(userId, socket);
    socketUsers.set(socket.id, userId);
    io.emit('online_count', getFakeOnlineCount(userSockets.size));

    socket.on('join_queue', async ({ timeControlId } = {}) => {
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) matchQueue.splice(idx, 1);

      for (const [, game] of activeGames) {
        if (game.status === 'active' && (game.redPlayer.id === userId || game.blackPlayer.id === userId)) {
          socket.emit('error_msg', 'Already in an active game');
          socket.emit('game_started', game.toJSON(userId));
          return;
        }
      }

      const tcId = TIME_CONTROLS[timeControlId] ? timeControlId : 'blitz5';
      matchQueue.push({ userId, elo: socket.userInfo.elo, timeControlId: tcId });
      socket.emit('queue_joined', { timeControlId: tcId });

      // Try real match first
      const matched = tryMatch(io);

      // If no real match after 45 seconds, match with bot
      if (!matched) {
        const botMatchTimer = setTimeout(async () => {
          const stillInQueue = matchQueue.findIndex(q => q.userId === userId);
          if (stillInQueue === -1) return; // Already matched

          matchQueue.splice(stillInQueue, 1);

          const playerData = await dbGet('SELECT id, username, elo FROM users WHERE id = ?', [userId]);
          if (!playerData) return;

          const bot = await findMatchingBot(playerData.elo);
          if (!bot) return;

          const difficulty = getBotDifficulty(playerData.elo, bot.elo);
          await createBotGame(io, playerData, bot, tcId, difficulty);
        }, 10000);

        socket.once('leave_queue', () => clearTimeout(botMatchTimer));
        socket.once('game_started', () => clearTimeout(botMatchTimer));
        socket.once('disconnect', () => clearTimeout(botMatchTimer));
      }
    });

    socket.on('leave_queue', () => {
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) { matchQueue.splice(idx, 1); socket.emit('queue_left'); }
    });

    socket.on('make_move', async ({ gameId, from, to }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return socket.emit('error_msg', 'Game not found');
      const playerColor = game.redPlayer.id === userId ? 'red' : game.blackPlayer.id === userId ? 'black' : null;
      if (!playerColor) return socket.emit('error_msg', 'Not in this game');
      if (game.turn !== playerColor) return socket.emit('error_msg', 'Not your turn');

      const legalMoves = engine.getLegalMoves(game.board, game.turn);
      const move = engine.findMatchingMove(legalMoves, from, to);
      if (!move) return socket.emit('error_msg', 'Illegal move');

      const now = Date.now();
      const elapsed = now - game.lastMoveTime;
      if (playerColor === 'red') game.redTime   = Math.max(0, game.redTime   - elapsed);
      else                       game.blackTime  = Math.max(0, game.blackTime - elapsed);
      game.lastMoveTime = now;

      game.board = engine.applyMove(game.board, move);
      game.moves.push({ color: playerColor, from, to, captures: move.captures, path: move.path });
      game.boardHistory.push(engine.cloneBoard(game.board));

      if (move.captures.length > 0) game.movesSinceCapture = 0;
      else game.movesSinceCapture++;

      game.turn = game.turn === 'red' ? 'black' : 'red';
      const result = engine.getGameResult(game.board, game.turn);

      if (result) await finishGame(io, game, result);
      else if (game.movesSinceCapture >= 80) await finishGame(io, game, 'draw');
      else {
        emitToGame(io, game, 'game_update', (uid) => game.toJSON(uid));
        // Schedule bot move if vs bot
        if (game.isVsBot) scheduleBotMove(io, game);
      }
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
      if (game.isVsBot) {
        // Bot always declines draw
        socket.emit('draw_declined', { gameId });
        return;
      }
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
      if (game.isVsBot) {
        // For bot games, just create a new bot game
        socket.emit('rematch_declined');
        return;
      }
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('rematch_offered', { gameId, from: socket.userInfo.username });
    });

    socket.on('accept_rematch', async ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      const tcId = game.timeControlId || 'blitz5';
      if (game.isVsBot) {
        const playerData = await dbGet('SELECT id, username, elo FROM users WHERE id = ?', [userId]);
        const bot = await findMatchingBot(playerData.elo);
        const difficulty = getBotDifficulty(playerData.elo, bot.elo);
        await createBotGame(io, playerData, bot, tcId, difficulty);
        return;
      }
      if (userSockets.get(game.redPlayer.id) && userSockets.get(game.blackPlayer.id)) {
        createGame(io,
          { userId: game.redPlayer.id,   elo: game.redPlayer.elo,   timeControlId: tcId },
          { userId: game.blackPlayer.id, elo: game.blackPlayer.elo, timeControlId: tcId }
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

    socket.on('game_chat', ({ gameId, message }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) return;
      if (game.isVsBot) {
        // Bot auto-replies
        const replies = ['Good move!', 'Interesting...', 'I see your strategy.', 'Well played.', 'Let me think...', '🤔'];
        const reply = replies[Math.floor(Math.random() * replies.length)];
        setTimeout(() => {
          socket.emit('game_chat_msg', { from: game.isVsBot ? (game.botColor === 'red' ? game.redPlayer.username : game.blackPlayer.username) : 'Bot', message: reply, timestamp: Date.now() });
        }, 800);
        return;
      }
      emitToGameBroadcast(io, game, 'game_chat_msg', {
        from: socket.userInfo.username, message: message.slice(0, 200), timestamp: Date.now(),
      });
    });

    socket.on('disconnect', async () => {
      console.log(`Disconnected: ${socket.userInfo.username}`);
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) matchQueue.splice(idx, 1);

      for (const [, game] of activeGames) {
        if (game.status !== 'active') continue;
        if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) continue;

        if (game.isVsBot) {
          // Bot games — finish immediately with loss for disconnecting player
          const playerColor = game.redPlayer.id === userId ? 'red' : 'black';
          await finishGame(io, game, playerColor === 'red' ? 'black_win' : 'red_win');
          continue;
        }

        // Real game — notify opponent, give 10 second grace period
        const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
        const opp   = userSockets.get(oppId);
        if (opp) opp.emit('opponent_disconnected', { gameId: game.id });

        // 10 second grace period for accidental disconnect
        game._disconnectGrace = setTimeout(async () => {
          if (game.status !== 'active') return;
          // Check if player reconnected
          if (userSockets.has(userId)) return;
          // Player didn't reconnect — give them a loss
          const playerColor = game.redPlayer.id === userId ? 'red' : 'black';
          console.log(`${socket.userInfo.username} disconnected — awarding loss`);
          await finishGame(io, game, playerColor === 'red' ? 'black_win' : 'red_win');
        }, 10000);
      }

      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      io.emit('online_count', getFakeOnlineCount(userSockets.size));
    });
  });
}

// ── Matchmaking ───────────────────────────────────────────────────────────────
function tryMatch(io) {
  if (matchQueue.length < 2) return false;
  for (let i = 0; i < matchQueue.length; i++) {
    for (let j = i + 1; j < matchQueue.length; j++) {
      if (matchQueue[i].timeControlId === matchQueue[j].timeControlId) {
        const p1 = matchQueue.splice(j, 1)[0];
        const p2 = matchQueue.splice(i, 1)[0];
        createGame(io, p1, p2);
        return true;
      }
    }
  }
  return false;
}

async function createGame(io, p1, p2) {
  const s1 = userSockets.get(p1.userId);
  const s2 = userSockets.get(p2.userId);
  if (!s1 || !s2) { if (s1) matchQueue.unshift(p1); if (s2) matchQueue.unshift(p2); return; }

  const flip    = Math.random() < 0.5;
  const redInfo   = flip ? s1.userInfo : s2.userInfo;
  const blackInfo = flip ? s2.userInfo : s1.userInfo;
  const tcId = p1.timeControlId || 'blitz5';
  const tc   = TIME_CONTROLS[tcId] || TIME_CONTROLS['blitz5'];

  const gameId = uuidv4();
  const game = new GameState(
    gameId,
    { id: redInfo.id,   username: redInfo.username,   elo: redInfo.elo   },
    { id: blackInfo.id, username: blackInfo.username, elo: blackInfo.elo },
    tc, tcId, false, null, null
  );
  activeGames.set(gameId, game);

  await dbRun('INSERT INTO games (id, player_red_id, player_black_id, red_elo_before, black_elo_before) VALUES (?, ?, ?, ?, ?)',
    [gameId, redInfo.id, blackInfo.id, redInfo.elo, blackInfo.elo]);

  game.timerInterval = setInterval(async () => {
    if (game.status !== 'active') { clearInterval(game.timerInterval); return; }
    const times = game.getCurrentTimes();
    if      (times.redTime   <= 0) { clearInterval(game.timerInterval); await finishGame(io, game, 'black_win'); }
    else if (times.blackTime <= 0) { clearInterval(game.timerInterval); await finishGame(io, game, 'red_win');   }
    else emitToGame(io, game, 'timer_update', () => ({ redTime: times.redTime, blackTime: times.blackTime }));
  }, 1000);

  const rs = userSockets.get(redInfo.id);
  const bs = userSockets.get(blackInfo.id);
  if (rs) rs.emit('game_started', game.toJSON(redInfo.id));
  if (bs) bs.emit('game_started', game.toJSON(blackInfo.id));
  console.log(`Game: ${redInfo.username} vs ${blackInfo.username} [${tc.name}]`);
}

async function createBotGame(io, playerData, botData, tcId, difficulty) {
  const tc  = TIME_CONTROLS[tcId] || TIME_CONTROLS['blitz5'];
  const flip = Math.random() < 0.5;

  const redPlayer   = flip ? playerData : botData;
  const blackPlayer = flip ? botData    : playerData;
  const botColor    = flip ? 'black'    : 'red';

  const gameId = uuidv4();
  const game = new GameState(
    gameId,
    { id: redPlayer.id,   username: redPlayer.username,   elo: redPlayer.elo   },
    { id: blackPlayer.id, username: blackPlayer.username, elo: blackPlayer.elo },
    tc, tcId, true, botColor, difficulty
  );
  activeGames.set(gameId, game);

  await dbRun('INSERT INTO games (id, player_red_id, player_black_id, red_elo_before, black_elo_before) VALUES (?, ?, ?, ?, ?)',
    [gameId, redPlayer.id, blackPlayer.id, redPlayer.elo, botData.elo]);

  const playerSocket = userSockets.get(playerData.id);
  if (playerSocket) playerSocket.emit('game_started', game.toJSON(playerData.id));

  console.log(`Bot game: ${playerData.username} (${playerData.elo}) vs ${botData.username} (${botData.elo}) [${difficulty}]`);

  // If bot goes first (bot is red), schedule its move
  if (botColor === 'red') scheduleBotMove(io, game);
}

// ── Finish game ───────────────────────────────────────────────────────────────
async function finishGame(io, game, result) {
  if (game.status === 'finished') return;
  game.status = 'finished';
  game.result = result;

  if (game.timerInterval)    { clearInterval(game.timerInterval);   game.timerInterval    = null; }
  if (game._disconnectTimer) { clearTimeout(game._disconnectTimer); game._disconnectTimer = null; }
  if (game._disconnectGrace) { clearTimeout(game._disconnectGrace); game._disconnectGrace = null; }

  // Clear bot timer
  const botTimer = botGameTimers.get(game.id);
  if (botTimer) { clearTimeout(botTimer); botGameTimers.delete(game.id); }

  console.log(`Finishing game ${game.id} — result: ${result}`);

  let redEloBefore = game.redPlayer.elo, blackEloBefore = game.blackPlayer.elo;
  let redEloAfter  = redEloBefore,       blackEloAfter  = blackEloBefore;

  try {
    const redUser   = await dbGet('SELECT * FROM users WHERE id = ?', [game.redPlayer.id]);
    const blackUser = await dbGet('SELECT * FROM users WHERE id = ?', [game.blackPlayer.id]);
    if (!redUser || !blackUser) throw new Error('Users not found');

    redEloBefore   = redUser.elo;
    blackEloBefore = blackUser.elo;
    redEloAfter    = redEloBefore;
    blackEloAfter  = blackEloBefore;

    if (result === 'red_win') {
      const r = calculateNewRatings(redEloBefore, blackEloBefore, redUser.games_played, blackUser.games_played, false);
      redEloAfter = r.newWinnerElo; blackEloAfter = r.newLoserElo;
      await dbRun('UPDATE users SET elo=?, wins=wins+1, games_played=games_played+1 WHERE id=?',     [redEloAfter,   redUser.id]);
      await dbRun('UPDATE users SET elo=?, losses=losses+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      await updateStreak(redUser.id, true);
      await updateStreak(blackUser.id, false);
    } else if (result === 'black_win') {
      const r = calculateNewRatings(blackEloBefore, redEloBefore, blackUser.games_played, redUser.games_played, false);
      blackEloAfter = r.newWinnerElo; redEloAfter = r.newLoserElo;
      await dbRun('UPDATE users SET elo=?, wins=wins+1, games_played=games_played+1 WHERE id=?',     [blackEloAfter, blackUser.id]);
      await dbRun('UPDATE users SET elo=?, losses=losses+1, games_played=games_played+1 WHERE id=?', [redEloAfter,   redUser.id]);
      await updateStreak(blackUser.id, true);
      await updateStreak(redUser.id,   false);
    } else if (result === 'draw') {
      const r = calculateNewRatings(redEloBefore, blackEloBefore, redUser.games_played, blackUser.games_played, true);
      redEloAfter = r.newWinnerElo; blackEloAfter = r.newLoserElo;
      await dbRun('UPDATE users SET elo=?, draws=draws+1, games_played=games_played+1 WHERE id=?', [redEloAfter,   redUser.id]);
      await dbRun('UPDATE users SET elo=?, draws=draws+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      await updateStreak(redUser.id,   false);
      await updateStreak(blackUser.id, false);
    } else {
      await dbRun('UPDATE users SET games_played=games_played+1 WHERE id=?', [redUser.id]);
      await dbRun('UPDATE users SET games_played=games_played+1 WHERE id=?', [blackUser.id]);
    }

    let movesJson = null;
    try {
      const payload = { moves: game.moves, boardHistory: game.boardHistory };
      movesJson = JSON.stringify(payload);
      if (movesJson.length > 2000000) movesJson = JSON.stringify({ moves: game.moves, boardHistory: [] });
    } catch (e) { console.error('Serialization error:', e); }

    const winnerId = result === 'red_win' ? game.redPlayer.id : result === 'black_win' ? game.blackPlayer.id : null;
    await dbRun(
      `UPDATE games SET winner_id=?, result=?, red_elo_after=?, black_elo_after=?,
       moves_count=?, moves_json=?, completed_at=NOW() WHERE id=?`,
      [winnerId, result, redEloAfter, blackEloAfter, game.moves.length, movesJson, game.id]
    );

    console.log(`ELO: red ${redEloBefore}→${redEloAfter} | black ${blackEloBefore}→${blackEloAfter}`);
  } catch (err) { console.error('finishGame error:', err); }

  const resultData = {
    result,
    redEloChange:   redEloAfter   - redEloBefore,
    blackEloChange: blackEloAfter - blackEloBefore,
    redEloAfter, blackEloAfter,
  };

  emitToGame(io, game, 'game_over', (uid) => ({ ...game.toJSON(uid), resultData }));
  setTimeout(() => activeGames.delete(game.id), 300000);
}

function emitToGame(io, game, event, dataFn) {
  const rs = userSockets.get(game.redPlayer.id);
  const bs = userSockets.get(game.blackPlayer.id);
  if (rs) rs.emit(event, dataFn(game.redPlayer.id));
  if (bs) bs.emit(event, dataFn(game.blackPlayer.id));
}

function emitToGameBroadcast(io, game, event, data) {
  const rs = userSockets.get(game.redPlayer.id);
  const bs = userSockets.get(game.blackPlayer.id);
  if (rs) rs.emit(event, data);
  if (bs) bs.emit(event, data);
}

module.exports = { setupSocket };