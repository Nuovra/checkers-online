const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prepare, dbGet, dbAll, dbRun, saveNow } = require('./database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'checkers-secret-change-in-production';

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

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
    if (username.length < 3 || username.length > 20) return res.status(400).json({ error: 'Username must be 3-20 chars' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' });
    const existing = dbGet('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) return res.status(400).json({ error: 'Username or email already taken' });
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);
    dbRun('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)', [id, username, email, password_hash]);
    saveNow();
    const token = jwt.sign({ id }, JWT_SECRET, { expiresIn: '7d' });
    const user = dbGet('SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country, created_at FROM users WHERE id = ?', [id]);
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
    const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid username or password' });
    dbRun('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = dbGet(
      'SELECT id, username, email, elo, wins, losses, draws, games_played, current_streak, best_streak, country, created_at, last_seen FROM users WHERE id = ?',
      [req.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/set-country', authMiddleware, (req, res) => {
  try {
    const { country } = req.body;
    if (country && country.length !== 2) return res.status(400).json({ error: 'Invalid country code' });
    const val = country ? country.toUpperCase() : null;
    dbRun('UPDATE users SET country = ? WHERE id = ?', [val, req.userId]);
    saveNow();
    res.json({ success: true, country: val });
  } catch (err) {
    console.error('Set country error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/profile/:username', (req, res) => {
  try {
    const user = dbGet(
      'SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country, created_at FROM users WHERE username = ?',
      [req.params.username]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rawGames = dbAll(
      `SELECT id, player_red_id, player_black_id, winner_id, result,
        red_elo_before, black_elo_before, red_elo_after, black_elo_after,
        moves_count, completed_at
       FROM games
       WHERE (player_red_id = ? OR player_black_id = ?)
         AND result IS NOT NULL AND completed_at IS NOT NULL
       ORDER BY completed_at DESC LIMIT 20`,
      [user.id, user.id]
    );

    const games = rawGames.map(g => {
      const ru = dbGet('SELECT username, country FROM users WHERE id = ?', [g.player_red_id]);
      const bu = dbGet('SELECT username, country FROM users WHERE id = ?', [g.player_black_id]);
      return {
        ...g,
        red_username:   ru?.username || 'Unknown',
        black_username: bu?.username || 'Unknown',
        red_country:    ru?.country  || null,
        black_country:  bu?.country  || null,
      };
    });

    res.json({ user, games });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/game/:gameId', authMiddleware, (req, res) => {
  try {
    const game = dbGet(
      `SELECT id, player_red_id, player_black_id, winner_id, result,
        red_elo_before, black_elo_before, red_elo_after, black_elo_after,
        moves_count, moves_json, completed_at FROM games WHERE id = ?`,
      [req.params.gameId]
    );
    if (!game) return res.status(404).json({ error: 'Game not found' });
    const ru = dbGet('SELECT username, country FROM users WHERE id = ?', [game.player_red_id]);
    const bu = dbGet('SELECT username, country FROM users WHERE id = ?', [game.player_black_id]);
    game.red_username   = ru?.username || 'Unknown';
    game.black_username = bu?.username || 'Unknown';
    game.red_country    = ru?.country  || null;
    game.black_country  = bu?.country  || null;
    let movesData = null;
    if (game.moves_json) {
      try { movesData = JSON.parse(game.moves_json); } catch {}
    }
    const { moves_json, ...gameClean } = game;
    res.json({ game: gameClean, movesData });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/leaderboard', (req, res) => {
  try {
    const players = dbAll(
      'SELECT id, username, elo, wins, losses, draws, games_played, current_streak, best_streak, country FROM users WHERE games_played > 0 ORDER BY elo DESC LIMIT 50'
    );
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/debug/games/:username', (req, res) => {
  try {
    const user = dbGet('SELECT id, username FROM users WHERE username = ?', [req.params.username]);
    if (!user) return res.json({ error: 'User not found' });
    const allGames = dbAll(
      'SELECT id, result, completed_at, moves_count FROM games WHERE player_red_id = ? OR player_black_id = ? ORDER BY completed_at DESC',
      [user.id, user.id]
    );
    res.json({ user, totalGames: allGames.length, games: allGames });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, authMiddleware, JWT_SECRET };