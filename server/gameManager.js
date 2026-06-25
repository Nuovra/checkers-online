const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { prepare, saveNow, dbGet, dbAll, dbRun } = require('./database');
const engine = require('./gameEngine');
const { calculateNewRatings } = require('./elo');
const { JWT_SECRET } = require('./auth');

const activeGames = new Map();
const matchQueue  = [];
const userSockets = new Map();
const socketUsers = new Map();

const TIME_CONTROLS = {
  bullet1: { name: 'Bullet', time: 60000  },
  blitz3:  { name: 'Blitz',  time: 180000 },
  blitz5:  { name: 'Blitz',  time: 300000 },
};

class GameState {
  constructor(gameId, redPlayer, blackPlayer, timeControl, timeControlId) {
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

function updateStreak(userId, won) {
  try {
    const user = dbGet('SELECT current_streak, best_streak FROM users WHERE id = ?', [userId]);
    if (!user) return;
    let currentStreak = user.current_streak || 0;
    let bestStreak    = user.best_streak    || 0;
    if (won) {
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
    dbRun('UPDATE users SET current_streak=?, best_streak=? WHERE id=?', [currentStreak, bestStreak, userId]);
  } catch (err) {
    console.error('Streak update error:', err);
  }
}

function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = dbGet('SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country FROM users WHERE id = ?', [decoded.id]);
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
    io.emit('online_count', userSockets.size);

    socket.on('join_queue', ({ timeControlId } = {}) => {
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
      tryMatch(io);
    });

    socket.on('leave_queue', () => {
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) { matchQueue.splice(idx, 1); socket.emit('queue_left'); }
    });

    socket.on('make_move', ({ gameId, from, to }) => {
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

      if (result) finishGame(io, game, result);
      else if (game.movesSinceCapture >= 80) finishGame(io, game, 'draw');
      else emitToGame(io, game, 'game_update', (uid) => game.toJSON(uid));
    });

    socket.on('resign', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return;
      const col = game.redPlayer.id === userId ? 'red' : game.blackPlayer.id === userId ? 'black' : null;
      if (!col) return;
      finishGame(io, game, col === 'red' ? 'black_win' : 'red_win');
    });

    socket.on('offer_draw', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return;
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('draw_offered', { gameId, from: socket.userInfo.username });
    });

    socket.on('accept_draw', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game || game.status !== 'active') return;
      if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) return;
      finishGame(io, game, 'draw');
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
      const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
      const opp = userSockets.get(oppId);
      if (opp) opp.emit('rematch_offered', { gameId, from: socket.userInfo.username });
    });

    socket.on('accept_rematch', ({ gameId }) => {
      const game = activeGames.get(gameId);
      if (!game) return;
      const tcId = game.timeControlId || 'blitz5';
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
      emitToGameBroadcast(io, game, 'game_chat_msg', {
        from: socket.userInfo.username, message: message.slice(0, 200), timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      console.log(`Disconnected: ${socket.userInfo.username}`);
      const idx = matchQueue.findIndex(q => q.userId === userId);
      if (idx !== -1) matchQueue.splice(idx, 1);
      for (const [, game] of activeGames) {
        if (game.status !== 'active') continue;
        if (game.redPlayer.id !== userId && game.blackPlayer.id !== userId) continue;
        const oppId = game.redPlayer.id === userId ? game.blackPlayer.id : game.redPlayer.id;
        const opp = userSockets.get(oppId);
        if (opp) opp.emit('opponent_disconnected', { gameId: game.id });
        game._disconnectTimer = setTimeout(() => {
          if (game.status !== 'active') return;
          finishGame(io, game, 'abandoned');
        }, 60000);
      }
      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      io.emit('online_count', userSockets.size);
    });
  });
}

function tryMatch(io) {
  if (matchQueue.length < 2) return;
  for (let i = 0; i < matchQueue.length; i++) {
    for (let j = i + 1; j < matchQueue.length; j++) {
      if (matchQueue[i].timeControlId === matchQueue[j].timeControlId) {
        const p1 = matchQueue.splice(j, 1)[0];
        const p2 = matchQueue.splice(i, 1)[0];
        createGame(io, p1, p2);
        return;
      }
    }
  }
}

function createGame(io, p1, p2) {
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
    tc, tcId
  );
  activeGames.set(gameId, game);

  dbRun('INSERT INTO games (id, player_red_id, player_black_id, red_elo_before, black_elo_before) VALUES (?, ?, ?, ?, ?)',
    [gameId, redInfo.id, blackInfo.id, redInfo.elo, blackInfo.elo]);
  saveNow();

  game.timerInterval = setInterval(() => {
    if (game.status !== 'active') { clearInterval(game.timerInterval); return; }
    const times = game.getCurrentTimes();
    if      (times.redTime   <= 0) { clearInterval(game.timerInterval); finishGame(io, game, 'black_win'); }
    else if (times.blackTime <= 0) { clearInterval(game.timerInterval); finishGame(io, game, 'red_win');   }
    else emitToGame(io, game, 'timer_update', () => ({ redTime: times.redTime, blackTime: times.blackTime }));
  }, 1000);

  const rs = userSockets.get(redInfo.id);
  const bs = userSockets.get(blackInfo.id);
  if (rs) rs.emit('game_started', game.toJSON(redInfo.id));
  if (bs) bs.emit('game_started', game.toJSON(blackInfo.id));
  console.log(`Game: ${redInfo.username} vs ${blackInfo.username} [${tc.name}]`);
}

function finishGame(io, game, result) {
  if (game.status === 'finished') return;
  game.status = 'finished';
  game.result = result;

  if (game.timerInterval)    { clearInterval(game.timerInterval);   game.timerInterval    = null; }
  if (game._disconnectTimer) { clearTimeout(game._disconnectTimer); game._disconnectTimer = null; }

  console.log(`Finishing game ${game.id} — result: ${result}`);

  let redUser, blackUser;
  try {
    redUser   = dbGet('SELECT * FROM users WHERE id = ?', [game.redPlayer.id]);
    blackUser = dbGet('SELECT * FROM users WHERE id = ?', [game.blackPlayer.id]);
  } catch (err) { console.error('Could not read users:', err); }

  const redEloBefore   = redUser?.elo   ?? game.redPlayer.elo;
  const blackEloBefore = blackUser?.elo ?? game.blackPlayer.elo;
  let redEloAfter   = redEloBefore;
  let blackEloAfter = blackEloBefore;

  try {
    if (result === 'red_win') {
      const r = calculateNewRatings(redEloBefore, blackEloBefore, redUser.games_played, blackUser.games_played, false);
      redEloAfter = r.newWinnerElo; blackEloAfter = r.newLoserElo;
      dbRun('UPDATE users SET elo=?, wins=wins+1, games_played=games_played+1 WHERE id=?',     [redEloAfter,   redUser.id]);
      dbRun('UPDATE users SET elo=?, losses=losses+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      updateStreak(redUser.id,   true);
      updateStreak(blackUser.id, false);

    } else if (result === 'black_win') {
      const r = calculateNewRatings(blackEloBefore, redEloBefore, blackUser.games_played, redUser.games_played, false);
      blackEloAfter = r.newWinnerElo; redEloAfter = r.newLoserElo;
      dbRun('UPDATE users SET elo=?, wins=wins+1, games_played=games_played+1 WHERE id=?',     [blackEloAfter, blackUser.id]);
      dbRun('UPDATE users SET elo=?, losses=losses+1, games_played=games_played+1 WHERE id=?', [redEloAfter,   redUser.id]);
      updateStreak(blackUser.id, true);
      updateStreak(redUser.id,   false);

    } else if (result === 'draw') {
      const r = calculateNewRatings(redEloBefore, blackEloBefore, redUser.games_played, blackUser.games_played, true);
      redEloAfter = r.newWinnerElo; blackEloAfter = r.newLoserElo;
      dbRun('UPDATE users SET elo=?, draws=draws+1, games_played=games_played+1 WHERE id=?', [redEloAfter,   redUser.id]);
      dbRun('UPDATE users SET elo=?, draws=draws+1, games_played=games_played+1 WHERE id=?', [blackEloAfter, blackUser.id]);
      // Draws reset streak
      updateStreak(redUser.id,   false);
      updateStreak(blackUser.id, false);

    } else {
      dbRun('UPDATE users SET games_played=games_played+1 WHERE id=?', [redUser.id]);
      dbRun('UPDATE users SET games_played=games_played+1 WHERE id=?', [blackUser.id]);
    }
    console.log(`ELO: red ${redEloBefore}→${redEloAfter} | black ${blackEloBefore}→${blackEloAfter}`);
  } catch (err) { console.error('ELO update error:', err); }

  let movesJson = null;
  try {
    const payload = { moves: game.moves, boardHistory: game.boardHistory };
    movesJson = JSON.stringify(payload);
    if (movesJson.length > 2000000) {
      console.warn('moves_json too large, dropping boardHistory');
      movesJson = JSON.stringify({ moves: game.moves, boardHistory: [] });
    }
  } catch (err) { console.error('Serialization error:', err); movesJson = null; }

  try {
    const winnerId = result === 'red_win' ? game.redPlayer.id : result === 'black_win' ? game.blackPlayer.id : null;
    dbRun(
      `UPDATE games SET winner_id=?, result=?, red_elo_after=?, black_elo_after=?,
       moves_count=?, moves_json=?, completed_at=datetime('now') WHERE id=?`,
      [winnerId, result, redEloAfter, blackEloAfter, game.moves.length, movesJson, game.id]
    );
    saveNow();
    console.log(`Game saved: ${game.id}`);
  } catch (err) { console.error('Game record update error:', err); }

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