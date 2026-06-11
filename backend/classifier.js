const { GROUPS } = require('./data/worldCupData');

// Fixture de dieciseisavos según los IDs de la BD y los labels del reglamento FIFA
const R16_FIXTURE = [
  { id: 'R32-1',  home: { type: '2nd', group: 'A' }, away: { type: '2nd', group: 'B' } },
  { id: 'R32-2',  home: { type: '1st', group: 'C' }, away: { type: '2nd', group: 'F' } },
  { id: 'R32-3',  home: { type: '1st', group: 'E' }, away: { type: 'best3', pools: ['A','B','C','D','F'] } },
  { id: 'R32-4',  home: { type: '1st', group: 'F' }, away: { type: '2nd', group: 'C' } },
  { id: 'R32-5',  home: { type: '2nd', group: 'E' }, away: { type: '2nd', group: 'I' } },
  { id: 'R32-6',  home: { type: '1st', group: 'I' }, away: { type: 'best3', pools: ['C','D','F','G','H'] } },
  { id: 'R32-7',  home: { type: '1st', group: 'A' }, away: { type: 'best3', pools: ['C','E','F','H','I'] } },
  { id: 'R32-8',  home: { type: '1st', group: 'L' }, away: { type: 'best3', pools: ['E','H','I','J','K'] } },
  { id: 'R32-9',  home: { type: '1st', group: 'G' }, away: { type: 'best3', pools: ['A','E','H','I','J'] } },
  { id: 'R32-10', home: { type: '1st', group: 'D' }, away: { type: 'best3', pools: ['B','E','F','I','J'] } },
  { id: 'R32-11', home: { type: '2nd', group: 'K' }, away: { type: '2nd', group: 'L' } },
  { id: 'R32-12', home: { type: '1st', group: 'H' }, away: { type: '2nd', group: 'J' } },
  { id: 'R32-13', home: { type: '1st', group: 'B' }, away: { type: 'best3', pools: ['E','F','G','I','J'] } },
  { id: 'R32-14', home: { type: '2nd', group: 'D' }, away: { type: '2nd', group: 'G' } },
  { id: 'R32-15', home: { type: '1st', group: 'J' }, away: { type: '2nd', group: 'H' } },
  { id: 'R32-16', home: { type: '1st', group: 'K' }, away: { type: 'best3', pools: ['D','E','I','J','L'] } },
];

// Cuartos: ganadores de dieciseisavos que se enfrentan (según Art. 12.7 FIFA)
const QF_FIXTURE = [
  { id: 'QF-1', home: 'R32-2',  away: 'R32-6'  },
  { id: 'QF-2', home: 'R32-1',  away: 'R32-3'  },
  { id: 'QF-3', home: 'R32-4',  away: 'R32-5'  },
  { id: 'QF-4', home: 'R32-7',  away: 'R32-8'  },
  { id: 'QF-5', home: 'R32-11', away: 'R32-12' },
  { id: 'QF-6', home: 'R32-9',  away: 'R32-10' },
  { id: 'QF-7', home: 'R32-15', away: 'R32-14' },
  { id: 'QF-8', home: 'R32-13', away: 'R32-16' },
];

// Semis (en la BD están como phase='sf', IDs SF-1..SF-6, los primeros 4 son cuartos reales)
// Según las imágenes: SF-1=Semifinal1, SF-2=Semifinal2, SF-3=Semifinal3(cuarto),
// SF-4=Semifinal4(cuarto), SF-5=Semifinal5, SF-6=Semifinal6
// Los cuartos de la BD son QF-1..QF-8, las semis reales son SF-1..SF-6
// Según imagen: Semis(6) contiene SF-1,SF-2,SF-4,SF-3,SF-5,SF-6
// SF-1 y SF-2 son semifinales del bracket izquierdo
// SF-3 y SF-4 son semifinales del bracket derecho  
// SF-5 = Final del bracket izquierdo (ganadores SF-1 y SF-2)
// SF-6 = Final del bracket derecho (ganadores SF-3 y SF-4)

const SF_FIXTURE = [
  { id: 'SF-1', home: 'QF-1', away: 'QF-2' },
  { id: 'SF-2', home: 'QF-3', away: 'QF-4' },
  { id: 'SF-3', home: 'QF-5', away: 'QF-6' },
  { id: 'SF-4', home: 'QF-7', away: 'QF-8' },
  { id: 'SF-5', home: 'SF-1', away: 'SF-2' }, // Semifinal real → Final
  { id: 'SF-6', home: 'SF-3', away: 'SF-4' }, // Semifinal real → Final
];

// Tercer puesto: perdedores de SF-5 y SF-6
// Final: ganadores de SF-5 y SF-6

function calcGroupStandings(groupCode, groupTeams, matchPredictions) {
  const standings = {};
  for (const t of groupTeams) {
    standings[t] = { team: t, pts: 0, gf: 0, ga: 0, gd: 0, played: 0 };
  }

  for (let i = 0; i < groupTeams.length; i++) {
    for (let j = i + 1; j < groupTeams.length; j++) {
      const teamA = groupTeams[i];
      const teamB = groupTeams[j];
      // Aceptar el partido en cualquier orden de local/visitante
      const pred = matchPredictions.find(p =>
        p.group_name === groupCode &&
        ((p.home_team === teamA && p.away_team === teamB) ||
         (p.home_team === teamB && p.away_team === teamA))
      );
      if (!pred || pred.pred_home == null || pred.pred_away == null) continue;

      // Asignar goles según quién fue local/visitante en el fixture real
      const aIsHome = pred.home_team === teamA;
      const goalsA = parseInt(aIsHome ? pred.pred_home : pred.pred_away);
      const goalsB = parseInt(aIsHome ? pred.pred_away : pred.pred_home);

      standings[teamA].played++;
      standings[teamB].played++;
      standings[teamA].gf += goalsA; standings[teamA].ga += goalsB;
      standings[teamB].gf += goalsB; standings[teamB].ga += goalsA;
      standings[teamA].gd = standings[teamA].gf - standings[teamA].ga;
      standings[teamB].gd = standings[teamB].gf - standings[teamB].ga;

      if (goalsA > goalsB) standings[teamA].pts += 3;
      else if (goalsB > goalsA) standings[teamB].pts += 3;
      else { standings[teamA].pts += 1; standings[teamB].pts += 1; }
    }
  }

  return Object.values(standings).sort((a, b) =>
    b.pts !== a.pts ? b.pts - a.pts :
    b.gd !== a.gd ? b.gd - a.gd :
    b.gf - a.gf
  );
}

function calcUserClassified(db, userId) {
  const matchPredictions = db.prepare(`
    SELECT p.pred_home, p.pred_away, m.home_team, m.away_team, m.group_name
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND m.phase = 'groups'
  `).all(userId);

  // 1. Posiciones de cada grupo
  const groupResults = {};
  const allThirds = [];
  for (const [groupCode, groupTeams] of Object.entries(GROUPS)) {
    const standings = calcGroupStandings(groupCode, groupTeams, matchPredictions);
    groupResults[groupCode] = standings;
    if (standings.length >= 3) {
      allThirds.push({ group: groupCode, ...standings[2] });
    }
  }

  // 2. Los 8 mejores terceros ordenados
  allThirds.sort((a, b) =>
    b.pts !== a.pts ? b.pts - a.pts :
    b.gd !== a.gd ? b.gd - a.gd :
    b.gf - a.gf
  );
  const best8Thirds = allThirds.slice(0, 8);
  const best8ThirdsCodes = best8Thirds.map(t => t.team);

  // 3. Función para resolver qué equipo ocupa un slot del fixture
  // Para best3: busca el mejor tercero cuyo grupo esté en la lista de pools
  function resolveSlot(slot, usedBest3 = new Set()) {
    if (slot.type === '1st') return groupResults[slot.group]?.[0]?.team || null;
    if (slot.type === '2nd') return groupResults[slot.group]?.[1]?.team || null;
    if (slot.type === 'best3') {
      const candidate = best8Thirds.find(t =>
        slot.pools.includes(t.group) && !usedBest3.has(t.team)
      );
      if (candidate) usedBest3.add(candidate.team);
      return candidate?.team || null;
    }
    return null;
  }

  // 4. Resolver equipos de dieciseisavos
  const usedBest3 = new Set();
  const matchTeams = {}; // matchId → { home, away }
  for (const m of R16_FIXTURE) {
    const away = m.away.type === 'best3'
      ? resolveSlot(m.away, usedBest3)
      : resolveSlot(m.away, usedBest3);
    matchTeams[m.id] = {
      home: resolveSlot(m.home, usedBest3),
      away
    };
  }

  // 5. Predicciones de ganadores eliminatorias del usuario
  const koPreds = db.prepare(`
    SELECT p.pred_winner, m.id as match_id
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE p.user_id = ? AND m.phase != 'groups'
  `).all(userId);
  const koWinner = Object.fromEntries(koPreds.map(p => [p.match_id, p.pred_winner]));

  // 6. Ganadores de dieciseisavos
  for (const m of R16_FIXTURE) {
    const w = koWinner[m.id] || null;
    matchTeams[m.id].winner = w;
  }

  // 7. Cuartos: equipos = ganadores de dieciseisavos
  for (const m of QF_FIXTURE) {
    matchTeams[m.id] = {
      home: matchTeams[m.home]?.winner || null,
      away: matchTeams[m.away]?.winner || null,
      winner: koWinner[m.id] || null
    };
  }

  // 8. Semis (SF-1 a SF-4): equipos = ganadores de cuartos
  for (const m of SF_FIXTURE.slice(0, 4)) {
    matchTeams[m.id] = {
      home: matchTeams[m.home]?.winner || null,
      away: matchTeams[m.away]?.winner || null,
      winner: koWinner[m.id] || null
    };
  }

  // 9. Semifinales reales (SF-5, SF-6): ganadores de SF-1..SF-4
  for (const m of SF_FIXTURE.slice(4)) {
    matchTeams[m.id] = {
      home: matchTeams[m.home]?.winner || null,
      away: matchTeams[m.away]?.winner || null,
      winner: koWinner[m.id] || null
    };
  }

  // 10. Final: ganadores de SF-5 y SF-6
  const sf5Winner = matchTeams['SF-5']?.winner || null;
  const sf6Winner = matchTeams['SF-6']?.winner || null;
  matchTeams['FINAL'] = { home: sf5Winner, away: sf6Winner, winner: null };

  // 11. Tercer puesto: perdedores de SF-5 y SF-6
  function loser(sfId) {
    const t = matchTeams[sfId];
    if (!t?.winner) return null;
    return t.winner === t.home ? t.away : t.home;
  }
  matchTeams['TP'] = {
    home: loser('SF-5'),
    away: loser('SF-6'),
    winner: null
  };

  // 12. Equipos que llegaron a la final (para podio)
  const finalist1 = sf5Winner;
  const finalist2 = sf6Winner;
  const finalist3 = loser('SF-5');
  const finalist4 = loser('SF-6');
  const podiumCandidates = [finalist1, finalist2, finalist3, finalist4].filter(Boolean);

  return {
    groups: groupResults,
    best8Thirds: best8ThirdsCodes,
    matchTeams,
    podiumCandidates
  };
}

module.exports = { calcUserClassified, GROUPS };
