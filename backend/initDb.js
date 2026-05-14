const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { TEAMS, generateGroupFixture, KNOCKOUT_MATCHES } = require('./data/worldCupData');

const DB_DIR = path.join(__dirname, 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'polla.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    paid_entry INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS teams (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    flag TEXT NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    phase TEXT NOT NULL,
    group_name TEXT,
    home_team TEXT,
    away_team TEXT,
    match_date TEXT NOT NULL,
    match_time TEXT,
    home_score INTEGER,
    away_score INTEGER,
    pen_home INTEGER,
    pen_away INTEGER,
    winner TEXT,
    label TEXT,
    FOREIGN KEY (home_team) REFERENCES teams(code),
    FOREIGN KEY (away_team) REFERENCES teams(code)
  );

  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    pred_home INTEGER,
    pred_away INTEGER,
    pred_winner TEXT,
    pred_pen_home INTEGER,
    pred_pen_away INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, match_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches(id)
  );

  CREATE TABLE IF NOT EXISTS podium_predictions (
    user_id INTEGER PRIMARY KEY,
    first_place TEXT,
    second_place TEXT,
    third_place TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS podium_real (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    first_place TEXT,
    second_place TEXT,
    third_place TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    pred_home INTEGER NOT NULL,
    pred_away INTEGER NOT NULL,
    bet_amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, match_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  -- ── POLLAS SEPARADAS ────────────────────────────────────────────────────────

  -- Registro de participantes en cada polla (grupos y eliminatorias)
  CREATE TABLE IF NOT EXISTS polla_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    polla TEXT NOT NULL,           -- 'groups' | 'knockout'
    paid INTEGER DEFAULT 0,        -- 1 = pago confirmado por admin
    registered_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, polla),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ── MINI-POLLAS ─────────────────────────────────────────────────────────────

  -- Registro de usuarios en cada mini-polla (quién pagó para participar)
  CREATE TABLE IF NOT EXISTS mini_polla_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phase TEXT NOT NULL,          -- 'r16' | 'qf' | 'sf'
    paid INTEGER DEFAULT 0,       -- 1 = pagó la inscripción
    registered_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, phase),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Pronósticos independientes para cada mini-polla
  CREATE TABLE IF NOT EXISTS mini_polla_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phase TEXT NOT NULL,          -- fase a la que pertenece este pronóstico
    match_id TEXT NOT NULL,
    pred_home INTEGER,
    pred_away INTEGER,
    pred_winner TEXT,
    pred_pen_home INTEGER,
    pred_pen_away INTEGER,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, phase, match_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (match_id) REFERENCES matches(id)
  );

  CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
  CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
  CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
  CREATE INDEX IF NOT EXISTS idx_daily_bets_match ON daily_bets(match_id);
  CREATE INDEX IF NOT EXISTS idx_mini_polla_reg ON mini_polla_registrations(user_id, phase);
  CREATE INDEX IF NOT EXISTS idx_mini_polla_pred ON mini_polla_predictions(user_id, phase);
`);

const insertTeam = db.prepare('INSERT OR IGNORE INTO teams (code, name, flag, color) VALUES (?, ?, ?, ?)');
const teamCount = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;

if (teamCount === 0) {
  console.log('Cargando equipos...');
  const insertTeams = db.transaction((teams) => {
    for (const t of teams) insertTeam.run(t.code, t.name, t.flag, t.color);
  });
  insertTeams(TEAMS);
  console.log(`${TEAMS.length} equipos cargados.`);
}

const matchCount = db.prepare('SELECT COUNT(*) as c FROM matches').get().c;
if (matchCount === 0) {
  console.log('Generando partidos...');
  const groupMatches = generateGroupFixture();

  const insertMatch = db.prepare(`
    INSERT OR IGNORE INTO matches (id, phase, group_name, home_team, away_team, match_date, match_time, label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    for (const m of groupMatches) {
      insertMatch.run(
        m.id, m.phase, m.group_name,
        m.home_team, m.away_team,
        m.match_date, m.match_time || null,
        m.label || null
      );
    }
    for (const k of KNOCKOUT_MATCHES) {
      insertMatch.run(
        k.id, k.phase, null,
        null, null,
        k.date, k.time || null,
        k.label
      );
    }
  });

  insertAll();
  console.log(`${groupMatches.length} partidos de grupos + ${KNOCKOUT_MATCHES.length} eliminatorias creados.`);
}

// ── POLLA 1: Fase de grupos ──────────────────────────────────────────────────
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla1_fee', '20');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla1_maintenance', '1');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla1_split_1st', '70');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla1_split_2nd', '25');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla1_split_3rd', '5');

// ── POLLA 2: Eliminatorias ───────────────────────────────────────────────────
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla2_fee', '20');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla2_maintenance', '1');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla2_split_1st', '70');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla2_split_2nd', '25');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('polla2_split_3rd', '5');

// ── Apuestas diarias ─────────────────────────────────────────────────────────
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('daily_bet_amount', '2');

// ── Mini-pollas ───────────────────────────────────────────────────────────────
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('mini_polla_fee_r16', '5');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('mini_polla_fee_qf', '3');
db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('mini_polla_fee_sf', '2');

console.log('Base de datos inicializada correctamente.');

const bcrypt = require('bcryptjs');
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (username, display_name, password_hash, is_admin, paid_entry)
    VALUES (?, ?, ?, 1, 1)
  `).run('admin', 'Administrador', hash);
  console.log('Usuario admin creado (usuario: admin, contrasena: admin123).');
}

db.close();
