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

async function seedBotAccounts() {
  if (botsSeeded) return;
  botsSeeded = true;
  console.log('Seeding bot accounts...');
  const password_hash = await bcrypt.hash(BOT_PASSWORD, 10);

  for (let i = 0; i < BOT_USERNAMES.length; i++) {
    const username = BOT_USERNAMES[i];
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) continue;

    let elo;
    const rand = Math.random();
    if      (rand < 0.15) elo = 800  + Math.floor(Math.random() * 200);
    else if (rand < 0.50) elo = 1000 + Math.floor(Math.random() * 300);
    else if (rand < 0.80) elo = 1300 + Math.floor(Math.random() * 300);
    else if (rand < 0.93) elo = 1600 + Math.floor(Math.random() * 200);
    else                  elo = 1800 + Math.floor(Math.random() * 400);

    const games_played = Math.floor(Math.random() * 400) + 50;
    const wins         = Math.floor(games_played * (0.3 + Math.random() * 0.4));
    const losses       = Math.floor((games_played - wins) * 0.85);
    const draws        = games_played - wins - losses;
    const country      = BOT_COUNTRIES[Math.floor(Math.random() * BOT_COUNTRIES.length)];
    const streak       = Math.floor(Math.random() * 8);
    const best_streak  = streak + Math.floor(Math.random() * 10);
    const id           = uuidv4();

    // Clean email — remove special chars from username for valid email
    const cleanEmail = username.toLowerCase().replace(/[^a-z0-9]/g, '') + '@checkers.bot';

    await dbRun(
      `INSERT INTO users (id, username, email, password_hash, elo, wins, losses, draws, games_played, country, current_streak, best_streak)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, username, cleanEmail, password_hash,
       elo, wins, losses, draws, games_played, country, streak, best_streak]
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