const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prepare, dbGet, dbAll, dbRun, saveNow } = require('./database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'checkers-secret-change-in-production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminMiddleware(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 chars' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    const existing = await dbGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(400).json({ error: 'Username or email already taken' });
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);
    await dbRun('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)', [id, username, email, password_hash]);
    const token = jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
    const user = await dbGet('SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country, created_at FROM users WHERE id = ?', [id]);
    res.json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid username or password' });
    await dbRun('UPDATE users SET last_seen = NOW() WHERE id = ?', [user.id]);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await dbGet(
      'SELECT id, username, email, elo, wins, losses, draws, games_played, current_streak, best_streak, country, created_at, last_seen FROM users WHERE id = ?',
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/set-country', authMiddleware, async (req, res) => {
  try {
    const { country } = req.body;
    if (country && country.length !== 2) return res.status(400).json({ error: 'Invalid country code' });
    const val = country ? country.toUpperCase() : null;
    await dbRun('UPDATE users SET country = ? WHERE id = ?', [val, req.userId]);
    res.json({ success: true, country: val });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/profile/:username', async (req, res) => {
  try {
    const user = await dbGet(
      'SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country, created_at FROM users WHERE username = ?',
      [req.params.username]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rawGames = await dbAll(
      `SELECT id, player_red_id, player_black_id, winner_id, result,
        red_elo_before, black_elo_before, red_elo_after, black_elo_after,
        moves_count, completed_at
       FROM games
       WHERE (player_red_id = ? OR player_black_id = ?)
         AND result IS NOT NULL AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 20`,
      [user.id, user.id]
    );

    const games = await Promise.all(rawGames.map(async g => {
      const ru = await dbGet('SELECT username, country FROM users WHERE id = ?', [g.player_red_id]);
      const bu = await dbGet('SELECT username, country FROM users WHERE id = ?', [g.player_black_id]);
      return { ...g, red_username: ru?.username || 'Unknown', black_username: bu?.username || 'Unknown', red_country: ru?.country || null, black_country: bu?.country || null };
    }));

    res.json({ user, games });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/game/:gameId', authMiddleware, async (req, res) => {
  try {
    const game = await dbGet(
      `SELECT id, player_red_id, player_black_id, winner_id, result,
        red_elo_before, black_elo_before, red_elo_after, black_elo_after,
        moves_count, moves_json, completed_at FROM games WHERE id = ?`,
      [req.params.gameId]
    );
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const ru = await dbGet('SELECT username, country FROM users WHERE id = ?', [game.player_red_id]);
    const bu = await dbGet('SELECT username, country FROM users WHERE id = ?', [game.player_black_id]);
    game.red_username = ru?.username || 'Unknown';
    game.black_username = bu?.username || 'Unknown';
    game.red_country = ru?.country || null;
    game.black_country = bu?.country || null;
    let movesData = null;
    if (game.moves_json) { try { movesData = JSON.parse(game.moves_json); } catch {} }
    const { moves_json, ...gameClean } = game;
    res.json({ game: gameClean, movesData });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/leaderboard', async (req, res) => {
  try {
    const players = await dbAll(
      'SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country FROM users WHERE games_played > 0 ORDER BY elo DESC LIMIT 50'
    );
    res.json({ players });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const totalUsers  = await dbGet('SELECT COUNT(*) as count FROM users');
    const totalGames  = await dbGet("SELECT COUNT(*) as count FROM games WHERE result IS NOT NULL");
    const todayUsers  = await dbGet("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = CURRENT_DATE");
    const todayGames  = await dbGet("SELECT COUNT(*) as count FROM games WHERE DATE(completed_at) = CURRENT_DATE AND result IS NOT NULL");
    const activeUsers = await dbGet("SELECT COUNT(*) as count FROM users WHERE last_seen > NOW() - INTERVAL '1 hour'");
    const topPlayer   = await dbGet('SELECT username, elo, wins, country FROM users ORDER BY elo DESC LIMIT 1');
    const avgElo      = await dbGet('SELECT AVG(elo) as avg FROM users');
    const totalWins   = await dbGet("SELECT COUNT(*) as count FROM games WHERE result IN ('red_win','black_win')");
    const totalDraws  = await dbGet("SELECT COUNT(*) as count FROM games WHERE result = 'draw'");

    const recentGames = await dbAll(
      `SELECT g.id, g.result, g.moves_count, g.completed_at,
        u1.username as red_username, u2.username as black_username,
        g.red_elo_before, g.black_elo_before, g.red_elo_after, g.black_elo_after
       FROM games g
       JOIN users u1 ON g.player_red_id = u1.id
       JOIN users u2 ON g.player_black_id = u2.id
       WHERE g.result IS NOT NULL
       ORDER BY g.completed_at DESC LIMIT 10`, []
    );

    const recentUsers = await dbAll(
      'SELECT username, elo, wins, losses, draws, games_played, country, created_at FROM users ORDER BY created_at DESC LIMIT 10', []
    );

    const gamesByDay = await dbAll(
      `SELECT DATE(completed_at) as day, COUNT(*) as count
       FROM games WHERE result IS NOT NULL AND completed_at > NOW() - INTERVAL '7 days'
       GROUP BY DATE(completed_at) ORDER BY day ASC`, []
    );

    const usersByDay = await dbAll(
      `SELECT DATE(created_at) as day, COUNT(*) as count
       FROM users WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY DATE(created_at) ORDER BY day ASC`, []
    );

    res.json({
      stats: {
        totalUsers:  totalUsers?.count  || 0,
        totalGames:  totalGames?.count  || 0,
        todayUsers:  todayUsers?.count  || 0,
        todayGames:  todayGames?.count  || 0,
        activeUsers: activeUsers?.count || 0,
        avgElo:      Math.round(avgElo?.avg || 1200),
        totalWins:   totalWins?.count   || 0,
        totalDraws:  totalDraws?.count  || 0,
        topPlayer,
      },
      recentGames, recentUsers, gamesByDay, usersByDay,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/debug/games/:username', async (req, res) => {
  try {
    const user = await dbGet('SELECT id, username FROM users WHERE username = ?', [req.params.username]);
    if (!user) return res.json({ error: 'User not found' });
    const allGames = await dbAll(
      'SELECT id, result, completed_at, moves_count FROM games WHERE player_red_id = ? OR player_black_id = ? ORDER BY completed_at DESC',
      [user.id, user.id]
    );
    res.json({ user, totalGames: allGames.length, games: allGames });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, authMiddleware, JWT_SECRET };