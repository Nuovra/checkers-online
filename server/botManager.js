const { dbRun, dbGet, dbAll } = require('./database');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const BOT_USERNAMES = [
  'C4r0m3n', 'Check3rSavant', 'romero11', 'yandiel', 'weeniebeenie',
  'idontlikecheckers', 'pedro', 'EmilianoM', 'xix6', 'certifiedplayer12',
  'CaptureKing', 'enrique22', 'chatarra', 'akuma', 'DonaldTrumpeta',
  'Dd223544', 'Maria', 'Skipjack', 'celsiislover', 'CheckerChamp',
  'Nightcrawler', 'IronPiece', 'GoldCrown', 'SilverSquare', 'BoardBoss',
  'QuickCapture', 'TripleJump', 'EndgameKing', 'OpeningPro', 'MidgameMike',
  'TacticalTom', 'StrategySam', 'BlitzBob', 'BulletBen', 'ClassicCarl',
  'AggressiveAl', 'DefensiveDan', 'CounterKing', 'ForkMaster', 'PinPro',
  'CornerKing', 'EdgeRunner', 'CenterSquare', 'TempoPlayer', 'ForceMove',
  'LongJump', 'BackRankBob', 'PromotionPro', 'ExchangeKing', 'SacrificeKing',
  'FlashPlayer', 'TurboKing', 'NightOwl', 'DawnRaider', 'StormPiece',
  'ThunderBoard', 'LightningJump', 'ChaosKing', 'OrderSquare', 'PrecisionPro',
  'ShadowPiece', 'PhantomKing', 'GhostBoard', 'SpecterJump', 'WarlordRed',
  'CommanderBlack', 'GeneralKing', 'CaptainSquare', 'LieutenantJump', 'SergeantPiece',
  'VanguardKing', 'SentinelBoard', 'GuardianPro', 'WardenSquare', 'RangerRed',
  'HunterBlack', 'TrackerKing', 'ScoutBoard', 'PathfinderPro', 'WayfareJump',
  'CrusaderKing', 'PaladinBoard', 'KnightSquare', 'SquireJump', 'HeroPiece',
  'LegendKing', 'MythBoard', 'EpicSquare', 'FableJump', 'TaleKing',
  'StarBoard', 'CosmicPiece', 'GalaxyKing', 'NebulaPro', 'OrbitSquare',
  'ApexKing', 'ZenithBoard', 'PeakSquare', 'SummitJump', 'CrestKing',
  'RiftBoard', 'VoidKing', 'AbyssSquare', 'DepthJump', 'CorePiece',
  'ArcaneKing', 'MysticBoard', 'RuneSquare', 'SpellJump', 'CharmKing',
];

const BOT_PASSWORD = 'botaccount_secure_2026';
let botsSeeded = false;

const BOT_COUNTRIES = [
  'US', 'US', 'US', 'GB', 'CA', 'BR', 'MX', 'DE', 'FR', 'AU',
  'IN', 'NG', 'CO', 'AR', 'PH', 'JM', 'TT', 'DO', 'PR', 'CU',
  null, null, null, null,
];

// ELO to win rate mapping — mathematically consistent
// ELO 800  → ~30% win rate
// ELO 1000 → ~38% win rate
// ELO 1200 → ~46% win rate  (baseline)
// ELO 1400 → ~54% win rate
// ELO 1600 → ~62% win rate
// ELO 1800 → ~70% win rate
// ELO 2000+ → ~76% win rate
function getWinRateForElo(elo) {
  if (elo < 900)  return 0.28 + Math.random() * 0.06; // 28-34%
  if (elo < 1050) return 0.33 + Math.random() * 0.07; // 33-40%
  if (elo < 1200) return 0.38 + Math.random() * 0.08; // 38-46%
  if (elo < 1350) return 0.44 + Math.random() * 0.08; // 44-52%
  if (elo < 1500) return 0.50 + Math.random() * 0.08; // 50-58%
  if (elo < 1650) return 0.56 + Math.random() * 0.08; // 56-64%
  if (elo < 1800) return 0.62 + Math.random() * 0.08; // 62-70%
  if (elo < 1950) return 0.67 + Math.random() * 0.08; // 67-75%
  return 0.72 + Math.random() * 0.06;                  // 72-78%
}

// Games played should also be relative to ELO
// Higher ELO players have played more to get there
function getGamesPlayedForElo(elo) {
  if (elo < 900)  return Math.floor(Math.random() * 40)  + 10;  // 10-50 games (new/bad)
  if (elo < 1050) return Math.floor(Math.random() * 60)  + 20;  // 20-80
  if (elo < 1200) return Math.floor(Math.random() * 100) + 40;  // 40-140
  if (elo < 1350) return Math.floor(Math.random() * 150) + 60;  // 60-210
  if (elo < 1500) return Math.floor(Math.random() * 200) + 80;  // 80-280
  if (elo < 1650) return Math.floor(Math.random() * 250) + 100; // 100-350
  if (elo < 1800) return Math.floor(Math.random() * 300) + 150; // 150-450
  if (elo < 1950) return Math.floor(Math.random() * 350) + 200; // 200-550
  return Math.floor(Math.random() * 400) + 250;                  // 250-650
}

// Streak should be relative to ELO and win rate
function getStreakForElo(elo) {
  if (elo < 1000) return Math.floor(Math.random() * 2);   // 0-1
  if (elo < 1300) return Math.floor(Math.random() * 3);   // 0-2
  if (elo < 1600) return Math.floor(Math.random() * 5);   // 0-4
  if (elo < 1800) return Math.floor(Math.random() * 7);   // 0-6
  return Math.floor(Math.random() * 12);                   // 0-11
}

async function seedBotAccounts() {
  if (botsSeeded) return;
  botsSeeded = true;
  console.log('Seeding bot accounts...');
  const password_hash = await bcrypt.hash(BOT_PASSWORD, 10);

  for (let i = 0; i < BOT_USERNAMES.length; i++) {
    const username = BOT_USERNAMES[i];
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) continue;

    // Generate ELO first
    let elo;
    const rand = Math.random();
    if      (rand < 0.12) elo = 800  + Math.floor(Math.random() * 150);
    else if (rand < 0.30) elo = 950  + Math.floor(Math.random() * 150);
    else if (rand < 0.55) elo = 1100 + Math.floor(Math.random() * 200);
    else if (rand < 0.75) elo = 1300 + Math.floor(Math.random() * 200);
    else if (rand < 0.88) elo = 1500 + Math.floor(Math.random() * 200);
    else if (rand < 0.95) elo = 1700 + Math.floor(Math.random() * 200);
    else                  elo = 1900 + Math.floor(Math.random() * 300);

    // Derive stats from ELO — mathematically consistent
    const games_played = getGamesPlayedForElo(elo);
    const winRate      = getWinRateForElo(elo);
    const drawRate     = 0.04 + Math.random() * 0.06; // 4-10% draws for everyone
    const wins         = Math.round(games_played * winRate);
    const draws        = Math.round(games_played * drawRate);
    const losses       = games_played - wins - draws;
    const current_streak = getStreakForElo(elo);
    const best_streak    = current_streak + Math.floor(Math.random() * (elo > 1500 ? 15 : 8));
    const country        = BOT_COUNTRIES[Math.floor(Math.random() * BOT_COUNTRIES.length)];
    const id             = uuidv4();
    const cleanEmail     = username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@checkers.bot';

    await dbRun(
      `INSERT INTO users (id, username, email, password_hash, elo, wins, losses, draws, games_played, country, current_streak, best_streak)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, cleanEmail, password_hash,
       elo, wins, Math.max(0, losses), draws, games_played,
       country, current_streak, best_streak]
    );
  }

  console.log(`Bot accounts seeded — ${BOT_USERNAMES.length} bots ready`);
}

async function findMatchingBot(playerElo) {
  const bots = await dbAll(
    'SELECT id, username, elo FROM users WHERE email LIKE ?',
    ['%@checkers.bot']
  );
  if (!bots.length) return null;
  bots.sort((a, b) => {
    const da = Math.abs(a.elo - playerElo) + Math.random() * 80;
    const db = Math.abs(b.elo - playerElo) + Math.random() * 80;
    return da - db;
  });
  return bots[0];
}

function getBotDifficulty(playerElo, botElo) {
  const avg = (playerElo + botElo) / 2;
  if (avg < 1050) return 'easy';
  if (avg < 1400) return 'medium';
  return 'hard';
}

function isBot(email) {
  return email && email.endsWith('@checkers.bot');
}

let fakeOnlineBase  = 2800 + Math.floor(Math.random() * 400);
let lastFluctuation = Date.now();

function getFakeOnlineCount(realCount) {
  const now = Date.now();
  if (now - lastFluctuation > 30000) {
    fakeOnlineBase += Math.floor(Math.random() * 100) - 50;
    fakeOnlineBase = Math.max(2600, Math.min(3800, fakeOnlineBase));
    lastFluctuation = now;
  }
  return fakeOnlineBase + realCount;
}

module.exports = { seedBotAccounts, findMatchingBot, getBotDifficulty, isBot, getFakeOnlineCount };