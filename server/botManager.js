const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// ── Bot account pool ──────────────────────────────────────────────────────────
const BOT_USERNAMES = [
  'Kingsford', 'RedRaven', 'CheckMaster', 'DarkSquare', 'CrownChaser',
  'BoardWizard', 'PieceHunter', 'SquareOne', 'JumpKing', 'DiagonalDave',
  'CaptureKing', 'BlackPiece', 'RedRush', 'BoardShark', 'KingMaker',
  'DoubleJump', 'CrownMe', 'SkipJack', 'DiagPro', 'CheckerChamp',
  'Nightcrawler', 'IronPiece', 'GoldCrown', 'SilverSquare', 'BoardBoss',
  'QuickCapture', 'TripleJump', 'EndgameKing', 'OpeningPro', 'MidgameMike',
  'TacticalTom', 'StrategySam', 'BlitzBob', 'BulletBen', 'ClassicCarl',
  'AggressiveAl', 'DefensiveDan', 'CounterKing', 'ForkMaster', 'PinPro',
  'CornerKing', 'EdgeRunner', 'CenterSquare', 'TempoPlayer', 'ForceMove',
  'LongJump', 'BackRankBob', 'PromotionPro', 'ExchangeKing', 'SacrificeKing',
];

const BOT_PASSWORD = 'botaccount_secure_2026';
let botsSeeded = false;

async function seedBotAccounts() {
  if (botsSeeded) return;
  botsSeeded = true;

  console.log('Seeding bot accounts...');
  const password_hash = await bcrypt.hash(BOT_PASSWORD, 10);

  for (let i = 0; i < BOT_USERNAMES.length; i++) {
    const username = BOT_USERNAMES[i];
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) continue;

    // Spread ELO across realistic range
    const elo = 800 + Math.floor((i / BOT_USERNAMES.length) * 1400) + Math.floor(Math.random() * 100);
    const id  = uuidv4();

    await dbRun(
      `INSERT INTO users (id, username, email, password_hash, elo, wins, losses, draws, games_played)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, `${username.toLowerCase()}@checkers.bot`, password_hash,
       elo,
       Math.floor(Math.random() * 80) + 20,
       Math.floor(Math.random() * 40) + 10,
       Math.floor(Math.random() * 10),
       Math.floor(Math.random() * 120) + 30]
    );
  }

  console.log('Bot accounts seeded');
}

// Find the best matching bot for a given ELO
async function findMatchingBot(playerElo) {
  const bots = await dbAll(
    'SELECT id, username, elo FROM users WHERE email LIKE ?',
    ['%@checkers.bot']
  );
  if (!bots.length) return null;

  // Find closest ELO bot
  bots.sort((a, b) => Math.abs(a.elo - playerElo) - Math.abs(b.elo - playerElo));
  return bots[0];
}

// Get bot difficulty based on ELO difference
function getBotDifficulty(playerElo, botElo) {
  const avg = (playerElo + botElo) / 2;
  if (avg < 1100) return 'easy';
  if (avg < 1500) return 'medium';
  return 'hard';
}

// Check if a user is a bot
function isBot(email) {
  return email && email.endsWith('@checkers.bot');
}

// Fake online count — fluctuates realistically
let fakeOnlineBase = 2800 + Math.floor(Math.random() * 400);
let lastFluctuation = Date.now();

function getFakeOnlineCount(realCount) {
  const now = Date.now();
  if (now - lastFluctuation > 30000) {
    fakeOnlineBase += Math.floor(Math.random() * 60) - 30;
    fakeOnlineBase = Math.max(2600, Math.min(3400, fakeOnlineBase));
    lastFluctuation = now;
  }
  return fakeOnlineBase + realCount;
}

module.exports = { seedBotAccounts, findMatchingBot, getBotDifficulty, isBot, getFakeOnlineCount };