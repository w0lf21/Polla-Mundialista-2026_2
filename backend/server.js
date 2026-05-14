require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { calcUserTotalPoints, calcDailyBetResults, calcGroupMatchPoints, calcKOMatchPoints } = require('./scoring');
const { calcUserClassified } = require('./classifier');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto-en-produccion';
const DB_PATH = path.join(__dirname, 'db', 'polla.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const app = express();
app.use(cors());
app.use(express.json({ limit: '500kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const LOCK_BEFORE_MS = 5 * 60 * 1000; // 5 minutos antes

function matchStartUTC(matchDate, matchTime) {
  if (!matchDate || !matchTime) return null;
  const [h, m] = matchTime.split(':').map(Number);
  const d = new Date(`${matchDate}T00:00:00Z`);
  d.setUTCHours(h + 5, m, 0, 0); // ECU = UTC-5
  return d;
}

// Polla 1 — se bloquea 5 min antes del primer partido de grupos
function arePolla1Locked() {
  const first = db.prepare(`
    SELECT match_date, match_time FROM matches
    WHERE phase = 'groups' AND match_date IS NOT NULL AND match_time IS NOT NULL
    ORDER BY match_date ASC, match_time ASC LIMIT 1
  `).get();
  if (!first) return false;
  const start = matchStartUTC(first.match_date, first.match_time);
  if (!start) return false;
  return new Date() >= new Date(start.getTime() - LOCK_BEFORE_MS);
}

// Polla 2 — se bloquea 5 min antes del primer partido de dieciseisavos (r16)
function arePolla2Locked() {
  const first = db.prepare(`
    SELECT match_date, match_time FROM matches
    WHERE phase = 'r16' AND match_date IS NOT NULL AND match_time IS NOT NULL
    ORDER BY match_date ASC, match_time ASC LIMIT 1
  `).get();
  if (!first) return false;
  const start = matchStartUTC(first.match_date, first.match_time);
  if (!start) return false;
  return new Date() >= new Date(start.getTime() - LOCK_BEFORE_MS);
}

// Mantener compatibilidad con código existente
function areGroupPredictionsLocked() {
  return arePolla1Locked();
}

function isDailyBetLocked(matchDate, matchTime) {
  const start = matchStartUTC(matchDate, matchTime);
  if (!start) return false;
  return new Date() >= new Date(start.getTime() - LOCK_BEFORE_MS);
}

function formatEcuadorTime(date) {
  return date.toLocaleString('es-EC', {
    timeZone: 'America/Guayaquil',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getLockTimeEcuador(phase) {
  const phaseMap = { groups: 'groups', r16: 'r16' };
  const first = db.prepare(`
    SELECT match_date, match_time FROM matches
    WHERE phase = ? AND match_date IS NOT NULL AND match_time IS NOT NULL
    ORDER BY match_date ASC, match_time ASC LIMIT 1
  `).get(phaseMap[phase] || phase);
  if (!first) return null;
  const start = matchStartUTC(first.match_date, first.match_time);
  if (!start) return null;
  return formatEcuadorTime(new Date(start.getTime() - LOCK_BEFORE_MS));
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalido' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  next();
}

// ─── HELPERS MINI-POLLAS ──────────────────────────────────────────────────────

// Fases de mini-pollas y sus partidos correspondientes
const MINI_POLLA_PHASES = {
  r16: { label: 'Dieciseisavos de final', matchPhase: 'r16' },
  qf:  { label: 'Octavos de final',       matchPhase: 'qf'  },
  sf:  { label: 'Cuartos / Semis',        matchPhase: 'sf'  }
};

// Determina el estado de una mini-polla:
// 'upcoming' = aún no abierta | 'open' = abierta para inscripción y pronósticos
// 'locked' = cerrada | 'finished' = todos los partidos tienen resultado
function getMiniPollaStatus(phase) {
  const phaseMatches = db.prepare(
    'SELECT * FROM matches WHERE phase = ? ORDER BY match_date, match_time'
  ).all(MINI_POLLA_PHASES[phase].matchPhase);

  if (!phaseMatches.length) return 'upcoming';

  const now = new Date();

  // Primer partido de esta fase
  const firstMatch = phaseMatches[0];
  const firstStart = matchStartUTC(firstMatch.match_date, firstMatch.match_time);

  // Último partido de la fase anterior (para saber cuándo abre)
  const prevPhaseMap = { r16: 'groups', qf: 'r16', sf: 'qf' };
  const prevPhase = prevPhaseMap[phase];
  const prevMatches = db.prepare(
    'SELECT * FROM matches WHERE phase = ? ORDER BY match_date DESC, match_time DESC LIMIT 1'
  ).get(prevPhase);

  // Abre cuando el último partido de la fase anterior tiene resultado
  const prevFinished = prevMatches && prevMatches.home_score != null;

  if (!prevFinished) return 'upcoming';

  // Cierra 5 min antes del primer partido
  if (firstStart && now >= new Date(firstStart.getTime() - 5 * 60 * 1000)) {
    // Verificar si todos los partidos tienen resultado
    const allFinished = phaseMatches.every(m => m.home_score != null);
    return allFinished ? 'finished' : 'locked';
  }

  return 'open';
}

function calcMiniPollaPoints(db, userId, phase) {
  const preds = db.prepare(
    'SELECT * FROM mini_polla_predictions WHERE user_id = ? AND phase = ?'
  ).all(userId, phase);

  const matchPhase = MINI_POLLA_PHASES[phase].matchPhase;
  const matches = db.prepare(
    'SELECT * FROM matches WHERE phase = ? AND home_score IS NOT NULL'
  ).all(matchPhase);

  let total = 0;
  let correct = 0;
  let exact = 0;

  for (const m of matches) {
    const pred = preds.find(p => p.match_id === m.id);
    if (!pred || pred.pred_home == null || pred.pred_away == null) continue;

    const ph = parseInt(pred.pred_home);
    const pa = parseInt(pred.pred_away);
    const rh = m.home_score;
    const ra = m.away_score;

    // Marcador exacto
    if (ph === rh && pa === ra) {
      total += 5; exact++; correct++;
      // Si hubo penales, verificar penales también
      if (m.pen_home != null && pred.pred_pen_home != null) {
        if (parseInt(pred.pred_pen_home) === m.pen_home &&
            parseInt(pred.pred_pen_away) === m.pen_away) {
          total += 3; // bonus penales exactos
        }
      }
      continue;
    }

    // Ganador correcto
    const predWinner = ph > pa ? 'home' : pa > ph ? 'away' : 'draw';
    const realWinner = rh > ra ? 'home' : ra > rh ? 'away' : 'draw';

    if (predWinner === realWinner) {
      correct++;
      // Diferencia correcta
      if (Math.abs(ph - pa) === Math.abs(rh - ra)) {
        total += 3;
      } else {
        total += 2;
      }
      // Si hubo penales y acertó ganador de penales
      if (m.winner && pred.pred_winner === m.winner) {
        total += 1;
      }
    }
  }

  return { total, correct, exact };
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  const { username, display_name, password } = req.body || {};
  if (!username || !display_name || !password)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (password.length < 4)
    return res.status(400).json({ error: 'La contrasena debe tener al menos 4 caracteres' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Ese usuario ya existe' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (username, display_name, password_hash, is_admin, paid_entry)
    VALUES (?, ?, ?, 0, 0)
  `).run(username.toLowerCase(), display_name, hash);

  const token = jwt.sign(
    { id: result.lastInsertRowid, username: username.toLowerCase(), is_admin: 0 },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: result.lastInsertRowid, username: username.toLowerCase(), display_name, is_admin: 0, paid_entry: 0 } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });

  const token = jwt.sign(
    { id: user.id, username: user.username, is_admin: user.is_admin },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, is_admin: user.is_admin, paid_entry: user.paid_entry } });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT id, username, display_name, is_admin, paid_entry FROM users WHERE id = ?').get(req.user.id));
});

app.put('/api/me', authMiddleware, (req, res) => {
  const { display_name, password } = req.body || {};
  if (display_name) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, req.user.id);
  if (password && password.length >= 4)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.user.id);
  res.json({ success: true });
});

// ─── EQUIPOS Y PARTIDOS ───────────────────────────────────────────────────────

app.get('/api/teams', (req, res) => {
  res.json(db.prepare('SELECT * FROM teams ORDER BY name').all());
});

app.get('/api/matches', (req, res) => {
  const { phase, date } = req.query;
  let query = `
    SELECT m.*,
           h.name as home_name, h.flag as home_flag, h.color as home_color,
           a.name as away_name, a.flag as away_flag, a.color as away_color
    FROM matches m
    LEFT JOIN teams h ON h.code = m.home_team
    LEFT JOIN teams a ON a.code = m.away_team
  `;
  const where = [], params = [];
  if (phase) { where.push('m.phase = ?'); params.push(phase); }
  if (date)  { where.push('m.match_date = ?'); params.push(date); }
  if (where.length) query += ' WHERE ' + where.join(' AND ');
  query += ' ORDER BY m.match_date, m.match_time, m.id';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/matches/today', (req, res) => {
  const now = new Date();
  const local = new Date(now.getTime() + (-5 * 60 - now.getTimezoneOffset()) * 60000);
  const today = local.toISOString().split('T')[0];
  const matches = db.prepare(`
    SELECT m.*, h.name as home_name, h.flag as home_flag,
           a.name as away_name, a.flag as away_flag
    FROM matches m
    LEFT JOIN teams h ON h.code = m.home_team
    LEFT JOIN teams a ON a.code = m.away_team
    WHERE m.match_date = ?
    ORDER BY m.match_time, m.id
  `).all(today);
  res.json({ date: today, matches });
});

app.get('/api/predictions/lock-status', (req, res) => {
  const polla1Locked = arePolla1Locked();
  const polla2Locked = arePolla2Locked();
  res.json({
    locked: polla1Locked,           // compatibilidad con código existente
    polla1Locked,
    polla2Locked,
    lockTimeEcuador: getLockTimeEcuador('groups'),
    lockTimePolla2Ecuador: getLockTimeEcuador('r16')
  });
});

// ─── PREDICCIONES ─────────────────────────────────────────────────────────────

app.get('/api/predictions', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM predictions WHERE user_id = ?').all(req.user.id));
});

app.post('/api/predictions', authMiddleware, (req, res) => {
  const { match_id, pred_home, pred_away, pred_winner, pred_pen_home, pred_pen_away } = req.body || {};
  if (!match_id) return res.status(400).json({ error: 'Falta match_id' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(404).json({ error: 'Partido no existe' });

  // Verificar bloqueo según fase
  if (match.phase === 'groups' && arePolla1Locked())
    return res.status(403).json({ error: 'Las predicciones de grupos están cerradas (5 min antes del primer partido).' });

  if (match.phase !== 'groups' && arePolla2Locked())
    return res.status(403).json({ error: 'Las predicciones de eliminatorias están cerradas (5 min antes del primer partido de dieciseisavos).' });

  db.prepare(`
    INSERT INTO predictions (user_id, match_id, pred_home, pred_away, pred_winner, pred_pen_home, pred_pen_away, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      pred_home = excluded.pred_home,
      pred_away = excluded.pred_away,
      pred_winner = excluded.pred_winner,
      pred_pen_home = excluded.pred_pen_home,
      pred_pen_away = excluded.pred_pen_away,
      updated_at = datetime('now')
  `).run(req.user.id, match_id,
    pred_home ?? null, pred_away ?? null,
    pred_winner ?? null,
    pred_pen_home ?? null, pred_pen_away ?? null
  );
  res.json({ success: true });
});

app.post('/api/predictions/batch', authMiddleware, (req, res) => {
  if (arePolla1Locked())
    return res.status(403).json({ error: 'Las predicciones de grupos están cerradas.' });

  const { predictions } = req.body || {};
  if (!Array.isArray(predictions)) return res.status(400).json({ error: 'Se esperaba un array' });

  const insert = db.prepare(`
    INSERT INTO predictions (user_id, match_id, pred_home, pred_away, pred_winner, pred_pen_home, pred_pen_away, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      pred_home = excluded.pred_home,
      pred_away = excluded.pred_away,
      pred_winner = excluded.pred_winner,
      pred_pen_home = excluded.pred_pen_home,
      pred_pen_away = excluded.pred_pen_away,
      updated_at = datetime('now')
  `);
  db.transaction(() => {
    for (const p of predictions) {
      if (p.match_id) insert.run(
        req.user.id, p.match_id,
        p.pred_home ?? null, p.pred_away ?? null,
        p.pred_winner ?? null,
        p.pred_pen_home ?? null, p.pred_pen_away ?? null
      );
    }
  })();
  res.json({ success: true, saved: predictions.length });
});

app.get('/api/predictions/classified', authMiddleware, (req, res) => {
  try {
    const data = calcUserClassified(db, req.user.id);
    const teamMap = Object.fromEntries(db.prepare('SELECT * FROM teams').all().map(t => [t.code, t]));
    const enriched = {};
    for (const [group, standings] of Object.entries(data.groups)) {
      enriched[group] = standings.map((s, i) => ({
        ...s,
        team_info: teamMap[s.team] || { code: s.team, name: s.team, flag: '?' },
        position: i + 1,
        classified: i < 2
      }));
    }
    const best8 = data.best8Thirds.map(code => teamMap[code] || { code, name: code, flag: '?' });
    res.json({ groups: enriched, best8Thirds: best8 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/predictions/ko-teams', authMiddleware, (req, res) => {
  try {
    const data = calcUserClassified(db, req.user.id);
    const teamMap = Object.fromEntries(db.prepare('SELECT * FROM teams').all().map(t => [t.code, t]));
    const enriched = {};
    for (const [matchId, teams] of Object.entries(data.matchTeams)) {
      enriched[matchId] = {
        home: teams.home ? (teamMap[teams.home] || { code: teams.home, name: teams.home, flag: '?' }) : null,
        away: teams.away ? (teamMap[teams.away] || { code: teams.away, name: teams.away, flag: '?' }) : null,
      };
    }
    const podiumCandidates = data.podiumCandidates.map(code =>
      teamMap[code] || { code, name: code, flag: '?' }
    );
    res.json({ matchTeams: enriched, podiumCandidates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PODIO ────────────────────────────────────────────────────────────────────

app.get('/api/podium', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM podium_predictions WHERE user_id = ?').get(req.user.id) ||
    { user_id: req.user.id, first_place: null, second_place: null, third_place: null });
});

app.post('/api/podium', authMiddleware, (req, res) => {
  if (areGroupPredictionsLocked())
    return res.status(403).json({ error: 'Las predicciones ya estan cerradas.' });
  const { first_place, second_place, third_place } = req.body || {};
  db.prepare(`
    INSERT INTO podium_predictions (user_id, first_place, second_place, third_place, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      first_place = excluded.first_place,
      second_place = excluded.second_place,
      third_place = excluded.third_place,
      updated_at = datetime('now')
  `).run(req.user.id, first_place || null, second_place || null, third_place || null);
  res.json({ success: true });
});

// ─── RANKING ──────────────────────────────────────────────────────────────────

// Ranking Polla 1 — solo grupos, solo pagados en polla 1
app.get('/api/leaderboard/groups', (req, res) => {
  const settings = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value]));
  const fee = parseFloat(settings['polla1_fee'] || 20);
  const maintenance = parseFloat(settings['polla1_maintenance'] || 1);
  const netFee = fee - maintenance;
  const split1 = parseFloat(settings['polla1_split_1st'] || 70) / 100;
  const split2 = parseFloat(settings['polla1_split_2nd'] || 25) / 100;
  const split3 = parseFloat(settings['polla1_split_3rd'] || 5) / 100;

  const regs = db.prepare(`
    SELECT r.user_id, u.display_name, u.username, r.paid
    FROM polla_registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.polla = 'groups' AND r.paid = 1
  `).all();

  const leaderboard = regs.map(u => {
    // Solo puntos de partidos de grupos
    const matches = db.prepare(`
      SELECT m.*, p.pred_home, p.pred_away
      FROM matches m
      LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
      WHERE m.phase = 'groups' AND m.home_score IS NOT NULL
    `).all(u.user_id);

    let total = 0, correct = 0, exact = 0;
    for (const m of matches) {
      const pts = calcGroupMatchPoints(m, m);
      total += pts;
      if (pts > 0) correct++;
      if (pts === 5) exact++;
    }
    return { ...u, points: total, correctPredictions: correct, exactScores: exact };
  }).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);

  const totalPot = regs.length * netFee;
  res.json({
    leaderboard,
    totalPot,
    prizes: { first: totalPot * split1, second: totalPot * split2, third: totalPot * split3 },
    fee, netFee, polla: 'groups'
  });
});

// Ranking Polla 2 — eliminatorias, solo pagados en polla 2
app.get('/api/leaderboard/knockout', (req, res) => {
  const settings = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value]));
  const fee = parseFloat(settings['polla2_fee'] || 20);
  const maintenance = parseFloat(settings['polla2_maintenance'] || 1);
  const netFee = fee - maintenance;
  const split1 = parseFloat(settings['polla2_split_1st'] || 70) / 100;
  const split2 = parseFloat(settings['polla2_split_2nd'] || 25) / 100;
  const split3 = parseFloat(settings['polla2_split_3rd'] || 5) / 100;

  const regs = db.prepare(`
    SELECT r.user_id, u.display_name, u.username, r.paid
    FROM polla_registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.polla = 'knockout' AND r.paid = 1
  `).all();

  const leaderboard = regs.map(u => {
    const matches = db.prepare(`
      SELECT m.*, p.pred_home, p.pred_away, p.pred_winner, p.pred_pen_home, p.pred_pen_away
      FROM matches m
      LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
      WHERE m.phase != 'groups' AND m.home_score IS NOT NULL
    `).all(u.user_id);

    let total = 0, correct = 0, exact = 0;
    for (const m of matches) {
      const pts = calcKOMatchPoints(m, m);
      total += pts;
      if (pts > 0) correct++;
      if (pts === 5 || pts === 8) exact++;
    }
    return { ...u, points: total, correctPredictions: correct, exactScores: exact };
  }).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);

  const totalPot = regs.length * netFee;
  res.json({
    leaderboard,
    totalPot,
    prizes: { first: totalPot * split1, second: totalPot * split2, third: totalPot * split3 },
    fee, netFee, polla: 'knockout'
  });
});

// Mantener endpoint legacy para compatibilidad
app.get('/api/leaderboard', (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, paid_entry FROM users WHERE is_admin = 0').all();
  const leaderboard = users.map(u => {
    const stats = calcUserTotalPoints(db, u.id);
    return { ...u, points: stats.total, correctPredictions: stats.correctPredictions, exactScores: stats.exactScores };
  }).sort((a, b) => b.points - a.points || b.exactScores - a.exactScores);
  res.json(leaderboard);
});

// ─── POLLAS — INSCRIPCIONES ──────────────────────────────────────────────────

app.get('/api/pollas/status', authMiddleware, (req, res) => {
  const settings = Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value]));

  const reg1 = db.prepare('SELECT * FROM polla_registrations WHERE user_id = ? AND polla = ?').get(req.user.id, 'groups');
  const reg2 = db.prepare('SELECT * FROM polla_registrations WHERE user_id = ? AND polla = ?').get(req.user.id, 'knockout');

  const count1 = db.prepare("SELECT COUNT(*) as c FROM polla_registrations WHERE polla = 'groups' AND paid = 1").get().c;
  const count2 = db.prepare("SELECT COUNT(*) as c FROM polla_registrations WHERE polla = 'knockout' AND paid = 1").get().c;

  const locked = areGroupPredictionsLocked();

  // Polla 2 abre cuando termina el último partido de grupos
  const lastGroupMatch = db.prepare(
    "SELECT * FROM matches WHERE phase = 'groups' ORDER BY match_date DESC, match_time DESC LIMIT 1"
  ).get();
  const polla2Open = lastGroupMatch && lastGroupMatch.home_score != null;

  res.json({
    polla1: {
      fee: parseFloat(settings['polla1_fee'] || 20),
      maintenance: parseFloat(settings['polla1_maintenance'] || 1),
      registered: !!reg1,
      paid: reg1 ? !!reg1.paid : false,
      locked,
      totalPaid: count1
    },
    polla2: {
      fee: parseFloat(settings['polla2_fee'] || 20),
      maintenance: parseFloat(settings['polla2_maintenance'] || 1),
      registered: !!reg2,
      paid: reg2 ? !!reg2.paid : false,
      open: polla2Open,
      totalPaid: count2
    }
  });
});

app.post('/api/pollas/:polla/register', authMiddleware, (req, res) => {
  const { polla } = req.params;
  if (!['groups', 'knockout'].includes(polla))
    return res.status(400).json({ error: 'Polla invalida' });

  if (polla === 'groups' && arePolla1Locked())
    return res.status(400).json({ error: 'La inscripción a grupos ya cerró (5 min antes del primer partido).' });

  if (polla === 'knockout') {
    if (arePolla2Locked())
      return res.status(400).json({ error: 'La inscripción a eliminatorias ya cerró (5 min antes del primer partido de dieciseisavos).' });
    const lastGroupMatch = db.prepare(
      "SELECT * FROM matches WHERE phase = 'groups' ORDER BY match_date DESC, match_time DESC LIMIT 1"
    ).get();
    if (!lastGroupMatch || lastGroupMatch.home_score == null)
      return res.status(400).json({ error: 'La polla de eliminatorias aún no está abierta.' });
  }

  const existing = db.prepare('SELECT * FROM polla_registrations WHERE user_id = ? AND polla = ?').get(req.user.id, polla);
  if (existing) return res.status(409).json({ error: 'Ya estás inscrito en esta polla.' });

  db.prepare('INSERT INTO polla_registrations (user_id, polla, paid) VALUES (?, ?, 0)').run(req.user.id, polla);
  res.json({ success: true });
});

// Admin — confirmar pago de polla
app.put('/api/admin/pollas/:polla/users/:userId/paid', authMiddleware, adminMiddleware, (req, res) => {
  const { polla, userId } = req.params;
  const { paid } = req.body || {};
  db.prepare('UPDATE polla_registrations SET paid = ? WHERE user_id = ? AND polla = ?')
    .run(paid ? 1 : 0, userId, polla);
  res.json({ success: true });
});

// Admin — listar inscritos por polla
app.get('/api/admin/pollas/:polla/registrations', authMiddleware, adminMiddleware, (req, res) => {
  const { polla } = req.params;
  res.json(db.prepare(`
    SELECT r.*, u.display_name, u.username
    FROM polla_registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.polla = ?
    ORDER BY r.registered_at
  `).all(polla));
});

// Admin — configurar montos de pollas
app.put('/api/admin/pollas/settings', authMiddleware, adminMiddleware, (req, res) => {
  const { polla1_fee, polla1_maintenance, polla1_split_1st, polla1_split_2nd, polla1_split_3rd,
          polla2_fee, polla2_maintenance, polla2_split_1st, polla2_split_2nd, polla2_split_3rd } = req.body || {};

  const updates = { polla1_fee, polla1_maintenance, polla1_split_1st, polla1_split_2nd, polla1_split_3rd,
                    polla2_fee, polla2_maintenance, polla2_split_1st, polla2_split_2nd, polla2_split_3rd };

  for (const [key, val] of Object.entries(updates)) {
    if (val != null) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(val), key);
  }
  res.json({ success: true });
});

// ─── APUESTAS DIARIAS ─────────────────────────────────────────────────────────

app.get('/api/daily-bets/today', authMiddleware, (req, res) => {
  const now = new Date();
  const local = new Date(now.getTime() + (-5 * 60 - now.getTimezoneOffset()) * 60000);
  const today = local.toISOString().split('T')[0];

  const matches = db.prepare(`
    SELECT m.*, h.name as home_name, h.flag as home_flag,
           a.name as away_name, a.flag as away_flag
    FROM matches m
    LEFT JOIN teams h ON h.code = m.home_team
    LEFT JOIN teams a ON a.code = m.away_team
    WHERE m.match_date = ? AND m.home_team IS NOT NULL
    ORDER BY m.match_time, m.id
  `).all(today);

  const betsMap = Object.fromEntries(
    db.prepare('SELECT * FROM daily_bets WHERE user_id = ?').all(req.user.id).map(b => [b.match_id, b])
  );

  res.json({
    date: today,
    matches: matches.map(m => {
      const all = db.prepare('SELECT COUNT(*) as c, SUM(bet_amount) as pot FROM daily_bets WHERE match_id = ?').get(m.id);
      return { ...m, myBet: betsMap[m.id] || null, totalBets: all.c, pot: all.pot || 0, locked: isDailyBetLocked(m.match_date, m.match_time) };
    })
  });
});

app.post('/api/daily-bets', authMiddleware, (req, res) => {
  const { match_id, pred_home, pred_away, bet_amount } = req.body || {};
  if (!match_id || pred_home == null || pred_away == null || !bet_amount)
    return res.status(400).json({ error: 'Faltan campos' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
  if (!match) return res.status(404).json({ error: 'Partido no existe' });
  if (isDailyBetLocked(match.match_date, match.match_time))
    return res.status(400).json({ error: 'Las apuestas para este partido ya cerraron (5 min antes del inicio).' });

  const min = parseFloat(db.prepare('SELECT value FROM settings WHERE key = ?').get('daily_bet_min').value);
  const max = parseFloat(db.prepare('SELECT value FROM settings WHERE key = ?').get('daily_bet_max').value);
  if (bet_amount < min || bet_amount > max)
    return res.status(400).json({ error: `El monto debe estar entre $${min} y $${max}` });

  db.prepare(`
    INSERT INTO daily_bets (user_id, match_id, pred_home, pred_away, bet_amount)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, match_id) DO UPDATE SET
      pred_home = excluded.pred_home,
      pred_away = excluded.pred_away,
      bet_amount = excluded.bet_amount
  `).run(req.user.id, match_id, pred_home, pred_away, bet_amount);
  res.json({ success: true });
});

app.get('/api/daily-bets/results/:matchId', authMiddleware, (req, res) => {
  const matchId = req.params.matchId;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match) return res.status(404).json({ error: 'Partido no existe' });
  if (match.home_score == null) return res.json({ status: 'pending', matchId });

  const allBets = db.prepare(`
    SELECT b.*, u.display_name
    FROM daily_bets b
    JOIN users u ON u.id = b.user_id
    WHERE b.match_id = ?
  `).all(matchId);

  const totalPot = allBets.reduce((s, b) => s + b.bet_amount, 0);
  const realHome = match.home_score;
  const realAway = match.away_score;
  let realWinner = null;
  if (realHome > realAway) realWinner = match.home_team;
  else if (realAway > realHome) realWinner = match.away_team;

  const exactWinners = allBets.filter(b =>
    parseInt(b.pred_home) === realHome && parseInt(b.pred_away) === realAway
  );
  const winnerWinners = realWinner
    ? allBets.filter(b => {
        const ph = parseInt(b.pred_home);
        const pa = parseInt(b.pred_away);
        const predWinner = ph > pa ? match.home_team : pa > ph ? match.away_team : null;
        return predWinner === realWinner && !exactWinners.find(e => e.user_id === b.user_id);
      })
    : [];

  let potWinners = [], potType = '', carried = false;
  if (exactWinners.length > 0) { potWinners = exactWinners; potType = 'exacto'; }
  else if (winnerWinners.length > 0) { potWinners = winnerWinners; potType = 'ganador'; }
  else { carried = true; potType = 'nadie'; }

  const perWinner = potWinners.length > 0 ? (totalPot / potWinners.length).toFixed(2) : '0.00';
  const myUserId = req.user.id;
  const iWon = potWinners.some(b => b.user_id === myUserId);
  const myBet = allBets.find(b => b.user_id === myUserId);

  res.json({
    status: 'finished', matchId,
    realScore: `${realHome}–${realAway}`,
    totalPot, potType, carried,
    perWinner: parseFloat(perWinner),
    winners: potWinners.map(b => ({ display_name: b.display_name, pred: `${b.pred_home}–${b.pred_away}` })),
    allBets: allBets.map(b => ({ display_name: b.display_name, pred: `${b.pred_home}–${b.pred_away}`, amount: b.bet_amount })),
    myResult: myBet ? { pred: `${myBet.pred_home}–${myBet.pred_away}`, won: iWon, prize: iWon ? parseFloat(perWinner) : 0 } : null
  });
});

// ─── MINI-POLLAS ──────────────────────────────────────────────────────────────

// Estado y datos de todas las mini-pollas para el usuario actual
app.get('/api/mini-polla/status', authMiddleware, (req, res) => {
  const settings = Object.fromEntries(
    db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value])
  );
  const result = {};
  for (const phase of Object.keys(MINI_POLLA_PHASES)) {
    const status = getMiniPollaStatus(phase);
    const reg = db.prepare(
      'SELECT * FROM mini_polla_registrations WHERE user_id = ? AND phase = ?'
    ).get(req.user.id, phase);
    const totalRegistered = db.prepare(
      'SELECT COUNT(*) as c FROM mini_polla_registrations WHERE phase = ? AND paid = 1'
    ).get(phase).c;
    result[phase] = {
      label: MINI_POLLA_PHASES[phase].label,
      status,
      fee: parseFloat(settings[`mini_polla_fee_${phase}`] || 5),
      registered: !!reg,
      paid: reg ? !!reg.paid : false,
      totalRegistered,
      pot: totalRegistered * parseFloat(settings[`mini_polla_fee_${phase}`] || 5)
    };
  }
  res.json(result);
});

// Partidos de una fase para la mini-polla (equipos reales del admin)
app.get('/api/mini-polla/:phase/matches', authMiddleware, (req, res) => {
  const { phase } = req.params;
  if (!MINI_POLLA_PHASES[phase]) return res.status(400).json({ error: 'Fase invalida' });

  const matchPhase = MINI_POLLA_PHASES[phase].matchPhase;
  const matches = db.prepare(`
    SELECT m.*,
           h.name as home_name, h.flag as home_flag,
           a.name as away_name, a.flag as away_flag
    FROM matches m
    LEFT JOIN teams h ON h.code = m.home_team
    LEFT JOIN teams a ON a.code = m.away_team
    WHERE m.phase = ?
    ORDER BY m.match_date, m.match_time, m.id
  `).all(matchPhase);

  const preds = db.prepare(
    'SELECT * FROM mini_polla_predictions WHERE user_id = ? AND phase = ?'
  ).all(req.user.id, phase);
  const predMap = Object.fromEntries(preds.map(p => [p.match_id, p]));

  res.json(matches.map(m => ({ ...m, myPred: predMap[m.id] || null })));
});

// Inscribirse en una mini-polla
app.post('/api/mini-polla/:phase/register', authMiddleware, (req, res) => {
  const { phase } = req.params;
  if (!MINI_POLLA_PHASES[phase]) return res.status(400).json({ error: 'Fase invalida' });

  const status = getMiniPollaStatus(phase);
  if (status !== 'open') return res.status(400).json({ error: 'Esta mini-polla no esta abierta para inscripcion.' });

  const existing = db.prepare(
    'SELECT * FROM mini_polla_registrations WHERE user_id = ? AND phase = ?'
  ).get(req.user.id, phase);
  if (existing) return res.status(409).json({ error: 'Ya estas inscrito en esta mini-polla.' });

  db.prepare(`
    INSERT INTO mini_polla_registrations (user_id, phase, paid)
    VALUES (?, ?, 0)
  `).run(req.user.id, phase);
  res.json({ success: true });
});

// Guardar pronóstico de mini-polla
app.post('/api/mini-polla/:phase/predictions', authMiddleware, (req, res) => {
  const { phase } = req.params;
  if (!MINI_POLLA_PHASES[phase]) return res.status(400).json({ error: 'Fase invalida' });

  const status = getMiniPollaStatus(phase);
  if (status === 'locked' || status === 'finished')
    return res.status(403).json({ error: 'Las predicciones de esta fase estan cerradas.' });

  const reg = db.prepare(
    'SELECT * FROM mini_polla_registrations WHERE user_id = ? AND phase = ?'
  ).get(req.user.id, phase);
  if (!reg) return res.status(403).json({ error: 'Debes inscribirte primero en esta mini-polla.' });

  const { match_id, pred_home, pred_away, pred_winner, pred_pen_home, pred_pen_away } = req.body || {};
  if (!match_id) return res.status(400).json({ error: 'Falta match_id' });

  db.prepare(`
    INSERT INTO mini_polla_predictions (user_id, phase, match_id, pred_home, pred_away, pred_winner, pred_pen_home, pred_pen_away, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, phase, match_id) DO UPDATE SET
      pred_home = excluded.pred_home,
      pred_away = excluded.pred_away,
      pred_winner = excluded.pred_winner,
      pred_pen_home = excluded.pred_pen_home,
      pred_pen_away = excluded.pred_pen_away,
      updated_at = datetime('now')
  `).run(req.user.id, phase, match_id,
    pred_home ?? null, pred_away ?? null,
    pred_winner ?? null,
    pred_pen_home ?? null, pred_pen_away ?? null
  );
  res.json({ success: true });
});

// Ranking de una mini-polla
app.get('/api/mini-polla/:phase/leaderboard', authMiddleware, (req, res) => {
  const { phase } = req.params;
  if (!MINI_POLLA_PHASES[phase]) return res.status(400).json({ error: 'Fase invalida' });

  const registrations = db.prepare(`
    SELECT r.*, u.display_name, u.username
    FROM mini_polla_registrations r
    JOIN users u ON u.id = r.user_id
    WHERE r.phase = ?
  `).all(phase);

  const leaderboard = registrations.map(r => {
    const stats = calcMiniPollaPoints(db, r.user_id, phase);
    return {
      user_id: r.user_id,
      display_name: r.display_name,
      username: r.username,
      paid: !!r.paid,
      points: stats.total,
      correct: stats.correct,
      exact: stats.exact
    };
  }).sort((a, b) => b.points - a.points || b.exact - a.exact);

  const settings = Object.fromEntries(
    db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value])
  );
  const fee = parseFloat(settings[`mini_polla_fee_${phase}`] || 5);
  const paidCount = registrations.filter(r => r.paid).length;
  const totalPot = paidCount * fee;

  res.json({ leaderboard, totalPot, fee, phase, label: MINI_POLLA_PHASES[phase].label });
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────

app.put('/api/admin/matches/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { home_score, away_score, pen_home, pen_away, winner, home_team, away_team } = req.body || {};
  if (!db.prepare('SELECT id FROM matches WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'No existe' });
  db.prepare(`
    UPDATE matches SET
      home_score = COALESCE(?, home_score),
      away_score = COALESCE(?, away_score),
      pen_home   = COALESCE(?, pen_home),
      pen_away   = COALESCE(?, pen_away),
      winner     = COALESCE(?, winner),
      home_team  = COALESCE(?, home_team),
      away_team  = COALESCE(?, away_team)
    WHERE id = ?
  `).run(
    home_score ?? null, away_score ?? null,
    pen_home ?? null, pen_away ?? null,
    winner ?? null,
    home_team ?? null, away_team ?? null,
    req.params.id
  );
  res.json({ success: true });
});

app.put('/api/admin/podium', authMiddleware, adminMiddleware, (req, res) => {
  const { first_place, second_place, third_place } = req.body || {};
  db.prepare(`
    INSERT INTO podium_real (id, first_place, second_place, third_place)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      first_place = excluded.first_place,
      second_place = excluded.second_place,
      third_place = excluded.third_place
  `).run(first_place || null, second_place || null, third_place || null);
  res.json({ success: true });
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  res.json(db.prepare('SELECT id, username, display_name, is_admin, paid_entry, created_at FROM users ORDER BY created_at DESC').all());
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const { display_name, username, is_admin, paid_entry } = req.body || {};
  if (username) {
    const clash = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.toLowerCase(), req.params.id);
    if (clash) return res.status(409).json({ error: 'Ese usuario ya existe' });
  }
  db.prepare(`
    UPDATE users SET
      display_name = COALESCE(?, display_name),
      username     = COALESCE(?, username),
      is_admin     = COALESCE(?, is_admin),
      paid_entry   = COALESCE(?, paid_entry)
    WHERE id = ?
  `).run(
    display_name ?? null,
    username ? username.toLowerCase() : null,
    is_admin != null ? (is_admin ? 1 : 0) : null,
    paid_entry != null ? (paid_entry ? 1 : 0) : null,
    req.params.id
  );
  res.json({ success: true });
});

app.post('/api/admin/users/:id/reset-password', authMiddleware, adminMiddleware, (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 4) return res.status(400).json({ error: 'Contrasena muy corta' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  res.json(Object.fromEntries(db.prepare('SELECT * FROM settings').all().map(r => [r.key, r.value])));
});

// Admin: marcar pago de mini-polla
app.put('/api/admin/mini-polla/:phase/users/:userId/paid', authMiddleware, adminMiddleware, (req, res) => {
  const { phase, userId } = req.params;
  const { paid } = req.body || {};
  db.prepare(
    'UPDATE mini_polla_registrations SET paid = ? WHERE user_id = ? AND phase = ?'
  ).run(paid ? 1 : 0, userId, phase);
  res.json({ success: true });
});

// Admin: editar montos de mini-pollas
app.put('/api/admin/mini-polla/fees', authMiddleware, adminMiddleware, (req, res) => {
  const { fee_r16, fee_qf, fee_sf } = req.body || {};
  if (fee_r16) db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(fee_r16), 'mini_polla_fee_r16');
  if (fee_qf)  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(fee_qf),  'mini_polla_fee_qf');
  if (fee_sf)  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(fee_sf),  'mini_polla_fee_sf');
  res.json({ success: true });
});

// ENDPOINT TEMPORAL DE PRUEBA — ELIMINAR DESPUÉS
app.get('/api/admin/set-test-date', authMiddleware, adminMiddleware, (req, res) => {
  const now = new Date();
  const local = new Date(now.getTime() + (-5 * 60 - now.getTimezoneOffset()) * 60000);
  const today = local.toISOString().split('T')[0];
  db.prepare("UPDATE matches SET match_date = ?, match_time = '14:00' WHERE id = 'G-A-1'").run(today);
  res.json({ success: true, today });
});

app.get('/api/admin/restore-test-date', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare("UPDATE matches SET match_date = '2026-06-11', match_time = '14:00' WHERE id = 'G-A-1'").run();
  res.json({ success: true });
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
  console.log(`Predicciones bloqueadas: ${areGroupPredictionsLocked()}`);
});
