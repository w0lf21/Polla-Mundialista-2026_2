const API = '/api';

const app = {
  token: sessionStorage.getItem('polla_token'),
  user: null,
  teams: [],
  matches: [],
  predictions: {},
  lockStatus: { locked: false },
  koTeams: null,
  currentView: 'today',

  async init() {
    this.bindLogin();
    if (this.token) {
      try {
        await this.loadUser();
        await this.loadData();
        this.showApp();
      } catch (err) {
        sessionStorage.removeItem('polla_token');
        this.token = null;
        this.showLogin();
      }
    } else {
      this.showLogin();
    }
  },

  bindLogin() {
    document.querySelectorAll('.tab-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(btn.dataset.tab + '-form').classList.add('active');
      });
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('login-error');
      const btn = e.target.querySelector('button[type=submit]');
      err.textContent = '';
      btn.classList.add('btn-login-loading');
      btn.textContent = 'Entrando...  ';
      try {
        const r = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('login-username').value.trim(),
            password: document.getElementById('login-password').value
          })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error al ingresar');
        this.token = data.token;
        this.user = data.user;
        sessionStorage.setItem('polla_token', this.token);
        await this.loadData();
        this.showApp();
      } catch (e) {
        btn.classList.remove('btn-login-loading');
        btn.textContent = 'Entrar';
        err.textContent = e.message;
      }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('register-error');
      err.textContent = '';
      try {
        const r = await fetch(`${API}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('reg-username').value.trim(),
            display_name: document.getElementById('reg-display').value.trim(),
            password: document.getElementById('reg-password').value
          })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Error al registrarse');
        this.token = data.token;
        this.user = data.user;
        sessionStorage.setItem('polla_token', this.token);
        await this.loadData();
        this.showApp();
      } catch (e) { err.textContent = e.message; }
    });
  },

  async api(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {}),
      ...(opts.headers || {})
    };
    const r = await fetch(API + path, { ...opts, headers });
    if (r.status === 401) { this.logout(); throw new Error('Sesion expirada'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error en el servidor');
    return data;
  },

  async loadUser() { this.user = await this.api('/me'); },

  async loadData() {
    const [teams, matches, preds, lockStatus] = await Promise.all([
      this.api('/teams'),
      this.api('/matches'),
      this.api('/predictions'),
      this.api('/predictions/lock-status')
    ]);
    this.teams = teams;
    this.matches = matches;
    this.predictions = Object.fromEntries(preds.map(p => [p.match_id, p]));
    this.lockStatus = lockStatus;
    try {
      this.koTeams = await this.api('/predictions/ko-teams');
    } catch (e) {
      this.koTeams = null;
    }
  },

  teamByCode(code) {
    return this.teams.find(t => t.code === code) || { code, name: code, flag: '?' };
  },

  showLogin() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
  },

  async showApp() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');

    // Animación de salida del login — zoom out como cámara alejándose
    loginScreen.style.animation = 'loginFadeOut 0.5s ease forwards';

    setTimeout(() => {
      loginScreen.classList.remove('active');
      loginScreen.style.animation = '';
      appScreen.classList.add('active');
      appScreen.style.animation = 'appStadiumReveal 0.6s ease both';
    }, 450);

    document.getElementById('header-username').textContent = this.user.display_name;
    await this.refreshPoints();
    this.renderNav();
    this.navigate('fixture');
  },

  logout() {
    sessionStorage.removeItem('polla_token');
    this.token = null;
    this.user = null;
    this.showLogin();
  },

  async refreshPoints() {
    try {
      const lb = await this.api('/leaderboard');
      const me = lb.find(u => u.id === this.user.id);
      document.getElementById('header-points').textContent = (me ? me.points : 0) + ' pts';
    } catch (e) {}
  },

  renderNav() {
    const views = [
      { id: 'fixture',    label: 'Fixture' },
      { id: 'today',      label: 'Hoy' },
      { id: 'groups',     label: 'Grupos' },
      { id: 'knockout',   label: 'Eliminatorias' },
      { id: 'podium',     label: 'Podio' },
      { id: 'minipollas', label: 'Mini-Pollas' },
      { id: 'leaderboard',label: 'Ranking' },
      { id: 'rules',      label: 'Reglas' }
    ];
    if (this.user.is_admin) views.push({ id: 'admin', label: 'Admin' });

    const nav = document.getElementById('app-nav');
    nav.innerHTML = views.map(v =>
      `<button class="nav-btn ${v.id === this.currentView ? 'active' : ''}" data-view="${v.id}">${v.label}</button>`
    ).join('');
    nav.querySelectorAll('.nav-btn').forEach(b => {
      b.addEventListener('click', () => this.navigate(b.dataset.view));
    });
  },

  navigate(view) {
    this.currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    this.renderView();
  },

  renderView() {
    const main = document.getElementById('main-content');
    switch (this.currentView) {
      case 'fixture':     this.renderFixture(main); break;
      case 'today':       this.renderToday(main); break;
      case 'groups':      this.renderGroups(main); break;
      case 'knockout':    this.renderKnockout(main); break;
      case 'podium':      this.renderPodium(main); break;
      case 'minipollas':  this.renderMiniPollas(main); break;
      case 'leaderboard': this.renderLeaderboard(main); break;
      case 'rules':       this.renderRules(main); break;
      case 'admin':       this.renderAdmin(main); break;
    }
  },

  // ── FIXTURE ─────────────────────────────────────────────────────────────────

  renderFixture(main) {
    this._fixtureTab = this._fixtureTab || 'groups';

    // Calcular posiciones reales de cada grupo
    const groupMatches = this.matches.filter(m => m.phase === 'groups');
    const groups = {};
    groupMatches.forEach(m => {
      if (!groups[m.group_name]) groups[m.group_name] = {};
      [m.home_team, m.away_team].forEach(code => {
        if (code && !groups[m.group_name][code]) {
          const t = this.teamByCode(code);
          groups[m.group_name][code] = { code, name: t.name, flag: t.flag, pts: 0, pj: 0, gf: 0, ga: 0, gd: 0 };
        }
      });
      if (m.home_score != null && m.away_score != null && m.home_team && m.away_team) {
        const h = groups[m.group_name][m.home_team];
        const a = groups[m.group_name][m.away_team];
        if (h && a) {
          h.pj++; a.pj++;
          h.gf += m.home_score; h.ga += m.away_score;
          a.gf += m.away_score; a.ga += m.home_score;
          h.gd = h.gf - h.ga; a.gd = a.gf - a.ga;
          if (m.home_score > m.away_score) { h.pts += 3; }
          else if (m.away_score > m.home_score) { a.pts += 3; }
          else { h.pts += 1; a.pts += 1; }
        }
      }
    });

    const sortedGroups = {};
    for (const [g, teams] of Object.entries(groups)) {
      sortedGroups[g] = Object.values(teams).sort((a, b) =>
        b.pts !== a.pts ? b.pts - a.pts :
        b.gd !== a.gd ? b.gd - a.gd :
        b.gf - a.gf
      );
    }

    const koMatches = this.matches.filter(m => m.phase !== 'groups');
    const matchById = Object.fromEntries(koMatches.map(m => [m.id, m]));

    const groupColors = {
      A:'#1a5c8a', B:'#6b21a8', C:'#166534', D:'#991b1b',
      E:'#0f766e', F:'#92400e', G:'#5b21b6', H:'#1e40af',
      I:'#9d174d', J:'#065f46', K:'#7c2d12', L:'#164e63'
    };

    // ── Tarjeta de partido para bracket
    const matchCard = (m) => {
      if (!m) return `<div class="bk-match empty">?</div>`;
      const home = m.home_team ? this.teamByCode(m.home_team) : null;
      const away = m.away_team ? this.teamByCode(m.away_team) : null;
      const hasResult = m.home_score != null;
      const wc = m.winner;
      return `<div class="bk-match${hasResult ? ' played' : ''}">
        <div class="bk-team ${wc === m.home_team ? 'winner' : hasResult ? 'loser' : ''}">
          <span class="bk-flag">${home?.flag || '?'}</span>
          <span class="bk-name">${home?.name || '?'}</span>
          ${hasResult ? `<span class="bk-score">${m.home_score}${m.pen_home != null ? `(${m.pen_home})` : ''}</span>` : ''}
        </div>
        <div class="bk-team ${wc === m.away_team ? 'winner' : hasResult ? 'loser' : ''}">
          <span class="bk-flag">${away?.flag || '?'}</span>
          <span class="bk-name">${away?.name || '?'}</span>
          ${hasResult ? `<span class="bk-score">${m.away_score}${m.pen_away != null ? `(${m.pen_away})` : ''}</span>` : ''}
        </div>
      </div>`;
    };

    // ── Grupos HTML
    const groupsHtml = Object.keys(sortedGroups).sort().map(g => {
      const standing = sortedGroups[g];
      const color = groupColors[g] || '#C9A84C';
      return `
        <div class="fixture-group-card" style="border-left:3px solid ${color}">
          <div class="fixture-group-title" style="color:${color}">Grupo ${g}</div>
          <table class="fixture-group-table">
            <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>Pts</th><th>GD</th></tr></thead>
            <tbody>
              ${standing.map((t, i) => `
                <tr class="${i < 2 ? 'classified' : ''}">
                  <td style="font-size:11px;color:var(--color-text-muted)">${i+1}</td>
                  <td><span style="margin-right:4px">${t.flag}</span>${t.name}</td>
                  <td style="text-align:center">${t.pj}</td>
                  <td style="text-align:center;font-weight:${i<2?'700':'400'}">${t.pts}</td>
                  <td style="text-align:center">${t.gd > 0 ? '+' : ''}${t.gd}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    }).join('');

    // ── Bracket mobile (lista vertical)
    const mobilePhasesAll = [
      { label: 'Dieciseisavos', ids: ['R32-1','R32-2','R32-3','R32-4','R32-5','R32-6','R32-7','R32-8','R32-9','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16'] },
      { label: 'Octavos de final', ids: ['QF-1','QF-2','QF-3','QF-4','QF-5','QF-6','QF-7','QF-8'] },
      { label: 'Cuartos de final', ids: ['SF-1','SF-2','SF-3','SF-4'] },
      { label: 'Semifinales',   ids: ['SF-5','SF-6'] },
      { label: 'Tercer puesto', ids: ['TP'] },
      { label: 'Gran Final',    ids: ['FINAL'] }
    ];
    const bracketMobileHtml = mobilePhasesAll.map(phase => {
      const ms = phase.ids.map(id => matchById[id]).filter(Boolean);
      if (!ms.length) return '';
      return `<div style="margin-bottom:16px">
        <div class="fixture-group-title" style="color:var(--color-primary);margin-bottom:8px">${phase.label}</div>
        ${ms.map(m => matchCard(m)).join('')}
      </div>`;
    }).join('');

    // ── Bracket desktop tipo pathway (afuera → adentro)
    // Pathway 1: R32-1..R32-8 → QF-1..QF-4 → SF-1,SF-2 → SF-5 → FINAL
    // Pathway 2: R32-9..R32-16 → QF-5..QF-8 → SF-3,SF-4 → SF-6 → FINAL
    const p1r32 = ['R32-1','R32-2','R32-3','R32-4','R32-5','R32-6','R32-7','R32-8'].map(id => matchById[id] || null);
    const p1r16 = ['QF-1','QF-2','QF-3','QF-4'].map(id => matchById[id] || null);
    const p1qf  = ['SF-1','SF-2'].map(id => matchById[id] || null);
    const p1sf  = matchById['SF-5'] || null;

    const p2r32 = ['R32-9','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16'].map(id => matchById[id] || null);
    const p2r16 = ['QF-5','QF-6','QF-7','QF-8'].map(id => matchById[id] || null);
    const p2qf  = ['SF-3','SF-4'].map(id => matchById[id] || null);
    const p2sf  = matchById['SF-6'] || null;

    const final  = matchById['FINAL'] || null;
    const third  = matchById['TP'] || null;

    const col = (matches, label) => `
      <div class="pw-col">
        <div class="pw-col-label">${label}</div>
        <div class="pw-col-matches">
          ${matches.map(m => matchCard(m)).join('')}
        </div>
      </div>`;

    const bracketDesktopHtml = `
      <div class="pw-bracket">
        <!-- Pathway 1 izquierda -->
        <div class="pw-side pw-left">
          ${col(p1r32, 'Dieciseisavos')}
          ${col(p1r16, 'Octavos')}
          ${col(p1qf,  'Cuartos')}
          ${col([p1sf], 'Semis')}
        </div>
        <!-- Centro: Final + 3er puesto -->
        <div class="pw-center">
          <div class="pw-center-label">Gran Final</div>
          ${matchCard(final)}
          <div class="pw-center-label" style="margin-top:16px">3er Puesto</div>
          ${matchCard(third)}
        </div>
        <!-- Pathway 2 derecha -->
        <div class="pw-side pw-right">
          ${col([p2sf], 'Semis')}
          ${col(p2qf,  'Cuartos')}
          ${col(p2r16, 'Octavos')}
          ${col(p2r32, 'Dieciseisavos')}
        </div>
      </div>`;

    const CSS = `
      <style>
        /* ── Subpestañas fixture ── */
        .fixture-tabs { display:flex; gap:4px; margin-bottom:1rem; }
        .fixture-tab {
          padding:7px 18px; border-radius:var(--radius-md);
          font-size:13px; font-weight:600; cursor:pointer;
          border:1px solid var(--color-border);
          background:transparent; color:var(--color-text-muted);
          font-family:inherit; transition:all 0.2s;
        }
        .fixture-tab.active {
          background:var(--gold-gradient); color:#1A1200; border-color:transparent;
          box-shadow:0 2px 8px rgba(201,168,76,0.25);
        }
        .fixture-tab-content { display:none; }
        .fixture-tab-content.active { display:block; }

        /* ── Grupos grid ── */
        .fixture-groups-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        @media(max-width:500px){ .fixture-groups-grid{ grid-template-columns:1fr; } }
        .fixture-group-card {
          background:var(--color-surface); border:1px solid var(--color-border);
          border-radius:var(--radius-md); padding:8px;
          transition:transform 0.2s, box-shadow 0.2s;
        }
        .fixture-group-card:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.3); }
        .fixture-group-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
        .fixture-group-table { width:100%; border-collapse:collapse; font-size:12px; }
        .fixture-group-table th { font-size:10px; color:var(--color-text-muted); font-weight:500; padding:2px 4px; text-align:left; }
        .fixture-group-table td { padding:3px 4px; color:var(--color-text); white-space:nowrap; }
        .fixture-group-table tr.classified { background:rgba(255,255,255,0.04); }
        .fixture-group-table tr.classified td:nth-child(2) { font-weight:600; }

        /* ── Tarjeta de partido bracket ── */
        .bk-match {
          background:var(--color-surface); border:1px solid var(--color-border);
          border-radius:var(--radius-md); overflow:hidden;
          transition:border-color 0.2s; margin-bottom:4px;
        }
        .bk-match.played { border-color:rgba(201,168,76,0.35); }
        .bk-match.empty { padding:8px; font-size:11px; color:var(--color-text-muted); font-style:italic; text-align:center; }
        .bk-team { display:flex; align-items:center; gap:5px; padding:4px 7px; font-size:11px; border-bottom:1px solid var(--color-border); }
        .bk-team:last-child { border-bottom:none; }
        .bk-team.winner { background:rgba(201,168,76,0.1); font-weight:700; color:var(--color-primary); }
        .bk-team.loser { opacity:0.4; }
        .bk-flag { font-size:13px; flex-shrink:0; }
        .bk-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bk-score { font-weight:700; font-size:12px; flex-shrink:0; }

        /* ── Bracket mobile ── */
        .bracket-mobile { display:block; }
        @media(min-width:900px){ .bracket-mobile{ display:none; } }

        /* ── Bracket pathway desktop ── */
        .pw-bracket {
          display:none;
          gap:0;
          min-height:600px;
          align-items:stretch;
        }
        @media(min-width:900px){
          .pw-bracket { display:flex; overflow-x:auto; }
        }
        .pw-side {
          display:flex;
          flex-direction:row;
          gap:6px;
          flex:1;
        }
        .pw-left { justify-content:flex-start; }
        .pw-right { justify-content:flex-end; }
        .pw-col {
          display:flex; flex-direction:column;
          min-width:140px; flex-shrink:0;
        }
        .pw-col-label {
          font-size:10px; font-weight:700; color:var(--color-primary);
          text-transform:uppercase; letter-spacing:0.5px;
          text-align:center; padding:4px 0 8px; flex-shrink:0;
        }
        .pw-col-matches {
          display:flex; flex-direction:column;
          justify-content:space-around; flex:1; gap:4px;
        }
        .pw-center {
          display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          min-width:160px; flex-shrink:0;
          padding:0 8px;
          border-left:1px solid var(--color-border);
          border-right:1px solid var(--color-border);
        }
        .pw-center-label {
          font-size:11px; font-weight:700; color:var(--color-primary);
          text-transform:uppercase; letter-spacing:0.5px;
          text-align:center; margin-bottom:8px;
        }
        .pw-center .bk-match { width:100%; }

        /* Bracket usa ancho completo de pantalla */
        @media(min-width:900px){
          .pw-bracket-wrapper {
            width: 100vw;
            margin-left: calc(-1 * (100vw - 100%) / 2);
            overflow-x: auto;
            padding: 0 16px;
          }
        }
      </style>`;

    main.innerHTML = `
      <h2>Fixture · FIFA World Cup 2026™</h2>
      ${CSS}
      <div class="fixture-tabs">
        <button class="fixture-tab ${this._fixtureTab === 'groups' ? 'active' : ''}" data-tab="groups">Fase de Grupos</button>
        <button class="fixture-tab ${this._fixtureTab === 'finals' ? 'active' : ''}" data-tab="finals">Eliminatorias</button>
      </div>
      <div class="fixture-tab-content ${this._fixtureTab === 'groups' ? 'active' : ''}" id="ftab-groups">
        <div class="fixture-groups-grid">${groupsHtml}</div>
      </div>
      <div class="fixture-tab-content ${this._fixtureTab === 'finals' ? 'active' : ''}" id="ftab-finals">
        <div class="bracket-mobile">${bracketMobileHtml}</div>
        <div class="pw-bracket-wrapper">${bracketDesktopHtml}</div>
      </div>
    `;

    // Eventos de subpestañas
    main.querySelectorAll('.fixture-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._fixtureTab = btn.dataset.tab;
        main.querySelectorAll('.fixture-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === this._fixtureTab));
        main.querySelectorAll('.fixture-tab-content').forEach(c => c.classList.remove('active'));
        main.getElementById ? null : main.querySelector(`#ftab-${this._fixtureTab}`).classList.add('active');
        document.getElementById(`ftab-${this._fixtureTab}`).classList.add('active');
      });
    });
  },

  // ── HOY ────────────────────────────────────────────────────────────────────

  async renderToday(main) {
    main.innerHTML = '<h2>Partidos de hoy</h2><div style="color:var(--color-text-muted)">Cargando...</div>';
    try {
      const data = await this.api('/daily-bets/today');
      if (!data.matches.length) {
        main.innerHTML = `<h2>Partidos de hoy</h2><div class="empty-state"><div class="empty-state-icon">⚽</div><p>No hay partidos hoy (${data.date} hora Ecuador).</p></div>`;
        return;
      }

      const resultsMap = {};
      await Promise.all(
        data.matches
          .filter(m => m.home_score != null)
          .map(async m => {
            try {
              resultsMap[m.id] = await this.api(`/daily-bets/results/${m.id}`);
            } catch (e) {}
          })
      );

      main.innerHTML = `
        <h2>Partidos de hoy · ${data.date}</h2>
        <div class="notice">Apuesta $2 por partido. Quienes aciertan el marcador exacto se reparten el pote. Cierra <strong>5 minutos</strong> antes de cada partido.</div>
        ${data.matches.map(m => this.renderDailyMatch(m, resultsMap[m.id])).join('')}
      `;
      main.querySelectorAll('.daily-bet-form').forEach(form => {
        form.addEventListener('submit', (e) => this.saveDailyBet(e, form));
      });
    } catch (e) {
      main.innerHTML = `<h2>Partidos de hoy</h2><div class="empty-state">Error: ${e.message}</div>`;
    }
  },

  renderDailyMatch(m, result) {
    const locked = m.locked || m.home_score != null;
    const myBet = m.myBet || {};
    const timeStr = m.match_time ? `${m.match_time} (ECU)` : '';
    const finished = m.home_score != null;

    let resultBlock = '';
    if (finished && result && result.status === 'finished') {
      const { potType, totalPot, perWinner, winners, myResult, carried } = result;

      let potMsg = '', potStyle = '';
      if (carried) {
        potMsg = `⏩ Nadie acertó — el pote de <strong>$${totalPot.toFixed(2)}</strong> se acumula al siguiente partido`;
        potStyle = 'color:var(--color-text-muted)';
      } else if (potType === 'exacto') {
        potMsg = `🎯 Marcador exacto — ${winners.length} ganador${winners.length > 1 ? 'es' : ''} se reparten <strong>$${totalPot.toFixed(2)}</strong> (<strong>$${perWinner}</strong> c/u)`;
        potStyle = 'color:var(--color-success)';
      } else if (potType === 'ganador') {
        potMsg = `✅ Ganador correcto — ${winners.length} ganador${winners.length > 1 ? 'es' : ''} se reparten <strong>$${totalPot.toFixed(2)}</strong> (<strong>$${perWinner}</strong> c/u)`;
        potStyle = 'color:var(--color-success)';
      }

      let myResultBlock = '';
      if (myResult) {
        if (myResult.won) {
          myResultBlock = `<div style="margin-top:6px;padding:8px 12px;background:rgba(34,197,94,0.1);border-radius:8px;border:1px solid rgba(34,197,94,0.3);font-size:13px;font-weight:600;color:var(--color-success)">
            🏆 ¡Ganaste! Tu pronóstico: ${myResult.pred} · Premio: <strong>$${myResult.prize}</strong>
          </div>`;
        } else {
          myResultBlock = `<div style="margin-top:6px;padding:8px 12px;background:var(--color-background-secondary);border-radius:8px;font-size:13px;color:var(--color-text-muted)">
            Tu pronóstico: ${myResult.pred} · No ganaste esta vez
          </div>`;
        }
      }

      const winnersBlock = winners.length > 0 ? `
        <div style="margin-top:6px;font-size:12px;color:var(--color-text-muted)">
          Ganadores: ${winners.map(w => `<strong>${w.display_name}</strong> (${w.pred})`).join(', ')}
        </div>` : '';

      resultBlock = `
        <div style="margin-top:10px;padding:10px 12px;background:var(--color-background-secondary);border-radius:8px;border-top:2px solid var(--color-border-secondary)">
          <div style="font-size:13px;${potStyle}">${potMsg}</div>
          ${winnersBlock}
          ${myResultBlock}
        </div>
      `;
    }

    return `
      <form class="card daily-bet-form" data-match="${m.id}">
        <div class="match-grid">
          <div class="team-cell">
            <span class="team-flag">${m.home_flag || '?'}</span>
            <span class="team-name">${m.home_name || m.home_team}</span>
          </div>
          <div class="score-inputs">
            <input type="number" min="0" max="20" class="score-input" name="home" value="${myBet.pred_home ?? ''}" ${locked ? 'disabled' : ''} placeholder="0">
            <span class="score-separator">—</span>
            <input type="number" min="0" max="20" class="score-input" name="away" value="${myBet.pred_away ?? ''}" ${locked ? 'disabled' : ''} placeholder="0">
          </div>
          <div class="team-cell away">
            <span class="team-name">${m.away_name || m.away_team}</span>
            <span class="team-flag">${m.away_flag || '?'}</span>
          </div>
        </div>
        <div class="match-meta">
          <span>${timeStr}</span>
          ${finished ? `<span class="match-result-badge correct">Real: ${m.home_score}–${m.away_score}</span>` : ''}
        </div>
        <div class="bet-bar">
          <span style="font-size:13px;color:var(--color-text-muted)">Apuesta: $2</span>
          <input type="hidden" name="bet" value="2">
          <span style="flex:1"></span>
          <span style="font-size:12px;color:var(--color-text-muted)">Pote: $${(m.pot||0).toFixed(0)} · ${m.totalBets} apuestas</span>
          ${locked
            ? `<span class="chip ${finished ? 'paid' : 'unpaid'}">${finished ? 'Terminado' : 'Cerrado'}</span>`
            : '<button type="submit" class="btn-sm btn-accent">Apostar</button>'}
        </div>
        ${resultBlock}
        <div class="success-msg" data-msg></div>
      </form>
    `;
  },

  async saveDailyBet(e, form) {
    e.preventDefault();
    const msg = form.querySelector('[data-msg]');
    const home = form.querySelector('[name=home]').value;
    const away = form.querySelector('[name=away]').value;
    if (home === '' || away === '') {
      msg.textContent = 'Ingresa ambos marcadores.';
      msg.style.color = 'var(--color-danger)';
      return;
    }
    try {
      await this.api('/daily-bets', {
        method: 'POST',
        body: JSON.stringify({ match_id: form.dataset.match, pred_home: parseInt(home), pred_away: parseInt(away), bet_amount: 2 })
      });
      msg.textContent = 'Apuesta registrada por $2.';
      msg.style.color = 'var(--color-success)';
      setTimeout(() => { msg.textContent = ''; this.renderView(); }, 2000);
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = 'var(--color-danger)';
    }
  },

  // ── GRUPOS ──────────────────────────────────────────────────────────────────

  renderGroups(main) {
    const groups = {};
    this.matches.filter(m => m.phase === 'groups').forEach(m => {
      if (!groups[m.group_name]) groups[m.group_name] = [];
      groups[m.group_name].push(m);
    });

    const locked = this.lockStatus.polla1Locked || this.lockStatus.locked;
    const lockMsg = locked
      ? `<div class="notice" style="background:rgba(224,82,82,0.08);border-color:rgba(224,82,82,0.3);color:var(--color-danger)">Las predicciones de grupos están cerradas.</div>`
      : `<div class="notice">Se cierran <strong>5 minutos antes del primer partido</strong> (${this.lockStatus.lockTimeEcuador || ''} hora Ecuador).</div>`;

    main.innerHTML = `
      <h2>Fase de grupos</h2>
      ${lockMsg}
      ${Object.keys(groups).sort().map(g => `
        <div class="group-header"><span class="group-badge" data-group="${g}">Grupo ${g}</span></div>
        ${groups[g].map(m => this.renderGroupMatchCard(m, locked)).join('')}
      `).join('')}
      ${!locked ? `<div class="save-bar">
        <span class="success-msg" id="groups-save-msg"></span>
        <button class="btn-primary" style="width:auto;margin:0" onclick="app.saveAllGroupPreds()">Guardar todas</button>
      </div>` : ''}
    `;

    if (!locked) {
      main.querySelectorAll('.score-input[data-match]').forEach(i => {
        i.addEventListener('blur', () => this.autoSavePrediction(i));
      });
    }
  },

  renderGroupMatchCard(m, locked) {
    const p = this.predictions[m.id] || {};
    const timeStr = m.match_time ? `${m.match_date} · ${m.match_time} (ECU)` : m.match_date || '';
    return `
      <div class="match-row ${locked ? 'locked' : ''}" data-group="${m.group_name}">
        <div class="match-grid">
          <div class="team-cell">
            <span class="team-flag">${m.home_flag || '?'}</span>
            <span class="team-name">${m.home_name || m.home_team}</span>
          </div>
          <div class="score-inputs">
            <input type="number" min="0" max="20" class="score-input" data-match="${m.id}" data-field="home" value="${p.pred_home ?? ''}" ${locked ? 'disabled' : ''} placeholder="—">
            <span class="score-separator">—</span>
            <input type="number" min="0" max="20" class="score-input" data-match="${m.id}" data-field="away" value="${p.pred_away ?? ''}" ${locked ? 'disabled' : ''} placeholder="—">
          </div>
          <div class="team-cell away">
            <span class="team-name">${m.away_name || m.away_team}</span>
            <span class="team-flag">${m.away_flag || '?'}</span>
          </div>
        </div>
        <div class="match-meta">
          <span>${timeStr}</span>
          ${m.home_score != null ? `<span class="match-result-badge correct">Real: ${m.home_score}–${m.away_score}</span>` : ''}
        </div>
      </div>
    `;
  },

  async autoSavePrediction(input) {
    const matchId = input.dataset.match;
    const field = input.dataset.field;
    const value = input.value === '' ? null : parseInt(input.value);
    if (!this.predictions[matchId]) this.predictions[matchId] = { match_id: matchId };
    this.predictions[matchId]['pred_' + field] = value;
    const p = this.predictions[matchId];
    if (p.pred_home == null || p.pred_away == null) return;
    try {
      await this.api('/predictions', {
        method: 'POST',
        body: JSON.stringify({ match_id: matchId, pred_home: p.pred_home, pred_away: p.pred_away })
      });
      this.koTeams = await this.api('/predictions/ko-teams');
      input.style.borderColor = 'var(--color-success)';
      setTimeout(() => input.style.borderColor = '', 800);
    } catch (e) { input.style.borderColor = 'var(--color-danger)'; }
  },

  async saveAllGroupPreds() {
    const batch = {};
    document.querySelectorAll('.score-input[data-match]').forEach(i => {
      const mid = i.dataset.match;
      if (!batch[mid]) batch[mid] = { match_id: mid };
      batch[mid]['pred_' + i.dataset.field] = i.value === '' ? null : parseInt(i.value);
    });
    const toSave = Object.values(batch).filter(p => p.pred_home != null && p.pred_away != null);
    const msg = document.getElementById('groups-save-msg');
    try {
      await this.api('/predictions/batch', { method: 'POST', body: JSON.stringify({ predictions: toSave }) });
      this.koTeams = await this.api('/predictions/ko-teams');
      msg.textContent = `✓ ${toSave.length} predicciones guardadas.`;
      msg.style.color = 'var(--color-success)';
      document.querySelectorAll('.match-row').forEach(row => {
        row.classList.add('save-flash');
        setTimeout(() => row.classList.remove('save-flash'), 700);
      });
      setTimeout(() => { msg.textContent = ''; msg.style.color = ''; }, 3000);
    } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--color-danger)'; }
  },

  // ── ELIMINATORIAS ───────────────────────────────────────────────────────────

  async renderKnockout(main) {
    main.innerHTML = `<h2>Eliminatorias</h2><div style="color:var(--color-text-muted);font-size:14px">Cargando...</div>`;

    const locked = this.lockStatus.polla2Locked || false;
    const koMatches = this.matches.filter(m => m.phase !== 'groups');

    let html = `<h2>Eliminatorias</h2>`;
    html += `<div class="notice">Los equipos se cargan automáticamente con los <strong>resultados reales</strong> de la fase de grupos. Ingresa el marcador de cada partido. Si hay empate aparecerán los campos de penales.${!locked && this.lockStatus.lockTimePolla2Ecuador ? ` Las predicciones se cierran <strong>5 minutos antes del primer partido de dieciseisavos</strong> (${this.lockStatus.lockTimePolla2Ecuador} hora Ecuador).` : ''}</div>`;
    if (locked) {
      html += `<div class="notice" style="background:rgba(224,82,82,0.08);border-color:rgba(224,82,82,0.3);color:var(--color-danger)">Las predicciones de eliminatorias están cerradas.</div>`;
    }

    const phases = [
      { key: 'r16',   label: 'Dieciseisavos de final',  filter: m => m.phase === 'r16' },
      { key: 'qf',    label: 'Octavos de final',         filter: m => m.phase === 'qf' },
      { key: 'sf-qf', label: 'Cuartos de final',         filter: m => m.phase === 'sf' && ['SF-1','SF-2','SF-3','SF-4'].includes(m.id) },
      { key: 'sf-sf', label: 'Semifinales',              filter: m => m.phase === 'sf' && ['SF-5','SF-6'].includes(m.id) },
      { key: 'tp',    label: 'Tercer puesto',            filter: m => m.phase === 'tp' },
      { key: 'final', label: 'Gran final',               filter: m => m.phase === 'final' }
    ];

    phases.forEach(phase => {
      const matches = koMatches.filter(phase.filter);
      if (!matches.length) return;
      html += `<div class="group-header"><span class="group-badge">${phase.label}</span></div>`;

      matches.forEach(m => {
        const pred = this.predictions[m.id] || {};
        // Usar equipos REALES desde m.home_team/away_team (cargados por admin)
        const homeTeam = m.home_team ? this.teamByCode(m.home_team) : null;
        const awayTeam = m.away_team ? this.teamByCode(m.away_team) : null;
        const timeStr = m.match_time ? `${m.match_date} · ${m.match_time} (ECU)` : m.match_date || '';
        const predHome = pred.pred_home ?? '';
        const predAway = pred.pred_away ?? '';
        const predPenHome = pred.pred_pen_home ?? '';
        const predPenAway = pred.pred_pen_away ?? '';
        const isDraw = predHome !== '' && predAway !== '' && parseInt(predHome) === parseInt(predAway);

        let autoWinner = null;
        if (predHome !== '' && predAway !== '') {
          const h = parseInt(predHome), a = parseInt(predAway);
          if (h > a) autoWinner = homeTeam;
          else if (a > h) autoWinner = awayTeam;
          else if (predPenHome !== '' && predPenAway !== '') {
            const ph = parseInt(predPenHome), pa = parseInt(predPenAway);
            if (ph > pa) autoWinner = homeTeam;
            else if (pa > ph) autoWinner = awayTeam;
          }
        }

        html += `
          <div class="card" style="margin-bottom:8px"
            data-ko-match="${m.id}"
            data-home-code="${homeTeam?.code || ''}"
            data-away-code="${awayTeam?.code || ''}">
            <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">${m.label || ''} · ${timeStr}</div>
            ${homeTeam || awayTeam ? `
            <div class="match-grid" style="margin-bottom:${isDraw ? '8px' : '0'}">
              <div class="team-cell">
                <span class="team-flag">${homeTeam?.flag || '?'}</span>
                <span class="team-name">${homeTeam?.name || '?'}</span>
              </div>
              <div class="score-inputs">
                <input type="number" min="0" max="20" class="score-input ko-score" data-match="${m.id}" data-field="home" value="${predHome}" ${locked ? 'disabled' : ''} placeholder="—">
                <span class="score-separator">—</span>
                <input type="number" min="0" max="20" class="score-input ko-score" data-match="${m.id}" data-field="away" value="${predAway}" ${locked ? 'disabled' : ''} placeholder="—">
              </div>
              <div class="team-cell away">
                <span class="team-name">${awayTeam?.name || '?'}</span>
                <span class="team-flag">${awayTeam?.flag || '?'}</span>
              </div>
            </div>` : `
            <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:8px;font-style:italic">Completa rondas anteriores para ver los equipos</div>`}
            <div class="ko-pen-section" data-match="${m.id}" style="${isDraw ? '' : 'display:none'}">
              <div style="font-size:12px;color:var(--color-text-muted);margin:8px 0 6px">⚖️ Empate — ingresa el marcador en penales:</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:13px;font-weight:500">${homeTeam?.flag || ''} ${homeTeam?.name || ''}</span>
                <input type="number" min="0" max="30" class="score-input ko-pen" data-match="${m.id}" data-field="pen_home" value="${predPenHome}" ${locked ? 'disabled' : ''} placeholder="—" style="width:44px;text-align:center">
                <span class="score-separator">—</span>
                <input type="number" min="0" max="30" class="score-input ko-pen" data-match="${m.id}" data-field="pen_away" value="${predPenAway}" ${locked ? 'disabled' : ''} placeholder="—" style="width:44px;text-align:center">
                <span style="font-size:13px;font-weight:500">${awayTeam?.name || ''} ${awayTeam?.flag || ''}</span>
              </div>
            </div>
            ${autoWinner ? `<div style="margin-top:8px;font-size:12px;color:var(--color-success);font-weight:500">✓ Avanza: ${autoWinner.flag || ''} ${autoWinner.name}${isDraw ? ' (por penales)' : ''}</div>` : (isDraw && (predPenHome === '' || predPenAway === '') ? `<div style="margin-top:8px;font-size:12px;color:var(--color-accent)">⚠️ Ingresa el marcador de penales para definir quién avanza</div>` : '')}
            ${m.home_score != null ? `
            <div style="margin-top:8px;font-size:12px;color:var(--color-text-muted);border-top:1px solid var(--color-border);padding-top:8px">
              Resultado real: <strong>${m.home_score}–${m.away_score}</strong>
              ${m.pen_home != null ? `· Penales: <strong>${m.pen_home}–${m.pen_away}</strong>` : ''}
              ${m.winner ? `· Ganador: <strong>${this.teamByCode(m.winner).flag || ''} ${this.teamByCode(m.winner).name}</strong>` : ''}
            </div>` : ''}
          </div>
        `;
      });
    });

    html += `${!locked ? `<div class="save-bar">
      <span class="success-msg" id="ko-save-msg"></span>
      <button class="btn-primary" style="width:auto;margin:0" onclick="app.saveAllKOPreds()">Guardar todas</button>
    </div>` : ''}`;

    main.innerHTML = html;

    if (!locked) {
      main.querySelectorAll('.ko-score').forEach(input => {
        input.addEventListener('input', () => {
          const matchId = input.dataset.match;
          const card = main.querySelector(`[data-ko-match="${matchId}"]`);
          if (!card) return;
          const hVal = card.querySelector('.ko-score[data-field="home"]')?.value;
          const aVal = card.querySelector('.ko-score[data-field="away"]')?.value;
          const penSection = card.querySelector('.ko-pen-section');
          if (!penSection) return;
          const drawNow = hVal !== '' && aVal !== '' && parseInt(hVal) === parseInt(aVal);
          penSection.style.display = drawNow ? '' : 'none';
          if (!drawNow) card.querySelectorAll('.ko-pen').forEach(p => { p.value = ''; });
        });
        input.addEventListener('blur', () => this.saveKOPrediction(input.dataset.match, main));
      });
      main.querySelectorAll('.ko-pen').forEach(input => {
        input.addEventListener('blur', () => this.saveKOPrediction(input.dataset.match, main));
      });
    }
  },

  async saveAllKOPreds() {
    const main = document.getElementById('main-content');
    const cards = main.querySelectorAll('[data-ko-match]');
    const msg = document.getElementById('ko-save-msg');
    let saved = 0;
    for (const card of cards) {
      const matchId = card.dataset.koMatch;
      if (matchId) { await this.saveKOPrediction(matchId, main); saved++; }
    }
    if (msg) {
      msg.textContent = `✓ ${saved} predicciones guardadas.`;
      msg.style.color = 'var(--color-success)';
      cards.forEach(card => {
        card.classList.add('save-flash');
        setTimeout(() => card.classList.remove('save-flash'), 700);
      });
      setTimeout(() => { msg.textContent = ''; msg.style.color = ''; }, 3000);
    }
  },

  async saveKOPrediction(matchId, main) {
    const card = main ? main.querySelector(`[data-ko-match="${matchId}"]`) : null;
    if (!card) return;
    const homeCode = card.dataset.homeCode || null;
    const awayCode = card.dataset.awayCode || null;
    const homeInput = card.querySelector('.ko-score[data-field="home"]');
    const awayInput = card.querySelector('.ko-score[data-field="away"]');
    const penHomeInput = card.querySelector('.ko-pen[data-field="pen_home"]');
    const penAwayInput = card.querySelector('.ko-pen[data-field="pen_away"]');
    const predHome = homeInput?.value !== '' ? parseInt(homeInput.value) : null;
    const predAway = awayInput?.value !== '' ? parseInt(awayInput.value) : null;
    const predPenHome = penHomeInput?.value !== '' ? parseInt(penHomeInput.value) : null;
    const predPenAway = penAwayInput?.value !== '' ? parseInt(penAwayInput.value) : null;
    let effectiveWinner = null;
    if (predHome !== null && predAway !== null) {
      if (predHome > predAway) effectiveWinner = homeCode;
      else if (predAway > predHome) effectiveWinner = awayCode;
      else if (predPenHome !== null && predPenAway !== null) {
        if (predPenHome > predPenAway) effectiveWinner = homeCode;
        else if (predPenAway > predPenHome) effectiveWinner = awayCode;
      }
    }
    const body = { match_id: matchId, pred_home: predHome, pred_away: predAway, pred_winner: effectiveWinner, pred_pen_home: predPenHome, pred_pen_away: predPenAway };
    try {
      await this.api('/predictions', { method: 'POST', body: JSON.stringify(body) });
      this.predictions[matchId] = { ...this.predictions[matchId], ...body };
      this.koTeams = await this.api('/predictions/ko-teams');
      if (homeInput) { homeInput.style.borderColor = 'var(--color-success)'; setTimeout(() => homeInput.style.borderColor = '', 800); }
    } catch (e) {
      if (homeInput) homeInput.style.borderColor = 'var(--color-danger)';
    }
  },

  // ── PODIO ───────────────────────────────────────────────────────────────────

  async renderPodium(main) {
    // Equipos reales del admin (no de pronósticos en cascada)
    const finalMatch = this.matches.find(m => m.id === 'FINAL');
    const tpMatch = this.matches.find(m => m.id === 'TP');

    const finalPred = this.predictions['FINAL'] || {};
    const tpPred = this.predictions['TP'] || {};

    const finalHome = finalMatch?.home_team ? this.teamByCode(finalMatch.home_team) : null;
    const finalAway = finalMatch?.away_team ? this.teamByCode(finalMatch.away_team) : null;
    const tpHome = tpMatch?.home_team ? this.teamByCode(tpMatch.home_team) : null;
    const tpAway = tpMatch?.away_team ? this.teamByCode(tpMatch.away_team) : null;

    let champion = null, runnerUp = null;
    if (finalPred.pred_winner && (finalHome || finalAway)) {
      const wCode = finalPred.pred_winner;
      champion = finalHome?.code === wCode ? finalHome : finalAway;
      runnerUp = finalHome?.code === wCode ? finalAway : finalHome;
    }
    let thirdPlace = null;
    if (tpPred.pred_winner && (tpHome || tpAway)) {
      const wCode = tpPred.pred_winner;
      thirdPlace = tpHome?.code === wCode ? tpHome : tpAway;
    }

    const teamCard = (medal, label, team, hint) => team ? `
      <div class="podium-slot">
        <span class="podium-medal">${medal}</span>
        <span class="podium-label">${label}</span>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:15px;font-weight:500">
          <span style="font-size:22px">${team.flag || ''}</span><span>${team.name}</span>
        </div>
      </div>` : `
      <div class="podium-slot">
        <span class="podium-medal">${medal}</span>
        <span class="podium-label">${label}</span>
        <div style="padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:13px;color:var(--color-text-muted);font-style:italic">${hint}</div>
      </div>`;

    main.innerHTML = `
      <h2>Podio final</h2>
      <div class="notice">El podio se determina automáticamente según tus pronósticos de la <strong>Gran Final</strong> y el partido de <strong>Tercer puesto</strong>. Completa esos partidos en la sección Eliminatorias.<br><br>
        🥇 Campeón: <strong>15 pts</strong> · 🥈 Subcampeón: <strong>10 pts</strong> · 🥉 Tercer lugar: <strong>6 pts</strong>
      </div>
      <div class="card">
        ${teamCard('🥇', 'Campeón', champion, 'Pronostica la Gran Final en Eliminatorias')}
        ${teamCard('🥈', 'Subcampeón', runnerUp, 'Pronostica la Gran Final en Eliminatorias')}
        ${teamCard('🥉', 'Tercer lugar', thirdPlace, 'Pronostica el Tercer puesto en Eliminatorias')}
      </div>
    `;
  },

  // ── MINI-POLLAS ─────────────────────────────────────────────────────────────

  async renderMiniPollas(main) {
    main.innerHTML = `<h2>Mini-Pollas</h2><div style="color:var(--color-text-muted)">Cargando...</div>`;
    try {
      const status = await this.api('/mini-polla/status');
      const phaseIcons = { r16: '⚽', qf: '🏅', sf_qf: '🏆', sf_sf: '🌟' };

      let html = `<h2>Mini-Pollas</h2>
        <div class="notice">Pollas independientes por fase eliminatoria. Puedes unirte aunque no hayas participado en la polla general. Cada una tiene su propio pozo y ranking. Reparto: <strong>70% primero · 30% segundo</strong>.</div>`;

      for (const [phase, info] of Object.entries(status)) {
        const statusLabels = {
          upcoming: { text: 'Próximamente', color: 'var(--color-text-muted)', chip: 'unpaid' },
          open:     { text: 'Abierta',      color: 'var(--color-success)',    chip: 'paid' },
          locked:   { text: 'Cerrada',      color: 'var(--color-danger)',     chip: 'unpaid' },
          finished: { text: 'Finalizada',   color: 'var(--color-text-muted)', chip: 'default' }
        };
        const sl = statusLabels[info.status] || statusLabels.upcoming;

        html += `
          <div class="card" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div>
                <div style="font-size:16px;font-weight:600">${phaseIcons[phase]} ${info.label}</div>
                <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">
                  Inscripción: <strong>$${info.fee}</strong> · Inscritos: <strong>${info.totalRegistered}</strong> · Pozo: <strong>$${info.pot.toFixed(0)}</strong>
                </div>
              </div>
              <span class="chip ${sl.chip}" style="color:${sl.color}">${sl.text}</span>
            </div>`;

        if (info.status === 'upcoming') {
          html += `<div style="font-size:13px;color:var(--color-text-muted);font-style:italic">Se abre cuando termine la fase anterior.</div>`;
        } else if (info.status === 'open' && !info.registered) {
          html += `<button class="btn-primary" style="width:auto" onclick="app.registerMiniPolla('${phase}')">Inscribirme — $${info.fee}</button>`;
        } else if (info.status === 'open' && info.registered) {
          html += `<div style="font-size:13px;color:var(--color-success);margin-bottom:10px">✓ Estás inscrito${info.paid ? ' · Pago confirmado' : ' · Pendiente de pago'}</div>`;
          html += `<button class="btn-primary" style="width:auto" onclick="app.navigateMiniPolla('${phase}')">Ver partidos y pronosticar</button>`;
        } else if ((info.status === 'locked' || info.status === 'finished') && info.registered) {
          html += `<button class="btn-primary" style="width:auto;margin-right:8px" onclick="app.navigateMiniPolla('${phase}')">Ver mis pronósticos</button>`;
          html += `<button class="btn-sm btn-ghost" onclick="app.showMiniPollaLeaderboard('${phase}')">Ver ranking</button>`;
        } else if (info.status === 'locked' || info.status === 'finished') {
          html += `<div style="font-size:13px;color:var(--color-text-muted)">No participaste en esta mini-polla.</div>`;
          if (info.status === 'finished') {
            html += `<button class="btn-sm btn-ghost" style="margin-top:8px" onclick="app.showMiniPollaLeaderboard('${phase}')">Ver ranking</button>`;
          }
        }
        html += `</div>`;
      }
      main.innerHTML = html;
    } catch (e) {
      main.innerHTML = `<h2>Mini-Pollas</h2><div class="empty-state">Error: ${e.message}</div>`;
    }
  },

  async registerMiniPolla(phase) {
    try {
      await this.api(`/mini-polla/${phase}/register`, { method: 'POST' });
      this.navigate('minipollas');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async navigateMiniPolla(phase) {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div style="color:var(--color-text-muted)">Cargando partidos...</div>`;
    try {
      const matches = await this.api(`/mini-polla/${phase}/matches`);
      const status = await this.api('/mini-polla/status');
      const phaseInfo = status[phase];
      const locked = phaseInfo.status === 'locked' || phaseInfo.status === 'finished';
      const phaseLabels = { r16: 'Dieciseisavos de final', qf: 'Octavos de final', sf_qf: 'Cuartos de final', sf_sf: 'Semifinales + Final' };

      let html = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <button class="btn-sm btn-ghost" onclick="app.navigate('minipollas')">← Volver</button>
          <h2 style="margin:0">Mini-Polla: ${phaseLabels[phase]}</h2>
        </div>
        <div class="notice">Pronósticos independientes de la polla general. Los equipos son los clasificados reales.
          ${locked ? '<strong>Esta fase está cerrada.</strong>' : '<strong>Predice de arriba hacia abajo y guarda.</strong>'}
        </div>
      `;

      matches.forEach(m => {
        const pred = m.myPred || {};
        const predHome = pred.pred_home ?? '';
        const predAway = pred.pred_away ?? '';
        const predPenHome = pred.pred_pen_home ?? '';
        const predPenAway = pred.pred_pen_away ?? '';
        const isDraw = predHome !== '' && predAway !== '' && parseInt(predHome) === parseInt(predAway);
        const timeStr = m.match_time ? `${m.match_date} · ${m.match_time} (ECU)` : m.match_date || '';

        let autoWinner = null;
        if (predHome !== '' && predAway !== '') {
          const h = parseInt(predHome), a = parseInt(predAway);
          if (h > a) autoWinner = { flag: m.home_flag, name: m.home_name, code: m.home_team };
          else if (a > h) autoWinner = { flag: m.away_flag, name: m.away_name, code: m.away_team };
          else if (predPenHome !== '' && predPenAway !== '') {
            const ph = parseInt(predPenHome), pa = parseInt(predPenAway);
            if (ph > pa) autoWinner = { flag: m.home_flag, name: m.home_name, code: m.home_team };
            else if (pa > ph) autoWinner = { flag: m.away_flag, name: m.away_name, code: m.away_team };
          }
        }

        html += `
          <div class="card" style="margin-bottom:8px" data-mp-match="${m.id}" data-mp-phase="${phase}" data-home-code="${m.home_team || ''}" data-away-code="${m.away_team || ''}">
            <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">${m.label || ''} · ${timeStr}</div>
            ${m.home_team ? `
            <div class="match-grid" style="margin-bottom:${isDraw ? '8px' : '0'}">
              <div class="team-cell">
                <span class="team-flag">${m.home_flag || '?'}</span>
                <span class="team-name">${m.home_name || m.home_team}</span>
              </div>
              <div class="score-inputs">
                <input type="number" min="0" max="20" class="score-input mp-score" data-match="${m.id}" data-field="home" value="${predHome}" ${locked ? 'disabled' : ''} placeholder="—">
                <span class="score-separator">—</span>
                <input type="number" min="0" max="20" class="score-input mp-score" data-match="${m.id}" data-field="away" value="${predAway}" ${locked ? 'disabled' : ''} placeholder="—">
              </div>
              <div class="team-cell away">
                <span class="team-name">${m.away_name || m.away_team}</span>
                <span class="team-flag">${m.away_flag || '?'}</span>
              </div>
            </div>` : `<div style="font-size:13px;color:var(--color-text-muted);font-style:italic">Equipos pendientes</div>`}
            <div class="mp-pen-section" style="${isDraw ? '' : 'display:none'}">
              <div style="font-size:12px;color:var(--color-text-muted);margin:8px 0 6px">⚖️ Empate — ingresa el marcador en penales:</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:13px;font-weight:500">${m.home_flag || ''} ${m.home_name || ''}</span>
                <input type="number" min="0" max="30" class="score-input mp-pen" data-match="${m.id}" data-field="pen_home" value="${predPenHome}" ${locked ? 'disabled' : ''} placeholder="—" style="width:44px;text-align:center">
                <span class="score-separator">—</span>
                <input type="number" min="0" max="30" class="score-input mp-pen" data-match="${m.id}" data-field="pen_away" value="${predPenAway}" ${locked ? 'disabled' : ''} placeholder="—" style="width:44px;text-align:center">
                <span style="font-size:13px;font-weight:500">${m.away_name || ''} ${m.away_flag || ''}</span>
              </div>
            </div>
            ${autoWinner ? `<div style="margin-top:8px;font-size:12px;color:var(--color-success);font-weight:500">✓ Avanza: ${autoWinner.flag || ''} ${autoWinner.name}${isDraw ? ' (por penales)' : ''}</div>` : ''}
            ${m.home_score != null ? `
            <div style="margin-top:8px;font-size:12px;color:var(--color-text-muted);border-top:1px solid var(--color-border);padding-top:8px">
              Resultado real: <strong>${m.home_score}–${m.away_score}</strong>
              ${m.pen_home != null ? `· Penales: <strong>${m.pen_home}–${m.pen_away}</strong>` : ''}
            </div>` : ''}
          </div>
        `;
      });

      if (!locked) {
        html += `<div class="save-bar">
          <span class="success-msg" id="mp-save-msg"></span>
          <button class="btn-primary" style="width:auto;margin:0" onclick="app.saveAllMPPreds('${phase}')">Guardar todas</button>
        </div>`;
      }

      main.innerHTML = html;

      if (!locked) {
        main.querySelectorAll('.mp-score').forEach(input => {
          input.addEventListener('input', () => {
            const card = input.closest('[data-mp-match]');
            if (!card) return;
            const hVal = card.querySelector('.mp-score[data-field="home"]')?.value;
            const aVal = card.querySelector('.mp-score[data-field="away"]')?.value;
            const penSection = card.querySelector('.mp-pen-section');
            if (!penSection) return;
            const drawNow = hVal !== '' && aVal !== '' && parseInt(hVal) === parseInt(aVal);
            penSection.style.display = drawNow ? '' : 'none';
            if (!drawNow) card.querySelectorAll('.mp-pen').forEach(p => { p.value = ''; });
          });
          input.addEventListener('blur', () => this.saveMPPrediction(phase, input.dataset.match, main));
        });
        main.querySelectorAll('.mp-pen').forEach(input => {
          input.addEventListener('blur', () => this.saveMPPrediction(phase, input.dataset.match, main));
        });
      }
    } catch (e) {
      main.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  },

  async saveAllMPPreds(phase) {
    const main = document.getElementById('main-content');
    const cards = main.querySelectorAll('[data-mp-match]');
    const msg = document.getElementById('mp-save-msg');
    let saved = 0;
    for (const card of cards) {
      const matchId = card.dataset.mpMatch;
      if (matchId) { await this.saveMPPrediction(phase, matchId, main); saved++; }
    }
    if (msg) { msg.textContent = `${saved} predicciones guardadas.`; setTimeout(() => msg.textContent = '', 3000); }
  },

  async saveMPPrediction(phase, matchId, main) {
    const card = main ? main.querySelector(`[data-mp-match="${matchId}"]`) : null;
    if (!card) return;
    const homeCode = card.dataset.homeCode || null;
    const awayCode = card.dataset.awayCode || null;
    const homeInput = card.querySelector('.mp-score[data-field="home"]');
    const awayInput = card.querySelector('.mp-score[data-field="away"]');
    const penHomeInput = card.querySelector('.mp-pen[data-field="pen_home"]');
    const penAwayInput = card.querySelector('.mp-pen[data-field="pen_away"]');
    const predHome = homeInput?.value !== '' ? parseInt(homeInput.value) : null;
    const predAway = awayInput?.value !== '' ? parseInt(awayInput.value) : null;
    const predPenHome = penHomeInput?.value !== '' ? parseInt(penHomeInput.value) : null;
    const predPenAway = penAwayInput?.value !== '' ? parseInt(penAwayInput.value) : null;
    let effectiveWinner = null;
    if (predHome !== null && predAway !== null) {
      if (predHome > predAway) effectiveWinner = homeCode;
      else if (predAway > predHome) effectiveWinner = awayCode;
      else if (predPenHome !== null && predPenAway !== null) {
        if (predPenHome > predPenAway) effectiveWinner = homeCode;
        else if (predPenAway > predPenHome) effectiveWinner = awayCode;
      }
    }
    const body = { match_id: matchId, pred_home: predHome, pred_away: predAway, pred_winner: effectiveWinner, pred_pen_home: predPenHome, pred_pen_away: predPenAway };
    try {
      await this.api(`/mini-polla/${phase}/predictions`, { method: 'POST', body: JSON.stringify(body) });
      if (homeInput) { homeInput.style.borderColor = 'var(--color-success)'; setTimeout(() => homeInput.style.borderColor = '', 800); }
    } catch (e) {
      if (homeInput) homeInput.style.borderColor = 'var(--color-danger)';
    }
  },

  async showMiniPollaLeaderboard(phase) {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div style="color:var(--color-text-muted)">Cargando ranking...</div>`;
    try {
      const data = await this.api(`/mini-polla/${phase}/leaderboard`);
      const { leaderboard, totalPot } = data;
      const prize1 = (totalPot * 0.7).toFixed(2);
      const prize2 = (totalPot * 0.3).toFixed(2);

      main.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <button class="btn-sm btn-ghost" onclick="app.navigate('minipollas')">← Volver</button>
          <h2 style="margin:0">Ranking · ${data.label}</h2>
        </div>
        <div class="grid-2" style="margin-bottom:1rem">
          <div class="metric-card"><div class="metric-label">Inscritos</div><div class="metric-value">${leaderboard.length}</div></div>
          <div class="metric-card"><div class="metric-label">Pozo total</div><div class="metric-value">$${totalPot.toFixed(0)}</div></div>
          <div class="metric-card"><div class="metric-label">🥇 Premio 1ro</div><div class="metric-value">$${prize1}</div></div>
          <div class="metric-card"><div class="metric-label">🥈 Premio 2do</div><div class="metric-value">$${prize2}</div></div>
        </div>
        <table class="leaderboard-table">
          <thead><tr><th>#</th><th>Participante</th><th style="text-align:center">Aciertos</th><th style="text-align:center">Exactos</th><th style="text-align:right">Puntos</th></tr></thead>
          <tbody>
            ${leaderboard.map((u, i) => {
              const rank = i + 1;
              const medal = rank===1?'gold':rank===2?'silver':rank===3?'bronze':'default';
              const init = u.display_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
              const isMe = u.user_id === this.user.id;
              return `<tr style="${isMe ? 'background:rgba(24,95,165,0.08)' : ''}">
                <td><span class="rank-medal ${medal}">${rank}</span></td>
                <td class="user-cell"><span class="avatar">${init}</span><span>${u.display_name}${isMe ? ' <strong>(tú)</strong>' : ''}${u.paid ? '' : '<span class="chip unpaid">sin pago</span>'}</span></td>
                <td style="text-align:center">${u.correct}</td>
                <td style="text-align:center">${u.exact}</td>
                <td style="text-align:right;font-weight:700">${u.points}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (e) {
      main.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
  },

  // ── RANKING ─────────────────────────────────────────────────────────────────

  async renderLeaderboard(main) {
    main.innerHTML = '<h2>Ranking</h2><div style="color:var(--color-text-muted)">Cargando...</div>';
    try {
      const [lb1, lb2] = await Promise.all([
        this.api('/leaderboard/groups'),
        this.api('/leaderboard/knockout')
      ]);

      const renderTable = (data) => {
        const { leaderboard, totalPot, prizes } = data;
        if (!leaderboard.length) return `
          <div style="font-size:13px;color:var(--color-text-muted);font-style:italic;padding:8px 0">
            Aún no hay participantes con pago confirmado.
          </div>`;
        return `
          <div class="grid-2" style="margin-bottom:1rem">
            <div class="metric-card"><div class="metric-label">Participantes</div><div class="metric-value">${leaderboard.length}</div></div>
            <div class="metric-card"><div class="metric-label">Pozo neto</div><div class="metric-value">$${totalPot.toFixed(0)}</div></div>
            <div class="metric-card"><div class="metric-label">🥇 Premio 1ro <small style="font-size:10px">(70%)</small></div><div class="metric-value" style="color:var(--color-primary)">$${prizes.first.toFixed(2)}</div></div>
            <div class="metric-card"><div class="metric-label">🥈 Premio 2do <small style="font-size:10px">(25%)</small></div><div class="metric-value">$${prizes.second.toFixed(2)}</div></div>
            <div class="metric-card"><div class="metric-label">🥉 Premio 3ro <small style="font-size:10px">(5%)</small></div><div class="metric-value">$${prizes.third.toFixed(2)}</div></div>
          </div>
          <table class="leaderboard-table">
            <thead><tr><th>#</th><th>Participante</th><th style="text-align:center">Aciertos</th><th style="text-align:center">Exactos</th><th style="text-align:right">Puntos</th></tr></thead>
            <tbody>
              ${leaderboard.map((u, i) => {
                const rank = i + 1;
                const medal = rank===1?'gold':rank===2?'silver':rank===3?'bronze':'default';
                const init = u.display_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                const isMe = u.user_id === this.user.id || u.id === this.user.id;
                return `<tr style="${isMe ? 'background:rgba(201,168,76,0.06)' : ''}">
                  <td><span class="rank-medal ${medal}">${rank}</span></td>
                  <td class="user-cell"><span class="avatar">${init}</span><span>${u.display_name}${isMe ? ' <strong>(tú)</strong>' : ''}</span></td>
                  <td style="text-align:center">${u.correctPredictions ?? u.correct ?? 0}</td>
                  <td style="text-align:center">${u.exactScores ?? u.exact ?? 0}</td>
                  <td style="text-align:right;font-weight:700">${u.points}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      };

      main.innerHTML = `
        <h2>Ranking</h2>
        <div style="display:flex;gap:4px;margin-bottom:1rem;flex-wrap:wrap">
          <button class="fixture-tab active" id="rank-tab-groups" onclick="app.switchRankTab('groups')">⚽ Fase de Grupos</button>
          <button class="fixture-tab" id="rank-tab-knockout" onclick="app.switchRankTab('knockout')">🏆 Eliminatorias</button>
          <button class="fixture-tab" id="rank-tab-today" onclick="app.switchRankTab('today')">📅 Apuestas de hoy</button>
        </div>
        <style>
          .fixture-tab { padding:7px 18px; border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; border:1px solid var(--color-border); background:transparent; color:var(--color-text-muted); font-family:inherit; transition:all 0.2s; }
          .fixture-tab.active { background:var(--gold-gradient); color:#1A1200; border-color:transparent; box-shadow:0 2px 8px rgba(201,168,76,0.25); }
        </style>
        <div id="rank-content-groups">
          <div class="notice" style="margin-bottom:1rem">Solo participan usuarios con <strong>pago confirmado</strong>. El pozo se reparte al finalizar la fase de grupos.</div>
          ${renderTable(lb1)}
        </div>
        <div id="rank-content-knockout" style="display:none">
          <div class="notice" style="margin-bottom:1rem">Solo participan usuarios con <strong>pago confirmado</strong>. El pozo se reparte al finalizar el torneo.</div>
          ${renderTable(lb2)}
        </div>
        <div id="rank-content-today" style="display:none">
          <div style="color:var(--color-text-muted);font-size:13px">Cargando...</div>
        </div>
      `;

      const me1 = lb1.leaderboard?.find(u => u.user_id === this.user.id);
      if (me1) document.getElementById('header-points').textContent = me1.points + ' pts';

    } catch (e) { main.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`; }
  },

  switchRankTab(tab) {
    ['groups','knockout','today'].forEach(t => {
      document.getElementById(`rank-tab-${t}`)?.classList.toggle('active', t === tab);
      const c = document.getElementById(`rank-content-${t}`);
      if (c) c.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'today') this.renderRankingToday();
  },

  async renderRankingToday() {
    const container = document.getElementById('rank-content-today');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--color-text-muted);font-size:13px">Cargando...</div>';
    try {
      const data = await this.api('/daily-bets/today');
      if (!data.matches.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><p>No hay partidos hoy (${data.date} hora Ecuador).</p></div>`;
        return;
      }

      const resultsMap = {};
      await Promise.all(
        data.matches.filter(m => m.home_score != null).map(async m => {
          try { resultsMap[m.id] = await this.api(`/daily-bets/results/${m.id}`); } catch (e) {}
        })
      );

      let html = `<div style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">Apuestas del día · ${data.date}</div>`;

      data.matches.forEach(m => {
        const result = resultsMap[m.id];
        const finished = m.home_score != null;
        const timeStr = m.match_time ? `${m.match_time} (ECU)` : '';

        let statusHtml = '';
        if (finished && result?.status === 'finished') {
          const { potType, totalPot, perWinner, winners, myResult, carried } = result;
          let potMsg = '', potColor = 'var(--color-text-muted)';
          if (carried) { potMsg = `⏩ Nadie acertó — pote $${totalPot.toFixed(2)} acumulado`; }
          else if (potType === 'exacto') { potMsg = `🎯 Exacto — ${winners.length} ganador${winners.length>1?'es':''} · $${perWinner} c/u`; potColor='var(--color-success)'; }
          else if (potType === 'ganador') { potMsg = `✅ Ganador — ${winners.length} ganador${winners.length>1?'es':''} · $${perWinner} c/u`; potColor='var(--color-success)'; }

          statusHtml = `
            <div style="margin-top:8px;padding:8px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:12px">
              <div style="color:${potColor};margin-bottom:4px">${potMsg}</div>
              ${myResult ? (myResult.won
                ? `<div style="color:var(--color-success);font-weight:600">🏆 ¡Ganaste $${myResult.prize}! Tu pronóstico: ${myResult.pred}</div>`
                : myResult.paid
                  ? `<div style="color:var(--color-text-muted)">Tu pronóstico: ${myResult.pred} · No ganaste esta vez</div>`
                  : `<div style="color:var(--color-primary)">⚠️ Tu pronóstico: ${myResult.pred} · Pago pendiente de confirmación</div>`) : ''}
            </div>`;
        }

        html += `
          <div class="card" style="margin-bottom:8px">
            <div class="match-grid">
              <div class="team-cell"><span class="team-flag">${m.home_flag||'?'}</span><span class="team-name">${m.home_name||m.home_team}</span></div>
              <div style="text-align:center;font-size:14px;font-weight:700">
                ${finished ? `${m.home_score} – ${m.away_score}` : `<span style="color:var(--color-text-muted)">${timeStr}</span>`}
              </div>
              <div class="team-cell away"><span class="team-name">${m.away_name||m.away_team}</span><span class="team-flag">${m.away_flag||'?'}</span></div>
            </div>
            <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">
              Pote: $${(m.pot||0).toFixed(0)} · ${m.totalBets} apuesta${m.totalBets!==1?'s':''}
            </div>
            ${statusHtml}
          </div>`;
      });

      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div style="color:var(--color-danger)">Error: ${e.message}</div>`;
    }
  },

// ── REGLAS ──────────────────────────────────────────────────────────────────

  renderRules(main) {
    main.innerHTML = `
      <h2>Reglas y puntuación</h2>

      <div class="card">
        <h3>📋 Reglas</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.9">
          Hay <strong>dos pollas independientes</strong>, cada una con su propio pozo:
        </p>
        <ul style="font-size:14px;color:var(--color-text-muted);line-height:2;margin-top:8px;padding-left:16px">
          <li><strong>Polla 1 — Fase de Grupos ($20):</strong> pronosticas los partidos de la fase de grupos. El pozo se reparte al finalizar los grupos.</li>
          <li><strong>Polla 2 — Eliminatorias ($20):</strong> se abre cuando terminan los grupos. Pronosticas los partidos eliminatorios con los equipos reales clasificados. El pozo se reparte al finalizar el torneo.</li>
        </ul>
        <p style="font-size:12px;color:var(--color-text-muted);margin-top:10px;font-style:italic">
          * $1 de cada inscripción se destina al mantenimiento de la plataforma. El pozo se calcula sobre $19 por participante pagado.
        </p>
      </div>

      <div class="card">
        <h3>💰 Repartición del pozo</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Solo participan quienes tengan el <strong>pago confirmado</strong>. El pozo neto se reparte así:
        </p>
        <ul style="font-size:14px;line-height:2;list-style:none;margin-top:8px">
          <li>🥇 Primer lugar: <strong>70%</strong></li>
          <li>🥈 Segundo lugar: <strong>25%</strong></li>
          <li>🥉 Tercer lugar: <strong>5%</strong></li>
        </ul>
      </div>

      <div class="card">
        <h3>⏱️ Cierre de predicciones</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Las predicciones de <strong>grupos</strong> se cierran 5 minutos antes del primer partido del Mundial (11 de junio de 2026, hora Ecuador).
          Las predicciones de <strong>eliminatorias</strong> se cierran 5 minutos antes del primer partido de dieciseisavos de final.
          Las <strong>apuestas diarias</strong> se cierran 5 minutos antes de cada partido.
          Todos los horarios son en hora Ecuador (GMT-5).
        </p>
      </div>

      <div class="card">
        <h3>🌍 Formato FIFA 2026</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          48 equipos en 12 grupos de 4. Clasifican los 2 primeros de cada grupo más los 8 mejores terceros, dando 32 equipos en eliminatorias.
          Fases: Dieciseisavos → Octavos → Cuartos → Semifinales → Final.
        </p>
      </div>

      <div class="card">
        <h3>🔄 Eliminatorias con equipos reales</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          En la Polla 2, los equipos de cada partido eliminatorio corresponden a los clasificados <strong>reales</strong> de la fase de grupos, no a pronósticos. Ya sabrás quién clasificó antes de pronosticar. El podio se determina automáticamente según tus pronósticos de la Gran Final y el Tercer puesto.
        </p>
      </div>

      <div class="card">
        <h3>🎯 Puntos · Fase de Grupos</h3>
        <ul style="font-size:14px;line-height:2;list-style:none">
          <li>🎯 Marcador exacto: <strong>5 puntos</strong></li>
          <li>📏 Ganador correcto + diferencia exacta: <strong>3 puntos</strong></li>
          <li>✅ Solo ganador correcto: <strong>2 puntos</strong></li>
        </ul>
      </div>

      <div class="card">
        <h3>🎯 Puntos · Eliminatorias (sin penales)</h3>
        <ul style="font-size:14px;line-height:2;list-style:none">
          <li>🎯 Marcador exacto: <strong>5 puntos</strong></li>
          <li>📏 Ganador correcto + diferencia exacta: <strong>3 puntos</strong></li>
          <li>✅ Solo ganador correcto: <strong>2 puntos</strong></li>
        </ul>
      </div>

      <div class="card">
        <h3>⚡ Puntos · Eliminatorias (con penales)</h3>
        <ul style="font-size:14px;line-height:2;list-style:none">
          <li>🏆 Marcador exacto + penales exactos + ganador correcto: <strong>8 puntos</strong></li>
          <li>🎯 Marcador exacto: <strong>5 puntos</strong></li>
          <li>👍 Empate correcto + ganador correcto en penales: <strong>3 puntos</strong></li>
          <li>📏 Ganador correcto + diferencia exacta: <strong>3 puntos</strong></li>
          <li>✅ Solo ganador correcto: <strong>2 puntos</strong></li>
        </ul>
      </div>

      <div class="card">
        <h3>🏅 Puntos · Podio</h3>
        <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:8px">El podio se calcula automáticamente de tus pronósticos de la Gran Final y el Tercer puesto.</p>
      </div>

      <div class="card">
        <h3>💵 Apuestas diarias</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Apuesta $2 por partido del día. Quienes aciertan el marcador exacto se reparten el pote.
          Si nadie acierta el exacto, se reparte entre quienes acertaron el ganador.
          Si nadie acierta el ganador, los $2 se acumulan al siguiente partido.
          Las apuestas diarias no suman puntos al ranking general.
        </p>
      </div>

      <div class="card">
        <h3>🎮 Mini-Pollas</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Al inicio de cada fase eliminatoria se habilita una mini-polla independiente con su propio pozo y ranking.
          Puedes participar aunque no estés en ninguna polla principal.
          El reparto es 70% al primero y 30% al segundo.
          Los montos de inscripción los define el administrador.
        </p>
      </div>
    `;
  },

  // ── ADMIN ───────────────────────────────────────────────────────────────────

  async renderAdmin(main) {
    main.innerHTML = `
      <h2>Panel de administrador</h2>
      <div style="display:flex;gap:4px;margin-bottom:1rem;flex-wrap:wrap">
        <button class="fixture-tab active" id="admin-tab-pollas" onclick="app.switchAdminTab('pollas')">⚙️ Pollas</button>
        <button class="fixture-tab" id="admin-tab-today" onclick="app.switchAdminTab('today')">📅 Hoy</button>
        <button class="fixture-tab" id="admin-tab-matches" onclick="app.switchAdminTab('matches')">⚽ Resultados</button>
        <button class="fixture-tab" id="admin-tab-minipollas" onclick="app.switchAdminTab('minipollas')">🎮 Mini-Pollas</button>
        <button class="fixture-tab" id="admin-tab-users" onclick="app.switchAdminTab('users')">👥 Usuarios</button>
      </div>
      <style>
        .fixture-tab { padding:7px 18px; border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; border:1px solid var(--color-border); background:transparent; color:var(--color-text-muted); font-family:inherit; transition:all 0.2s; }
        .fixture-tab.active { background:var(--gold-gradient); color:#1A1200; border-color:transparent; box-shadow:0 2px 8px rgba(201,168,76,0.25); }
      </style>

      <div id="admin-content-pollas">
        <div class="card"><h3>⚙️ Configuración de pollas</h3><div id="admin-pollas-config"></div></div>
        <div class="card"><h3>👥 Inscripciones y pagos</h3><div id="admin-pollas-regs"></div></div>
        <div class="card"><h3>🏅 Podio real</h3><div id="admin-podium"></div></div>
      </div>

      <div id="admin-content-today" style="display:none">
        <div class="card"><div id="admin-today-content"><span style="color:var(--color-text-muted);font-size:14px">Cargando...</span></div></div>
      </div>

      <div id="admin-content-matches" style="display:none">
        <div class="card"><h3>Cargar resultados</h3><div id="admin-matches"><span style="color:var(--color-text-muted);font-size:14px">Cargando...</span></div></div>
      </div>

      <div id="admin-content-minipollas" style="display:none">
        <div class="card"><h3>🎮 Mini-Pollas</h3><div id="admin-minipollas"></div></div>
      </div>

      <div id="admin-content-users" style="display:none">
        <div class="card"><h3>Participantes</h3><div id="admin-users"></div></div>
      </div>
    `;
    this.renderAdminPollasConfig();
    this.renderAdminPollasRegs();
    this.renderAdminPodium();
    this.renderAdminTodayBets();
    this.renderAdminMatches();
    this.renderAdminMiniPollas();
    this.renderAdminUsers();
    // Sincronizar BD existente (datos cargados antes de la propagación automática)
    this.syncBracketOnce();
  },

  async syncBracketOnce() {
    // Solo correr una vez por sesión para no spam
    if (this._bracketSynced) return;
    this._bracketSynced = true;
    try {
      await this.api('/admin/bracket/propagate', { method: 'POST' });
      await this.loadData();
      this.renderAdminMatches();
      this.renderAdminPodium();
    } catch (e) {}
  },

  switchAdminTab(tab) {
    ['pollas','today','matches','minipollas','users'].forEach(t => {
      document.getElementById(`admin-tab-${t}`)?.classList.toggle('active', t === tab);
      const c = document.getElementById(`admin-content-${t}`);
      if (c) c.style.display = t === tab ? 'block' : 'none';
    });
  },

  async renderAdminTodayBets() {
    const container = document.getElementById('admin-today-content');
    if (!container) return;
    try {
      const [data, settings] = await Promise.all([
        this.api('/admin/daily-bets/today'),
        this.api('/settings')
      ]);

      const currentAmount = settings.daily_bet_amount || 2;

      let html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <h3 style="margin:0">Apuestas del día · ${data.date}</h3>
          <div style="display:flex;align-items:center;gap:8px">
            <label style="font-size:12px;color:var(--color-text-muted)">Monto apuesta ($):</label>
            <input type="number" id="daily-amount-input" value="${currentAmount}" min="1" style="width:60px;text-align:center">
            <button class="btn-sm btn-ghost" onclick="app.saveDailyBetAmount()">Guardar</button>
            <span class="success-msg" id="daily-amount-msg"></span>
          </div>
        </div>`;

      if (!data.matches.length) {
        html += `<div class="empty-state"><div class="empty-state-icon">📅</div><p>No hay partidos hoy.</p></div>`;
        container.innerHTML = html;
        return;
      }

      data.matches.forEach(m => {
        const { match, totalBets, paidBets, totalPot, potType, carried, perWinner, winners, bets } = m;
        const finished = match.home_score != null;
        const timeStr = match.match_time ? `${match.match_time} (ECU)` : '';

        let statusHtml = '';
        if (finished) {
          let potMsg = '', potColor = 'var(--color-text-muted)';
          if (carried) { potMsg = `⏩ Nadie acertó — pote $${totalPot.toFixed(2)} acumulado`; }
          else if (potType === 'exacto') { potMsg = `🎯 Exacto — ${winners.length} ganador${winners.length>1?'es':''} · $${perWinner.toFixed(2)} c/u`; potColor='var(--color-success)'; }
          else if (potType === 'ganador') { potMsg = `✅ Ganador — ${winners.length} ganador${winners.length>1?'es':''} · $${perWinner.toFixed(2)} c/u`; potColor='var(--color-success)'; }
          statusHtml = `<div style="font-size:12px;color:${potColor};margin:4px 0">${potMsg}</div>`;
        }

        html += `
          <div style="margin-bottom:12px;padding:10px;background:var(--color-surface-2);border-radius:var(--radius-md);border:1px solid var(--color-border)">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-bottom:6px">
              <div style="font-size:14px;font-weight:600">
                ${match.home_flag||''} ${match.home_name}
                ${finished ? `<strong>${match.home_score}–${match.away_score}</strong>` : 'vs'}
                ${match.away_name} ${match.away_flag||''}
              </div>
              <div style="font-size:12px;color:var(--color-text-muted)">
                ${timeStr} · ${paidBets}/${totalBets} pagados · Pote: $${totalPot.toFixed(2)}
              </div>
            </div>
            ${statusHtml}
            ${totalBets > 0 ? `
            <details style="margin-top:6px" open>
              <summary style="cursor:pointer;font-size:12px;color:var(--color-text-muted);margin-bottom:6px">
                ${totalBets} pronóstico${totalBets!==1?'s':''}
              </summary>
              ${bets.map(b => `
                <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--color-border)">
                  <span style="flex:1;font-weight:${b.won?'700':b.paid?'500':'400'};color:${b.won?'var(--color-success)':b.paid?'var(--color-text)':'var(--color-text-muted)'}">
                    ${b.display_name}
                  </span>
                  <span style="color:var(--color-text-muted)">${b.pred}</span>
                  <span>$${b.amount}</span>
                  ${b.won ? '<span class="chip paid">Ganó</span>' : ''}
                  <span class="chip ${b.paid ? 'paid' : 'unpaid'}">${b.paid ? 'Pagado' : 'Pendiente'}</span>
                  <button class="btn-sm btn-ghost" onclick="app.toggleDailyBetPaid('${match.id}',${b.user_id},${b.paid})">
                    ${b.paid ? 'Quitar' : 'Confirmar'}
                  </button>
                </div>`).join('')}
            </details>` : `<div style="font-size:12px;color:var(--color-text-muted)">Sin pronósticos aún</div>`}
          </div>`;
      });

      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = `<div style="color:var(--color-danger)">Error: ${e.message}</div>`;
    }
  },

  async saveDailyBetAmount() {
    const msg = document.getElementById('daily-amount-msg');
    const amount = document.getElementById('daily-amount-input')?.value;
    try {
      await this.api('/admin/daily-bets/amount', {
        method: 'PUT',
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      msg.textContent = '✓ Guardado';
      setTimeout(() => msg.textContent = '', 2000);
    } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--color-danger)'; }
  },

  async toggleDailyBetPaid(matchId, userId, currentPaid) {
    try {
      await this.api(`/admin/daily-bets/${matchId}/users/${userId}/paid`, {
        method: 'PUT',
        body: JSON.stringify({ paid: !currentPaid })
      });
      this.renderAdminTodayBets();
    } catch (e) { alert('Error: ' + e.message); }
  },

  async renderAdminPollasConfig() {
    const container = document.getElementById('admin-pollas-config');
    try {
      const s = await this.api('/settings');
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--color-primary);margin-bottom:8px">⚽ Polla 1 — Grupos</div>
            <div style="display:grid;gap:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">Inscripción ($)</label>
                <input type="number" id="p1-fee" value="${s.polla1_fee||20}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">Mantenimiento ($)</label>
                <input type="number" id="p1-maint" value="${s.polla1_maintenance||1}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">1ro (%)</label>
                <input type="number" id="p1-s1" value="${s.polla1_split_1st||70}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">2do (%)</label>
                <input type="number" id="p1-s2" value="${s.polla1_split_2nd||25}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">3ro (%)</label>
                <input type="number" id="p1-s3" value="${s.polla1_split_3rd||5}" style="width:70px;text-align:center">
              </div>
            </div>
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--color-primary);margin-bottom:8px">🏆 Polla 2 — Eliminatorias</div>
            <div style="display:grid;gap:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">Inscripción ($)</label>
                <input type="number" id="p2-fee" value="${s.polla2_fee||20}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">Mantenimiento ($)</label>
                <input type="number" id="p2-maint" value="${s.polla2_maintenance||1}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">1ro (%)</label>
                <input type="number" id="p2-s1" value="${s.polla2_split_1st||70}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">2do (%)</label>
                <input type="number" id="p2-s2" value="${s.polla2_split_2nd||25}" style="width:70px;text-align:center">
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <label style="font-size:12px;flex:1">3ro (%)</label>
                <input type="number" id="p2-s3" value="${s.polla2_split_3rd||5}" style="width:70px;text-align:center">
              </div>
            </div>
          </div>
        </div>
        <button class="btn-primary" style="width:auto;margin-top:12px" onclick="app.savePollaSettings()">Guardar configuración</button>
        <div class="success-msg" id="pollas-config-msg" style="margin-top:8px"></div>
      `;
    } catch (e) { container.innerHTML = `<div style="color:var(--color-danger)">Error: ${e.message}</div>`; }
  },

  async savePollaSettings() {
    const msg = document.getElementById('pollas-config-msg');
    try {
      await this.api('/admin/pollas/settings', {
        method: 'PUT',
        body: JSON.stringify({
          polla1_fee: document.getElementById('p1-fee').value,
          polla1_maintenance: document.getElementById('p1-maint').value,
          polla1_split_1st: document.getElementById('p1-s1').value,
          polla1_split_2nd: document.getElementById('p1-s2').value,
          polla1_split_3rd: document.getElementById('p1-s3').value,
          polla2_fee: document.getElementById('p2-fee').value,
          polla2_maintenance: document.getElementById('p2-maint').value,
          polla2_split_1st: document.getElementById('p2-s1').value,
          polla2_split_2nd: document.getElementById('p2-s2').value,
          polla2_split_3rd: document.getElementById('p2-s3').value,
        })
      });
      msg.textContent = '✓ Configuración guardada.';
      setTimeout(() => msg.textContent = '', 3000);
    } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--color-danger)'; }
  },

  async renderAdminPollasRegs() {
    const container = document.getElementById('admin-pollas-regs');
    if (!container) return;
    try {
      const users = await this.api('/admin/users');
      const nonAdmin = users.filter(u => !u.is_admin);

      container.innerHTML = `
        <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:10px">
          Lista de participantes y estado de pago. Para confirmar o quitar pagos usa la pestaña <strong>Usuarios</strong>.
        </div>
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th>Participante</th>
              <th style="text-align:center">⚽ Polla 1 · Grupos</th>
              <th style="text-align:center">🏆 Polla 2 · Finales</th>
            </tr>
          </thead>
          <tbody>
            ${nonAdmin.map(u => `
              <tr>
                <td class="user-cell">
                  <span class="avatar">${u.display_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</span>
                  <span>${u.display_name}</span>
                </td>
                <td style="text-align:center">
                  <span class="chip ${u.paid_groups ? 'paid' : 'unpaid'}">${u.paid_groups ? '✓ Pagado' : 'Pendiente'}</span>
                </td>
                <td style="text-align:center">
                  <span class="chip ${u.paid_knockout ? 'paid' : 'unpaid'}">${u.paid_knockout ? '✓ Pagado' : 'Pendiente'}</span>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${nonAdmin.length === 0 ? '<div style="font-size:13px;color:var(--color-text-muted);padding:8px 0">Sin participantes registrados.</div>' : ''}
      `;
    } catch (e) { container.innerHTML = `<div style="color:var(--color-danger)">Error: ${e.message}</div>`; }
  },

  async renderAdminMiniPollas() {
    const container = document.getElementById('admin-minipollas');
    if (!container) return;
    try {
      const settings = await this.api('/settings');
      const phases = [
        { key: 'r16',   label: '⚽ Dieciseisavos' },
        { key: 'qf',    label: '🏅 Octavos de final' },
        { key: 'sf_qf', label: '🏆 Cuartos de final' },
        { key: 'sf_sf', label: '🌟 Semifinales + Final' }
      ];

      const lbData = {};
      for (const p of phases) {
        try { lbData[p.key] = await this.api(`/mini-polla/${p.key}/leaderboard`); }
        catch (e) { lbData[p.key] = { leaderboard: [], totalPot: 0 }; }
      }

      container.innerHTML = `
        <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">
          Configura montos e inscripciones de cada mini-polla.
        </div>
        <div style="display:grid;gap:8px;margin-bottom:16px">
          ${phases.map(p => `
            <div style="display:flex;align-items:center;gap:10px">
              <label style="font-size:13px;flex:1">${p.label}</label>
              <span style="font-size:13px">$</span>
              <input type="number" min="1" max="100" id="mp-fee-${p.key}"
                value="${settings[`mini_polla_fee_${p.key}`] || 5}"
                style="width:70px;text-align:center">
            </div>
          `).join('')}
        </div>
        <button class="btn-primary" style="width:auto;margin-bottom:16px" onclick="app.saveMinPollaFees()">
          Guardar montos
        </button>
        <div class="success-msg" id="mp-fees-msg" style="margin-bottom:12px"></div>
        <hr style="margin:0 0 16px;border-color:var(--color-border)">
        ${phases.map(p => {
          const lb = lbData[p.key];
          const prize1 = (lb.totalPot * 0.7).toFixed(2);
          const prize2 = (lb.totalPot * 0.3).toFixed(2);
          return `
            <div style="margin-bottom:20px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:13px;font-weight:600;color:var(--color-primary)">${p.label}</div>
                <div style="font-size:12px;color:var(--color-text-muted)">
                  Pozo: $${lb.totalPot.toFixed(0)} · 🥇$${prize1} · 🥈$${prize2}
                </div>
              </div>
              ${lb.leaderboard.length === 0
                ? `<div style="font-size:12px;color:var(--color-text-muted);font-style:italic">Sin inscritos aún.</div>`
                : lb.leaderboard.map((u, i) => `
                  <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px solid var(--color-border)">
                    <span style="font-size:11px;color:var(--color-text-muted);width:16px">${i+1}</span>
                    <span style="flex:1">${u.display_name}</span>
                    <span style="font-size:12px;color:var(--color-text-muted)">${u.points} pts</span>
                    <span class="chip ${u.paid ? 'paid' : 'unpaid'}">${u.paid ? 'Pagado' : 'Pendiente'}</span>
                    <button class="btn-sm btn-ghost" onclick="app.toggleMPPayment('${p.key}',${u.user_id},${u.paid})">
                      ${u.paid ? 'Quitar' : 'Confirmar'}
                    </button>
                  </div>`).join('')
              }
            </div>`;
        }).join('')}
      `;
    } catch (e) {
      container.innerHTML = `<div style="color:var(--color-danger)">Error: ${e.message}</div>`;
    }
  },

  async saveMinPollaFees() {
    const msg = document.getElementById('mp-fees-msg');
    try {
      await this.api('/admin/mini-polla/fees', {
        method: 'PUT',
        body: JSON.stringify({
          fee_r16:   parseFloat(document.getElementById('mp-fee-r16')?.value || 5),
          fee_qf:    parseFloat(document.getElementById('mp-fee-qf')?.value || 3),
          fee_sf_qf: parseFloat(document.getElementById('mp-fee-sf_qf')?.value || 3),
          fee_sf_sf: parseFloat(document.getElementById('mp-fee-sf_sf')?.value || 2)
        })
      });
      msg.textContent = '✓ Montos guardados.';
      msg.style.color = 'var(--color-success)';
      setTimeout(() => { msg.textContent = ''; msg.style.color = ''; }, 3000);
    } catch (e) { msg.textContent = e.message; msg.style.color = 'var(--color-danger)'; }
  },

  async toggleMPPayment(phase, userId, currentPaid) {
    try {
      await this.api(`/admin/mini-polla/${phase}/users/${userId}/paid`, {
        method: 'PUT',
        body: JSON.stringify({ paid: !currentPaid })
      });
      this.renderAdminMiniPollas();
    } catch (e) { alert('Error: ' + e.message); }
  },

  renderAdminMatches() {
    const container = document.getElementById('admin-matches');
    if (!container) return;
    const phases = [
      { key: 'groups', label: 'Grupos' },
      { key: 'r16',    label: 'Dieciseisavos' },
      { key: 'qf',     label: 'Octavos de final' },
      { key: 'sf_qf',  label: 'Cuartos de final', ids: ['SF-1','SF-2','SF-3','SF-4'] },
      { key: 'sf_sf',  label: 'Semifinales', ids: ['SF-5','SF-6'] },
      { key: 'tp',     label: '3er puesto' },
      { key: 'final',  label: 'Final' }
    ];

    const groupsComplete = this.matches.filter(m => m.phase === 'groups').every(m => m.home_score != null);
    const bracketGenerated = this.matches.filter(m => m.phase === 'r16').some(m => m.home_team != null);

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;color:var(--color-text-muted)">Los resultados se guardan y propagan automáticamente al siguiente partido.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${groupsComplete && !bracketGenerated ? `<button class="btn-primary" style="width:auto;background:linear-gradient(135deg,#1a5c8a,#0f3d6b)" onclick="app.openBracketGenerator()">🔄 Generar Eliminatorias</button>` : ''}
          <button class="btn-primary" style="width:auto" onclick="app.saveAllAdminMatches()">💾 Guardar todo</button>
        </div>
      </div>
      <div class="success-msg" id="admin-matches-msg" style="margin-bottom:8px"></div>
      ${phases.map(p => {
        let matches;
        if (p.ids) {
          matches = this.matches.filter(m => p.ids.includes(m.id));
        } else {
          matches = this.matches.filter(m => m.phase === p.key);
        }
        if (!matches.length) return '';
        return `
          <details style="margin-bottom:10px">
            <summary style="cursor:pointer;font-weight:500;padding:6px 0">${p.label} (${matches.length})</summary>
            <div style="padding-top:8px">
              ${matches.map(m => {
                const timeStr = m.match_time ? `${m.match_date} ${m.match_time}` : m.match_date;
                const hasResult = m.home_score != null;

                if (p.key === 'groups') {
                  return `<div class="user-row" data-admin-match="${m.id}" style="grid-template-columns:1fr auto;${hasResult?'border-left:2px solid var(--color-success)':''}">
                    <div style="display:flex;align-items:center;gap:6px;font-size:13px;flex-wrap:wrap">
                      <span>${m.home_flag||''}</span>
                      <span style="flex:1;font-weight:500">${m.home_name||m.home_team}</span>
                      <input type="number" min="0" max="20" data-field="home_score" value="${m.home_score??''}" style="width:46px;text-align:center;padding:4px" placeholder="—">
                      <span style="color:var(--color-text-muted)">—</span>
                      <input type="number" min="0" max="20" data-field="away_score" value="${m.away_score??''}" style="width:46px;text-align:center;padding:4px" placeholder="—">
                      <span style="flex:1;text-align:right;font-weight:500">${m.away_name||m.away_team}</span>
                      <span>${m.away_flag||''}</span>
                      <span style="font-size:11px;color:var(--color-text-muted);width:100%">${timeStr}</span>
                    </div>
                    <span class="match-save-status" style="font-size:14px;width:20px;text-align:center"></span>
                  </div>`;
                }

                const homeTeam = m.home_team ? this.teamByCode(m.home_team) : null;
                const awayTeam = m.away_team ? this.teamByCode(m.away_team) : null;
                const isDraw = m.home_score != null && m.away_score != null && m.home_score === m.away_score;

                // Calcular ganador automático para mostrar
                let autoWinner = null;
                if (m.home_score != null && m.away_score != null) {
                  if (m.home_score > m.away_score) autoWinner = homeTeam;
                  else if (m.away_score > m.home_score) autoWinner = awayTeam;
                  else if (m.pen_home != null && m.pen_away != null) {
                    if (m.pen_home > m.pen_away) autoWinner = homeTeam;
                    else if (m.pen_away > m.pen_home) autoWinner = awayTeam;
                  }
                }

                return `<div class="user-row" data-admin-match="${m.id}" data-home="${m.home_team||''}" data-away="${m.away_team||''}" style="grid-template-columns:1fr auto;${hasResult?'border-left:2px solid var(--color-success)':''}">
                  <div style="font-size:13px">
                    <div style="color:var(--color-text-muted);margin-bottom:6px">${m.label||''} · ${timeStr}</div>
                    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;font-weight:500">
                      <span>${homeTeam?.flag||'?'} ${homeTeam?.name||'Por definir'}</span>
                      <span style="color:var(--color-text-muted)">vs</span>
                      <span>${awayTeam?.flag||'?'} ${awayTeam?.name||'Por definir'}</span>
                    </div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
                      <label style="font-size:12px;color:var(--color-text-muted)">Marcador:</label>
                      <input type="number" min="0" max="20" class="admin-score" data-field="home_score" value="${m.home_score??''}" style="width:46px;text-align:center" placeholder="—">
                      <span style="color:var(--color-text-muted)">—</span>
                      <input type="number" min="0" max="20" class="admin-score" data-field="away_score" value="${m.away_score??''}" style="width:46px;text-align:center" placeholder="—">
                    </div>
                    <div class="admin-pen-section" style="${isDraw ? '' : 'display:none'}">
                      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:6px">
                        <label style="font-size:12px;color:var(--color-text-muted)">⚖️ Penales:</label>
                        <input type="number" min="0" max="30" data-field="pen_home" value="${m.pen_home??''}" style="width:46px;text-align:center" placeholder="—">
                        <span style="color:var(--color-text-muted)">—</span>
                        <input type="number" min="0" max="30" data-field="pen_away" value="${m.pen_away??''}" style="width:46px;text-align:center" placeholder="—">
                      </div>
                    </div>
                    ${autoWinner ? `<div style="font-size:12px;color:var(--color-success);font-weight:500">✓ Ganador: ${autoWinner.flag||''} ${autoWinner.name}</div>` : (isDraw && !m.pen_home ? `<div style="font-size:12px;color:var(--color-primary)">⚠️ Ingresa penales para definir ganador</div>` : '')}
                  </div>
                  <span class="match-save-status" style="font-size:14px;width:20px;text-align:center"></span>
                </div>`;
              }).join('')}
            </div>
          </details>
        `;
      }).join('')}
    `;

    // Autoguardado en blur/change + penales dinámicos
    container.querySelectorAll('[data-admin-match]').forEach(row => {
      // Mostrar/ocultar penales según empate
      row.querySelectorAll('.admin-score').forEach(input => {
        input.addEventListener('input', () => {
          const hVal = row.querySelector('.admin-score[data-field="home_score"]')?.value;
          const aVal = row.querySelector('.admin-score[data-field="away_score"]')?.value;
          const penSection = row.querySelector('.admin-pen-section');
          if (!penSection) return;
          const drawNow = hVal !== '' && aVal !== '' && parseInt(hVal) === parseInt(aVal);
          penSection.style.display = drawNow ? '' : 'none';
          if (!drawNow) {
            row.querySelector('[data-field="pen_home"]') && (row.querySelector('[data-field="pen_home"]').value = '');
            row.querySelector('[data-field="pen_away"]') && (row.querySelector('[data-field="pen_away"]').value = '');
          }
        });
      });

      row.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('change', () => this.saveAdminMatch(row));
        if (el.tagName === 'INPUT') {
          el.addEventListener('blur', () => this.saveAdminMatch(row));
        }
      });
    });
  },

  async openBracketGenerator() {
    const statusDiv = document.getElementById('admin-matches-msg');
    if (!confirm('Se generarán automáticamente las eliminatorias según el reglamento FIFA (8 mejores terceros). ¿Continuar?')) return;

    if (statusDiv) { statusDiv.textContent = 'Generando bracket...'; statusDiv.style.color = 'var(--color-text-muted)'; }

    try {
      const result = await this.api('/admin/bracket/generate', { method: 'POST' });
      await this.loadData();
      this.renderAdminMatches();

      // Mostrar resumen de clasificados
      const qualified = result.qualifiedThirds.map(t => {
        const team = this.teams.find(tm => tm.code === t.code);
        return `${team?.flag||''} ${team?.name||t.code} (${t.group})`;
      }).join(', ');
      const eliminated = result.eliminatedThirds.map(t => {
        const team = this.teams.find(tm => tm.code === t.code);
        return `${team?.flag||''} ${team?.name||t.code} (${t.group})`;
      }).join(', ');

      if (statusDiv) {
        statusDiv.innerHTML = `
          <div style="color:var(--color-success);margin-bottom:8px">✓ Bracket generado correctamente</div>
          <div style="font-size:12px;color:var(--color-text-muted)">
            <strong>8 mejores terceros (clasificados):</strong> ${qualified}<br>
            <strong>Terceros eliminados:</strong> ${eliminated || 'ninguno'}
          </div>`;
      }
    } catch (e) {
      if (statusDiv) { statusDiv.textContent = 'Error: ' + e.message; statusDiv.style.color = 'var(--color-danger)'; }
    }
  },

  async repropagate() {
    const msg = document.getElementById('admin-matches-msg');
    try {
      await this.api('/admin/bracket/propagate', { method: 'POST' });
      await this.loadData();
      this.renderAdminMatches();
      this.renderAdminPodium();
      if (msg) {
        msg.textContent = '✓ Sincronizado.';
        msg.style.color = 'var(--color-success)';
        setTimeout(() => msg.textContent = '', 2000);
      }
    } catch (e) {
      if (msg) { msg.textContent = 'Error: ' + e.message; msg.style.color = 'var(--color-danger)'; }
    }
  },

  async saveAllAdminMatches() {
    const container = document.getElementById('admin-matches');
    const msg = document.getElementById('admin-matches-msg');
    const rows = container.querySelectorAll('[data-admin-match]');
    let saved = 0;
    for (const row of rows) {
      const body = {};
      row.querySelectorAll('[data-field]').forEach(el => {
        const f = el.dataset.field;
        if (['home_score','away_score','pen_home','pen_away'].includes(f)) {
          body[f] = el.value === '' ? null : parseInt(el.value);
        } else if (el.value !== '') {
          body[f] = el.value;
        }
      });
      if (body.home_score == null && body.away_score == null && !body.home_team) continue;
      try {
        await this.api(`/admin/matches/${row.dataset.adminMatch}`, { method: 'PUT', body: JSON.stringify(body) });
        saved++;
        const status = row.querySelector('.match-save-status');
        if (status) { status.textContent = '✓'; status.style.color = 'var(--color-success)'; }
      } catch (e) {}
    }
    if (msg) {
      msg.textContent = `✓ ${saved} resultado${saved !== 1 ? 's' : ''} guardado${saved !== 1 ? 's' : ''}.`;
      msg.style.color = 'var(--color-success)';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    }
    await this.loadData();
    this.renderAdminMatches();
    this.renderAdminPodium();
  },

  async saveAdminMatch(row) {
    const matchId = row.dataset.adminMatch;
    const body = {};

    row.querySelectorAll('[data-field]').forEach(el => {
      const f = el.dataset.field;
      if (['home_score','away_score','pen_home','pen_away'].includes(f)) {
        body[f] = el.value === '' ? null : parseInt(el.value);
      }
    });

    // Solo guardar si hay marcador completo
    if (body.home_score == null || body.away_score == null) return;

    const status = row.querySelector('.match-save-status');
    try {
      await this.api(`/admin/matches/${matchId}`, { method: 'PUT', body: JSON.stringify(body) });
      if (status) {
        status.textContent = '✓';
        status.style.color = 'var(--color-success)';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }
      row.style.borderLeft = '2px solid var(--color-success)';
      // Recargar datos (los partidos siguientes se actualizan al expandir su sección)
      await this.loadData();
      // Solo re-renderizar el podio (que es ligero)
      this.renderAdminPodium();
      // Y debouncedRefresh para actualizar admin matches sin perder foco
      this._scheduleAdminRefresh();
    } catch (e) {
      if (status) { status.textContent = '✗'; status.style.color = 'var(--color-danger)'; }
      if (e.message) console.warn('Error guardando:', e.message);
    }
  },

  _scheduleAdminRefresh() {
    // Re-renderizar admin matches después de un tiempo sin actividad
    if (this._adminRefreshTimer) clearTimeout(this._adminRefreshTimer);
    this._adminRefreshTimer = setTimeout(() => {
      const activeEl = document.activeElement;
      // Solo refrescar si el usuario no está editando un input
      if (!activeEl || activeEl.tagName !== 'INPUT') {
        this.renderAdminMatches();
      } else {
        // Reintentar en 2 segundos
        this._scheduleAdminRefresh();
      }
    }, 1500);
  },

  async renderAdminPodium() {
    const container = document.getElementById('admin-podium');
    if (!container) return;

    // Calcular podio automáticamente desde resultados reales
    const finalMatch = this.matches.find(m => m.id === 'FINAL');
    const tpMatch = this.matches.find(m => m.id === 'TP');

    let champion = null, runnerUp = null, thirdPlace = null;

    if (finalMatch?.winner) {
      champion = this.teamByCode(finalMatch.winner);
      const loserCode = finalMatch.winner === finalMatch.home_team ? finalMatch.away_team : finalMatch.home_team;
      runnerUp = loserCode ? this.teamByCode(loserCode) : null;
    }
    if (tpMatch?.winner) {
      thirdPlace = this.teamByCode(tpMatch.winner);
    }

    const teamCard = (medal, label, team, hint) => team ? `
      <div class="podium-slot">
        <span class="podium-medal">${medal}</span>
        <span class="podium-label">${label}</span>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:15px;font-weight:500">
          <span style="font-size:22px">${team.flag||''}</span><span>${team.name}</span>
        </div>
      </div>` : `
      <div class="podium-slot">
        <span class="podium-medal">${medal}</span>
        <span class="podium-label">${label}</span>
        <div style="padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:13px;color:var(--color-text-muted);font-style:italic">${hint}</div>
      </div>`;

    container.innerHTML = `
      <div class="notice" style="margin-bottom:12px">El podio se determina automáticamente según los resultados reales de la <strong>Gran Final</strong> y el <strong>Tercer puesto</strong>.</div>
      ${teamCard('🥇', 'Campeón', champion, 'Pendiente — carga el resultado de la Final')}
      ${teamCard('🥈', 'Subcampeón', runnerUp, 'Pendiente — carga el resultado de la Final')}
      ${teamCard('🥉', 'Tercer lugar', thirdPlace, 'Pendiente — carga el resultado del 3er puesto')}
    `;
  },

  async renderAdminUsers() {
    const container = document.getElementById('admin-users');
    try {
      const users = await this.api('/admin/users');
      container.innerHTML = users.map(u => `
        <div class="user-row" data-user="${u.id}" style="align-items:flex-start">
          <div class="user-row-info">
            <input type="text" data-field="display_name" value="${u.display_name}" style="font-weight:500;margin-bottom:4px">
            <small>usuario: <input type="text" data-field="username" value="${u.username}" style="padding:2px 6px;font-size:12px;width:auto;display:inline-block">
            ${u.is_admin ? '<span class="chip admin">admin</span>' : ''}
            </small>
            <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">
              <span class="chip ${u.paid_groups ? 'paid' : 'unpaid'}">
                Grupos: ${u.paid_groups ? '✓ Pagado' : 'Pendiente'}
              </span>
              <span class="chip ${u.paid_knockout ? 'paid' : 'unpaid'}">
                Finales: ${u.paid_knockout ? '✓ Pagado' : 'Pendiente'}
              </span>
            </div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn-sm ${u.paid_groups ? 'btn-ghost' : 'btn-accent'}" data-action="toggle-groups">
              ${u.paid_groups ? 'Quitar GRUPOS' : 'Pagar GRUPOS'}
            </button>
            <button class="btn-sm ${u.paid_knockout ? 'btn-ghost' : 'btn-accent'}" data-action="toggle-knockout">
              ${u.paid_knockout ? 'Quitar FINALES' : 'Pagar FINALES'}
            </button>
            <button class="btn-sm btn-ghost" data-action="save">Guardar</button>
            <button class="btn-sm btn-ghost" data-action="reset">Reset pass</button>
            ${u.id !== this.user.id ? '<button class="btn-sm btn-danger" data-action="delete">Eliminar</button>' : ''}
          </div>
        </div>
      `).join('');
      container.querySelectorAll('[data-user]').forEach(row => {
        row.querySelectorAll('[data-action]').forEach(btn => {
          btn.addEventListener('click', () => this.handleAdminUserAction(row, btn.dataset.action, users));
        });
      });
    } catch (e) { container.innerHTML = `<div style="color:var(--color-danger)">Error: ${e.message}</div>`; }
  },

  async handleAdminUserAction(row, action, users) {
    const userId = row.dataset.user;
    const user = users.find(u => u.id == userId);
    try {
      if (action === 'save') {
        await this.api(`/admin/users/${userId}`, {
          method: 'PUT',
          body: JSON.stringify({
            display_name: row.querySelector('[data-field=display_name]').value,
            username: row.querySelector('[data-field=username]').value
          })
        });
        alert('Guardado.');
      } else if (action === 'toggle-groups') {
        await this.api(`/admin/users/${userId}/polla/groups/paid`, {
          method: 'PUT',
          body: JSON.stringify({ paid: !user.paid_groups })
        });
        this.renderAdminUsers();
        this.renderAdminPollasRegs();
      } else if (action === 'toggle-knockout') {
        await this.api(`/admin/users/${userId}/polla/knockout/paid`, {
          method: 'PUT',
          body: JSON.stringify({ paid: !user.paid_knockout })
        });
        this.renderAdminUsers();
        this.renderAdminPollasRegs();
      } else if (action === 'reset') {
        const p = prompt('Nueva contraseña (min 4 caracteres):');
        if (!p || p.length < 4) return;
        await this.api(`/admin/users/${userId}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ password: p })
        });
        alert('Contraseña reseteada.');
      } else if (action === 'delete') {
        if (!confirm(`Eliminar a "${user.display_name}"?`)) return;
        await this.api(`/admin/users/${userId}`, { method: 'DELETE' });
        this.renderAdminUsers();
      }
    } catch (e) { alert('Error: ' + e.message); }
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
