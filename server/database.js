const { Pool } = require('pg');

let pool = null;

// Simple sync-like interface using a shared queue
const queue = [];
let running = false;

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const { fn, resolve, reject } = queue.shift();
    try { resolve(await fn()); } catch (err) { reject(err); }
  }
  running = false;
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
}

async function initDatabase() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  await pool.query('SELECT 1');
  console.log('PostgreSQL connected');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      elo INTEGER DEFAULT 1200,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      games_played INTEGER DEFAULT 0,
      current_streak INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      country TEXT DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      player_red_id TEXT NOT NULL,
      player_black_id TEXT NOT NULL,
      winner_id TEXT,
      result TEXT,
      red_elo_before INTEGER,
      black_elo_before INTEGER,
      red_elo_after INTEGER,
      black_elo_after INTEGER,
      moves_count INTEGER DEFAULT 0,
      moves_json TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  console.log('Database initialized');
}

function pgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function dbRun(sql, params = []) {
  return enqueue(() => pool.query(pgSql(sql), params));
}

function dbGet(sql, params = []) {
  return enqueue(async () => {
    const r = await pool.query(pgSql(sql), params);
    return r.rows[0];
  });
}

function dbAll(sql, params = []) {
  return enqueue(async () => {
    const r = await pool.query(pgSql(sql), params);
    return r.rows;
  });
}

function saveNow() {}

function prepare(sql) {
  return {
    run:    (...params) => dbRun(sql, params),
    runNow: (...params) => dbRun(sql, params),
    get:    (...params) => dbGet(sql, params),
    all:    (...params) => dbAll(sql, params),
  };
}

module.exports = { initDatabase, prepare, saveNow, dbRun, dbGet, dbAll };