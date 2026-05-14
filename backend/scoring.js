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

  // Empate correcto pero no exacto: 0 pts (ya no hay CORRECT_DRAW parcial)
  if (realResult === 'D') return 0;

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

  let total = 0;
  let correctPredictions = 0;
  let exactScores = 0;

  for (const m of matches) {
    if (m.pred_home == null && m.pred_winner == null) continue;

    let pts = 0;
    if (m.phase === 'groups') {
      pts = calcGroupMatchPoints(m, m);
    } else {
      pts = calcKOMatchPoints(m, m);
    }

    total += pts;
    if (pts > 0) correctPredictions++;
    if (pts === POINTS.EXACT_SCORE || pts === POINTS.KO_EXACT || pts === POINTS.KO_EXACT_PEN_ALL) exactScores++;
  }

  const podiumPred = db.prepare('SELECT * FROM podium_predictions WHERE user_id = ?').get(userId);
  const podiumReal = db.prepare('SELECT * FROM podium_real WHERE id = 1').get();

  if (podiumPred && podiumReal) {
    if (podiumReal.first_place && podiumPred.first_place === podiumReal.first_place) total += POINTS.CHAMPION;
    if (podiumReal.second_place && podiumPred.second_place === podiumReal.second_place) total += POINTS.RUNNER_UP;
    if (podiumReal.third_place && podiumPred.third_place === podiumReal.third_place) total += POINTS.THIRD_PLACE;
  }

  return { total, correctPredictions, exactScores };
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
