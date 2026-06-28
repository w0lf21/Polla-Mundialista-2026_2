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
      const lb = await this.api('/leaderboard');
      const me = lb.find(u => u.id === this.user.id);
      document.getElementById('header-points').textContent = (me ? me.points : 0) + ' pts';
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

  renderFixture(main) {
    this._fixtureTab = this._fixtureTab || 'groups';
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
    const matchCard = (m) => {
      if (!m) return `<div class="bk-match empty">?</div>`;
      const home = m.home_team ? this.teamByCode(m.home_team) : null;
      const away = m.away_team ? this.teamByCode(m.away_team) : null;
      const hasResult = m.home_score != null;
      const wc = m.winner;
      const bothDefined = m.home_team && m.away_team;

      // Mi predicción para ESTE cruce real
      const pred = myPreds[m.id];
      let myPick = null; // código del equipo que predije como ganador
      if (pred && bothDefined) {
        const ph = pred.pred_home != null ? parseInt(pred.pred_home) : null;
        const pa = pred.pred_away != null ? parseInt(pred.pred_away) : null;
        if (ph != null && pa != null) {
          if (ph > pa) myPick = m.home_team;
          else if (pa > ph) myPick = m.away_team;
          else myPick = pred.pred_winner || null; // empate → ganador por penales
        } else if (pred.pred_winner) {
          myPick = pred.pred_winner;
        }
      }
      const myScore = (pred && pred.pred_home != null) ? `${pred.pred_home}-${pred.pred_away}` : null;

      // Marca de acierto si ya hay resultado
      let pickResult = ''; // 'hit' | 'miss' | ''
      if (hasResult && myPick && wc) {
        pickResult = myPick === wc ? 'hit' : 'miss';
      }

      const teamRow = (team, code, scoreVal, penVal, confirmed) => {
        const isRealWinner = wc === code;
        const isMyPick = myPick === code;
        const cls = isRealWinner ? 'winner' : (hasResult ? 'loser' : '');
        // Equipo aún no confirmado matemáticamente → gris opaco (provisional)
        const provisional = bothDefined && confirmed === false && !hasResult;
        return `<div class="bk-team ${cls}${isMyPick ? ' mypick' : ''}${provisional ? ' provisional' : ''}">
          <span class="bk-flag">${team?.flag || '?'}</span>
          <span class="bk-name">${team?.name || (bothDefined ? '?' : '???')}</span>
          ${isMyPick ? '<span class="bk-pick-dot" title="Mi pronóstico de ganador">●</span>' : ''}
          ${hasResult ? `<span class="bk-score">${scoreVal}${penVal != null ? `(${penVal})` : ''}</span>` : ''}
        </div>`;
      };

      return `<div class="bk-match${hasResult ? ' played' : ''}${pickResult ? ' pick-'+pickResult : ''}">
        ${teamRow(home, m.home_team, m.home_score, m.pen_home, m.home_confirmed)}
        ${teamRow(away, m.away_team, m.away_score, m.pen_away, m.away_confirmed)}
        ${myScore || myPick ? `<div class="bk-mypred">🎯 Mi pred: ${myScore ? myScore : (myPick ? this.teamByCode(myPick)?.name : '—')}${pickResult === 'hit' ? ' <span style="color:#4ade80">✓</span>' : pickResult === 'miss' ? ' <span style="color:#f87171">✗</span>' : ''}</div>` : ''}
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
        .bk-mypred { font-size:9px; color:var(--color-text-muted); padding:2px 7px; background:rgba(96,165,250,0.06); border-top:1px solid var(--color-border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

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
        <button class="fixture-tab ${this._fixtureTab === 'groups' ? 'active' : ''}" data-tab="groups">Fase de Grupos</button>
        <button class="fixture-tab ${this._fixtureTab === 'finals' ? 'active' : ''}" data-tab="finals">Eliminatorias</button>
      </div>
      <div class="fixture-tab-content ${this._fixtureTab === 'groups' ? 'active' : ''}" id="ftab-groups">
        <div class="fixture-groups-grid">${groupsHtml}</div>
      </div>
      <div class="fixture-tab-content ${this._fixtureTab === 'finals' ? 'active' : ''}" id="ftab-finals">
        <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:11px;color:var(--color-text-muted);margin-bottom:8px;padding:6px 10px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px">
          <span style="font-weight:700;color:var(--color-text)">Leyenda:</span>
          <span><span style="display:inline-block;width:8px;height:8px;background:rgba(201,168,76,0.4);border-radius:2px;vertical-align:middle"></span> Ganador real</span>
          <span><span style="color:#60a5fa">● </span>Mi pronóstico</span>
          <span><span style="color:#4ade80">✓</span> Acerté · <span style="color:#f87171">✗</span> Fallé</span>
          <span style="color:var(--color-text-muted)">??? = sin definir</span>
        </div>
        <div class="pw-scroll-hint">← Desliza horizontalmente para ver el bracket completo →</div>
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

      const QF_PAIRS  = { 'QF-1': ['R32-2','R32-6'], 'QF-2': ['R32-1','R32-3'], 'QF-3': ['R32-4','R32-5'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-15','R32-14'], 'QF-8': ['R32-13','R32-16'] };
      const SF_PAIRS  = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-3','QF-4'], 'SF-3': ['QF-5','QF-6'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
      const FINAL_PAIR = ['SF-5','SF-6'];

      // Calcula el ganador pronosticado por el usuario para una llave
      // (deriva del marcador; si empate, usa pred_winner para penales)
      const userWinnerOf = (matchId, homeCode, awayCode) => {
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
            ${myCol(['R32-1','R32-2','R32-3','R32-4','R32-5','R32-6','R32-7','R32-8'], 'Dieciseisavos')}
            ${myCol(['QF-1','QF-2','QF-3','QF-4'], 'Octavos')}
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
            ${myCol(['QF-5','QF-6','QF-7','QF-8'], 'Octavos')}
            ${myCol(['R32-9','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16'], 'Dieciseisavos')}
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

  async showCompare(rivalId, rivalName) {
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
      const data = await this.api(`/users/${rivalId}/compare`);
      const { me, rival, gap, canCatchUp, gold, silver, neutral, totalPending } = data;

      const alertClass = gap <= 0 ? 'good' : canCatchUp ? 'warn' : 'bad';
      const alertMsg = gap <= 0
        ? `🎉 Ya le vas ganando por ${Math.abs(gap)} pts.`
        : canCatchUp
        ? `⚠️ Te lleva ${gap} pts. Puedes alcanzarlo si salen tus exactos — máxima ganancia neta posible: ${gold.length * 5 + silver.reduce((s,m) => s+m.net_gain,0)} pts.`
        : `❌ Te lleva ${gap} pts y matemáticamente es difícil alcanzarlo solo con grupos.`;

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
            <div style="font-size:10px;color:var(--color-text-muted)">pts actuales</div>
          </div>
          <div style="display:flex;align-items:center;font-size:20px;color:var(--color-text-muted)">⚔️</div>
          <div class="cmp-score-box">
            <div style="font-size:11px;color:var(--color-text-muted)">${rival.display_name.split(' ')[0]}</div>
            <div style="font-size:22px;font-weight:700">${rival.points}</div>
            <div style="font-size:10px;color:var(--color-text-muted)">pts actuales</div>
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
          Análisis basado en ${totalPending} partidos pendientes de fase de grupos. Los puntos de eliminatorias no están incluidos.
        </div>`;
    } catch(e) {
      container.innerHTML = `<div style="color:var(--color-danger);padding:1rem">⚠️ ${e.message}</div>`;
    }
  },

  // ── DETALLE DE PUNTOS (partido a partido) ──────────────────────────────────

  async showPointsBreakdown(userId, displayName) {
    document.getElementById('pts-breakdown-modal')?.remove();

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
      const data = await this.api(`/users/${userId}/points-breakdown`);
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

      const catLabel = { exacto: 'Exacto', 'g+dif': 'G+Dif', ganador: 'Ganador', fallo: 'Fallo' };
      const catClass = { exacto: 'exacto', 'g+dif': 'gdif', ganador: 'ganador', fallo: 'fallo' };
      const ptsClass = { exacto: 'pbm-pts-5', 'g+dif': 'pbm-pts-3', ganador: 'pbm-pts-2', fallo: 'pbm-pts-0' };

      const rows = matches.map(m => {
        const predStr = m.pred_home != null ? `${m.pred_home}-${m.pred_away}` : (m.pred_winner || '—');
        const realStr = `${m.real_home}-${m.real_away}`;
        const grpLabel = m.phase === 'groups' ? `Gr.${m.group_name}` : m.phase.toUpperCase();
        return `<tr>
          <td style="color:var(--color-text-muted);font-size:10px;white-space:nowrap">${m.match_date?.slice(5,10) || ''}<br><span style="font-size:9px">${grpLabel}</span></td>
          <td style="white-space:nowrap">${m.home_flag} ${m.home_name}</td>
          <td style="text-align:center;font-size:11px;white-space:nowrap">
            <span style="background:var(--color-surface);padding:1px 5px;border-radius:4px;font-weight:600">${realStr}</span>
          </td>
          <td style="white-space:nowrap">${m.away_flag} ${m.away_name}</td>
          <td style="text-align:center;color:var(--color-text-muted)">${predStr}</td>
          <td style="text-align:center"><span class="pbm-badge ${catClass[m.category]}">${catLabel[m.category]}</span></td>
          <td style="text-align:right" class="${ptsClass[m.category]}">${m.pts > 0 ? '+' + m.pts : '0'}</td>
        </tr>`;
      }).join('');

      container.innerHTML = `
        <div class="pbm-summary">
          <div class="pbm-chip total">🏆 Total: ${total} pts</div>
          <div class="pbm-chip">🎯 Exactos: ${exactos}</div>
          <div class="pbm-chip">📏 G+Dif: ${gdif}</div>
          <div class="pbm-chip">✅ Ganador: ${ganador}</div>
          <div class="pbm-chip">❌ Fallos: ${fallos}</div>
        </div>
        <table class="pbm-t">
          <thead><tr>
            <th>Fecha</th><th>Local</th><th style="text-align:center">Resultado</th><th>Visitante</th>
            <th style="text-align:center">Mi pronóstico</th><th style="text-align:center">Categoría</th>
            <th style="text-align:right">Pts</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    } catch(e) {
      container.innerHTML = `<div style="color:var(--color-danger);padding:1rem">⚠️ ${e.message}</div>`;
    }
  },

  // ── VER PRONÓSTICOS DE OTRO USUARIO ────────────────────────────────────────

  async showUserPredictions(userId) {
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
      const [classified, otherPredsArr, podiumData] = await Promise.all([
        this.api(`/predictions/classified?userId=${userId}`),
        this.api(`/predictions?userId=${userId}`),
        this.api(`/podium?userId=${userId}`).catch(() => null)
      ]);

      // Mapa LOCAL — nunca tocamos this.predictions
      const upreds = Object.fromEntries(otherPredsArr.map(p => [p.match_id, p]));

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
      const QF = {'QF-1':['R32-2','R32-6'],'QF-2':['R32-1','R32-3'],'QF-3':['R32-4','R32-5'],'QF-4':['R32-7','R32-8'],'QF-5':['R32-11','R32-12'],'QF-6':['R32-9','R32-10'],'QF-7':['R32-15','R32-14'],'QF-8':['R32-13','R32-16']};
      const SF = {'SF-1':['QF-1','QF-2'],'SF-2':['QF-3','QF-4'],'SF-3':['QF-5','QF-6'],'SF-4':['QF-7','QF-8'],'SF-5':['SF-1','SF-2'],'SF-6':['SF-3','SF-4']};
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
        <div class="updm-side">${col(['R32-1','R32-2','R32-3','R32-4','R32-5','R32-6','R32-7','R32-8'],'Dieciseisavos')}${col(['QF-1','QF-2','QF-3','QF-4'],'Octavos')}${col(['SF-1','SF-2'],'Cuartos')}${col(['SF-5'],'Semis')}</div>
        <div class="updm-center"><div class="updm-clabel">Gran Final</div>${card('FINAL')}<div class="updm-clabel" style="margin-top:16px">3er Puesto</div>${card('TP')}</div>
        <div class="updm-side updm-right">${col(['SF-6'],'Semis')}${col(['SF-3','SF-4'],'Cuartos')}${col(['QF-5','QF-6','QF-7','QF-8'],'Octavos')}${col(['R32-9','R32-10','R32-11','R32-12','R32-13','R32-14','R32-15','R32-16'],'Dieciseisavos')}</div>
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

    const QF_PAIRS  = { 'QF-1': ['R32-2','R32-6'], 'QF-2': ['R32-1','R32-3'], 'QF-3': ['R32-4','R32-5'], 'QF-4': ['R32-7','R32-8'], 'QF-5': ['R32-11','R32-12'], 'QF-6': ['R32-9','R32-10'], 'QF-7': ['R32-15','R32-14'], 'QF-8': ['R32-13','R32-16'] };
    const SF_PAIRS  = { 'SF-1': ['QF-1','QF-2'], 'SF-2': ['QF-3','QF-4'], 'SF-3': ['QF-5','QF-6'], 'SF-4': ['QF-7','QF-8'], 'SF-5': ['SF-1','SF-2'], 'SF-6': ['SF-3','SF-4'] };
    const FINAL_PAIR = ['SF-5','SF-6'];

    const koWinnerOf = (matchId, homeCode, awayCode) => {
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
              ${m.pen_home != null ? `· Pe
