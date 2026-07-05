const POINTS = {
  // Grupos
  EXACT_SCORE: 5,       // Marcador exacto
  CORRECT_DIFF: 3,      // Ganador + diferencia correcta
  CORRECT_WINNER: 2,    // Solo ganador correcto
  CORRECT_DRAW: 5,      // Empate exacto (igual que marcador exacto)

  // Eliminatorias - sin penales
  KO_EXACT: 5,          // Marcador exacto
  KO_WINNER_DIFF: 3,    // Ganador + diferencia correcta
  KO_WINNER: 2,         // Solo ganador correcto

  // Eliminatorias - con penales (empate en 90 min)
  KO_EXACT_PEN_ALL: 8,  // Marcador exacto + penales exactos (8 pts)
  KO_EXACT_PEN: 5,      // (a) Marcador exacto + ganador, penales no exactos
                         // (b) Marcador NO exacto + penales exactos + ganador
  KO_DRAW_WINNER: 4,    // Empate no exacto (otro marcador) + ganador correcto
  CORRECT_DRAW_KO: 3,   // Empate no exacto, sin acertar ganador en penales

  // Podio
  CHAMPION: 15,
  RUNNER_UP: 10,
  THIRD_PLACE: 6
};

function calcGroupMatchPoints(pred, real) {
  if (!pred || real.home_score == null || real.away_score == null) return 0;
  if (pred.pred_home == null || pred.pred_away == null) return 0;

  const ph = parseInt(pred.pred_home);
  const pa = parseInt(pred.pred_away);
  const rh = parseInt(real.home_score);
  const ra = parseInt(real.away_score);

  // Marcador exacto (incluye empate exacto — ambos valen 5)
  if (ph === rh && pa === ra) return POINTS.EXACT_SCORE;

  const predResult = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
  const realResult = rh > ra ? 'H' : rh < ra ? 'A' : 'D';

  if (predResult !== realResult) return 0;

  // Empate correcto pero no exacto: la diferencia de goles es 0 en ambos → 3 pts (CORRECT_DIFF)
  // Ganador correcto + diferencia correcta → 3 pts
  // Ganador correcto solamente → 2 pts
  const predDiff = Math.abs(ph - pa);
  const realDiff = Math.abs(rh - ra);
  if (predDiff === realDiff) return POINTS.CORRECT_DIFF;

  return POINTS.CORRECT_WINNER;
}

function calcKOMatchPoints(pred, real) {
  if (!pred || real.home_score == null || real.away_score == null) return 0;

  const rh = parseInt(real.home_score);
  const ra = parseInt(real.away_score);
  const realIsDraw = rh === ra;
  const realWinner = real.winner;

  // Partido sin penales (no hubo empate en tiempo reglamentario)
  if (!realIsDraw) {
    if (pred.pred_home == null || pred.pred_away == null) return 0;
    const ph = parseInt(pred.pred_home);
    const pa = parseInt(pred.pred_away);

    // Si el pred_winner está definido y contradice al ganador real → 0 pts.
    // Esto captura los casos de cascada errónea donde el usuario predijo
    // que avanzaba el equipo equivocado (aunque el marcador numérico coincida).
    // Solo aplicamos si pred_winner viene explícito Y contradice al real.
    const predNumResult = ph > pa ? 'home' : ph < pa ? 'away' : 'draw';
    const realNumResult = rh > ra ? 'home' : 'away';
    if (pred.pred_winner && realWinner && pred.pred_winner !== realWinner) {
      // Doble check: si el marcador numérico también coincide con el ganador real,
      // pero el pred_winner es incorrecto, es cascada errónea → 0
      return 0;
    }

    if (ph === rh && pa === ra) return POINTS.KO_EXACT;

    const predResult = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
    const realResult = rh > ra ? 'H' : 'A';
    if (predResult !== realResult) return 0;

    const predDiff = Math.abs(ph - pa);
    const realDiff = Math.abs(rh - ra);
    if (predDiff === realDiff) return POINTS.KO_WINNER_DIFF;

    return POINTS.KO_WINNER;
  }

  // Partido con penales (empate en tiempo reglamentario)
  const predIsDraw = pred.pred_home != null && pred.pred_away != null &&
    parseInt(pred.pred_home) === parseInt(pred.pred_away);
  const predExact = pred.pred_home != null && pred.pred_away != null &&
    parseInt(pred.pred_home) === rh && parseInt(pred.pred_away) === ra;

  const predWinner = pred.pred_winner;
  const predPenHome = pred.pred_pen_home != null ? parseInt(pred.pred_pen_home) : null;
  const predPenAway = pred.pred_pen_away != null ? parseInt(pred.pred_pen_away) : null;
  const realPenHome = real.pen_home != null ? parseInt(real.pen_home) : null;
  const realPenAway = real.pen_away != null ? parseInt(real.pen_away) : null;

  const correctWinner = predWinner && realWinner && predWinner === realWinner;
  const exactPenales = predPenHome != null && predPenAway != null &&
    realPenHome != null && realPenAway != null &&
    predPenHome === realPenHome && predPenAway === realPenAway;

  // Tabla de puntos para empates en eliminatorias (de mayor a menor):
  // 1) Marcador exacto + penales exactos              → 8 pts (gana el ganador correcto sí o sí, ya que penales exactos lo implican)
  // 2) Marcador exacto + penales NO exactos + ganador  → 5 pts
  // 3) Marcador NO exacto + penales exactos + ganador  → 5 pts
  // 4) Marcador NO exacto (empate, otro marcador) + ganador → 4 pts
  // 5) Empate no exacto (sin acertar ganador)           → 3 pts
  // 6) Nada acertado                                    → 0 pts

  if (predExact && exactPenales) return POINTS.KO_EXACT_PEN_ALL; // 8 pts

  if (predExact && correctWinner) return POINTS.KO_EXACT_PEN; // 5 pts — exacto, ganador, penales no exactos

  if (predIsDraw && exactPenales && correctWinner) return POINTS.KO_EXACT_PEN; // 5 pts — no exacto, penales exactos, ganador

  if (predIsDraw && correctWinner) return POINTS.KO_DRAW_WINNER; // 4 pts — empate no exacto + ganador

  if (predIsDraw) return POINTS.CORRECT_DRAW_KO; // 3 pts — empate no exacto, sin acertar ganador

  // Solo ganador correcto (sin haber predicho empate): 2 pts
  if (correctWinner) return POINTS.KO_WINNER;

  return 0;
}

// ── Estructura del bracket (mapa oficial FIFA) ──────────────────────────────
// Cada llave de octavos en adelante se alimenta de dos partidos anteriores.
const KO_QF_PAIRS  = { 'QF-1': ['R32-3','R32-5'], 'QF-2': ['R32-1','R32-4'], 'QF-3': ['R32-2','R32-6'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-14','R32-16'], 'QF-8': ['R32-13','R32-15'] };
const KO_SF_PAIRS  = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-5','QF-6'], 'SF-3': ['QF-3','QF-4'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
const KO_FINAL_PAIR = ['SF-5','SF-6'];

/**
 * Devuelve un Set con los IDs de partidos de eliminatorias que están "muertos por
 * arrastre" para el usuario indicado: partidos de octavos en adelante que dependen
 * de un partido anterior donde el usuario predijo al ganador equivocado, de modo que
 * el cruce que el usuario predijo es un partido fantasma (con equipos que en realidad
 * ya fueron eliminados). Estos partidos NO deben otorgar puntos aunque el nombre del
 * ganador coincida por casualidad con el resultado real.
 *
 * IMPORTANTE: el partido DONDE el usuario falló al ganador NO se incluye en este set.
 * Ese partido se califica normalmente con calcKOMatchPoints (que ya da 0 por fallar al
 * ganador en un partido definido, y da el crédito parcial que corresponda —por ejemplo
 * 3 pts por acertar que un partido se fue a penales aunque se falle quién ganó la tanda).
 * Solo se anulan los partidos RÍO ABAJO del error.
 *
 * Replica la cascada de la visualización del bracket de pronóstico (_buildMyBracketHtml
 * en el frontend) para determinar qué caminos están rotos. Los partidos compensados
 * nunca rompen el camino (en la cascada se toman como si el usuario hubiera acertado
 * al ganador real).
 */
function getDeadKOMatchIds(db, userId) {
  const koMatches = db.prepare(
    "SELECT id, home_team, away_team, home_score, away_score, winner FROM matches WHERE phase != 'groups'"
  ).all();
  const matchById = Object.fromEntries(koMatches.map(m => [m.id, m]));

  const preds = {};
  const predRows = db.prepare(
    "SELECT match_id, pred_home, pred_away, pred_winner FROM predictions WHERE user_id = ?"
  ).all(userId);
  predRows.forEach(p => { preds[p.match_id] = p; });

  let compSet = new Set();
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'compensated_matches'").get();
    if (row && row.value) compSet = new Set(row.value.split(',').map(s => s.trim()).filter(Boolean));
  } catch (e) { /* noop */ }

  const userWinnerOf = (matchId, homeCode, awayCode) => {
    if (compSet.has(matchId)) {
      const real = matchById[matchId];
      if (real && real.winner) return real.winner;
    }
    const pred = preds[matchId];
    if (!pred) return null;
    const ph = pred.pred_home != null ? parseInt(pred.pred_home) : null;
    const pa = pred.pred_away != null ? parseInt(pred.pred_away) : null;
    if (ph != null && pa != null && ph !== pa) return ph > pa ? homeCode : awayCode;
    return pred.pred_winner || null;
  };
  const userLoserOf = (matchId, homeCode, awayCode) => {
    const w = userWinnerOf(matchId, homeCode, awayCode);
    if (!w) return null;
    return w === homeCode ? awayCode : homeCode;
  };

  const resolved = {};
  const resolveMatch = (matchId) => {
    if (resolved[matchId]) return resolved[matchId];
    let homeCode = null, awayCode = null;
    if (matchId.startsWith('R32')) {
      const m = matchById[matchId];
      homeCode = m ? m.home_team : null;
      awayCode = m ? m.away_team : null;
    } else if (KO_QF_PAIRS[matchId]) {
      const [a, b] = KO_QF_PAIRS[matchId];
      const ra = resolveMatch(a), rb = resolveMatch(b);
      homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
      awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
    } else if (KO_SF_PAIRS[matchId]) {
      const [a, b] = KO_SF_PAIRS[matchId];
      const ra = resolveMatch(a), rb = resolveMatch(b);
      homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
      awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
    } else if (matchId === 'FINAL') {
      const [a, b] = KO_FINAL_PAIR;
      const ra = resolveMatch(a), rb = resolveMatch(b);
      homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
      awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
    } else if (matchId === 'TP') {
      const ra = resolveMatch('SF-5'), rb = resolveMatch('SF-6');
      homeCode = userLoserOf('SF-5', ra.homeCode, ra.awayCode);
      awayCode = userLoserOf('SF-6', rb.homeCode, rb.awayCode);
    }
    resolved[matchId] = { homeCode, awayCode };
    return resolved[matchId];
  };

  const deadCache = {};
  const isDead = (matchId) => {
    if (matchId in deadCache) return deadCache[matchId];
    if (compSet.has(matchId)) return deadCache[matchId] = false;
    const real = matchById[matchId];

    if (matchId.startsWith('R32')) {
      if (!real || real.home_score == null || !real.winner) return deadCache[matchId] = false;
      const { homeCode, awayCode } = resolveMatch(matchId);
      const predW = userWinnerOf(matchId, homeCode, awayCode);
      return deadCache[matchId] = (!!predW && predW !== real.winner);
    }
    if (matchId === 'TP') {
      if (isDead('SF-5') || isDead('SF-6')) return deadCache[matchId] = true;
      if (real && real.home_score != null && real.winner) {
        const { homeCode, awayCode } = resolveMatch(matchId);
        const predW = userWinnerOf(matchId, homeCode, awayCode);
        if (predW && predW !== real.winner) return deadCache[matchId] = true;
      }
      return deadCache[matchId] = false;
    }
    const pair = KO_QF_PAIRS[matchId] || KO_SF_PAIRS[matchId] || (matchId === 'FINAL' ? KO_FINAL_PAIR : null);
    if (pair && pair.some(p => isDead(p))) return deadCache[matchId] = true;
    if (real && real.home_score != null && real.winner) {
      const { homeCode, awayCode } = resolveMatch(matchId);
      const predW = userWinnerOf(matchId, homeCode, awayCode);
      if (predW && predW !== real.winner) return deadCache[matchId] = true;
    }
    return deadCache[matchId] = false;
  };

  const dead = new Set();
  // Devolver SOLO los partidos "muertos por arrastre": aquellos que dependen de un
  // partido anterior donde el usuario predijo al ganador equivocado (cruce fantasma).
  // El partido DONDE ocurre el error NO se incluye — ese se califica normalmente con
  // calcKOMatchPoints, que ya maneja el acierto parcial (p. ej. 3 pts por acertar que
  // el partido se fue a penales, aunque se haya fallado quién ganó la tanda) y el 0
  // por fallar al ganador en partidos definidos en 90 min. Así preservamos la tabla
  // de puntos prometida a los usuarios y solo anulamos los partidos río abajo.
  for (const m of koMatches) {
    let feeders = null;
    if (m.id === 'TP') feeders = ['SF-5', 'SF-6'];
    else feeders = KO_QF_PAIRS[m.id] || KO_SF_PAIRS[m.id] || (m.id === 'FINAL' ? KO_FINAL_PAIR : null);
    if (feeders && feeders.some(f => isDead(f))) dead.add(m.id);
  }
  return dead;
}

function calcUserTotalPoints(db, userId) {
  const matches = db.prepare(`
    SELECT m.*, p.pred_home, p.pred_away, p.pred_winner, p.pred_pen_home, p.pred_pen_away
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id AND p.user_id = ?
    WHERE m.home_score IS NOT NULL AND m.away_score IS NOT NULL
  `).all(userId);

  // Partidos compensados: todos los inscritos reciben 5 pts fijos por ese partido.
  // Se guardan como CSV en settings -> 'compensated_matches' (ej: "R32-1,R32-2")
  let compensated = new Set();
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'compensated_matches'").get();
    if (row && row.value) compensated = new Set(row.value.split(',').map(s => s.trim()).filter(Boolean));
  } catch (e) { /* tabla settings sin la clave aún */ }

  // Camino muerto: partidos de eliminatorias que no puntúan porque el usuario
  // rompió su cadena de ganadores (ver getDeadKOMatchIds).
  const deadKO = getDeadKOMatchIds(db, userId);

  let total = 0;
  let correctPredictions = 0;
  let exactScores = 0;   // count
  let exactPts = 0;       // puntos acumulados por exactos
  let diffCount = 0;      // ganador + diferencia correcta
  let diffPts = 0;
  let winnerCount = 0;    // solo ganador correcto
  let winnerPts = 0;
  let compensatedPts = 0; // puntos otorgados por compensación

  // Cargar updated_at de predicciones para la lógica de corte de compensación
  let predUpdatedAt = {};
  try {
    const rows = db.prepare("SELECT match_id, updated_at FROM predictions WHERE user_id = ?").all(userId);
    rows.forEach(r => { predUpdatedAt[r.match_id] = r.updated_at; });
  } catch (e) { /* tabla puede no tener updated_at */ }

  for (const m of matches) {
    // Compensación excepcional: exacto=8 pts solo si predijo ANTES del inicio del partido.
    // Si predijo después (es decir, cuando el resultado ya era conocido), recibe 5 pts.
    // Los demás (ganador equivocado, no predijo) reciben siempre 5 pts.
    if (compensated.has(m.id)) {
      const acertoExacto = m.pred_home != null && m.pred_away != null &&
        parseInt(m.pred_home) === m.home_score && parseInt(m.pred_away) === m.away_score;

      // Verificar que la predicción fue hecha antes del inicio del partido
      let predAntes = true;
      if (acertoExacto && m.match_date && m.match_time && predUpdatedAt[m.id]) {
        const matchStart = new Date(m.match_date + 'T' + m.match_time + ':00-05:00').getTime();
        const predTime = new Date(predUpdatedAt[m.id].replace(' ', 'T') + 'Z').getTime();
        predAntes = predTime <= matchStart;
      }

      if (acertoExacto && predAntes) {
        total += 8;
        exactScores++;
        exactPts += 8;
      } else {
        total += 5;
        compensatedPts += 5;
      }
      continue;
    }

    if (m.pred_home == null && m.pred_winner == null) continue;

    // Camino muerto en el bracket: si el usuario predijo al ganador equivocado
    // en este partido o en uno anterior del que depende, no otorga puntos
    // (aunque el nombre del ganador coincida por casualidad con el real).
    if (m.phase !== 'groups' && deadKO.has(m.id)) continue;

    let pts = 0;
    if (m.phase === 'groups') {
      pts = calcGroupMatchPoints(m, m);
    } else {
      pts = calcKOMatchPoints(m, m);
    }

    if (pts === 0) continue;

    total += pts;
    correctPredictions++;

    // Clasificar según el puntaje obtenido:
    // Exactos: 5 (EXACT_SCORE, KO_EXACT, CORRECT_DRAW, KO_EXACT_PEN) u 8 (KO_EXACT_PEN_ALL)
    // G+Dif:   3 (CORRECT_DIFF, KO_WINNER_DIFF, KO_DRAW_WINNER)
    // Ganador: 2 (CORRECT_WINNER, KO_WINNER)
    if (pts >= 5) {
      exactScores++;
      exactPts += pts;
    } else if (pts === 3) {
      diffCount++;
      diffPts += pts;
    } else if (pts === 2) {
      winnerCount++;
      winnerPts += pts;
    }
  }

  return {
    total,
    compensatedPts,
    correctPredictions,
    exactScores,
    exactPts,
    diffCount,
    diffPts,
    winnerCount,
    winnerPts
  };
}

function calcDailyBetResults(db, matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match || match.home_score == null) return [];

  const bets = db.prepare(`
    SELECT db.*, u.display_name
    FROM daily_bets db
    JOIN users u ON u.id = db.user_id
    WHERE db.match_id = ?
  `).all(matchId);

  const winners = bets.filter(b =>
    b.pred_home === match.home_score && b.pred_away === match.away_score
  );

  const totalPot = bets.reduce((sum, b) => sum + b.bet_amount, 0);

  return {
    match,
    totalBets: bets.length,
    totalPot,
    winners: winners.map(w => ({
      user_id: w.user_id,
      name: w.display_name,
      bet: w.bet_amount,
      payout: winners.length > 0 ? totalPot / winners.length : 0
    }))
  };
}

module.exports = { calcGroupMatchPoints, calcKOMatchPoints, calcUserTotalPoints, calcDailyBetResults, getDeadKOMatchIds, POINTS };
