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

  // Eliminatorias - con penales
  KO_EXACT_PEN_ALL: 8,  // Marcador exacto + penales exactos + ganador correcto
  KO_EXACT_PEN: 5,      // Marcador exacto + penales exactos
  KO_DRAW_WINNER: 3,    // Empate correcto + ganador correcto en penales

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

  // Marcador exacto + penales exactos + ganador correcto: 8 pts
  if (predExact && exactPenales && correctWinner) return POINTS.KO_EXACT_PEN_ALL;

  // Marcador exacto + penales exactos (sin importar ganador): 5 pts
  if (predExact && exactPenales) return POINTS.KO_EXACT_PEN;

  // Empate correcto (no exacto) + penales exactos + ganador: 5 pts
  if (predIsDraw && exactPenales && correctWinner) return POINTS.KO_EXACT_PEN;

  // Marcador exacto + ganador correcto en penales: 3 pts
  if (predExact && correctWinner) return POINTS.KO_DRAW_WINNER;

  // Empate correcto + ganador correcto en penales: 3 pts
  if (predIsDraw && correctWinner) return POINTS.KO_DRAW_WINNER;

  // Solo ganador correcto: 2 pts
  if (correctWinner) return POINTS.KO_WINNER;

  return 0;
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

module.exports = { calcGroupMatchPoints, calcKOMatchPoints, calcUserTotalPoints, calcDailyBetResults, POINTS };
