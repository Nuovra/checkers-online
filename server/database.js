const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'checkers.db');
let db = null;
let saveTimer = null;

function saveToDisk() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!db) return;
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('DB save error:', err);
    }
  }, 300);
}

function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    console.log('DB saved to disk');
  } catch (err) {
    console.error('DB immediate save error:', err);
  }
}

function dbRun(sql, params = []) {
  try {
    db.run(sql, params);
  } catch (err) {
    console.error('DB run error:', sql, err);
    throw err;
  }
}

function dbGet(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  } catch (err) {
    console.error('DB get error:', sql, err);
    return undefined;
  }
}

function dbAll(sql, params = []) {
  try {
    const results = [];
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  } catch (err) {
    console.error('DB all error:', sql, err);
    return [];
  }
}

function prepare(sql) {
  return {
    run(...params)    { dbRun(sql, params); saveToDisk(); return this; },
    runNow(...params) { dbRun(sql, params); saveNow();   return this; },
    get(...params)    { return dbGet(sql, params); },
    all(...params)    { return dbAll(sql, params); },
  };
}

function columnExists(table, column) {
  try {
    const stmt = db.prepare(`PRAGMA table_info(${table})`);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      if (row.name === column) { stmt.free(); return true; }
    }
    stmt.free();
    return false;
  } catch { return false; }
}

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  dbRun(`CREATE TABLE IF NOT EXISTS users (
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  dbRun(`CREATE TABLE IF NOT EXISTS games (
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
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  )`);

  // Migrations for existing databases
  const migrations = [
    { table: 'games',  column: 'moves_json',      def: 'TEXT' },
    { table: 'users',  column: 'current_streak',  def: 'INTEGER DEFAULT 0' },
    { table: 'users',  column: 'best_streak',     def: 'INTEGER DEFAULT 0' },
    { table: 'users',  column: 'country',         def: 'TEXT DEFAULT NULL' },
  ];

  for (const m of migrations) {
    if (!columnExists(m.table, m.column)) {
      console.log(`Adding column ${m.column} to ${m.table}...`);
      dbRun(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.def}`);
    }
  }

  saveNow();
  console.log('Database initialized');
}

process.on('exit', () => saveNow());
process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  saveNow();
  process.exit(1);
});

module.exports = { initDatabase, prepare, saveNow, dbRun, dbGet, dbAll };