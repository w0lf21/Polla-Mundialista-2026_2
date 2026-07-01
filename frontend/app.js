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
        // Restaurar el botón antes de entrar (evita que quede en "Entrando..." al volver al login)
        btn.classList.remove('btn-login-loading');
        btn.textContent = 'Entrar';
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
    // Cargar partidos compensados (el ganador real avanza en el bracket)
    try {
      const comp = await this.api('/compensated-public');
      this._compensatedSet = new Set(comp.compensated || []);
    } catch (e) {
      this._compensatedSet = this._compensatedSet || new Set();
    }
  },

  teamByCode(code) {
    return this.teams.find(t => t.code === code) || { code, name: code, flag: '?' };
  },

  showLogin() {
    // Limpiar residuos de la animación de entrada
    const loginScreen = document.getElementById('login-screen');
    loginScreen.style.opacity = '';
    loginScreen.style.transition = '';
    document.getElementById('entry-overlay')?.remove();

    // Resetear formularios
    document.getElementById('login-form')?.reset();
    document.getElementById('register-form')?.reset();
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';

    // Restaurar el botón de login (queda en "Entrando..." tras un login exitoso)
    const loginBtn = document.querySelector('#login-form button[type=submit]');
    if (loginBtn) {
      loginBtn.classList.remove('btn-login-loading');
      loginBtn.textContent = 'Entrar';
    }

    // Restaurar tab de login activo
    document.querySelectorAll('.tab-toggle').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === 'login');
    });
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');

    // Cambiar pantallas
    loginScreen.classList.add('active');
    document.getElementById('app-screen').classList.remove('active');
  },

  async showApp() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');

    // Reproducir sonido de entrada (descomenta cuando subas el archivo)
    this.playEntrySound();

    // Crear overlay de zoom + flash dorado
    const overlay = document.createElement('div');
    overlay.id = 'entry-overlay';
    overlay.innerHTML = `
      <div class="entry-flash"></div>
      <img src="logo-mundial-2026.png" alt="" class="entry-logo">
    `;
    document.body.appendChild(overlay);

    // Pre-cargar la app debajo del overlay
    document.getElementById('header-username').textContent = this.user.display_name;
    await this.refreshPoints();
    this.renderNav();
    this.navigate('fixture');

    // Transición: login → overlay con zoom → flash → app
    loginScreen.style.transition = 'opacity 0.3s ease';
    loginScreen.style.opacity = '0';

    setTimeout(() => {
      loginScreen.classList.remove('active');
      loginScreen.style.opacity = '';
      loginScreen.style.transition = '';
      appScreen.classList.add('active');
    }, 300);

    // Remover overlay después de toda la animación (1.6s)
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 400);
    }, 1600);
  },

  playEntrySound() {
    try {
      const audio = new Audio('entry-sound.mp3');
      audio.volume = 0.6;
      audio.play().catch(() => {
        // El navegador bloqueó el sonido o no existe el archivo, ignorar silenciosamente
      });
    } catch (e) { /* archivo no existe aún, ignorar */ }
  },

  logout() {
    sessionStorage.removeItem('polla_token');
    this.token = null;
    this.user = null;
    this.showLogin();
  },

  async refreshPoints() {
    try {
      const [lb1, lb2] = await Promise.all([
        this.api('/leaderboard/groups').catch(() => ({ leaderboard: [] })),
        this.api('/leaderboard/knockout').catch(() => ({ leaderboard: [] }))
      ]);
      const me1 = lb1.leaderboard?.find(u => u.user_id === this.user.id);
      const me2 = lb2.leaderboard?.find(u => u.user_id === this.user.id);
      const pts1 = me1 ? me1.points : null;
      const pts2 = me2 ? me2.points : null;

      // Contador principal (Grupos)
      const headerPts = document.getElementById('header-points');
      if (headerPts) headerPts.textContent = (pts1 ?? 0) + ' pts';

      // Contador secundario (Eliminatorias) — crearlo si no existe
      let headerPts2 = document.getElementById('header-points-ko');
      if (!headerPts2 && headerPts) {
        headerPts2 = document.createElement('span');
        headerPts2.id = 'header-points-ko';
        headerPts2.style.cssText = 'display:inline-block;margin-left:6px;padding:4px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;color:var(--color-text)';
        headerPts2.title = 'Tus puntos en Eliminatorias';
        headerPts.insertAdjacentElement('afterend', headerPts2);
      }
      if (headerPts2 && pts2 != null) {
        headerPts2.textContent = '🏆 ' + pts2 + ' pts';
        headerPts2.style.display = 'inline-block';
      } else if (headerPts2) {
        headerPts2.style.display = 'none';
      }

      // Actualizar el botón principal con label de fase
      if (headerPts) headerPts.title = 'Tus puntos en Fase de Grupos';
    } catch (e) {}
  },

  renderNav() {
    const views = [
      { id: 'fixture',    label: 'Fixture' },
      { id: 'leaderboard',label: 'Ranking' },
      { id: 'today',      label: 'Hoy' },
      { id: 'groups',     label: 'Grupos' },
      { id: 'knockout',   label: 'Eliminatorias' },
      { id: 'podium',     label: 'Podio' },
      { id: 'minipollas', label: 'Mini-Pronósticos' },
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

  // Bracket de MI PRONÓSTICO usando las MISMAS clases visuales que el bracket real
  // (bk-match, pw-bracket, etc.) para que se vea igual, con llaves eliminadas en gris.
  _buildMyBracketHtml(matchById) {
    const QF_PAIRS  = { 'QF-1': ['R32-3','R32-5'], 'QF-2': ['R32-1','R32-4'], 'QF-3': ['R32-2','R32-6'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-14','R32-16'], 'QF-8': ['R32-13','R32-15'] };
    const SF_PAIRS  = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-5','QF-6'], 'SF-3': ['QF-3','QF-4'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
    const FINAL_PAIR = ['SF-5','SF-6'];
    const compSet = this._compensatedSet || new Set();

    const userWinnerOf = (matchId, homeCode, awayCode) => {
      if (compSet.has(matchId)) {
        const real = matchById[matchId];
        if (real && real.winner) return real.winner;
      }
      const pred = this.predictions[matchId];
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
        homeCode = m?.home_team || null;
        awayCode = m?.away_team || null;
      } else if (QF_PAIRS[matchId]) {
        const [a, b] = QF_PAIRS[matchId];
        const ra = resolveMatch(a), rb = resolveMatch(b);
        homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
        awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
      } else if (SF_PAIRS[matchId]) {
        const [a, b] = SF_PAIRS[matchId];
        const ra = resolveMatch(a), rb = resolveMatch(b);
        homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
        awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
      } else if (matchId === 'FINAL') {
        const [a, b] = FINAL_PAIR;
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

    // Detecta llaves "muertas": ya jugadas en la realidad y el usuario predijo mal,
    // o dependen de una llave que ya está muerta.
    const deadCache = {};
    const isDead = (matchId) => {
      if (matchId in deadCache) return deadCache[matchId];
      if (compSet.has(matchId)) return deadCache[matchId] = false; // compensados nunca se marcan muertos
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
      const pair = QF_PAIRS[matchId] || SF_PAIRS[matchId] || (matchId === 'FINAL' ? FINAL_PAIR : null);
      if (pair && pair.some(p => isDead(p))) return deadCache[matchId] = true;
      if (real && real.home_score != null && real.winner) {
        const { homeCode, awayCode } = resolveMatch(matchId);
        const predW = userWinnerOf(matchId, homeCode, awayCode);
        if (predW && predW !== real.winner) return deadCache[matchId] = true;
      }
      return deadCache[matchId] = false;
    };

    const myMatchCard = (matchId) => {
      const { homeCode, awayCode } = resolveMatch(matchId);
      const home = homeCode ? this.teamByCode(homeCode) : null;
      const away = awayCode ? this.teamByCode(awayCode) : null;
      const pred = this.predictions[matchId];
      const hasPred = !!(pred && (pred.pred_home != null || pred.pred_winner != null));
      const dead = isDead(matchId);

      const predWinner = homeCode && awayCode ? userWinnerOf(matchId, homeCode, awayCode) : null;
      const showScore = pred && pred.pred_home != null;
      const penH = pred && pred.pred_pen_home != null ? `(${pred.pred_pen_home})` : '';
      const penA = pred && pred.pred_pen_away != null ? `(${pred.pred_pen_away})` : '';

      if (!home && !away) return `<div class="bk-match empty"><div class="bk-team"><span class="bk-name" style="opacity:0.5">Por definir</span></div><div class="bk-team"><span class="bk-name" style="opacity:0.5">Por definir</span></div></div>`;

      return `<div class="bk-match${hasPred ? ' played' : ''}${dead ? ' dead' : ''}">
        <div class="bk-team ${predWinner && home && predWinner === home.code ? 'winner' : predWinner && home ? 'loser' : ''}">
          <span class="bk-flag">${home?.flag || '?'}</span>
          <span class="bk-name">${home?.name || 'Por definir'}</span>
          ${showScore ? `<span class="bk-score">${pred.pred_home}${penH}</span>` : ''}
        </div>
        <div class="bk-team ${predWinner && away && predWinner === away.code ? 'winner' : predWinner && away ? 'loser' : ''}">
          <span class="bk-flag">${away?.flag || '?'}</span>
          <span class="bk-name">${away?.name || 'Por definir'}</span>
          ${showScore ? `<span class="bk-score">${pred.pred_away}${penA}</span>` : ''}
        </div>
        ${dead ? `<div style="font-size:9px;color:#f87171;padding:2px 7px;border-top:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06)">❌ eliminado</div>` : ''}
      </div>`;
    };

    const myCol = (matchIds, label) => `
      <div class="pw-col">
        <div class="pw-col-label">${label}</div>
        <div class="pw-col-matches">${matchIds.map(id => myMatchCard(id)).join('')}</div>
      </div>`;

    return `
      <div class="pw-bracket">
        <div class="pw-side pw-left">
          ${myCol(['R32-3','R32-5','R32-1','R32-4','R32-11','R32-12','R32-9','R32-10'], 'Dieciseisavos')}
          ${myCol(['QF-1','QF-2','QF-5','QF-6'], 'Octavos')}
          ${myCol(['SF-1','SF-2'], 'Cuartos')}
          ${myCol(['SF-5'], 'Semis')}
        </div>
        <div class="pw-center">
          <div class="pw-center-label">Gran Final</div>
          ${myMatchCard('FINAL')}
          <div class="pw-center-label" style="margin-top:16px">3er Puesto</div>
          ${myMatchCard('TP')}
        </div>
        <div class="pw-side pw-right">
          ${myCol(['SF-6'], 'Semis')}
          ${myCol(['SF-3','SF-4'], 'Cuartos')}
          ${myCol(['QF-3','QF-4','QF-7','QF-8'], 'Octavos')}
          ${myCol(['R32-2','R32-6','R32-7','R32-8','R32-14','R32-16','R32-13','R32-15'], 'Dieciseisavos')}
        </div>
      </div>`;
  },

  renderFixture(main) {
    this._fixtureTab = this._fixtureTab || this.getActivePhase();
    this._mypredLoaded = false;

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

    // ── Tarjeta de partido para bracket: muestra cruce REAL + mi predicción de ganador
    const myPreds = this.predictions || {};

    // Detectar la fase KO activa: la primera que tiene partidos sin resultado
    // (con equipos ya definidos). "Mi pred" solo se muestra en esa fase.
    const koPhaseOrder = ['r16', 'qf', 'sf', 'final', 'tp'];
    const activeKOPhase = (() => {
      for (const phase of koPhaseOrder) {
        const hasUnplayed = this.matches.some(m =>
          m.phase === phase && m.home_score == null && m.home_team
        );
        if (hasUnplayed) return phase;
      }
      // Todas jugadas → mostrar en la última con resultados
      return 'final';
    })();

    const matchCard = (m) => {
      if (!m) return `<div class="bk-match empty">?</div>`;
      const home = m.home_team ? this.teamByCode(m.home_team) : null;
      const away = m.away_team ? this.teamByCode(m.away_team) : null;
      const hasResult = m.home_score != null;
      const wc = m.winner;
      const bothDefined = m.home_team && m.away_team;

      const teamRow = (team, code, scoreVal, penVal, confirmed) => {
        const isRealWinner = wc === code;
        const cls = isRealWinner ? 'winner' : (hasResult ? 'loser' : '');
        // Equipo aún no confirmado matemáticamente → gris opaco (provisional)
        const provisional = bothDefined && confirmed === false && !hasResult;
        return `<div class="bk-team ${cls}${provisional ? ' provisional' : ''}">
          <span class="bk-flag">${team?.flag || '?'}</span>
          <span class="bk-name">${team?.name || (bothDefined ? '?' : '???')}</span>
          ${hasResult ? `<span class="bk-score">${scoreVal}${penVal != null ? `(${penVal})` : ''}</span>` : ''}
        </div>`;
      };

      return `<div class="bk-match${hasResult ? ' played' : ''}">
        ${teamRow(home, m.home_team, m.home_score, m.pen_home, m.home_confirmed)}
        ${teamRow(away, m.away_team, m.away_score, m.pen_away, m.away_confirmed)}
      </div>`;
    };

    // ── Grupos HTML unificado: resultado real + mi pronóstico lado a lado
    const myPredsByMatch = this.predictions || {};

    // Calcular posiciones de cada grupo SEGÚN MIS PRONÓSTICOS
    const myGroups = {};
    groupMatches.forEach(m => {
      if (!myGroups[m.group_name]) myGroups[m.group_name] = {};
      [m.home_team, m.away_team].forEach(code => {
        if (code && !myGroups[m.group_name][code]) {
          const t = this.teamByCode(code);
          myGroups[m.group_name][code] = { code, name: t.name, flag: t.flag, pts: 0, pj: 0, gf: 0, ga: 0, gd: 0 };
        }
      });
      const pred = myPredsByMatch[m.id];
      if (pred && pred.pred_home != null && m.home_team && m.away_team) {
        const h = myGroups[m.group_name][m.home_team];
        const a = myGroups[m.group_name][m.away_team];
        if (h && a) {
          const ph = parseInt(pred.pred_home), pa = parseInt(pred.pred_away);
          h.pj++; a.pj++;
          h.gf += ph; h.ga += pa;
          a.gf += pa; a.ga += ph;
          h.gd = h.gf - h.ga; a.gd = a.gf - a.ga;
          if (ph > pa) h.pts += 3;
          else if (pa > ph) a.pts += 3;
          else { h.pts += 1; a.pts += 1; }
        }
      }
    });
    const mySortedGroups = {};
    for (const [g, teams] of Object.entries(myGroups)) {
      mySortedGroups[g] = Object.values(teams).sort((a, b) =>
        b.pts !== a.pts ? b.pts - a.pts : b.gd !== a.gd ? b.gd - a.gd : b.gf - a.gf
      );
    }

    const miniStandingTable = (standing, isPred) => `
      <table class="fixture-group-table">
        <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>Pts</th><th>GD</th></tr></thead>
        <tbody>
          ${standing.map((t, i) => `
            <tr class="${i < 2 ? 'classified' : ''}">
              <td style="font-size:10px;color:var(--color-text-muted)">${i+1}</td>
              <td style="font-size:11px"><span style="margin-right:3px">${t.flag}</span>${t.name}</td>
              <td style="text-align:center;font-size:11px">${t.pj}</td>
              <td style="text-align:center;font-size:11px;font-weight:${i<2?'700':'400'}">${t.pts}</td>
              <td style="text-align:center;font-size:11px">${t.gd > 0 ? '+' : ''}${t.gd}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

    const groupsHtml = Object.keys(sortedGroups).sort().map(g => {
      const standing = sortedGroups[g];
      const myStanding = mySortedGroups[g] || [];
      const color = groupColors[g] || '#C9A84C';
      const gMatches = groupMatches.filter(m => m.group_name === g);

      // Filas de partidos con columnas alineadas vía <colgroup>
      const matchRows = gMatches.map(m => {
        const home = this.teamByCode(m.home_team);
        const away = this.teamByCode(m.away_team);
        const pred = myPredsByMatch[m.id];
        const hasResult = m.home_score != null;
        const hasPred = pred && pred.pred_home != null;
        const realStr = hasResult ? `${m.home_score}-${m.away_score}` : '–';
        const predStr = hasPred ? `${pred.pred_home}-${pred.pred_away}` : '–';

        let pts = null, ptsColor = 'var(--color-text-muted)';
        if (hasResult && hasPred) {
          const ph = parseInt(pred.pred_home), pa = parseInt(pred.pred_away);
          const rh = parseInt(m.home_score), ra = parseInt(m.away_score);
          if (ph === rh && pa === ra) { pts = 5; ptsColor = '#C9A84C'; }
          else {
            const pr = ph > pa ? 'H' : ph < pa ? 'A' : 'D';
            const rr = rh > ra ? 'H' : rh < ra ? 'A' : 'D';
            if (pr !== rr) { pts = 0; }
            else if (Math.abs(ph-pa) === Math.abs(rh-ra)) { pts = 3; ptsColor = '#60a5fa'; }
            else { pts = 2; ptsColor = '#4ade80'; }
          }
        }

        return `<tr style="${!hasResult ? 'opacity:0.75' : ''}">
          <td style="font-size:11px;text-align:right;white-space:nowrap;padding:3px 4px">${home.name} ${home.flag}</td>
          <td style="text-align:center;padding:3px 4px">
            <span style="background:var(--color-background-secondary);border-radius:4px;padding:1px 6px;font-weight:600;font-size:11px">${realStr}</span>
          </td>
          <td style="text-align:center;padding:3px 4px">
            <span style="background:${hasPred ? 'rgba(255,255,255,0.06)' : 'transparent'};border-radius:4px;padding:1px 6px;font-size:11px;color:${hasPred ? 'var(--color-text)' : 'var(--color-text-muted)'}">${predStr}</span>
          </td>
          <td style="text-align:center;font-size:11px;font-weight:700;color:${ptsColor};padding:3px 4px">${pts !== null ? (pts > 0 ? '+'+pts : '✗') : '·'}</td>
          <td style="font-size:11px;text-align:left;white-space:nowrap;padding:3px 4px">${away.flag} ${away.name}</td>
        </tr>`;
      }).join('');

      return `
        <div class="fixture-group-card" style="border-left:3px solid ${color}">
          <div class="fixture-group-title" style="color:${color}">Grupo ${g}</div>
          <div class="fgc-standings">
            <div>
              <div class="fgc-label">📊 Posiciones reales</div>
              ${miniStandingTable(standing, false)}
            </div>
            <div>
              <div class="fgc-label">🎯 Según mi pronóstico</div>
              ${miniStandingTable(myStanding, true)}
            </div>
          </div>
          <div class="fgc-matches-wrap">
            <table class="fgc-matches">
              <colgroup>
                <col style="width:32%"><col style="width:16%"><col style="width:16%"><col style="width:10%"><col style="width:26%">
              </colgroup>
              <thead>
                <tr>
                  <th style="text-align:right">Local</th>
                  <th style="text-align:center">Real</th>
                  <th style="text-align:center">Mi pred</th>
                  <th style="text-align:center">Pts</th>
                  <th style="text-align:left">Visitante</th>
                </tr>
              </thead>
              <tbody>${matchRows}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    // ── Bracket pathway (afuera → adentro, con scroll horizontal en mobile)
    // Estructura FIFA oficial:
    // Lado IZQUIERDO (→SF-5→Final): QF-1,2,5,6 → SF-1,2 → SF-5
    // Lado DERECHO (→SF-6→Final): QF-3,4,7,8 → SF-3,4 → SF-6
    const p1r32 = ['R32-3','R32-5','R32-1','R32-4','R32-11','R32-12','R32-9','R32-10'].map(id => matchById[id] || null);
    const p1r16 = ['QF-1','QF-2','QF-5','QF-6'].map(id => matchById[id] || null);
    const p1qf  = ['SF-1','SF-2'].map(id => matchById[id] || null);
    const p1sf  = matchById['SF-5'] || null;

    const p2r32 = ['R32-2','R32-6','R32-7','R32-8','R32-14','R32-16','R32-13','R32-15'].map(id => matchById[id] || null);
    const p2r16 = ['QF-3','QF-4','QF-7','QF-8'].map(id => matchById[id] || null);
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

    // Bracket de PRONÓSTICO del usuario (reutiliza la lógica con dead-paths)
    const myPredBracketHtml = this._buildMyBracketHtml(matchById);

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
        /* ── Toggle de bracket real/pronóstico ── */
        .bracket-toggle-bar { display:flex; justify-content:center; margin-bottom:12px; }
        .bracket-toggle-btn {
          display:inline-flex; align-items:center; gap:10px; cursor:pointer;
          background:var(--color-surface); border:1px solid var(--color-border);
          border-radius:24px; padding:8px 18px; font-size:13px; font-weight:600;
          color:var(--color-text); transition:all 0.2s; user-select:none;
        }
        .bracket-toggle-btn:hover { border-color:var(--color-primary); background:var(--color-surface-2); }
        .bracket-toggle-btn .btg-current { color:var(--color-primary); }
        .bracket-toggle-btn .btg-arrow { color:var(--color-text-muted); font-size:15px; }
        .bracket-toggle-btn .btg-next { color:var(--color-text-muted); font-size:12px; }
        .bracket-legend {
          display:flex; gap:14px; flex-wrap:wrap; align-items:center;
          font-size:11px; color:var(--color-text-muted); margin-bottom:8px;
          padding:6px 10px; background:var(--color-surface);
          border:1px solid var(--color-border); border-radius:8px;
        }
        .bracket-slider-viewport { overflow:hidden; width:100%; }
        .bracket-slider-track {
          display:flex; width:200%;
          transition:transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .bracket-slide { width:50%; flex-shrink:0; }

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
        .fixture-groups-grid { display:grid; grid-template-columns:1fr; gap:12px; }
        @media(min-width:900px){ .fixture-groups-grid{ grid-template-columns:1fr 1fr; } }
        .fixture-group-card {
          background:var(--color-surface); border:1px solid var(--color-border);
          border-radius:var(--radius-md); padding:10px;
          transition:transform 0.2s, box-shadow 0.2s;
        }
        .fixture-group-card:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.3); }
        .fixture-group-title { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; }
        .fixture-group-table { width:100%; border-collapse:collapse; font-size:12px; }
        .fixture-group-table th { font-size:10px; color:var(--color-text-muted); font-weight:500; padding:2px 4px; text-align:left; }
        .fixture-group-table td { padding:3px 4px; color:var(--color-text); white-space:nowrap; }
        .fixture-group-table tr.classified { background:rgba(255,255,255,0.04); }
        .fixture-group-table tr.classified td:nth-child(2) { font-weight:600; }

        /* ── Grupo unificado: dos tablas de posiciones + partidos ── */
        .fgc-standings { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
        .fgc-label { font-size:9px; font-weight:700; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px; }
        .fgc-matches-wrap { overflow-x:auto; }
        .fgc-matches { width:100%; border-collapse:collapse; }
        .fgc-matches th { font-size:9px; color:var(--color-text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px; padding:4px; border-bottom:1px solid var(--color-border); }
        .fgc-matches td { color:var(--color-text); }
        @media(max-width:480px){
          .fgc-standings { grid-template-columns:1fr; gap:8px; }
          .fgc-matches { min-width:300px; }
        }


        /* ── Tarjeta de partido bracket ── */
        .bk-match {
          background:var(--color-surface); border:1px solid var(--color-border);
          border-radius:var(--radius-md); overflow:hidden;
          transition:border-color 0.2s; margin-bottom:4px;
        }
        .bk-match.played { border-color:rgba(201,168,76,0.35); }
        .bk-match.pick-hit { border-color:rgba(74,222,128,0.5); }
        .bk-match.pick-miss { border-color:rgba(248,113,113,0.4); }
        .bk-match.dead { opacity:0.4; filter:grayscale(0.8); }
        .bk-match.empty { padding:8px; font-size:11px; color:var(--color-text-muted); font-style:italic; text-align:center; }
        .bk-team { display:flex; align-items:center; gap:5px; padding:4px 7px; font-size:11px; border-bottom:1px solid var(--color-border); }
        .bk-team:last-child { border-bottom:none; }
        .bk-team.winner { background:rgba(201,168,76,0.1); font-weight:700; color:var(--color-primary); }
        .bk-team.loser { opacity:0.4; }
        .bk-team.mypick { box-shadow:inset 3px 0 0 #60a5fa; }
        .bk-team.provisional { opacity:0.55; }
        .bk-team.provisional .bk-name { color:var(--color-text-muted); font-style:italic; }
        .bk-flag { font-size:13px; flex-shrink:0; }
        .bk-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bk-score { font-weight:700; font-size:12px; flex-shrink:0; }
        .bk-pick-dot { color:#60a5fa; font-size:8px; flex-shrink:0; }
        .bk-mypred { font-size:13px; color:var(--color-text); padding:4px 8px; background:rgba(96,165,250,0.08); border-top:1px solid var(--color-border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500; }

        /* ── Bracket pathway (siempre visible, scroll horizontal en mobile) ── */
        .pw-bracket {
          display:flex;
          gap:0;
          min-height:600px;
          align-items:stretch;
          min-width:1100px;
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

        /* Wrapper con scroll horizontal */
        .pw-bracket-wrapper {
          width: 100%;
          overflow-x: auto;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }
        .pw-bracket-wrapper::-webkit-scrollbar { height: 6px; }
        .pw-bracket-wrapper::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 3px; }

        /* Hint de scroll en mobile */
        .pw-scroll-hint {
          display:block;
          font-size:11px; color:var(--color-text-muted);
          text-align:center; padding:6px 0;
          font-style:italic;
        }
        @media(min-width:1200px){ .pw-scroll-hint { display:none; } }

        /* En desktop grande, usa todo el ancho */
        @media(min-width:1200px){
          .pw-bracket-wrapper {
            width: 100vw;
            margin-left: calc(-1 * (100vw - 100%) / 2);
            padding: 0 16px;
          }
        }
      </style>`;

    main.innerHTML = `
      <h2>Fixture · FIFA World Cup 2026™</h2>
      ${CSS}
      <div class="fixture-tabs">
        <button class="fixture-tab ${this._fixtureTab === 'finals' ? 'active' : ''}" data-tab="finals">Eliminatorias</button>
        <button class="fixture-tab ${this._fixtureTab === 'groups' ? 'active' : ''}" data-tab="groups">Fase de Grupos</button>
      </div>
      <div class="fixture-tab-content ${this._fixtureTab === 'groups' ? 'active' : ''}" id="ftab-groups">
        <div class="fixture-groups-grid">${groupsHtml}</div>
      </div>
      <div class="fixture-tab-content ${this._fixtureTab === 'finals' ? 'active' : ''}" id="ftab-finals">
        <div class="bracket-toggle-bar">
          <button class="bracket-toggle-btn" id="bracket-toggle" onclick="app.toggleBracketView()">
            <span class="btg-current">🏆 Bracket Real</span>
            <span class="btg-arrow">⇄</span>
            <span class="btg-next">🔮 Mi Pronóstico</span>
          </button>
        </div>
        <div class="bracket-legend" id="bracket-legend-real">
          <span style="font-weight:700;color:var(--color-text)">Leyenda:</span>
          <span><span style="display:inline-block;width:8px;height:8px;background:rgba(201,168,76,0.4);border-radius:2px;vertical-align:middle"></span> Ganador real</span>
          <span><span style="color:#60a5fa">● </span>Mi pronóstico</span>
          <span><span style="color:#4ade80">✓</span> Acerté · <span style="color:#f87171">✗</span> Fallé</span>
        </div>
        <div class="bracket-legend" id="bracket-legend-pred" style="display:none">
          <span style="font-weight:700;color:var(--color-text)">Tu bracket:</span>
          <span>Tal como lo pronosticaste</span>
          <span><span style="opacity:0.4;filter:grayscale(0.8)">▦</span> <span style="color:#f87171">❌ eliminado</span> = ese camino ya no se puede dar</span>
        </div>
        <div class="pw-scroll-hint">← Desliza horizontalmente para ver el bracket completo →</div>
        <div class="bracket-slider-viewport">
          <div class="bracket-slider-track" id="bracket-slider-track">
            <div class="bracket-slide">
              <div class="pw-bracket-wrapper">${bracketDesktopHtml}</div>
            </div>
            <div class="bracket-slide">
              <div class="pw-bracket-wrapper">${myPredBracketHtml}</div>
            </div>
          </div>
        </div>
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

    // Restaurar el modo de bracket si el usuario ya lo había cambiado
    if (this._bracketView === 'pred') {
      const track = document.getElementById('bracket-slider-track');
      if (track) { track.style.transition = 'none'; this.toggleBracketView(true); setTimeout(() => { if (track) track.style.transition = ''; }, 50); }
    }
  },

  // Alternar entre bracket real y bracket de pronóstico (slide horizontal)
  toggleBracketView(forceToPred) {
    const track = document.getElementById('bracket-slider-track');
    const btn = document.getElementById('bracket-toggle');
    const legendReal = document.getElementById('bracket-legend-real');
    const legendPred = document.getElementById('bracket-legend-pred');
    if (!track || !btn) return;

    // Determinar el nuevo estado
    const goingToPred = forceToPred === true ? true : this._bracketView !== 'pred';
    this._bracketView = goingToPred ? 'pred' : 'real';

    // Deslizar el track
    track.style.transform = goingToPred ? 'translateX(-50%)' : 'translateX(0)';

    // Actualizar el texto del botón
    const current = btn.querySelector('.btg-current');
    const next = btn.querySelector('.btg-next');
    if (goingToPred) {
      current.textContent = '🔮 Mi Pronóstico';
      next.textContent = '🏆 Bracket Real';
      if (legendReal) legendReal.style.display = 'none';
      if (legendPred) legendPred.style.display = 'flex';
    } else {
      current.textContent = '🏆 Bracket Real';
      next.textContent = '🔮 Mi Pronóstico';
      if (legendReal) legendReal.style.display = 'flex';
      if (legendPred) legendPred.style.display = 'none';
    }
  },

  // ── MI PRONÓSTICO ──────────────────────────────────────────────────────────

  async loadMyPredictions() {
    const container = document.getElementById('mypred-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:2rem">Cargando mi pronóstico...</div>';

    try {
      const [classified, freshPreds, podiumData] = await Promise.all([
        this.api('/predictions/classified'),
        this.api('/predictions'),
        this.api('/podium').catch(() => null)
      ]);
      // Refrescar predicciones locales para que "Mis marcadores" siempre esté al día
      this.predictions = Object.fromEntries(freshPreds.map(p => [p.match_id, p]));

      // Si el usuario no tiene pronósticos, mostrar mensaje claro en vez de tablas vacías
      const groupMatches = this.matches.filter(m => m.phase === 'groups');
      const filledGroup = groupMatches.filter(m => this.predictions[m.id] && this.predictions[m.id].pred_home != null).length;
      if (filledGroup === 0) {
        container.innerHTML = `<div style="text-align:center;padding:2.5rem 1rem">
          <div style="font-size:2.2rem;margin-bottom:8px">📝</div>
          <p style="color:var(--color-text-muted);font-size:14px">Aún no tienes pronósticos registrados${!this.lockStatus.locked ? '.<br>Ve a la pestaña <strong>Grupos</strong> para llenarlos.' : '.'}</p>
        </div>`;
        return;
      }

      const groupColors = {
        A:'#1a5c8a', B:'#6b21a8', C:'#166534', D:'#991b1b',
        E:'#0f766e', F:'#92400e', G:'#5b21b6', H:'#1e40af',
        I:'#9d174d', J:'#065f46', K:'#7c2d12', L:'#164e63'
      };

      // ── Grupos con predicciones ──
      const matchesByGroup = {};
      groupMatches.forEach(m => {
        if (!matchesByGroup[m.group_name]) matchesByGroup[m.group_name] = [];
        matchesByGroup[m.group_name].push(m);
      });

      const groupsHtml = Object.keys(classified.groups).sort().map(g => {
        const standings = classified.groups[g];
        const color = groupColors[g] || '#C9A84C';
        const gMatches = matchesByGroup[g] || [];

        const matchesHtml = gMatches.map(m => {
          const pred = this.predictions[m.id];
          const home = this.teamByCode(m.home_team);
          const away = this.teamByCode(m.away_team);
          const ph = pred ? pred.pred_home : null;
          const pa = pred ? pred.pred_away : null;
          const hasPred = ph != null && pa != null;
          return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 0;${!hasPred ? 'opacity:0.4' : ''}">
            <span style="flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${home.flag} ${home.name}</span>
            <span style="font-weight:700;min-width:32px;text-align:center;background:var(--color-background-secondary);border-radius:4px;padding:1px 4px">${hasPred ? ph + '-' + pa : '–'}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${away.flag} ${away.name}</span>
          </div>`;
        }).join('');

        return `
          <div class="fixture-group-card" style="border-left:3px solid ${color}">
            <div class="fixture-group-title" style="color:${color}">Grupo ${g}</div>
            <table class="fixture-group-table">
              <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>Pts</th><th>GD</th></tr></thead>
              <tbody>
                ${standings.map((t, i) => `
                  <tr class="${t.classified ? 'classified' : ''}" ${i === 2 && classified.best8Thirds.some(b => b.code === t.team) ? 'style="background:rgba(201,168,76,0.08)"' : ''}>
                    <td style="font-size:11px;color:var(--color-text-muted)">${i+1}</td>
                    <td><span style="margin-right:4px">${t.team_info.flag}</span>${t.team_info.name}</td>
                    <td style="text-align:center">${t.played}</td>
                    <td style="text-align:center;font-weight:${t.classified?'700':'400'}">${t.pts}</td>
                    <td style="text-align:center">${t.gd > 0 ? '+' : ''}${t.gd}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--color-border)">
              <div style="font-size:10px;font-weight:600;color:var(--color-text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Mis marcadores</div>
              ${matchesHtml}
            </div>
          </div>`;
      }).join('');

      // ── Mejores terceros ──
      const best8Html = classified.best8Thirds.length > 0 ? `
        <div style="margin:12px 0;padding:10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md)">
          <div style="font-size:11px;font-weight:700;color:var(--color-primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Mis 8 mejores terceros clasificados</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${classified.best8Thirds.map(t => `<span style="font-size:12px;padding:3px 8px;background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.25);border-radius:12px">${t.flag} ${t.name}</span>`).join('')}
          </div>
        </div>` : '';

      // ── Bracket: equipos REALES del fixture + pronósticos del usuario en cascada ──
      // R32 arranca con los equipos reales que el admin va completando
      // De ahí en adelante, cada llave se llena con el ganador que el usuario pronosticó
      const matchesById = {};
      this.matches.forEach(m => { matchesById[m.id] = m; });

      const QF_PAIRS  = { 'QF-1': ['R32-3','R32-5'], 'QF-2': ['R32-1','R32-4'], 'QF-3': ['R32-2','R32-6'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-14','R32-16'], 'QF-8': ['R32-13','R32-15'] };
      const SF_PAIRS  = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-5','QF-6'], 'SF-3': ['QF-3','QF-4'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
      const FINAL_PAIR = ['SF-5','SF-6'];

      // Set de partidos compensados (cacheado desde renderKnockout o cargado aquí)
      const compSet = this._compensatedSet || new Set();

      // Calcula el ganador pronosticado por el usuario para una llave
      // (deriva del marcador; si empate, usa pred_winner para penales).
      // En partidos COMPENSADOS, el ganador REAL avanza obligatoriamente.
      const userWinnerOf = (matchId, homeCode, awayCode) => {
        if (compSet.has(matchId)) {
          const real = matchesById[matchId];
          if (real && real.winner) return real.winner;
        }
        const pred = this.predictions[matchId];
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

      // Resuelve los equipos de cada llave en cascada (memoizado)
      const resolved = {};
      const resolveMatch = (matchId) => {
        if (resolved[matchId]) return resolved[matchId];

        let homeCode = null, awayCode = null;

        if (matchId.startsWith('R32')) {
          // R32 usa los equipos REALES del fixture
          const m = matchesById[matchId];
          homeCode = m?.home_team || null;
          awayCode = m?.away_team || null;
        } else if (QF_PAIRS[matchId]) {
          const [a, b] = QF_PAIRS[matchId];
          const ra = resolveMatch(a);
          const rb = resolveMatch(b);
          homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
          awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
        } else if (SF_PAIRS[matchId]) {
          const [a, b] = SF_PAIRS[matchId];
          const ra = resolveMatch(a);
          const rb = resolveMatch(b);
          homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
          awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
        } else if (matchId === 'FINAL') {
          const [a, b] = FINAL_PAIR;
          const ra = resolveMatch(a);
          const rb = resolveMatch(b);
          homeCode = userWinnerOf(a, ra.homeCode, ra.awayCode);
          awayCode = userWinnerOf(b, rb.homeCode, rb.awayCode);
        } else if (matchId === 'TP') {
          // 3er puesto: perdedores de SF-5 y SF-6 según el usuario
          const ra = resolveMatch('SF-5');
          const rb = resolveMatch('SF-6');
          homeCode = userLoserOf('SF-5', ra.homeCode, ra.awayCode);
          awayCode = userLoserOf('SF-6', rb.homeCode, rb.awayCode);
        }

        resolved[matchId] = { homeCode, awayCode };
        return resolved[matchId];
      };

      const myMatchCard = (matchId) => {
        const { homeCode, awayCode } = resolveMatch(matchId);
        const home = homeCode ? this.teamByCode(homeCode) : null;
        const away = awayCode ? this.teamByCode(awayCode) : null;
        const pred = this.predictions[matchId];
        const hasPred = !!(pred && (pred.pred_home != null || pred.pred_winner != null));

        const predWinner = homeCode && awayCode ? userWinnerOf(matchId, homeCode, awayCode) : null;

        const showScore = pred && pred.pred_home != null;
        const penH = pred && pred.pred_pen_home != null ? `(${pred.pred_pen_home})` : '';
        const penA = pred && pred.pred_pen_away != null ? `(${pred.pred_pen_away})` : '';

        if (!home && !away) return `<div class="bk-match empty"><div class="bk-team"><span class="bk-name" style="opacity:0.5">Por definir</span></div><div class="bk-team"><span class="bk-name" style="opacity:0.5">Por definir</span></div></div>`;

        return `<div class="bk-match${hasPred ? ' played' : ''}">
          <div class="bk-team ${predWinner && home && predWinner === home.code ? 'winner' : predWinner && home ? 'loser' : ''}">
            <span class="bk-flag">${home?.flag || '?'}</span>
            <span class="bk-name">${home?.name || 'Por definir'}</span>
            ${showScore ? `<span class="bk-score">${pred.pred_home}${penH}</span>` : ''}
          </div>
          <div class="bk-team ${predWinner && away && predWinner === away.code ? 'winner' : predWinner && away ? 'loser' : ''}">
            <span class="bk-flag">${away?.flag || '?'}</span>
            <span class="bk-name">${away?.name || 'Por definir'}</span>
            ${showScore ? `<span class="bk-score">${pred.pred_away}${penA}</span>` : ''}
          </div>
        </div>`;
      };

      const myCol = (matchIds, label) => `
        <div class="pw-col">
          <div class="pw-col-label">${label}</div>
          <div class="pw-col-matches">
            ${matchIds.map(id => myMatchCard(id)).join('')}
          </div>
        </div>`;

      const myBracketHtml = `
        <div class="pw-bracket">
          <div class="pw-side pw-left">
            ${myCol(['R32-3','R32-5','R32-1','R32-4','R32-11','R32-12','R32-9','R32-10'], 'Dieciseisavos')}
            ${myCol(['QF-1','QF-2','QF-5','QF-6'], 'Octavos')}
            ${myCol(['SF-1','SF-2'], 'Cuartos')}
            ${myCol(['SF-5'], 'Semis')}
          </div>
          <div class="pw-center">
            <div class="pw-center-label">Gran Final</div>
            ${myMatchCard('FINAL')}
            <div class="pw-center-label" style="margin-top:16px">3er Puesto</div>
            ${myMatchCard('TP')}
          </div>
          <div class="pw-side pw-right">
            ${myCol(['SF-6'], 'Semis')}
            ${myCol(['SF-3','SF-4'], 'Cuartos')}
            ${myCol(['QF-3','QF-4','QF-7','QF-8'], 'Octavos')}
            ${myCol(['R32-2','R32-6','R32-7','R32-8','R32-14','R32-16','R32-13','R32-15'], 'Dieciseisavos')}
          </div>
        </div>`;

      // ── Podio predicho ──
      let podiumHtml = '';
      if (podiumData && podiumData.first_place) {
        const t1 = this.teamByCode(podiumData.first_place);
        const t2 = podiumData.second_place ? this.teamByCode(podiumData.second_place) : null;
        const t3 = podiumData.third_place ? this.teamByCode(podiumData.third_place) : null;
        podiumHtml = `
          <div style="margin:12px 0;padding:10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md)">
            <div style="font-size:11px;font-weight:700;color:var(--color-primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Mi podio</div>
            <div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap">
              <div style="text-align:center"><div style="font-size:22px">🥇</div><div style="font-size:13px;font-weight:700">${t1.flag} ${t1.name}</div></div>
              ${t2 ? `<div style="text-align:center"><div style="font-size:22px">🥈</div><div style="font-size:13px;font-weight:600">${t2.flag} ${t2.name}</div></div>` : ''}
              ${t3 ? `<div style="text-align:center"><div style="font-size:22px">🥉</div><div style="font-size:13px;font-weight:600">${t3.flag} ${t3.name}</div></div>` : ''}
            </div>
          </div>`;
      }

      // Contador de predicciones
      const totalGroupMatches = groupMatches.length;
      const koMatchIds = ['R32-1','R32-2','R32-3','R32-4','R32-5','R32-6','R32-7','R32-8','R32-9','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16','QF-1','QF-2','QF-3','QF-4','QF-5','QF-6','QF-7','QF-8','SF-1','SF-2','SF-3','SF-4','SF-5','SF-6','TP','FINAL'];
      const filledKo = koMatchIds.filter(id => this.predictions[id] && (this.predictions[id].pred_winner != null || this.predictions[id].pred_home != null)).length;

      container.innerHTML = `
        <div style="margin-bottom:12px;padding:10px 14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:13px">
          <strong style="color:var(--color-primary)">📊 Resumen:</strong>
          Grupos: <strong>${filledGroup}/${totalGroupMatches}</strong> partidos pronosticados ·
          Eliminatorias: <strong>${filledKo}/${koMatchIds.length}</strong> llaves completadas
        </div>
        <h3 style="font-size:14px;color:var(--color-primary);margin:16px 0 8px">Fase de Grupos</h3>
        <div class="fixture-groups-grid">${groupsHtml}</div>
        ${best8Html}
        <h3 style="font-size:14px;color:var(--color-primary);margin:20px 0 8px">Eliminatorias</h3>
        <div class="pw-scroll-hint">← Desliza horizontalmente para ver tu bracket →</div>
        <div class="pw-bracket-wrapper">${myBracketHtml}</div>
        ${podiumHtml}
      `;
    } catch (e) {
      container.innerHTML = `<div style="text-align:center;color:var(--color-error);padding:2rem">Error al cargar: ${e.message}</div>`;
    }
  },

  // ── COMPARARME CON OTRO JUGADOR ─────────────────────────────────────────────

  async showCompare(rivalId, rivalName, phase) {
    document.getElementById('compare-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'compare-modal';
    modal.innerHTML = `
      <style>
        #compare-modal { position:fixed;inset:0;z-index:8002;background:rgba(0,0,0,0.85);display:flex;align-items:flex-start;justify-content:center;padding:20px 10px;overflow-y:auto; }
        #compare-modal .cmp-panel { width:min(700px,100%);background:var(--color-background,#101018);border:1px solid var(--color-border);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.5); }
        #compare-modal .cmp-head { display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid var(--color-border); }
        #compare-modal .cmp-close { background:transparent;border:1px solid var(--color-border);color:var(--color-text-muted);font-size:14px;cursor:pointer;border-radius:8px;padding:5px 10px; }
        #compare-modal .cmp-body { padding:14px 16px 20px; }
        #compare-modal .cmp-scores { display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap; }
        #compare-modal .cmp-score-box { flex:1;min-width:120px;text-align:center;padding:10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:10px; }
        #compare-modal .cmp-score-box.me { border-color:rgba(201,168,76,0.4); }
        #compare-modal .cmp-section-title { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;display:flex;align-items:center;gap:6px; }
        #compare-modal table.cmp-t { width:100%;border-collapse:collapse;font-size:12px; }
        #compare-modal table.cmp-t th { font-size:10px;color:var(--color-text-muted);font-weight:500;padding:3px 6px;border-bottom:1px solid var(--color-border); }
        #compare-modal table.cmp-t td { padding:4px 6px;border-bottom:1px solid rgba(255,255,255,0.04); }
        #compare-modal table.cmp-t tr:last-child td { border-bottom:none; }
        #compare-modal .cmp-matches { display:flex; flex-direction:column; gap:4px; }
        #compare-modal .cmp-match-row { padding:6px 8px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:8px; }
        #compare-modal .cmp-match-teams { font-size:12px; margin-bottom:4px; }
        #compare-modal .cmp-match-data { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:11px; }
        #compare-modal .cmp-pred-pair { display:inline-flex; align-items:center; gap:3px; }
        #compare-modal .cmp-net { margin-left:auto; white-space:nowrap; }
        @media(max-width:480px){
          #compare-modal .cmp-match-data { gap:8px; }
          #compare-modal .cmp-net { margin-left:0; width:100%; padding-top:2px; }
        }
        #compare-modal .cmp-net-5 { color:#C9A84C;font-weight:700; }
        #compare-modal .cmp-net-pos { color:#4ade80;font-weight:600; }
        #compare-modal .cmp-net-0 { color:var(--color-text-muted); }
        #compare-modal .cmp-alert { padding:10px 12px;border-radius:8px;font-size:12px;margin-bottom:10px; }
        #compare-modal .cmp-alert.good { background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);color:#4ade80; }
        #compare-modal .cmp-alert.warn { background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);color:#fbbf24; }
        #compare-modal .cmp-alert.bad { background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171; }
      </style>
      <div class="cmp-panel">
        <div class="cmp-head">
          <div style="font-weight:700;font-size:15px">⚔️ Tú vs <span style="color:var(--color-primary)">${rivalName}</span></div>
          <button class="cmp-close" onclick="document.getElementById('compare-modal').remove()">✕ Cerrar</button>
        </div>
        <div class="cmp-body" id="compare-content">
          <div style="text-align:center;color:var(--color-text-muted);padding:2rem">Calculando...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const container = document.getElementById('compare-content');
    try {
      const data = await this.api(`/users/${rivalId}/compare?phase=${phase||'knockout'}`);
      const { me, rival, gap, canCatchUp, gold, silver, neutral, totalPending } = data;

      const faseLabel = (data.phase === 'knockout') ? 'eliminatorias' : 'grupos';
      const alertClass = gap <= 0 ? 'good' : canCatchUp ? 'warn' : 'bad';
      const alertMsg = gap <= 0
        ? `🎉 Ya le vas ganando en ${faseLabel} por ${Math.abs(gap)} pts.`
        : canCatchUp
        ? `⚠️ Te lleva ${gap} pts en ${faseLabel}. Puedes alcanzarlo — máxima ganancia neta posible: ${gold.length * 5 + silver.reduce((s,m) => s+m.net_gain,0)} pts.`
        : `❌ Te lleva ${gap} pts en ${faseLabel}. Difícil alcanzarlo con los partidos pendientes.`;

      const renderTable = (matches, emptyMsg) => {
        if (!matches.length) return `<div style="font-size:12px;color:var(--color-text-muted);padding:6px 0">${emptyMsg}</div>`;
        return `<div class="cmp-matches">${matches.map(m => `
          <div class="cmp-match-row">
            <div class="cmp-match-teams">${m.home_flag} ${m.home_name} <span style="color:var(--color-text-muted);font-size:10px">vs</span> ${m.away_flag} ${m.away_name}</div>
            <div class="cmp-match-data">
              <span class="cmp-pred-pair"><span style="color:var(--color-text-muted);font-size:10px">Yo</span> <strong>${m.my_pred}</strong></span>
              <span class="cmp-pred-pair"><span style="color:var(--color-text-muted);font-size:10px">Él</span> ${m.rival_pred}</span>
              <span class="cmp-net ${m.net_gain === 5 ? 'cmp-net-5' : m.net_gain > 0 ? 'cmp-net-pos' : 'cmp-net-0'}">+5/+${m.rival_pts} <strong>(+${m.net_gain})</strong></span>
            </div>
          </div>`).join('')}</div>`;
      };

      container.innerHTML = `
        <div class="cmp-scores">
          <div class="cmp-score-box me">
            <div style="font-size:11px;color:var(--color-text-muted)">Tú</div>
            <div style="font-size:22px;font-weight:700;color:var(--color-primary)">${me.points}</div>
            <div style="font-size:10px;color:var(--color-text-muted)">pts en ${faseLabel}</div>
          </div>
          <div style="display:flex;align-items:center;font-size:20px;color:var(--color-text-muted)">⚔️</div>
          <div class="cmp-score-box">
            <div style="font-size:11px;color:var(--color-text-muted)">${rival.display_name.split(' ')[0]}</div>
            <div style="font-size:22px;font-weight:700">${rival.points}</div>
            <div style="font-size:10px;color:var(--color-text-muted)">pts en ${faseLabel}</div>
          </div>
        </div>
        <div class="cmp-alert ${alertClass}">${alertMsg}</div>
        <div class="cmp-section-title" style="color:#C9A84C">🏆 Partidos de oro — Si sale mi exacto: yo +5, él 0 (${gold.length})</div>
        ${renderTable(gold, 'No hay partidos donde solo tú sumes 5.')}
        <div class="cmp-section-title" style="color:#4ade80">📈 Ventaja parcial — Si sale mi exacto: yo +5, él algo menos (${silver.length})</div>
        ${renderTable(silver, 'No hay partidos con ventaja parcial.')}
        <div class="cmp-section-title" style="color:var(--color-text-muted)">🤝 Pronóstico idéntico — No mueve la brecha (${neutral.length})</div>
        ${renderTable(neutral, 'Sin pronósticos idénticos.')}
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:10px;padding-top:8px;border-top:1px solid var(--color-border)">
          Análisis basado en ${totalPending} partidos pendientes de ${faseLabel}.
        </div>`;
    } catch(e) {
      container.innerHTML = `<div style="color:var(--color-danger);padding:1rem">⚠️ ${e.message}</div>`;
    }
  },

  // ── DETALLE DE PUNTOS (partido a partido) ──────────────────────────────────

  async showPointsBreakdown(userId, displayName, phase) {
    document.getElementById('pts-breakdown-modal')?.remove();
    // Filtrar endpoint por fase
    const endpoint = phase === 'knockout'
      ? `/users/${userId}/points-breakdown?phase=knockout`
      : phase === 'groups'
      ? `/users/${userId}/points-breakdown?phase=groups`
      : `/users/${userId}/points-breakdown`;

    const modal = document.createElement('div');
    modal.id = 'pts-breakdown-modal';
    modal.innerHTML = `
      <style>
        #pts-breakdown-modal { position:fixed;inset:0;z-index:8001;background:rgba(0,0,0,0.85);display:flex;align-items:flex-start;justify-content:center;padding:20px 10px;overflow-y:auto; }
        #pts-breakdown-modal .pbm-panel { width:min(680px,100%);background:var(--color-background,#101018);border:1px solid var(--color-border);border-radius:14px;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.5); }
        #pts-breakdown-modal .pbm-head { display:flex;justify-content:space-between;align-items:center;padding:13px 16px;border-bottom:1px solid var(--color-border);flex-shrink:0; }
        #pts-breakdown-modal .pbm-title { font-weight:700;font-size:15px; }
        #pts-breakdown-modal .pbm-close { background:transparent;border:1px solid var(--color-border);color:var(--color-text-muted);font-size:14px;cursor:pointer;border-radius:8px;padding:5px 10px; }
        #pts-breakdown-modal .pbm-body { padding:14px 16px 20px;overflow-y:auto;max-height:80vh; }
        #pts-breakdown-modal .pbm-summary { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px; }
        #pts-breakdown-modal .pbm-chip { padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;background:var(--color-surface);border:1px solid var(--color-border); }
        #pts-breakdown-modal .pbm-chip.total { background:rgba(201,168,76,0.12);border-color:rgba(201,168,76,0.35);color:var(--color-primary); }
        #pts-breakdown-modal table.pbm-t { width:100%;border-collapse:collapse;font-size:12px; }
        #pts-breakdown-modal table.pbm-t th { font-size:10px;color:var(--color-text-muted);font-weight:500;padding:4px 6px;text-align:left;border-bottom:1px solid var(--color-border); }
        #pts-breakdown-modal table.pbm-t td { padding:5px 6px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle; }
        #pts-breakdown-modal table.pbm-t tr:last-child td { border-bottom:none; }
        #pts-breakdown-modal .pbm-pts-5 { color:#C9A84C;font-weight:700; }
        #pts-breakdown-modal .pbm-pts-3 { color:#60a5fa;font-weight:600; }
        #pts-breakdown-modal .pbm-pts-2 { color:#4ade80;font-weight:600; }
        #pts-breakdown-modal .pbm-pts-0 { color:var(--color-text-muted); }
        #pts-breakdown-modal .pbm-badge { display:inline-block;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600; }
        #pts-breakdown-modal .pbm-badge.exacto { background:rgba(201,168,76,0.15);color:#C9A84C; }
        #pts-breakdown-modal .pbm-badge.gdif { background:rgba(96,165,250,0.15);color:#60a5fa; }
        #pts-breakdown-modal .pbm-badge.ganador { background:rgba(74,222,128,0.15);color:#4ade80; }
        #pts-breakdown-modal .pbm-badge.fallo { background:rgba(255,255,255,0.06);color:var(--color-text-muted); }
      </style>
      <div class="pbm-panel">
        <div class="pbm-head">
          <div class="pbm-title">📊 Puntos de <span style="color:var(--color-primary)">${displayName}</span></div>
          <button class="pbm-close" onclick="document.getElementById('pts-breakdown-modal').remove()">✕ Cerrar</button>
        </div>
        <div class="pbm-body" id="pts-breakdown-content">
          <div style="text-align:center;color:var(--color-text-muted);padding:2rem">Cargando...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const container = document.getElementById('pts-breakdown-content');
    try {
      const data = await this.api(endpoint);
      const { matches } = data;

      if (!matches.length) {
        container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--color-text-muted)">Aún no hay partidos puntuados.</div>`;
        return;
      }

      const total = matches.reduce((s, m) => s + m.pts, 0);
      const exactos = matches.filter(m => m.category === 'exacto').length;
      const gdif = matches.filter(m => m.category === 'g+dif').length;
      const ganador = matches.filter(m => m.category === 'ganador').length;
      const fallos = matches.filter(m => m.category === 'fallo').length;

      const catClass = { exacto: 'exacto', 'g+dif': 'gdif', ganador: 'ganador', fallo: 'fallo' };
      const ptsClassByPts = (pts) => pts >= 5 ? 'pbm-pts-5' : pts === 4 ? 'pbm-pts-3' : pts === 3 ? 'pbm-pts-3' : pts === 2 ? 'pbm-pts-2' : 'pbm-pts-0';

      const rows = matches.map(m => {
        // Resultado real: incluye penales si los hubo
        let realStr = `${m.real_home}-${m.real_away}`;
        if (m.had_penalties && m.real_pen_home != null) {
          realStr += ` <span style="font-size:9px;color:var(--color-text-muted)">pen ${m.real_pen_home}-${m.real_pen_away}</span>`;
        }

        // Mi pronóstico: marcador + penales si el usuario predijo empate con penales
        let predStr = m.pred_home != null ? `${m.pred_home}-${m.pred_away}` : (m.pred_winner_name || '—');
        if (m.had_penalties && m.pred_pen_home != null) {
          predStr += ` <span style="font-size:9px;color:var(--color-text-muted)">pen ${m.pred_pen_home}-${m.pred_pen_away}</span>`;
        }

        // Etiqueta del cruce/ronda
        const grpLabel = m.phase === 'groups' ? `Gr.${m.group_name}` : ({r16:'16avos',qf:'8vos',sf:'SF',final:'Final',tp:'3er'}[m.phase] || m.phase.toUpperCase());

        // Quién avanzó (solo KO): mostrar el equipo real que pasó
        const advanceInfo = (m.phase !== 'groups' && m.real_winner_name)
          ? `<div style="font-size:9px;color:var(--color-text-muted);margin-top:2px">→ avanzó ${m.real_winner_name}</div>`
          : '';

        const label = m.categoryLabel || '';

        return `<tr>
          <td style="color:var(--color-text-muted);font-size:10px;white-space:nowrap">${m.match_date?.slice(5,10) || ''}<br><span style="font-size:9px">${grpLabel}</span></td>
          <td style="white-space:nowrap">${m.home_flag} ${m.home_name}</td>
          <td style="text-align:center;font-size:11px;white-space:nowrap">
            <span style="background:var(--color-surface);padding:1px 5px;border-radius:4px;font-weight:600">${realStr}</span>
            ${advanceInfo}
          </td>
          <td style="white-space:nowrap">${m.away_flag} ${m.away_name}</td>
          <td style="text-align:center;color:var(--color-text-muted)">${predStr}</td>
          <td style="text-align:center"><span class="pbm-badge ${catClass[m.category]}" title="${label}" style="font-size:9px">${label || m.category}</span></td>
          <td style="text-align:right" class="${ptsClassByPts(m.pts)}">${m.pts > 0 ? '+' + m.pts : '0'}</td>
        </tr>`;
      }).join('');

      // Detectar si hay partidos de eliminatorias para mostrar la leyenda de penales
      const hasKO = matches.some(m => m.phase !== 'groups');
      const penLegend = hasKO ? `
        <div style="font-size:10px;color:var(--color-text-muted);margin-top:8px;padding:8px;background:var(--color-surface);border-radius:8px;line-height:1.6">
          <strong>Eliminatorias con penales:</strong> empate exacto + penales exactos = 8 · empate exacto + ganador = 5 · empate (no exacto) + penales exactos = 5 · empate (no exacto) + quién avanza = 4 · empate (no exacto) sin ganador = 3<br>
          <strong>Sin penales:</strong> marcador exacto = 5 · ganador + diferencia = 3 · solo ganador = 2
        </div>` : '';

      container.innerHTML = `
        <div class="pbm-summary">
          <div class="pbm-chip total">🏆 Total: ${total} pts</div>
          <div class="pbm-chip">🎯 Aciertos altos: ${exactos}</div>
          <div class="pbm-chip">📏 Parciales: ${gdif}</div>
          <div class="pbm-chip">✅ Ganador: ${ganador}</div>
          <div class="pbm-chip">❌ Fallos: ${fallos}</div>
        </div>
        <table class="pbm-t">
          <thead><tr>
            <th>Fecha</th><th>Local</th><th style="text-align:center">Resultado real</th><th>Visitante</th>
            <th style="text-align:center">Mi pronóstico</th><th style="text-align:center">Cómo puntuó</th>
            <th style="text-align:right">Pts</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${penLegend}`;
    } catch(e) {
      container.innerHTML = `<div style="color:var(--color-danger);padding:1rem">⚠️ ${e.message}</div>`;
    }
  },

  // ── Fase activa (genérico, reutilizable para cualquier torneo) ──────────────
  // Devuelve 'finals' si hay partidos KO con resultado o fechas próximas,
  // 'groups' en caso contrario. No hardcodea fases — usa las que existan en matches.
  getActivePhase() {
    const matches = this.matches || [];
    const hasKOResult = matches.some(m => m.phase !== 'groups' && m.home_score != null);
    if (hasKOResult) return 'finals';
    const hasKOMatch = matches.some(m => m.phase !== 'groups' && m.home_team);
    if (hasKOMatch) return 'finals';
    return 'groups';
  },

  // Bracket KO de las predicciones de un usuario (solo eliminatorias)
  _renderUserKOBracket(upreds) {
    const matchById = Object.fromEntries(this.matches.map(m => [m.id, m]));
    const QF_PAIRS = {'QF-1':['R32-3','R32-5'],'QF-2':['R32-1','R32-4'],'QF-3':['R32-2','R32-6'],'QF-4':['R32-7','R32-8'],'QF-5':['R32-11','R32-12'],'QF-6':['R32-9','R32-10'],'QF-7':['R32-14','R32-16'],'QF-8':['R32-13','R32-15']};
    const SF_PAIRS = {'SF-1':['QF-1','QF-2'],'SF-2':['QF-5','QF-6'],'SF-3':['QF-3','QF-4'],'SF-4':['QF-7','QF-8'],'SF-5':['SF-1','SF-2'],'SF-6':['SF-3','SF-4']};

    const winnerOf = (matchId, homeCode, awayCode) => {
      const pred = upreds[matchId];
      if (!pred) return null;
      const ph = pred.pred_home != null ? parseInt(pred.pred_home) : null;
      const pa = pred.pred_away != null ? parseInt(pred.pred_away) : null;
      if (ph != null && pa != null && ph !== pa) return ph > pa ? homeCode : awayCode;
      return pred.pred_winner || null;
    };

    const loserOf = (matchId, homeCode, awayCode) => {
      const w = winnerOf(matchId, homeCode, awayCode);
      if (!w || (!homeCode && !awayCode)) return null;
      return w === homeCode ? awayCode : homeCode;
    };

    const resolveMatch = (matchId) => {
      const real = matchById[matchId];
      if (matchId.startsWith('R32')) return { home: real?.home_team||null, away: real?.away_team||null };
      if (matchId === 'TP') {
        const ra = resolveMatch('SF-5'), rb = resolveMatch('SF-6');
        return { home: loserOf('SF-5', ra.home, ra.away), away: loserOf('SF-6', rb.home, rb.away) };
      }
      const pair = QF_PAIRS[matchId] || SF_PAIRS[matchId] || (matchId === 'FINAL' ? ['SF-5','SF-6'] : null);
      if (!pair) return { home:null, away:null };
      const [a, b] = pair;
      const ra = resolveMatch(a), rb = resolveMatch(b);
      return { home: winnerOf(a, ra.home, ra.away), away: winnerOf(b, rb.home, rb.away) };
    };

    // ── Detectar llaves eliminadas ────────────────────────────────────────────
    // Una llave es "muerta" si ya hay resultado real y el usuario predijo el equipo
    // equivocado, O si alguna llave anterior de la que depende ya está muerta.
    const deadCache = {};
    const isDead = (matchId) => {
      if (matchId in deadCache) return deadCache[matchId];
      const real = matchById[matchId];

      // R32: muerta si tiene resultado real y el usuario predijo al perdedor
      if (matchId.startsWith('R32')) {
        if (!real || real.home_score == null) return deadCache[matchId] = false;
        const predW = winnerOf(matchId, real.home_team, real.away_team);
        return deadCache[matchId] = (!!real.winner && predW !== real.winner);
      }

      // TP: muerta si SF-5 o SF-6 están muertas (usuario predijo mal quien llega)
      if (matchId === 'TP') {
        if (isDead('SF-5') || isDead('SF-6')) return deadCache[matchId] = true;
        if (real && real.home_score != null && real.winner) {
          const r = resolveMatch(matchId);
          const predW = winnerOf(matchId, r.home, r.away);
          if (predW && predW !== real.winner) return deadCache[matchId] = true;
        }
        return deadCache[matchId] = false;
      }

      // QF / SF / FINAL: muerta si algún feeder está muerto
      const pair = QF_PAIRS[matchId] || SF_PAIRS[matchId] || (matchId === 'FINAL' ? ['SF-5','SF-6'] : null);
      if (!pair) return deadCache[matchId] = false;
      if (pair.some(p => isDead(p))) return deadCache[matchId] = true;

      // O si este partido ya tiene resultado y el usuario predijo mal
      if (real && real.home_score != null && real.winner) {
        const r = resolveMatch(matchId);
        const predW = winnerOf(matchId, r.home, r.away);
        if (predW && predW !== real.winner) return deadCache[matchId] = true;
      }
      return deadCache[matchId] = false;
    };

    const bkCard = (matchId) => {
      const dead = isDead(matchId);
      const { home, away } = resolveMatch(matchId);
      const pred = upreds[matchId];
      const ht = home ? this.teamByCode(home) : null;
      const at = away ? this.teamByCode(away) : null;
      const ph = pred?.pred_home != null ? pred.pred_home : null;
      const pa = pred?.pred_away != null ? pred.pred_away : null;
      const winner = winnerOf(matchId, home, away);
      const wt = winner ? this.teamByCode(winner) : null;
      if (!ht && !at) return `<div class="updm-bk empty">Sin definir</div>`;

      const deadStyle = dead ? 'opacity:0.4;filter:grayscale(0.8)' : '';
      const deadBadge = dead ? `<div style="font-size:9px;color:#f87171;padding:2px 7px;border-top:1px solid rgba(248,113,113,0.2);background:rgba(248,113,113,0.06)">❌ eliminado</div>` : '';
      const arrowStyle = dead ? 'color:var(--color-text-muted)' : 'color:#C9A84C';
      const arrowBg = dead ? '' : 'background:rgba(201,168,76,0.06)';

      return `<div class="updm-bk" style="${deadStyle}">
        <div class="updm-team"><span class="updm-flag">${ht?.flag||'?'}</span><span class="updm-name">${ht?.name||'???'}</span>${ph!=null?`<span style="font-weight:700;font-size:12px;margin-left:auto">${ph}</span>`:''}</div>
        <div class="updm-team"><span class="updm-flag">${at?.flag||'?'}</span><span class="updm-name">${at?.name||'???'}</span>${pa!=null?`<span style="font-weight:700;font-size:12px;margin-left:auto">${pa}</span>`:''}</div>
        ${wt ? `<div style="font-size:10px;${arrowStyle};padding:2px 7px;border-top:1px solid var(--color-border);${arrowBg}">→ ${wt.flag} ${wt.name}</div>` : ''}
        ${deadBadge}
      </div>`;
    };

    const col = (ids, label) => `
      <div class="updm-col">
        <div class="updm-clabel">${label}</div>
        <div class="updm-cmatches">${ids.map(id => bkCard(id)).join('')}</div>
      </div>`;

    return `
      <div class="updm-bwrap">
        <div class="updm-bracket">
          <div class="updm-side">
            ${col(['R32-3','R32-5','R32-1','R32-4','R32-11','R32-12','R32-9','R32-10'],'Dieciseisavos')}
            ${col(['QF-1','QF-2','QF-5','QF-6'],'Octavos')}
            ${col(['SF-1','SF-2'],'Cuartos')}
            ${col(['SF-5'],'Semis')}
          </div>
          <div class="updm-center">
            <div class="updm-clabel" style="text-align:center">Final</div>
            ${bkCard('FINAL')}
            <div class="updm-clabel" style="text-align:center;margin-top:8px">3er Puesto</div>
            ${bkCard('TP')}
          </div>
          <div class="updm-side updm-right">
            ${col(['SF-6'],'Semis')}
            ${col(['SF-3','SF-4'],'Cuartos')}
            ${col(['QF-3','QF-4','QF-7','QF-8'],'Octavos')}
            ${col(['R32-2','R32-6','R32-7','R32-8','R32-14','R32-16','R32-13','R32-15'],'Dieciseisavos')}
          </div>
        </div>
      </div>`;
  },

  async showUserPredictions(userId, phase) {
    const displayName = (this._lbNames && this._lbNames[userId]) || 'Participante';
    document.getElementById('user-pred-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'user-pred-modal';
    modal.innerHTML = `
      <style>
        #user-pred-modal { position:fixed; inset:0; z-index:8000; background:rgba(0,0,0,0.82); display:flex; align-items:flex-start; justify-content:center; padding:20px 10px; overflow-y:auto; }
        #user-pred-modal .updm-panel { width:min(980px,100%); background:var(--color-background, #101018); border:1px solid var(--color-border); border-radius:14px; display:flex; flex-direction:column; max-height:calc(100vh - 40px); box-shadow:0 20px 60px rgba(0,0,0,0.5); }
        #user-pred-modal .updm-head { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:13px 16px; border-bottom:1px solid var(--color-border); flex-shrink:0; }
        #user-pred-modal .updm-title { font-weight:700; font-size:15px; }
        #user-pred-modal .updm-close { background:transparent; border:1px solid var(--color-border); color:var(--color-text-muted); font-size:15px; cursor:pointer; line-height:1; border-radius:8px; padding:5px 10px; }
        #user-pred-modal .updm-close:hover { color:var(--color-text); }
        #user-pred-modal .updm-body { padding:14px 16px 20px; overflow-y:auto; }
        #user-pred-modal h3.updm-h { font-size:13px; color:var(--color-primary); margin:18px 0 8px; text-transform:uppercase; letter-spacing:0.5px; }
        #user-pred-modal h3.updm-h:first-child { margin-top:0; }
        #user-pred-modal .updm-summary { padding:9px 12px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:10px; font-size:12.5px; margin-bottom:4px; }
        #user-pred-modal .updm-note { padding:8px 12px; background:rgba(201,168,76,0.07); border:1px solid rgba(201,168,76,0.2); border-radius:10px; font-size:12px; color:var(--color-text-muted); margin:10px 0 0; }
        #user-pred-modal .updm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(225px,1fr)); gap:8px; }
        #user-pred-modal .updm-card { background:var(--color-surface); border:1px solid var(--color-border); border-radius:10px; padding:8px; }
        #user-pred-modal .updm-gtitle { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
        #user-pred-modal table.updm-t { width:100%; border-collapse:collapse; font-size:12px; }
        #user-pred-modal table.updm-t th { font-size:10px; color:var(--color-text-muted); font-weight:500; padding:2px 4px; text-align:left; }
        #user-pred-modal table.updm-t td { padding:3px 4px; white-space:nowrap; }
        #user-pred-modal .updm-scores { margin-top:8px; padding-top:6px; border-top:1px solid var(--color-border); }
        #user-pred-modal .updm-scores-title { font-size:10px; font-weight:600; color:var(--color-text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px; }
        #user-pred-modal .updm-mrow { display:flex; align-items:center; gap:4px; font-size:11px; padding:2px 0; }
        #user-pred-modal .updm-mrow .l { flex:1; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #user-pred-modal .updm-mrow .r { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #user-pred-modal .updm-mrow .s { font-weight:700; min-width:34px; text-align:center; background:var(--color-background-secondary, rgba(255,255,255,0.05)); border-radius:4px; padding:1px 4px; flex-shrink:0; }
        #user-pred-modal .updm-bwrap { width:100%; overflow-x:auto; padding-bottom:8px; -webkit-overflow-scrolling:touch; }
        #user-pred-modal .updm-bracket { display:flex; gap:0; min-height:560px; align-items:stretch; min-width:1100px; }
        #user-pred-modal .updm-side { display:flex; flex-direction:row; gap:6px; flex:1; }
        #user-pred-modal .updm-right { justify-content:flex-end; }
        #user-pred-modal .updm-col { display:flex; flex-direction:column; min-width:140px; flex-shrink:0; }
        #user-pred-modal .updm-clabel { font-size:10px; font-weight:700; color:var(--color-primary); text-transform:uppercase; letter-spacing:0.5px; text-align:center; padding:4px 0 8px; }
        #user-pred-modal .updm-cmatches { display:flex; flex-direction:column; justify-content:space-around; flex:1; gap:4px; }
        #user-pred-modal .updm-center { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:160px; flex-shrink:0; padding:0 8px; border-left:1px solid var(--color-border); border-right:1px solid var(--color-border); }
        #user-pred-modal .updm-center .updm-bk { width:100%; }
        #user-pred-modal .updm-bk { background:var(--color-surface); border:1px solid var(--color-border); border-radius:10px; overflow:hidden; margin-bottom:4px; }
        #user-pred-modal .updm-bk.played { border-color:rgba(201,168,76,0.35); }
        #user-pred-modal .updm-bk.empty { padding:8px; font-size:11px; color:var(--color-text-muted); font-style:italic; text-align:center; }
        #user-pred-modal .updm-team { display:flex; align-items:center; gap:5px; padding:4px 7px; font-size:11px; border-bottom:1px solid var(--color-border); }
        #user-pred-modal .updm-team:last-child { border-bottom:none; }
        #user-pred-modal .updm-team.winner { background:rgba(201,168,76,0.1); font-weight:700; color:var(--color-primary); }
        #user-pred-modal .updm-team.loser { opacity:0.4; }
        #user-pred-modal .updm-flag { font-size:13px; flex-shrink:0; }
        #user-pred-modal .updm-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #user-pred-modal .updm-score { font-weight:700; font-size:12px; flex-shrink:0; }
        #user-pred-modal .updm-hint { font-size:11px; color:var(--color-text-muted); text-align:center; padding:4px 0; font-style:italic; }
        @media(min-width:1200px){ #user-pred-modal .updm-hint { display:none; } }
        #user-pred-modal .updm-podium { margin-top:14px; padding:10px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:10px; }
        #user-pred-modal .updm-chips { display:flex; flex-wrap:wrap; gap:6px; }
        #user-pred-modal .updm-chip { font-size:12px; padding:3px 8px; background:rgba(201,168,76,0.1); border:1px solid rgba(201,168,76,0.25); border-radius:12px; }
      </style>
      <div class="updm-panel">
        <div class="updm-head">
          <div class="updm-title">👁 Pronósticos de <span style="color:var(--color-primary)">${displayName}</span></div>
          <button class="updm-close" onclick="document.getElementById('user-pred-modal').remove()">✕ Cerrar</button>
        </div>
        <div class="updm-body" id="user-pred-content">
          <div style="text-align:center;color:var(--color-text-muted);padding:2rem">Cargando pronósticos...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const container = document.getElementById('user-pred-content');
    try {
      // Para KO solo necesitamos las predicciones, no grupos ni podio
      if (phase === 'knockout') {
        const otherPredsArr = await this.api(`/predictions?userId=${userId}`);
        const upreds = Object.fromEntries(otherPredsArr.map(p => [p.match_id, p]));
        container.innerHTML = this._renderUserKOBracket(upreds);
        return;
      }

      const [classified, otherPredsArr, podiumData] = await Promise.all([
        this.api(`/predictions/classified?userId=${userId}`),
        this.api(`/predictions?userId=${userId}`),
        this.api(`/podium?userId=${userId}`).catch(() => null)
      ]);

      // Mapa LOCAL — nunca tocamos this.predictions
      const upreds = Object.fromEntries(otherPredsArr.map(p => [p.match_id, p]));

      // Fase de grupos
      const groupColors = { A:'#1a5c8a',B:'#6b21a8',C:'#166534',D:'#991b1b',E:'#0f766e',F:'#92400e',G:'#5b21b6',H:'#1e40af',I:'#9d174d',J:'#065f46',K:'#7c2d12',L:'#164e63' };
      const groupMatches = this.matches.filter(m => m.phase === 'groups');
      const filledGroup = groupMatches.filter(m => upreds[m.id] && upreds[m.id].pred_home != null).length;

      if (filledGroup === 0) {
        container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--color-text-muted)">📝 ${displayName} aún no tiene pronósticos registrados.</div>`;
        return;
      }

      const matchesByGroup = {};
      groupMatches.forEach(m => { (matchesByGroup[m.group_name] = matchesByGroup[m.group_name] || []).push(m); });

      const groupsHtml = Object.keys(classified.groups).sort().map(g => {
        const standings = classified.groups[g];
        const color = groupColors[g] || '#C9A84C';
        const rows = (matchesByGroup[g] || []).map(m => {
          const p = upreds[m.id];
          const home = this.teamByCode(m.home_team);
          const away = this.teamByCode(m.away_team);
          const has = p && p.pred_home != null && p.pred_away != null;
          return `<div class="updm-mrow"${has?'':' style="opacity:0.4"'}>
            <span class="l">${home.flag} ${home.name}</span>
            <span class="s">${has ? p.pred_home + '-' + p.pred_away : '–'}</span>
            <span class="r">${away.flag} ${away.name}</span>
          </div>`;
        }).join('');
        return `<div class="updm-card" style="border-left:3px solid ${color}">
          <div class="updm-gtitle" style="color:${color}">Grupo ${g}</div>
          <table class="updm-t">
            <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>Pts</th><th>GD</th></tr></thead>
            <tbody>${standings.map((t,i)=>`<tr>
              <td style="font-size:11px;color:var(--color-text-muted)">${i+1}</td>
              <td><span style="margin-right:4px">${t.team_info.flag}</span>${t.team_info.name}</td>
              <td style="text-align:center">${t.played}</td>
              <td style="text-align:center;font-weight:${t.classified?'700':'400'}">${t.pts}</td>
              <td style="text-align:center">${t.gd>0?'+':''}${t.gd}</td>
            </tr>`).join('')}</tbody>
          </table>
          <div class="updm-scores">
            <div class="updm-scores-title">Marcadores</div>
            ${rows}
          </div>
        </div>`;
      }).join('');

      const best8Html = (classified.best8Thirds && classified.best8Thirds.length) ? `
        <div class="updm-card" style="margin-top:10px">
          <div class="updm-gtitle" style="color:var(--color-primary)">Sus 8 mejores terceros</div>
          <div class="updm-chips">${classified.best8Thirds.map(t=>`<span class="updm-chip">${t.flag} ${t.name}</span>`).join('')}</div>
        </div>` : '';

      // ── Bracket: equipos reales + cascada con los pronósticos de ESTE usuario ──
      const matchesById = {};
      this.matches.forEach(m => { matchesById[m.id] = m; });
      const QF = {'QF-1':['R32-3','R32-5'],'QF-2':['R32-1','R32-4'],'QF-3':['R32-2','R32-6'],'QF-4':['R32-7','R32-8'],'QF-5':['R32-11','R32-12'],'QF-6':['R32-9','R32-10'],'QF-7':['R32-14','R32-16'],'QF-8':['R32-13','R32-15']};
      const SF = {'SF-1':['QF-1','QF-2'],'SF-2':['QF-5','QF-6'],'SF-3':['QF-3','QF-4'],'SF-4':['QF-7','QF-8'],'SF-5':['SF-1','SF-2'],'SF-6':['SF-3','SF-4']};
      const memo = {};
      const winOf = (id, h, a) => {
        const p = upreds[id];
        if (!p) return null;
        const ph = p.pred_home != null ? parseInt(p.pred_home) : null;
        const pa = p.pred_away != null ? parseInt(p.pred_away) : null;
        if (ph != null && pa != null && ph !== pa) return ph > pa ? h : a;
        return p.pred_winner || null;
      };
      const resolve = (id) => {
        if (memo[id]) return memo[id];
        let h = null, a = null;
        if (id.startsWith('R32')) { const m = matchesById[id]; h = m?.home_team || null; a = m?.away_team || null; }
        else if (QF[id]) { const [x,y]=QF[id]; const rx=resolve(x), ry=resolve(y); h=winOf(x,rx.h,rx.a); a=winOf(y,ry.h,ry.a); }
        else if (SF[id]) { const [x,y]=SF[id]; const rx=resolve(x), ry=resolve(y); h=winOf(x,rx.h,rx.a); a=winOf(y,ry.h,ry.a); }
        else if (id === 'FINAL') { const rx=resolve('SF-5'), ry=resolve('SF-6'); h=winOf('SF-5',rx.h,rx.a); a=winOf('SF-6',ry.h,ry.a); }
        else if (id === 'TP') { const rx=resolve('SF-5'), ry=resolve('SF-6'); const w5=winOf('SF-5',rx.h,rx.a), w6=winOf('SF-6',ry.h,ry.a); h=w5?(w5===rx.h?rx.a:rx.h):null; a=w6?(w6===ry.h?ry.a:ry.h):null; }
        memo[id] = { h, a };
        return memo[id];
      };
      const card = (id) => {
        const { h, a } = resolve(id);
        const ht = h ? this.teamByCode(h) : null;
        const at = a ? this.teamByCode(a) : null;
        const p = upreds[id];
        const has = !!(p && (p.pred_home != null || p.pred_winner != null));
        const pw = (h && a) ? winOf(id, h, a) : null;
        const ss = p && p.pred_home != null;
        const pH = p && p.pred_pen_home != null ? `(${p.pred_pen_home})` : '';
        const pA = p && p.pred_pen_away != null ? `(${p.pred_pen_away})` : '';
        if (!ht && !at) return `<div class="updm-bk empty">Por definir</div>`;
        return `<div class="updm-bk${has ? ' played' : ''}">
          <div class="updm-team ${pw&&ht&&pw===ht.code?'winner':pw&&ht?'loser':''}">
            <span class="updm-flag">${ht?.flag||'?'}</span><span class="updm-name">${ht?.name||'Por definir'}</span>${ss?`<span class="updm-score">${p.pred_home}${pH}</span>`:''}
          </div>
          <div class="updm-team ${pw&&at&&pw===at.code?'winner':pw&&at?'loser':''}">
            <span class="updm-flag">${at?.flag||'?'}</span><span class="updm-name">${at?.name||'Por definir'}</span>${ss?`<span class="updm-score">${p.pred_away}${pA}</span>`:''}
          </div>
        </div>`;
      };
      const col = (ids, label) => `<div class="updm-col"><div class="updm-clabel">${label}</div><div class="updm-cmatches">${ids.map(card).join('')}</div></div>`;
      const bracketHtml = `<div class="updm-bracket">
        <div class="updm-side">${col(['R32-3','R32-5','R32-1','R32-4','R32-11','R32-12','R32-9','R32-10'],'Dieciseisavos')}${col(['QF-1','QF-2','QF-5','QF-6'],'Octavos')}${col(['SF-1','SF-2'],'Cuartos')}${col(['SF-5'],'Semis')}</div>
        <div class="updm-center"><div class="updm-clabel">Gran Final</div>${card('FINAL')}<div class="updm-clabel" style="margin-top:16px">3er Puesto</div>${card('TP')}</div>
        <div class="updm-side updm-right">${col(['SF-6'],'Semis')}${col(['SF-3','SF-4'],'Cuartos')}${col(['QF-3','QF-4','QF-7','QF-8'],'Octavos')}${col(['R32-2','R32-6','R32-7','R32-8','R32-14','R32-16','R32-13','R32-15'],'Dieciseisavos')}</div>
      </div>`;

      // Si la Polla 2 sigue abierta, el servidor oculta los picks de eliminatorias de otros
      const koNote = (!this.user.is_admin && this.lockStatus && !this.lockStatus.polla2Locked)
        ? `<div class="updm-note">🔒 Los pronósticos de eliminatorias de otros participantes serán visibles cuando cierre la Polla 2.</div>` : '';

      let podiumHtml = '';
      if (podiumData?.first_place) {
        const t1 = this.teamByCode(podiumData.first_place);
        const t2 = podiumData.second_place ? this.teamByCode(podiumData.second_place) : null;
        const t3 = podiumData.third_place ? this.teamByCode(podiumData.third_place) : null;
        podiumHtml = `<div class="updm-podium">
          <div class="updm-gtitle" style="color:var(--color-primary)">Podio pronosticado</div>
          <div style="display:flex;justify-content:center;gap:18px;flex-wrap:wrap">
            <div style="text-align:center"><div style="font-size:22px">🥇</div><div style="font-size:13px;font-weight:700">${t1.flag} ${t1.name}</div></div>
            ${t2?`<div style="text-align:center"><div style="font-size:22px">🥈</div><div style="font-size:13px">${t2.flag} ${t2.name}</div></div>`:''}
            ${t3?`<div style="text-align:center"><div style="font-size:22px">🥉</div><div style="font-size:13px">${t3.flag} ${t3.name}</div></div>`:''}
          </div>
        </div>`;
      }

      container.innerHTML = `
        <div class="updm-summary"><strong style="color:var(--color-primary)">📊</strong> Grupos: <strong>${filledGroup}/${groupMatches.length}</strong> partidos pronosticados</div>
        <h3 class="updm-h">Fase de Grupos</h3>
        <div class="updm-grid">${groupsHtml}</div>
        ${best8Html}
        <h3 class="updm-h">Eliminatorias</h3>
        <div class="updm-hint">← Desliza horizontalmente para ver el bracket →</div>
        <div class="updm-bwrap">${bracketHtml}</div>
        ${koNote}
        ${podiumHtml}`;
    } catch (e) {
      container.innerHTML = `<div style="text-align:center;color:var(--color-danger);padding:1.5rem">⚠️ ${e.message}</div>`;
    }
  },

  // ── HOY ────────────────────────────────────────────────────────────────────

  async renderToday(main) {
    main.innerHTML = '<h2>Partidos de hoy</h2><div style="color:var(--color-text-muted)">Cargando...</div>';
    try {
      const [data, settings] = await Promise.all([
        this.api('/daily-bets/today'),
        this.api('/settings')
      ]);
      const betAmount = settings.daily_bet_amount || 2;
      this._dailyBetAmount = betAmount;
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
        <div class="notice">Apuesta $${betAmount} por partido. Quienes aciertan el marcador exacto se reparten el pote. Cierra <strong>5 minutos</strong> antes de cada partido.</div>
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
          <span style="font-size:13px;color:var(--color-text-muted)">Apuesta: $${this._dailyBetAmount || 2}</span>
          <input type="hidden" name="bet" value="${this._dailyBetAmount || 2}">
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
      const amount = this._dailyBetAmount || 2;
      await this.api('/daily-bets', {
        method: 'POST',
        body: JSON.stringify({ match_id: form.dataset.match, pred_home: parseInt(home), pred_away: parseInt(away), bet_amount: amount })
      });
      msg.textContent = `Apuesta registrada por $${amount}.`;
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

  koFeederLabel(matchId) {
    const QF_PAIRS = { 'QF-1': ['R32-3','R32-5'], 'QF-2': ['R32-1','R32-4'], 'QF-3': ['R32-2','R32-6'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-14','R32-16'], 'QF-8': ['R32-13','R32-15'] };
    const SF_PAIRS = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-5','QF-6'], 'SF-3': ['QF-3','QF-4'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
    const pretty = (id) => {
      if (id.startsWith('R32')) return 'Dieciseisavos ' + id.replace('R32-','');
      if (id.startsWith('QF')) return 'Octavos ' + id.replace('QF-','');
      if (['SF-1','SF-2','SF-3','SF-4'].includes(id)) return 'Cuartos ' + id.replace('SF-','');
      if (['SF-5','SF-6'].includes(id)) return 'Semifinal ' + (id === 'SF-5' ? '1' : '2');
      return id;
    };
    const pair = QF_PAIRS[matchId] || SF_PAIRS[matchId] || (matchId === 'FINAL' ? ['SF-5','SF-6'] : (matchId === 'TP' ? ['SF-5','SF-6'] : null));
    if (!pair) return 'las rondas anteriores';
    return pair.map(pretty).join(' y ');
  },

  async renderKnockout(main) {
    main.innerHTML = `<h2>Eliminatorias</h2><div style="color:var(--color-text-muted);font-size:14px">Cargando...</div>`;

    const locked = this.lockStatus.polla2Locked || false;
    const koMatches = this.matches.filter(m => m.phase !== 'groups');

    // ── Cascada: derivar equipos de cada ronda desde la predicción del usuario ──
    // R32 usa equipos reales (cargados por admin). QF en adelante se llena con
    // el ganador que el usuario predijo en la ronda anterior, para que pueda
    // pronosticar octavos sin esperar a que el admin cargue los resultados reales.
    const matchesById = {};
    this.matches.forEach(m => { matchesById[m.id] = m; });

    // Partidos compensados: el ganador REAL avanza obligatoriamente en el bracket
    // de todos (además de otorgar 5 pts). Se cargan una vez y se cachean.
    let compensatedSet = this._compensatedSet || new Set();
    try {
      const resp = await this.api('/compensated-public').catch(() => null);
      if (resp && resp.compensated) {
        compensatedSet = new Set(resp.compensated);
        this._compensatedSet = compensatedSet;
      }
    } catch (e) { /* usar cache si falla */ }

    const QF_PAIRS  = { 'QF-1': ['R32-3','R32-5'], 'QF-2': ['R32-1','R32-4'], 'QF-3': ['R32-2','R32-6'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-14','R32-16'], 'QF-8': ['R32-13','R32-15'] };
    const SF_PAIRS  = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-5','QF-6'], 'SF-3': ['QF-3','QF-4'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
    const FINAL_PAIR = ['SF-5','SF-6'];

    const koWinnerOf = (matchId, homeCode, awayCode) => {
      // Partido compensado con resultado real cargado: el ganador real avanza
      // obligatoriamente, sin importar lo que el usuario haya predicho.
      if (compensatedSet.has(matchId)) {
        const real = matchesById[matchId];
        if (real && real.winner) return real.winner;
      }
      const pred = this.predictions[matchId];
      if (!pred) return null;
      const ph = pred.pred_home != null ? parseInt(pred.pred_home) : null;
      const pa = pred.pred_away != null ? parseInt(pred.pred_away) : null;
      if (ph != null && pa != null && ph !== pa) return ph > pa ? homeCode : awayCode;
      // Empate: definir por penales predichos
      if (ph != null && pa != null && ph === pa) {
        const pph = pred.pred_pen_home != null ? parseInt(pred.pred_pen_home) : null;
        const ppa = pred.pred_pen_away != null ? parseInt(pred.pred_pen_away) : null;
        if (pph != null && ppa != null && pph !== ppa) return pph > ppa ? homeCode : awayCode;
      }
      return pred.pred_winner || null;
    };

    const koResolved = {};
    const koResolve = (matchId) => {
      if (koResolved[matchId]) return koResolved[matchId];
      let homeCode = null, awayCode = null;
      const real = matchesById[matchId];

      if (matchId.startsWith('R32')) {
        homeCode = real?.home_team || null;
        awayCode = real?.away_team || null;
      } else {
        const pair = QF_PAIRS[matchId] || SF_PAIRS[matchId] || (matchId === 'FINAL' ? FINAL_PAIR : null);
        if (pair) {
          const [a, b] = pair;
          const ra = koResolve(a), rb = koResolve(b);
          // Si el admin YA cargó el equipo real en esta llave, ese tiene prioridad.
          // Si no, usar el ganador que el usuario predijo en la ronda anterior.
          homeCode = real?.home_team || koWinnerOf(a, ra.homeCode, ra.awayCode);
          awayCode = real?.away_team || koWinnerOf(b, rb.homeCode, rb.awayCode);
        } else if (matchId === 'TP') {
          // Tercer puesto: perdedores de las semifinales (SF-5, SF-6)
          const r5 = koResolve('SF-5'), r6 = koResolve('SF-6');
          const w5 = koWinnerOf('SF-5', r5.homeCode, r5.awayCode);
          const w6 = koWinnerOf('SF-6', r6.homeCode, r6.awayCode);
          homeCode = real?.home_team || (w5 ? (w5 === r5.homeCode ? r5.awayCode : r5.homeCode) : null);
          awayCode = real?.away_team || (w6 ? (w6 === r6.homeCode ? r6.awayCode : r6.homeCode) : null);
        }
      }
      koResolved[matchId] = { homeCode, awayCode };
      return koResolved[matchId];
    };

    let html = `<h2>Eliminatorias</h2>`;
    html += `<div class="notice">Ingresa el marcador de cada partido. Los <strong>dieciseisavos</strong> usan los equipos reales de la fase de grupos; las rondas siguientes se llenan automáticamente con <strong>los ganadores que tú predigas</strong>. Si hay empate aparecerán los campos de penales.${!locked && this.lockStatus.lockTimePolla2Ecuador ? ` Las predicciones se cierran <strong>5 minutos antes del primer partido de dieciseisavos</strong> (${this.lockStatus.lockTimePolla2Ecuador} hora Ecuador).` : ''}</div>`;
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
        // Equipos: reales si el admin los cargó, si no derivados de la predicción del usuario
        const resolved = koResolve(m.id);
        const homeCode = m.home_team || resolved.homeCode;
        const awayCode = m.away_team || resolved.awayCode;
        const homeTeam = homeCode ? this.teamByCode(homeCode) : null;
        const awayTeam = awayCode ? this.teamByCode(awayCode) : null;
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

        // Normalizar el label: la BD trae prefijos heredados ("Octavos: 1J vs 2H")
        // que no coinciden con la ronda real. Extraemos el cruce y anteponemos el nombre correcto.
        const roundNames = { r16: 'Dieciseisavos', qf: 'Octavos', sf: ['SF-1','SF-2','SF-3','SF-4'].includes(m.id) ? 'Cuartos' : 'Semis', tp: 'Tercer puesto', final: 'Final' };
        const rawLabel = m.label || '';
        const crossPart = rawLabel.includes(':') ? rawLabel.split(':').slice(1).join(':').trim() : rawLabel;
        const roundName = roundNames[m.phase] || '';
        const displayLabel = crossPart ? `${roundName}: ${crossPart}` : (roundName || rawLabel);

        html += `
          <div class="card" style="margin-bottom:8px"
            data-ko-match="${m.id}"
            data-home-code="${homeCode || ''}"
            data-away-code="${awayCode || ''}">
            <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">${displayLabel} · ${timeStr}</div>
            ${homeTeam || awayTeam ? `
            <div class="match-grid" style="margin-bottom:${isDraw ? '8px' : '0'}">
              <div class="team-cell">
                <span class="team-flag">${homeTeam?.flag || '⏳'}</span>
                <span class="team-name">${homeTeam?.name || 'Por definir'}</span>
              </div>
              <div class="score-inputs">
                <input type="number" min="0" max="20" class="score-input ko-score" data-match="${m.id}" data-field="home" value="${predHome}" ${locked ? 'disabled' : ''} placeholder="—">
                <span class="score-separator">—</span>
                <input type="number" min="0" max="20" class="score-input ko-score" data-match="${m.id}" data-field="away" value="${predAway}" ${locked ? 'disabled' : ''} placeholder="—">
              </div>
              <div class="team-cell away">
                <span class="team-name">${awayTeam?.name || 'Por definir'}</span>
                <span class="team-flag">${awayTeam?.flag || '⏳'}</span>
              </div>
            </div>` : `
            <div style="font-size:13px;color:var(--color-text-muted);margin-bottom:8px;font-style:italic">⏳ Predice ${this.koFeederLabel(m.id)} para habilitar este partido</div>`}
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
      const prevWinner = this.predictions[matchId]?.pred_winner;
      this.predictions[matchId] = { ...this.predictions[matchId], ...body };
      this.koTeams = await this.api('/predictions/ko-teams');
      if (homeInput) { homeInput.style.borderColor = 'var(--color-success)'; setTimeout(() => homeInput.style.borderColor = '', 800); }
      // Re-renderizar para propagar el ganador a la siguiente ronda (cascada).
      // Se hace cuando el ganador de este partido CAMBIA y alimenta una ronda posterior,
      // preservando la posición de scroll para no desorientar al usuario.
      const winnerChanged = prevWinner !== effectiveWinner;
      const feedsNextRound = matchId !== 'FINAL' && matchId !== 'TP';
      if (winnerChanged && feedsNextRound) {
        // Defer breve: si el usuario saltó a otro input de la misma ronda, no interrumpir.
        // Re-renderizamos solo cuando el foco ya no está en un input de predicción KO.
        setTimeout(() => {
          const active = document.activeElement;
          const stillEditing = active && (active.classList?.contains('ko-score') || active.classList?.contains('ko-pen'));
          if (!stillEditing) {
            const scrollY = window.scrollY;
            this.renderKnockout(main).then(() => window.scrollTo(0, scrollY));
          }
        }, 150);
      }
    } catch (e) {
      if (homeInput) homeInput.style.borderColor = 'var(--color-danger)';
    }
  },

  // ── PODIO ───────────────────────────────────────────────────────────────────

  async renderPodium(main) {
    main.innerHTML = '<h2>Podio final</h2><div style="color:var(--color-text-muted)">Cargando...</div>';

    // Cascada de predicciones del usuario (misma lógica que _renderUserKOBracket)
    const matchById = Object.fromEntries(this.matches.map(m => [m.id, m]));
    const QF_PAIRS = {'QF-1':['R32-3','R32-5'],'QF-2':['R32-1','R32-4'],'QF-3':['R32-2','R32-6'],'QF-4':['R32-7','R32-8'],'QF-5':['R32-11','R32-12'],'QF-6':['R32-9','R32-10'],'QF-7':['R32-14','R32-16'],'QF-8':['R32-13','R32-15']};
    const SF_PAIRS = {'SF-1':['QF-1','QF-2'],'SF-2':['QF-5','QF-6'],'SF-3':['QF-3','QF-4'],'SF-4':['QF-7','QF-8'],'SF-5':['SF-1','SF-2'],'SF-6':['SF-3','SF-4']};
    const preds = this.predictions || {};

    const winnerOf = (matchId, homeCode, awayCode) => {
      const pred = preds[matchId];
      if (!pred) return null;
      const ph = pred.pred_home != null ? parseInt(pred.pred_home) : null;
      const pa = pred.pred_away != null ? parseInt(pred.pred_away) : null;
      if (ph != null && pa != null && ph !== pa) return ph > pa ? homeCode : awayCode;
      return pred.pred_winner || null;
    };

    const loserOf = (matchId, homeCode, awayCode) => {
      const w = winnerOf(matchId, homeCode, awayCode);
      if (!w) return null;
      return w === homeCode ? awayCode : homeCode;
    };

    const resolveMatch = (matchId) => {
      const real = matchById[matchId];
      if (!real) return { home: null, away: null };
      if (matchId.startsWith('R32')) return { home: real.home_team || null, away: real.away_team || null };
      if (matchId === 'TP') {
        const ra = resolveMatch('SF-5'), rb = resolveMatch('SF-6');
        return { home: loserOf('SF-5', ra.home, ra.away), away: loserOf('SF-6', rb.home, rb.away) };
      }
      const pair = QF_PAIRS[matchId] || SF_PAIRS[matchId] || (matchId === 'FINAL' ? ['SF-5','SF-6'] : null);
      if (!pair) return { home: null, away: null };
      const [a, b] = pair;
      const ra = resolveMatch(a), rb = resolveMatch(b);
      // Solo predicciones del usuario — nunca equipos reales propagados
      return { home: winnerOf(a, ra.home, ra.away), away: winnerOf(b, rb.home, rb.away) };
    };

    // Podio pronosticado por el usuario (desde la cascada)
    const finalRes = resolveMatch('FINAL');
    const tpRes    = resolveMatch('TP');
    const myChampCode  = winnerOf('FINAL', finalRes.home, finalRes.away);
    const myRunUpCode  = loserOf ('FINAL', finalRes.home, finalRes.away);
    const myThirdCode  = winnerOf('TP',    tpRes.home,    tpRes.away);

    const myChampion   = myChampCode  ? this.teamByCode(myChampCode)  : null;
    const myRunnerUp   = myRunUpCode  ? this.teamByCode(myRunUpCode)  : null;
    const myThirdPlace = myThirdCode  ? this.teamByCode(myThirdCode)  : null;

    // Podio real (resultados cargados por el admin)
    const finalMatch = matchById['FINAL'];
    const tpMatch    = matchById['TP'];
    let realChampion = null, realRunnerUp = null, realThirdPlace = null;
    if (finalMatch?.winner) {
      realChampion = this.teamByCode(finalMatch.winner);
      const loserCode = finalMatch.winner === finalMatch.home_team ? finalMatch.away_team : finalMatch.home_team;
      realRunnerUp = loserCode ? this.teamByCode(loserCode) : null;
    }
    if (tpMatch?.winner) realThirdPlace = this.teamByCode(tpMatch.winner);

    // ¿El usuario llegó a pronosticar la final y el 3er puesto?
    const hasFinalPred = !!myChampion;
    const hasTPPred    = !!myThirdPlace;

    const teamCard = (medal, label, team, hint, isMatch) => team ? `
      <div class="podium-slot">
        <span class="podium-medal">${medal}</span>
        <span class="podium-label">${label}</span>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:15px;font-weight:500;${isMatch ? 'border:1px solid var(--color-success)' : ''}">
          <span style="font-size:22px">${team.flag || ''}</span>
          <span>${team.name}</span>
          ${isMatch ? '<span style="margin-left:auto;color:var(--color-success);font-size:18px">✓</span>' : ''}
        </div>
      </div>` : `
      <div class="podium-slot">
        <span class="podium-medal">${medal}</span>
        <span class="podium-label">${label}</span>
        <div style="padding:10px 14px;background:var(--color-surface-2);border-radius:var(--radius-md);font-size:13px;color:var(--color-text-muted);font-style:italic">${hint}</div>
      </div>`;

    main.innerHTML = `
      <h2>Podio final</h2>
      <div class="notice">Tu podio pronosticado se deriva automáticamente de tu bracket — el campeón, el subcampeón y el tercer lugar que elegiste.</div>

      <h3 style="margin-top:24px;margin-bottom:12px;font-size:16px;color:var(--color-primary)">🔮 Tu podio pronosticado</h3>
      <div class="card">
        ${teamCard('🥇', 'Campeón', myChampion, 'Completa tu bracket hasta la Gran Final',
            myChampion && realChampion && myChampion.code === realChampion.code)}
        ${teamCard('🥈', 'Subcampeón', myRunnerUp, 'Completa tu bracket hasta la Gran Final',
            myRunnerUp && realRunnerUp && myRunnerUp.code === realRunnerUp.code)}
        ${teamCard('🥉', 'Tercer lugar', myThirdPlace, 'Completa tu bracket hasta el 3er puesto',
            myThirdPlace && realThirdPlace && myThirdPlace.code === realThirdPlace.code)}
      </div>

      <h3 style="margin-top:24px;margin-bottom:12px;font-size:16px;color:var(--color-primary)">🏆 Podio real</h3>
      <div class="card">
        ${teamCard('🥇', 'Campeón real', realChampion, 'Pendiente — falta resultado de la Final', false)}
        ${teamCard('🥈', 'Subcampeón real', realRunnerUp, 'Pendiente — falta resultado de la Final', false)}
        ${teamCard('🥉', 'Tercer lugar real', realThirdPlace, 'Pendiente — falta resultado del 3er puesto', false)}
      </div>
    `;
  },

  // ── MINI-POLLAS ─────────────────────────────────────────────────────────────

  async renderMiniPollas(main) {
    main.innerHTML = `<h2>Mini-Pronósticos</h2><div style="color:var(--color-text-muted)">Cargando...</div>`;
    try {
      const status = await this.api('/mini-polla/status');
      const phaseIcons = { r16: '⚽', qf: '🏅', sf_qf: '🏆', sf_sf: '🌟' };

      let html = `<h2>Mini-Pronósticos</h2>
        <div class="notice">Pronósticos independientes por fase eliminatoria. Puedes unirte aunque no hayas participado en el pronóstico general. Cada una tiene su propio pozo y ranking. Reparto: <strong>70% primero · 30% segundo</strong>.</div>`;

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
          html += `<div style="font-size:13px;color:var(--color-text-muted)">No participaste en este mini-pronóstico.</div>`;
          if (info.status === 'finished') {
            html += `<button class="btn-sm btn-ghost" style="margin-top:8px" onclick="app.showMiniPollaLeaderboard('${phase}')">Ver ranking</button>`;
          }
        }
        html += `</div>`;
      }
      main.innerHTML = html;
    } catch (e) {
      main.innerHTML = `<h2>Mini-Pronósticos</h2><div class="empty-state">Error: ${e.message}</div>`;
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
          <h2 style="margin:0">Mini-Pronóstico: ${phaseLabels[phase]}</h2>
        </div>
        <div class="notice">Pronósticos independientes del pronóstico general. Los equipos son los clasificados reales.
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
      const [lb1, lb2, dailyGroups, dailyKO] = await Promise.all([
        this.api('/leaderboard/groups'),
        this.api('/leaderboard/knockout'),
        this.api('/leaderboard/daily-top?phase=groups').catch(() => null),
        this.api('/leaderboard/daily-top?phase=knockout').catch(() => null)
      ]);

      // Detección automática de fase activa (genérico, sin hardcodear)
      const activePhase = this.getActivePhase(); // 'finals' o 'groups'
      const defaultTab = activePhase === 'finals' ? 'knockout' : 'groups';

      // GJ por fase
      const gjGroupsIds = new Set((dailyGroups?.gjIds) || []);
      const gjKOIds = new Set((dailyKO?.gjIds) || []);

      const renderDailyTop = (daily, phase) => {
        if (!daily?.hasData || !daily.top.length) return '';
        const date = daily.date ? new Date(daily.date + 'T12:00:00').toLocaleDateString('es-EC', { weekday:'long', day:'numeric', month:'long' }) : '';
        const winMedals = ['🥇','🥈','🥉'];
        const loseMedals = ['😰','😓','😔'];
        const winners = daily.top.map((u, i) => `
          <div style="display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0">
            <span>${winMedals[i]}</span>
            <span style="font-weight:600">${u.display_name.split(' ')[0]}</span>
            <span style="font-weight:700;color:var(--color-primary)">${u.pts}pts</span>
            ${u.exactos > 0 ? `<span style="color:var(--color-text-muted);font-size:10px">🎯${u.exactos}</span>` : ''}
            ${u.isGJ ? '<span style="color:#C9A84C;font-size:10px;font-weight:700">⭐GJ</span>' : ''}
          </div>`).join('');
        const losers = (daily.bottom || []).map((u, i) => `
          <div style="display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0">
            <span>${loseMedals[i]}</span>
            <span style="font-weight:600;color:var(--color-text-muted)">${u.display_name.split(' ')[0]}</span>
            <span style="font-weight:700;color:var(--color-text-muted)">${u.pts}pts</span>
          </div>`).join('');
        return `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
            <div style="padding:8px 10px;background:var(--color-surface);border:1px solid rgba(201,168,76,0.2);border-radius:8px">
              <div style="font-size:10px;font-weight:700;color:#C9A84C;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">⭐ Jornada anterior · ${date}</div>
              ${winners}
            </div>
            <div style="padding:8px 10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px">
              <div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px">🔒 El Calabozo</div>
              ${losers || '<div style="font-size:11px;color:var(--color-text-muted)">Sin datos</div>'}
            </div>
          </div>`;
      };

      const renderTable = (data, phase) => {
        const { leaderboard, totalPot, prizes, splits } = data;
        const gjIds = phase === 'knockout' ? gjKOIds : gjGroupsIds;
        const sp = splits || { first: 70, second: 25, third: 5 };
        if (!leaderboard.length) return `
          <div style="font-size:13px;color:var(--color-text-muted);font-style:italic;padding:8px 0">
            Aún no hay participantes con pago confirmado.
          </div>`;
        return `
          <div class="grid-2" style="margin-bottom:1rem">
            <div class="metric-card"><div class="metric-label">Participantes</div><div class="metric-value">${leaderboard.length}</div></div>
            <div class="metric-card"><div class="metric-label">Pozo neto</div><div class="metric-value">$${totalPot.toFixed(0)}</div></div>
            <div class="metric-card"><div class="metric-label">🥇 Premio 1ro <small style="font-size:10px">(${sp.first}%)</small></div><div class="metric-value" style="color:var(--color-primary)">$${prizes.first.toFixed(2)}</div></div>
            <div class="metric-card"><div class="metric-label">🥈 Premio 2do <small style="font-size:10px">(${sp.second}%)</small></div><div class="metric-value">$${prizes.second.toFixed(2)}</div></div>
            <div class="metric-card"><div class="metric-label">🥉 Premio 3ro <small style="font-size:10px">(${sp.third}%)</small></div><div class="metric-value">$${prizes.third.toFixed(2)}</div></div>
          </div>
          <div style="overflow-x:auto">
          <table class="leaderboard-table">
            <thead><tr>
              <th>#</th><th>Participante</th>
              <th style="text-align:center" title="Marcador exacto">🎯 Exacto</th>
              <th style="text-align:center" title="Ganador + diferencia">📏 G+Dif</th>
              <th style="text-align:center" title="Solo ganador">✅ Ganador</th>
              <th style="text-align:right">Puntos</th>
            </tr></thead>
            <tbody>
              ${leaderboard.map((u, i) => {
                const rank = i + 1;
                const medal = rank===1?'gold':rank===2?'silver':rank===3?'bronze':'default';
                const init = u.display_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                const isMe = u.user_id === this.user.id || u.id === this.user.id;
                const uid = u.user_id || u.id;
                this._lbNames = this._lbNames || {};
                this._lbNames[uid] = u.display_name;
                const ex = u.exactScores ?? u.exact ?? 0;
                const df = u.diffCount ?? 0;
                const wn = u.winnerCount ?? 0;
                const gjBadge = gjIds.has(uid) ? ' <span title="Ganador de la Jornada" style="font-size:11px;background:rgba(201,168,76,0.15);color:#C9A84C;border:1px solid rgba(201,168,76,0.3);border-radius:10px;padding:1px 6px;margin-left:4px">⭐ GJ</span>' : '';
                // Botones exclusivos por fase
                const cmpBtn = uid !== this.user.id ? `<button title="Compararme" onclick="app.showCompare(${uid},'${u.display_name.replace(/'/g,"\\'")}','${phase}')" style="margin-left:6px;font-size:12px;padding:2px 8px;border:1px solid rgba(201,168,76,0.4);border-radius:6px;background:transparent;color:#C9A84C;cursor:pointer;flex-shrink:0">⚔️</button>` : '';
                const eyeBtn = `<button title="Ver pronósticos" onclick="app.showUserPredictions(${uid},'${phase}')" style="margin-left:4px;font-size:12px;padding:2px 8px;border:1px solid var(--color-border);border-radius:6px;background:transparent;color:var(--color-text-muted);cursor:pointer;flex-shrink:0">👁</button>`;
                const verBtn = `<button title="Ver detalle de puntos" onclick="app.showPointsBreakdown(${uid},'${u.display_name.replace(/'/g, "\\'")}','${phase}')" style="margin-left:6px;font-size:11px;padding:2px 7px;border:1px solid var(--color-border);border-radius:6px;background:transparent;color:var(--color-text-muted);cursor:pointer;vertical-align:middle">Ver</button>`;
                return `<tr style="${isMe ? 'background:rgba(201,168,76,0.06)' : ''}">
                  <td><span class="rank-medal ${medal}">${rank}</span></td>
                  <td class="user-cell"><span class="avatar">${init}</span><span>${u.display_name}${isMe ? ' <strong>(tú)</strong>' : ''}${gjBadge}</span>${cmpBtn}${eyeBtn}</td>
                  <td style="text-align:center;font-weight:600;color:var(--color-primary)">${ex}</td>
                  <td style="text-align:center">${df}</td>
                  <td style="text-align:center">${wn}</td>
                  <td style="text-align:right">
                    <span style="font-weight:700;font-size:15px">${u.points}</span>
                    ${verBtn}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>
          <div style="font-size:10px;color:var(--color-text-muted);margin-top:6px;padding:0 4px">
            🎯 Exacto = 5 pts · 📏 G+Dif = 3 pts · ✅ Ganador = 2 pts
          </div>`;
      };

      // Orden de tabs según fase activa — genérico para cualquier torneo
      const tabs = defaultTab === 'knockout'
        ? [['knockout','🏆 Eliminatorias'], ['groups','⚽ Fase de Grupos'], ['today','📅 Apuestas de hoy']]
        : [['groups','⚽ Fase de Grupos'], ['knockout','🏆 Eliminatorias'], ['today','📅 Apuestas de hoy']];

      main.innerHTML = `
        <h2>Ranking</h2>
        <div id="rank-daily-top-wrapper"></div>
        <div style="display:flex;gap:4px;margin-bottom:1rem;flex-wrap:wrap">
          ${tabs.map(([id, label]) => `<button class="fixture-tab ${id === defaultTab ? 'active' : ''}" id="rank-tab-${id}" onclick="app.switchRankTab('${id}')">${label}</button>`).join('')}
        </div>
        <style>
          .fixture-tab { padding:7px 18px; border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; border:1px solid var(--color-border); background:transparent; color:var(--color-text-muted); font-family:inherit; transition:all 0.2s; }
          .fixture-tab.active { background:var(--gold-gradient); color:#1A1200; border-color:transparent; box-shadow:0 2px 8px rgba(201,168,76,0.25); }
        </style>
        <div id="rank-content-groups" style="${defaultTab !== 'groups' ? 'display:none' : ''}">
          ${renderDailyTop(dailyGroups, 'groups')}
          <div class="notice" style="margin-bottom:1rem">Solo participan usuarios con <strong>pago confirmado</strong>.</div>
          ${renderTable(lb1, 'groups')}
        </div>
        <div id="rank-content-knockout" style="${defaultTab !== 'knockout' ? 'display:none' : ''}">
          ${renderDailyTop(dailyKO, 'knockout')}
          <div class="notice" style="margin-bottom:1rem">Solo participan usuarios con <strong>pago confirmado</strong>.</div>
          ${renderTable(lb2, 'knockout')}
        </div>
        <div id="rank-content-today" style="display:${defaultTab === 'today' ? 'block' : 'none'}">
          <div style="color:var(--color-text-muted);font-size:13px">Cargando...</div>
        </div>
      `;

      const me2 = lb2.leaderboard?.find(u => u.user_id === this.user.id);
      const me1 = lb1.leaderboard?.find(u => u.user_id === this.user.id);
      if (me1 != null || me2 != null) this.refreshPoints();

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

  async renderRules(main) {
    main.innerHTML = '<h2>Reglas y puntuación</h2><div style="color:var(--color-text-muted)">Cargando...</div>';
    let s = {};
    try { s = await this.api('/settings'); } catch (e) {}

    const p1fee = s.polla1_fee || 20;
    const p1maint = s.polla1_maintenance || 1;
    const p1net = p1fee - p1maint;
    const p2fee = s.polla2_fee || 20;
    const p2maint = s.polla2_maintenance || 1;
    const s1 = s.polla1_split_1st || 70;
    const s2 = s.polla1_split_2nd || 25;
    const s3 = s.polla1_split_3rd || 5;
    const betAmount = s.daily_bet_amount || 2;
    const feeR16 = s.mini_polla_fee_r16 || 5;
    const feeQF = s.mini_polla_fee_qf || 3;
    const feeSFQF = s.mini_polla_fee_sf_qf || 3;
    const feeSFSF = s.mini_polla_fee_sf_sf || 2;

    main.innerHTML = `
      <h2>Reglas y puntuación</h2>

      <div class="card">
        <h3>📋 Reglas</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.9">
          Hay <strong>dos pronósticos independientes</strong>, cada uno con su propio pozo:
        </p>
        <ul style="font-size:14px;color:var(--color-text-muted);line-height:2;margin-top:8px;padding-left:16px">
          <li><strong>Pronóstico 1 — Fase de Grupos ($${p1fee}):</strong> pronosticas los partidos de la fase de grupos. El pozo se reparte al finalizar los grupos.</li>
          <li><strong>Pronóstico 2 — Eliminatorias ($${p2fee}):</strong> se abre cuando terminan los grupos. Pronosticas los partidos eliminatorios con los equipos reales clasificados. El pozo se reparte al finalizar el torneo.</li>
        </ul>
        <p style="font-size:12px;color:var(--color-text-muted);margin-top:10px;font-style:italic">
          * $${p1maint} de cada inscripción se destina al mantenimiento de la plataforma. El pozo se calcula sobre $${p1net} por participante pagado.
        </p>
      </div>

      <div class="card">
        <h3>💰 Repartición del pozo</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Solo participan quienes tengan el <strong>pago confirmado</strong>. El pozo neto se reparte así:
        </p>
        <ul style="font-size:14px;line-height:2;list-style:none;margin-top:8px">
          <li>🥇 Primer lugar: <strong>${s1}%</strong></li>
          <li>🥈 Segundo lugar: <strong>${s2}%</strong></li>
          <li>🥉 Tercer lugar: <strong>${s3}%</strong></li>
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
          En el Pronóstico 2, los equipos de cada partido eliminatorio se basan en los clasificados <strong>reales</strong> de la fase de grupos, no en suposiciones ni predicciones. Es decir, ya conocerás qué equipos avanzaron antes de hacer tu pronóstico.
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
        <h3>🏅 Podio final</h3>
        <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:8px">El podio (campeón, subcampeón y tercer lugar) se muestra automáticamente a partir de tus pronósticos de la Gran Final y el Tercer puesto. Es solo una vista comparativa — <strong>no otorga puntos adicionales</strong>; los puntos provienen únicamente de acertar esos partidos en eliminatorias.</p>
      </div>

      <div class="card">
        <h3>💵 Apuestas diarias</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Apuesta $${betAmount} por partido del día. Quienes aciertan el marcador exacto se reparten el pote.
          Si nadie acierta el exacto, se reparte entre quienes acertaron el ganador.
          Si nadie acierta el ganador, el pote se acumula al siguiente partido.
          Las apuestas diarias no suman puntos al ranking general.
        </p>
      </div>

      <div class="card">
        <h3>🎮 Mini-Pronósticos</h3>
        <p style="font-size:14px;color:var(--color-text-muted);line-height:1.8">
          Al inicio de cada fase eliminatoria se habilita un mini-pronóstico independiente con su propio pozo y ranking.
          Puedes participar aunque no estés en ningún pronóstico principal.
          El reparto es 70% al primero y 30% al segundo.
        </p>
        <ul style="font-size:13px;color:var(--color-text-muted);line-height:2;margin-top:8px;padding-left:16px">
          <li>⚽ Dieciseisavos: <strong>$${feeR16}</strong></li>
          <li>🏅 Octavos de final: <strong>$${feeQF}</strong></li>
          <li>🏆 Cuartos de final: <strong>$${feeSFQF}</strong></li>
          <li>🌟 Semifinales + Final: <strong>$${feeSFSF}</strong></li>
        </ul>
      </div>
    `;
  },

  // ── ADMIN ───────────────────────────────────────────────────────────────────

  async renderAdmin(main) {
    main.innerHTML = `
      <h2>Panel de administrador</h2>
      <div style="display:flex;gap:4px;margin-bottom:1rem;flex-wrap:wrap">
        <button class="fixture-tab active" id="admin-tab-pollas" onclick="app.switchAdminTab('pollas')">⚙️ Pronósticos</button>
        <button class="fixture-tab" id="admin-tab-today" onclick="app.switchAdminTab('today')">📅 Hoy</button>
        <button class="fixture-tab" id="admin-tab-matches" onclick="app.switchAdminTab('matches')">⚽ Resultados</button>
        <button class="fixture-tab" id="admin-tab-minipollas" onclick="app.switchAdminTab('minipollas')">🎮 Mini-Pronósticos</button>
        <button class="fixture-tab" id="admin-tab-users" onclick="app.switchAdminTab('users')">👥 Usuarios</button>
      </div>
      <style>
        .fixture-tab { padding:7px 18px; border-radius:var(--radius-md); font-size:13px; font-weight:600; cursor:pointer; border:1px solid var(--color-border); background:transparent; color:var(--color-text-muted); font-family:inherit; transition:all 0.2s; }
        .fixture-tab.active { background:var(--gold-gradient); color:#1A1200; border-color:transparent; box-shadow:0 2px 8px rgba(201,168,76,0.25); }
      </style>

      <div id="admin-content-pollas">
        <div class="card"><h3>⚙️ Configuración de pronósticos</h3><div id="admin-pollas-config"></div></div>
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
        <div class="card"><h3>🎮 Mini-Pronósticos</h3><div id="admin-minipollas"></div></div>
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
      const [s, ls] = await Promise.all([
        this.api('/settings'),
        this.api('/predictions/lock-status')
      ]);
      const p1Locked = ls.polla1Locked;
      const p2Locked = ls.polla2Locked;
      container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--color-primary);margin-bottom:8px">⚽ Pronóstico 1 — Grupos</div>
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
            <div style="font-size:13px;font-weight:600;color:var(--color-primary);margin-bottom:8px">🏆 Pronóstico 2 — Eliminatorias</div>
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
        <div style="margin-top:16px;padding:12px;background:var(--color-background-secondary);border-radius:var(--radius-md);border:1px solid var(--color-border)">
          <div style="font-size:12px;font-weight:700;color:var(--color-primary);margin-bottom:10px">🔒 Control manual de bloqueo</div>
          <div style="display:grid;gap:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px">⚽ Pronóstico 1 (Grupos) — Estado: <strong id="lock1-status">${p1Locked ? '🔒 Bloqueado' : '🟢 Abierto'}</strong></span>
              <div style="display:flex;gap:6px">
                <button class="btn-sm" style="background:#166534;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="app.setPollaLock('polla1','unlock')">🔓 Abrir</button>
                <button class="btn-sm" style="background:#991b1b;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="app.setPollaLock('polla1','lock')">🔒 Cerrar</button>
                <button class="btn-sm" style="background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="app.setPollaLock('polla1','auto')">⏱ Auto</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
              <span style="font-size:12px">🏆 Pronóstico 2 (Eliminatorias) — Estado: <strong id="lock2-status">${p2Locked ? '🔒 Bloqueado' : '🟢 Abierto'}</strong></span>
              <div style="display:flex;gap:6px">
                <button class="btn-sm" style="background:#166534;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="app.setPollaLock('polla2','unlock')">🔓 Abrir</button>
                <button class="btn-sm" style="background:#991b1b;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="app.setPollaLock('polla2','lock')">🔒 Cerrar</button>
                <button class="btn-sm" style="background:transparent;color:var(--color-text-muted);border:1px solid var(--color-border);border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px" onclick="app.setPollaLock('polla2','auto')">⏱ Auto</button>
              </div>
            </div>
          </div>
          <div style="font-size:10px;color:var(--color-text-muted);margin-top:8px">⏱ Auto = vuelve al bloqueo automático (5 min antes del partido)</div>
          <div class="success-msg" id="lock-msg" style="margin-top:6px"></div>
        </div>
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

  async setPollaLock(polla, action) {
    const msg = document.getElementById('lock-msg');
    try {
      const result = await this.api(`/admin/pollas/${polla}/lock`, {
        method: 'PUT',
        body: JSON.stringify({ action })
      });
      const labels = { lock: '🔒 Cerrado manualmente', unlock: '🟢 Abierto manualmente', auto: '⏱ Automático' };
      if (polla === 'polla1') {
        const el = document.getElementById('lock1-status');
        if (el) el.textContent = action === 'auto' ? (result.locked ? '🔒 Bloqueado (auto)' : '🟢 Abierto (auto)') : labels[action];
      } else {
        const el = document.getElementById('lock2-status');
        if (el) el.textContent = action === 'auto' ? (result.polla2Locked ? '🔒 Bloqueado (auto)' : '🟢 Abierto (auto)') : labels[action];
      }
      msg.style.color = 'var(--color-success)';
      msg.textContent = `✓ Polla ${polla === 'polla1' ? '1' : '2'} ${action === 'lock' ? 'cerrada' : action === 'unlock' ? 'abierta' : 'en modo automático'}.`;
      setTimeout(() => msg.textContent = '', 3000);
    } catch(e) { msg.style.color = 'var(--color-danger)'; msg.textContent = e.message; }
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
              <th style="text-align:center">⚽ Pronóstico 1 · Grupos</th>
              <th style="text-align:center">🏆 Pronóstico 2 · Finales</th>
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
          Configura montos e inscripciones de cada mini-pronóstico.
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
          ${!bracketGenerated
            ? `<button class="btn-primary" style="width:auto;background:linear-gradient(135deg,#1a5c8a,#0f3d6b)" onclick="app.openBracketGenerator()">🔄 Generar Eliminatorias</button>`
            : `<button class="btn-sm" style="background:transparent;border:1px solid var(--color-border);color:var(--color-text-muted);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px" onclick="app.openBracketGenerator()">🔄 Regenerar bracket</button>`
          }
          <button class="btn-sm" style="background:transparent;border:1px solid var(--color-border);color:var(--color-text-muted);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:12px" onclick="app.repropagate()" title="Avanza los ganadores reales a la siguiente ronda">⚡ Propagar ganadores</button>
          <button class="btn-primary" style="width:auto" onclick="app.saveAllAdminMatches()">💾 Guardar todo</button>
        </div>
      </div>
      <div class="success-msg" id="admin-matches-msg" style="margin-bottom:8px"></div>
      <div style="margin-bottom:14px;padding:12px;background:var(--color-surface);border:1px solid rgba(251,191,36,0.25);border-radius:10px">
        <div style="font-size:13px;font-weight:700;color:#fbbf24;margin-bottom:6px">🎁 Compensar un partido</div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px">Otorga 5 puntos fijos a TODOS los inscritos en ese partido, sin importar su predicción. Útil si hubo un problema técnico.</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <select id="compensate-select" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-background-secondary);color:var(--color-text);font-size:12px">
            <option value="">Selecciona un partido...</option>
            ${this.matches.filter(m => m.phase !== 'groups').map(m => {
              const home = m.home_team ? this.teamByCode(m.home_team)?.name : '?';
              const away = m.away_team ? this.teamByCode(m.away_team)?.name : '?';
              return `<option value="${m.id}">${m.id} — ${home} vs ${away}</option>`;
            }).join('')}
          </select>
          <button class="btn-sm" style="background:#fbbf24;color:#1a1200;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:600;font-size:12px" onclick="app.compensateMatch('add')">Compensar</button>
        </div>
        <div id="compensated-list" style="margin-top:8px;font-size:11px"></div>
      </div>
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

    // Cargar la lista de partidos compensados
    this.loadCompensatedList();
  },

  async openBracketGenerator() {
    const statusDiv = document.getElementById('admin-matches-msg');
    const groupsComplete = this.matches.filter(m => m.phase === 'groups').every(m => m.home_score != null);
    const played = this.matches.filter(m => m.phase === 'groups' && m.home_score != null).length;
    const total = this.matches.filter(m => m.phase === 'groups').length;

    const msg = groupsComplete
      ? '¿Generar eliminatorias con los 72 resultados completos?'
      : `Faltan ${total - played} de ${total} partidos de grupos. ¿Generar el bracket con los resultados actuales? (puedes regenerarlo después)`;

    if (!confirm(msg)) return;

    if (statusDiv) { statusDiv.textContent = 'Generando bracket...'; statusDiv.style.color = 'var(--color-text-muted)'; }

    try {
      const result = await this.api('/admin/bracket/generate', { method: 'POST' });
      await this.loadData();
      this.renderAdminMatches();

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
          <div style="color:var(--color-success);margin-bottom:8px">✓ Bracket generado — ${played}/${total} partidos de grupos cargados</div>
          <div style="font-size:12px;color:var(--color-text-muted)">
            <strong>8 mejores terceros (clasificados):</strong> ${qualified}<br>
            ${eliminated ? `<strong>Terceros eliminados:</strong> ${eliminated}` : ''}
            ${!groupsComplete ? '<br><span style="color:#fbbf24">⚠️ Recuerda regenerar el bracket cuando cargues los resultados restantes.</span>' : ''}
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

  async compensateMatch(action, matchId) {
    const msg = document.getElementById('admin-matches-msg');
    const id = matchId || document.getElementById('compensate-select')?.value;
    if (!id) { if (msg) { msg.textContent = 'Selecciona un partido primero.'; msg.style.color = 'var(--color-danger)'; } return; }
    try {
      await this.api(`/admin/compensated/${id}`, { method: 'PUT', body: JSON.stringify({ action }) });
      this._compensatedSet = null; // invalidar cache para que se recargue en el bracket
      await this.loadCompensatedList();
      if (msg) {
        msg.textContent = action === 'add'
          ? `✓ Partido ${id} compensado — todos los inscritos reciben 5 pts.`
          : `✓ Compensación de ${id} retirada.`;
        msg.style.color = 'var(--color-success)';
        setTimeout(() => msg.textContent = '', 3000);
      }
    } catch (e) {
      if (msg) { msg.textContent = 'Error: ' + e.message; msg.style.color = 'var(--color-danger)'; }
    }
  },

  async loadCompensatedList() {
    const div = document.getElementById('compensated-list');
    if (!div) return;
    try {
      const { compensated } = await this.api('/admin/compensated');
      if (!compensated.length) {
        div.innerHTML = '<span style="color:var(--color-text-muted)">No hay partidos compensados.</span>';
        return;
      }
      div.innerHTML = '<strong style="color:var(--color-text-muted)">Compensados:</strong> ' + compensated.map(id => {
        const m = this.matches.find(mm => mm.id === id);
        const home = m?.home_team ? this.teamByCode(m.home_team)?.name : '?';
        const away = m?.away_team ? this.teamByCode(m.away_team)?.name : '?';
        const label = m ? `${id} (${home} vs ${away})` : id;
        return `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:2px 8px;margin:2px;font-size:11px">
          ${label}
          <button onclick="app.showCompensationAudit('${id}')" style="background:none;border:none;color:#60a5fa;cursor:pointer;font-size:11px;padding:0 2px" title="Ver quién predijo y cuándo">🔍</button>
          <button onclick="app.compensateMatch('remove','${id}')" style="background:none;border:none;color:#fbbf24;cursor:pointer;font-size:13px;padding:0;line-height:1" title="Quitar compensación">✕</button>
        </span>`;
      }).join('');
    } catch (e) {
      div.innerHTML = `<span style="color:var(--color-danger)">Error: ${e.message}</span>`;
    }
  },

  async exportUsersXlsx() {
    try {
      // Cargar SheetJS dinámicamente si no está disponible
      if (!window.XLSX) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          s.onload = resolve; s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      const XLSX = window.XLSX;

      // Cargar datos con el token JWT (llamada autenticada)
      const [users, bracketData, lb1, lb2] = await Promise.all([
        this.api('/admin/users'),
        this.api('/admin/bracket-completion').catch(() => ({ users: [], totalKO: 0 })),
        this.api('/leaderboard/groups').catch(() => ({ leaderboard: [] })),
        this.api('/leaderboard/knockout').catch(() => ({ leaderboard: [] }))
      ]);

      const bracketBy = Object.fromEntries((bracketData.users || []).map(b => [b.user_id, b]));
      const ptsGroups = Object.fromEntries((lb1.leaderboard || []).map(u => [u.user_id, u.points]));
      const ptsKO = Object.fromEntries((lb2.leaderboard || []).map(u => [u.user_id, u.points]));

      // Construir filas
      const rows = users
        .filter(u => !u.is_admin)
        .map(u => {
          const bracket = bracketBy[u.id] || {};
          return {
            'Nombre':             u.display_name,
            'Usuario':            u.username,
            'Pagó Grupos':        u.paid_groups  ? 'Sí' : 'No',
            'Pagó Eliminatorias': u.paid_knockout ? 'Sí' : 'No',
            'Pts Grupos':         ptsGroups[u.id] ?? 0,
            'Pts Eliminatorias':  ptsKO[u.id]     ?? 0,
            'Bracket KO':         `${bracket.filled ?? 0}/${bracket.total ?? 0}`,
            'Bracket Completo':   bracket.complete ? 'Sí' : 'No',
          };
        })
        .sort((a, b) => a['Nombre'].localeCompare(b['Nombre']));

      // Crear workbook
      const ws = XLSX.utils.json_to_sheet(rows);

      // Ancho de columnas
      ws['!cols'] = [
        { wch: 22 }, { wch: 14 }, { wch: 13 }, { wch: 18 },
        { wch: 11 }, { wch: 18 }, { wch: 11 }, { wch: 16 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Participantes');

      // Descargar
      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `polla-participantes-${fecha}.xlsx`);
    } catch (e) {
      alert('Error al generar el Excel: ' + e.message);
    }
  },

  async fixPredictionTime(userId, matchId, displayName) {
    if (!confirm(`¿Corregir el timestamp de ${displayName} en ${matchId}?\n\nEsto le dará 8 puntos (exacto válido). Úsalo solo si el usuario predijo antes del partido pero el sistema registró la hora mal.`)) return;
    try {
      const result = await this.api(`/admin/predictions/${userId}/${matchId}/fix-time`, { method: 'PUT' });
      alert(`✓ Corregido: ${result.message}\n\nRecarga la auditoría para ver el cambio.`);
      // Recargar la auditoría
      const old = document.getElementById('comp-audit-modal');
      if (old) old.remove();
      await this.showCompensationAudit(matchId);
    } catch(e) {
      alert('Error: ' + e.message);
    }
  },

  async showCompensationAudit(matchId) {
    const existingAudit = document.getElementById('comp-audit-modal');
    if (existingAudit) existingAudit.remove();
    const modal = document.createElement('div');
    modal.id = 'comp-audit-modal';
    modal.innerHTML = `
      <style>
        #comp-audit-modal { position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.88);display:flex;align-items:flex-start;justify-content:center;padding:20px 10px;overflow-y:auto; }
        #comp-audit-modal .ca-panel { width:min(700px,100%);background:var(--color-background,#101018);border:1px solid var(--color-border);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.5); }
        #comp-audit-modal .ca-head { display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--color-border); }
        #comp-audit-modal .ca-body { padding:14px 16px 20px;overflow-y:auto;max-height:80vh; }
        #comp-audit-modal table { width:100%;border-collapse:collapse;font-size:12px; }
        #comp-audit-modal th { font-size:10px;color:var(--color-text-muted);font-weight:600;padding:4px 8px;border-bottom:1px solid var(--color-border);text-align:left; }
        #comp-audit-modal td { padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle; }
        #comp-audit-modal tr:last-child td { border-bottom:none; }
        #comp-audit-modal .badge-8 { background:rgba(201,168,76,0.2);color:#C9A84C;border:1px solid rgba(201,168,76,0.4);border-radius:8px;padding:1px 6px;font-weight:700;font-size:11px; }
        #comp-audit-modal .badge-5 { background:rgba(255,255,255,0.06);color:var(--color-text-muted);border:1px solid var(--color-border);border-radius:8px;padding:1px 6px;font-size:11px; }
        #comp-audit-modal .badge-0 { background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:1px 6px;font-size:11px; }
        #comp-audit-modal .before { color:#4ade80; }
        #comp-audit-modal .after { color:#f87171; }
      </style>
      <div class="ca-panel">
        <div class="ca-head">
          <div style="font-weight:700;font-size:14px">🔍 Auditoría de compensación — <span style="color:var(--color-primary)">${matchId}</span></div>
          <button onclick="document.getElementById('comp-audit-modal').remove()" style="background:transparent;border:1px solid var(--color-border);color:var(--color-text-muted);border-radius:8px;padding:4px 10px;cursor:pointer;font-size:13px">✕ Cerrar</button>
        </div>
        <div class="ca-body" id="comp-audit-content">
          <div style="text-align:center;color:var(--color-text-muted);padding:2rem">Cargando...</div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    const container = document.getElementById('comp-audit-content');
    try {
      const data = await this.api(`/admin/compensated/${matchId}/audit`);
      const { match, predictions } = data;

      const rows = predictions.map(p => {
        const badgeClass = p.pts_compensacion === 8 ? 'badge-8' : p.pts_compensacion === 5 ? 'badge-5' : 'badge-0';
        const tiempoClass = p.antes_del_partido === true ? 'before' : p.antes_del_partido === false ? 'after' : '';
        const tiempoLabel = p.antes_del_partido === true ? '✓ Antes' : p.antes_del_partido === false ? '✗ Después' : '—';
        // Botón para corregir solo si tiene exacto pero aparece como "después"
        const fixBtn = (p.exacto && p.antes_del_partido === false)
          ? `<button onclick="app.fixPredictionTime(${p.user_id},'${matchId}','${p.display_name.replace(/'/g,"\\'")}')" style="margin-left:6px;font-size:10px;padding:1px 6px;border:1px solid #fbbf24;border-radius:6px;background:transparent;color:#fbbf24;cursor:pointer" title="Corregir timestamp — dar 8 pts">🔧 Corregir</button>`
          : '';
        return `<tr>
          <td style="font-weight:500">${p.display_name}</td>
          <td style="text-align:center;font-weight:600">${p.pred || '<span style="color:var(--color-text-muted)">—</span>'}</td>
          <td style="text-align:center">${p.exacto ? '✓' : '—'}</td>
          <td style="font-size:11px;color:var(--color-text-muted)">${p.updated_at_ecu || '<em>Sin predicción</em>'}</td>
          <td style="text-align:center" class="${tiempoClass}">${tiempoLabel}${fixBtn}</td>
          <td style="text-align:center"><span class="${badgeClass}">${p.pts_compensacion} pts</span></td>
        </tr>`;
      }).join('');

      container.innerHTML = `
        <div style="margin-bottom:12px;padding:8px 12px;background:var(--color-surface);border-radius:8px;font-size:12px">
          <strong>${match.home} vs ${match.away}</strong> · Resultado: ${match.score} · 
          <span style="color:var(--color-text-muted)">Inicio del partido: <strong>${match.start}</strong></span>
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px">
          🟡 8 pts = acertó exacto Y predijo ANTES del partido · Gris 5 pts = compensación · Rojo 0 pts = sin predicción
        </div>
        <table>
          <thead><tr>
            <th>Usuario</th><th style="text-align:center">Pred</th><th style="text-align:center">Exacto</th>
            <th>Hora predicción (ECU)</th><th style="text-align:center">¿Antes?</th><th style="text-align:center">Puntos</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:10px;font-size:11px;color:var(--color-text-muted);border-top:1px solid var(--color-border);padding-top:8px">
          Esta tabla muestra la hora real en que cada usuario guardó su predicción. Los que predijeron después del inicio del partido no califican para los 8 puntos.
        </div>`;
    } catch(e) {
      container.innerHTML = `<div style="color:var(--color-danger);padding:1rem">⚠️ ${e.message}</div>`;
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
      const [users, bracketData] = await Promise.all([
        this.api('/admin/users'),
        this.api('/admin/bracket-completion').catch(() => ({ users: [], totalKO: 0 }))
      ]);
      const bracketBy = {};
      (bracketData.users || []).forEach(b => { bracketBy[b.user_id] = b; });

      // Botón de descarga xlsx (generado en el frontend con los datos ya cargados)
      const downloadBtn = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
          <button onclick="app.exportUsersXlsx()" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;color:var(--color-text-muted);font-size:12px;font-weight:600;cursor:pointer">
            📥 Descargar Excel
          </button>
        </div>`;

      container.innerHTML = downloadBtn + users.map(u => {
        const bracket = bracketBy[u.id];
        const bracketChip = bracket
          ? (bracket.complete
              ? '<span class="chip" style="background:rgba(74,222,128,0.15);color:#4ade80">✅ Bracket completo</span>'
              : `<span class="chip" style="background:rgba(251,191,36,0.15);color:#fbbf24">⚠️ Bracket incompleto (${bracket.filled}/${bracket.total})</span>`)
          : '';
        return `
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
              ${u.is_admin ? '' : bracketChip}
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
      `;}).join('');
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
