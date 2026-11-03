/* League admin: sign in, set up the season, and enter scores. Data lives in Supabase. */
(() => {
  const L = window.AVIDLeague;
  const app = document.getElementById('app');
  const account = document.getElementById('adm-account');
  const toastBox = document.getElementById('adm-toast');
  // Read before Supabase starts, because it clears the reset-password link from the address bar.
  const recovering = /type=recovery/.test(location.hash);

  const TABS = [
    ['schedule', 'Weeks & courses'],
    ['leagues', 'Leagues & teams'],
    ['scores', 'Scores'],
    ['ctp', 'Closest to the pin & aces'],
    ['season', 'Season settings']
  ];

  const S = {
    sb: null,
    user: null,
    seasons: [],
    seasonId: null,
    weeks: [], leagues: [], flights: [], teams: [], scores: [], ctp: [], aces: [],
    tab: sessionGet('adm-tab') || 'schedule',
    leagueId: null,
    scoreLeagueId: null,
    scoreFlight: 'all',
    ctpWeekId: null,
    pending: 0
  };

  /* ---------- Small helpers ---------- */

  function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } }

  // h('button', {class: 'x', onClick: fn}, 'Label')
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    let value;
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') el[k] = !!v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(kid));
    }
    if (value != null) el.value = value;
    return el;
  }

  let toastTimer;
  function toast(msg, kind = 'ok') {
    toastBox.textContent = msg;
    toastBox.className = 'adm-toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastBox.className = 'adm-toast'; }, kind === 'error' ? 6000 : 2200);
  }

  function setSaving(delta) {
    S.pending += delta;
    const el = document.getElementById('adm-saving');
    if (el) {
      el.textContent = S.pending > 0 ? 'Saving…' : 'All changes saved';
      el.classList.toggle('busy', S.pending > 0);
    }
  }

  // Runs a Supabase call, shows errors, and marks the field that triggered it.
  async function run(promise, field) {
    setSaving(1);
    field?.classList.remove('adm-ok', 'adm-err');
    field?.classList.add('adm-busy');
    try {
      const { data, error } = await promise;
      if (error) throw error;
      field?.classList.add('adm-ok');
      setTimeout(() => field?.classList.remove('adm-ok'), 1200);
      return { data, ok: true };
    } catch (err) {
      console.error(err);
      field?.classList.add('adm-err');
      toast(friendlyError(err), 'error');
      return { ok: false };
    } finally {
      field?.classList.remove('adm-busy');
      setSaving(-1);
    }
  }

  function friendlyError(err) {
    const msg = err?.message || String(err);
    if (/row-level security|permission denied/i.test(msg)) return 'Not saved: this account doesn’t have admin access.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Not saved: no internet connection. Try again.';
    if (/check constraint/i.test(msg)) return 'Not saved: that value is outside the allowed range.';
    return 'Not saved: ' + msg;
  }

  const byId = (list, id) => list.find(x => x.id === id);
  const season = () => byId(S.seasons, S.seasonId);
  const leagueTeams = id => S.teams.filter(t => t.league_id === id);
  const leagueFlights = id => S.flights.filter(f => f.league_id === id);
  const scoreOf = (teamId, weekId) => S.scores.find(s => s.team_id === teamId && s.week_id === weekId);
  const weekLabel = w => `Week ${w.week_number}${w.course ? ' · ' + w.course : ''}`;
  const sortTeams = (list, flights) => [...list].sort((a, b) => {
    const fa = flights.findIndex(f => f.id === a.flight_id), fb = flights.findIndex(f => f.id === b.flight_id);
    return (fa < 0 ? 999 : fa) - (fb < 0 ? 999 : fb) || L.teamLabel(a).localeCompare(L.teamLabel(b));
  });

  /* ---------- Start and sign in ---------- */

  async function start() {
    try {
      S.sb = await L.getClient();
    } catch (err) {
      console.error(err);
    }
    if (!S.sb) {
      app.replaceChildren(card('Almost ready',
        h('p', null, 'The leaderboard isn’t connected to Supabase yet. Add your Supabase project URL and anon key to ', h('code', null, 'content.js'), ' (see ', h('code', null, 'supabase/README.md'), ').')));
      return;
    }
    S.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { showNewPassword(); return; }
      if (event === 'SIGNED_OUT') { S.user = null; showLogin(); }
    });
    const { data } = await S.sb.auth.getSession();
    if (recovering) {
      if (data.session) showNewPassword();
      else showLogin('That reset link has expired. Choose “Forgot password” to get a new one.');
      return;
    }
    if (data.session) await signedIn(data.session.user);
    else showLogin();
  }

  function card(title, ...body) {
    document.body.classList.remove('adm-auth-mode');
    return h('section', { class: 'adm-card adm-narrow' }, h('h1', null, title), body);
  }

  /* ---------- Sign-in screens ---------- */

  const ICONS = {
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 6.9C3.9 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };
  function icon(name, cls) {
    const span = h('span', { class: 'adm-ico ' + (cls || ''), 'aria-hidden': 'true' });
    span.innerHTML = ICONS[name]; // fixed markup above, no user data
    return span;
  }

  // Input with an icon on the left; password inputs also get a show/hide button.
  function iconField(iconName, input) {
    const wrap = h('div', { class: 'adm-field' }, icon(iconName, 'lead'), input);
    if (input.type === 'password') {
      const toggle = h('button', { type: 'button', class: 'adm-eye', 'aria-label': 'Show password', 'aria-pressed': 'false' }, icon('eye'));
      toggle.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        toggle.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
        input.focus();
      });
      wrap.append(toggle);
    }
    return wrap;
  }

  // Split screen: golf photo on the left, form on the right.
  function authScreen(title, subtitle, form) {
    document.body.classList.add('adm-auth-mode');
    const curves = h('span', { class: 'adm-auth-curves', 'aria-hidden': 'true' });
    curves.innerHTML = '<svg viewBox="0 0 400 400" fill="none" stroke="currentColor" stroke-width="1"><path d="M400 20C300 60 230 160 190 260S90 390 0 400"/><path d="M400 60C310 95 250 185 215 280S120 400 40 410"/><path d="M400 100C320 130 270 210 240 300S150 410 80 420"/></svg>';
    return h('div', { class: 'adm-auth' },
      h('aside', { class: 'adm-auth-photo' },
        h('div', { class: 'adm-auth-brand' },
          h('img', { src: 'assets/logo.png', alt: 'AVID Golf', width: 72, height: 71 }),
          h('span', { class: 'adm-auth-divider', 'aria-hidden': 'true' }),
          h('span', { class: 'adm-auth-kicker' }, 'League admin')),
        h('div', { class: 'adm-auth-pitch' },
          h('p', { class: 'adm-auth-headline' }, 'Better Golf.', h('br'), 'Together.'),
          h('p', { class: 'adm-auth-tags' }, 'League leaderboards', h('span', { 'aria-hidden': 'true' }, ' / '), 'Scores', h('span', { 'aria-hidden': 'true' }, ' / '), 'Teams'))),
      h('section', { class: 'adm-auth-panel' },
        h('div', { class: 'adm-auth-inner' },
          h('a', { class: 'adm-auth-logo', href: 'index.html', 'aria-label': 'AVID Golf home' }, h('img', { src: 'assets/logo.png', alt: 'AVID Golf', width: 110, height: 108 })),
          h('h1', null, title),
          h('p', { class: 'adm-auth-sub' }, subtitle),
          form),
        curves));
  }

  function showLogin(message) {
    account.replaceChildren();
    const email = h('input', { type: 'email', id: 'adm-email', autocomplete: 'username', placeholder: 'Enter your email address', required: true });
    const pass = h('input', { type: 'password', id: 'adm-pass', autocomplete: 'current-password', placeholder: 'Enter your password', required: true });
    const msg = h('p', { class: 'adm-form-msg', role: 'alert' }, message || '');
    const btn = h('button', { class: 'adm-btn adm-auth-btn', type: 'submit' }, h('span', null, 'Sign in'), icon('arrow'));
    const form = h('form', {
      class: 'adm-form adm-auth-form', onSubmit: async e => {
        e.preventDefault();
        btn.disabled = true;
        msg.textContent = '';
        const { data, error } = await S.sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        btn.disabled = false;
        if (error) {
          msg.textContent = /invalid login|credentials/i.test(error.message) || error.status === 400
            ? 'That email and password don’t match. Please try again.'
            : 'Couldn’t reach the server. Check your connection and try again.';
          return;
        }
        await signedIn(data.user);
      }
    },
    h('label', { for: 'adm-email' }, 'Email'), iconField('mail', email),
    h('label', { for: 'adm-pass' }, 'Password'), iconField('lock', pass),
    msg, btn,
    h('button', {
      type: 'button', class: 'adm-link adm-auth-forgot', onClick: async () => {
        if (!email.value.trim()) { msg.textContent = 'Enter your email first, then choose “Forgot password”.'; email.focus(); return; }
        const { error } = await S.sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
        msg.textContent = error ? 'Couldn’t send the email: ' + error.message : 'Check your inbox for a link to set a new password.';
      }
    }, 'Forgot password?'));
    app.replaceChildren(authScreen('League Admin', 'Sign in to manage leagues, teams and scores.', form));
    email.focus();
  }

  function showNewPassword() {
    const pass = h('input', { type: 'password', id: 'adm-new', autocomplete: 'new-password', placeholder: 'At least 8 characters', minlength: 8, required: true });
    const msg = h('p', { class: 'adm-form-msg', role: 'alert' });
    const form = h('form', {
      class: 'adm-form adm-auth-form', onSubmit: async e => {
        e.preventDefault();
        const { data, error } = await S.sb.auth.updateUser({ password: pass.value });
        if (error) { msg.textContent = error.message; return; }
        history.replaceState(null, '', location.pathname);
        toast('Password updated');
        await signedIn(data.user);
      }
    }, h('label', { for: 'adm-new' }, 'New password'), iconField('lock', pass), msg,
      h('button', { class: 'adm-btn adm-auth-btn', type: 'submit' }, h('span', null, 'Save password'), icon('arrow')));
    app.replaceChildren(authScreen('Set a new password', 'Choose a new password for your admin account.', form));
    pass.focus();
  }

  async function signedIn(user) {
    S.user = user;
    document.body.classList.remove('adm-auth-mode');
    account.replaceChildren(
      h('span', { id: 'adm-saving', class: 'adm-saving' }, 'All changes saved'),
      h('span', { class: 'adm-who' }, user.email),
      h('button', { class: 'adm-link', onClick: () => S.sb.auth.signOut() }, 'Sign out'));
    const { data: isAdmin, error } = await S.sb.rpc('is_admin');
    if (error || !isAdmin) {
      app.replaceChildren(card('No admin access',
        h('p', null, `You’re signed in as ${user.email}, but this account isn’t set up as a league admin.`),
        h('p', { class: 'adm-muted' }, 'Ask the site owner to add your account to the admins list in Supabase.')));
      return;
    }
    await loadSeasons();
  }

  /* ---------- Loading ---------- */

  async function loadSeasons(selectId) {
    const { data, error } = await S.sb.from('seasons').select('*').order('created_at', { ascending: false });
    if (error) { toast(friendlyError(error), 'error'); return; }
    S.seasons = data;
    const remembered = selectId || S.seasonId || sessionGet('adm-season');
    S.seasonId = (byId(data, remembered) || data.find(s => s.is_current) || data[0] || {}).id || null;
    if (!S.seasonId) { showFirstSeason(); return; }
    await loadSeason();
  }

  async function loadSeason() {
    sessionSet('adm-season', S.seasonId);
    const sb = S.sb;
    try {
      const [weeks, leagues, aces] = await Promise.all([
        L.selectAll(() => sb.from('weeks').select('*').eq('season_id', S.seasonId).order('week_number')),
        L.selectAll(() => sb.from('leagues').select('*').eq('season_id', S.seasonId).order('sort_order').order('created_at')),
        L.selectAll(() => sb.from('hole_in_ones').select('*').eq('season_id', S.seasonId).order('play_date', { ascending: false }).order('created_at'))
      ]);
      const lids = leagues.map(l => l.id), wids = weeks.map(w => w.id);
      const [flights, teams, scores, ctp] = await Promise.all([
        lids.length ? L.selectAll(() => sb.from('flights').select('*').in('league_id', lids).order('sort_order').order('created_at')) : [],
        lids.length ? L.selectAll(() => sb.from('teams').select('*').in('league_id', lids).order('name')) : [],
        wids.length ? L.selectAll(() => sb.from('scores').select('*').in('week_id', wids).order('team_id')) : [],
        wids.length ? L.selectAll(() => sb.from('ctp_results').select('*').in('week_id', wids).order('hole')) : []
      ]);
      Object.assign(S, { weeks, leagues, flights, teams, scores, ctp, aces });
    } catch (err) {
      toast(friendlyError(err), 'error');
      return;
    }
    if (!byId(S.leagues, S.leagueId)) S.leagueId = S.leagues[0]?.id || null;
    if (!byId(S.leagues, S.scoreLeagueId)) S.scoreLeagueId = S.leagues[0]?.id || null;
    if (!byId(S.weeks, S.ctpWeekId)) S.ctpWeekId = (latestPlayedWeek() || S.weeks[0])?.id || null;
    renderShell();
  }

  function latestPlayedWeek() {
    const played = S.weeks.filter(w => S.scores.some(s => s.week_id === w.id) || S.ctp.some(c => c.week_id === w.id));
    return played[played.length - 1];
  }

  /* ---------- Layout ---------- */

  function renderShell() {
    const seasonSelect = h('select', {
      id: 'adm-season-select', onChange: e => { S.seasonId = e.target.value; loadSeason(); }
    }, S.seasons.map(s => h('option', { value: s.id, selected: s.id === S.seasonId }, s.name + (s.is_current ? ' (current)' : ''))));
    const nav = h('nav', { class: 'adm-tabs', role: 'tablist', 'aria-label': 'Admin sections' },
      TABS.map(([id, label]) => h('button', {
        role: 'tab', class: 'adm-tab', 'aria-selected': String(S.tab === id), onClick: () => { S.tab = id; sessionSet('adm-tab', id); renderShell(); }
      }, label)));
    const views = { schedule: viewSchedule, leagues: viewLeagues, scores: viewScores, ctp: viewCtp, season: viewSeason };
    app.replaceChildren(
      h('div', { class: 'adm-bar' },
        h('label', { class: 'adm-season' }, h('span', null, 'Season'), seasonSelect),
        h('a', { class: 'adm-link', href: 'leaderboard.html', target: '_blank', rel: 'noopener' }, 'View leaderboard ↗')),
      nav,
      h('section', { class: 'adm-card', role: 'tabpanel' }, (views[S.tab] || viewSchedule)()));
  }

  function intro(title, text) {
    return h('div', { class: 'adm-intro' }, h('h2', null, title), text ? h('p', { class: 'adm-muted' }, text) : null);
  }

  /* ---------- Weeks & courses ---------- */

  function viewSchedule() {
    const rows = S.weeks.map(w => {
      const course = h('input', { type: 'text', value: w.course, placeholder: 'Course name', 'aria-label': `Week ${w.week_number} course` });
      course.addEventListener('change', async () => {
        const v = course.value.trim();
        if ((await run(S.sb.from('weeks').update({ course: v }).eq('id', w.id), course)).ok) w.course = v;
      });
      const needsPar = () => !w.par && S.scores.some(x => x.week_id === w.id);
      const par = h('input', { type: 'number', min: 18, max: 200, value: w.par ?? '', placeholder: '72', class: 'adm-num' + (needsPar() ? ' adm-warn' : ''), 'aria-label': `Week ${w.week_number} par`, title: needsPar() ? 'This week has scores but no par, so it isn’t counted in the rankings yet.' : '' });
      par.addEventListener('change', async () => {
        const v = par.value === '' ? null : parseInt(par.value, 10);
        if ((await run(S.sb.from('weeks').update({ par: v }).eq('id', w.id), par)).ok) {
          w.par = v;
          par.classList.toggle('adm-warn', needsPar());
          par.title = needsPar() ? 'This week has scores but no par, so it isn’t counted in the rankings yet.' : '';
        }
      });
      const date = h('input', { type: 'date', value: w.play_date || '', 'aria-label': `Week ${w.week_number} date` });
      date.addEventListener('change', async () => {
        const v = date.value || null;
        if ((await run(S.sb.from('weeks').update({ play_date: v }).eq('id', w.id), date)).ok) w.play_date = v;
      });
      return h('tr', null,
        h('th', { scope: 'row' }, 'Week ' + w.week_number),
        h('td', null, course), h('td', null, par), h('td', null, date),
        h('td', null, publishToggle(w)));
    });
    return [
      intro('Weeks & courses', 'Every league plays the same course each week. Enter each course’s par: the leaderboard ranks teams by their score against par, so a week’s scores only count once it has a par. Scores for a week only appear on the website once “Show on site” is turned on, so you can enter them first and publish when they’re all in.'),
      h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table' },
        h('thead', null, h('tr', null, h('th', null, 'Week'), h('th', null, 'Course'), h('th', null, 'Par'), h('th', null, 'Date'), h('th', null, 'Show on site'))),
        h('tbody', null, rows)))
    ];
  }

  function publishToggle(w, compact) {
    const input = h('input', { type: 'checkbox', checked: w.published, 'aria-label': `Show week ${w.week_number} on the website` });
    const text = h('span', null, w.published ? 'Live' : 'Hidden');
    const label = h('label', { class: 'adm-switch' + (compact ? ' compact' : '') }, input, h('i', { 'aria-hidden': 'true' }), text);
    input.addEventListener('change', async () => {
      const v = input.checked;
      const res = await run(S.sb.from('weeks').update({ published: v }).eq('id', w.id), label);
      if (res.ok) {
        w.published = v;
        text.textContent = v ? 'Live' : 'Hidden';
        toast(v ? `Week ${w.week_number} is now on the website` : `Week ${w.week_number} is hidden from the website`);
        document.querySelectorAll(`input[data-pub="${w.id}"]`).forEach(x => { x.checked = v; });
      } else {
        input.checked = !v;
      }
    });
    input.dataset.pub = w.id;
    return label;
  }

  /* ---------- Leagues & teams ---------- */

  function viewLeagues() {
    const list = h('div', { class: 'adm-league-list' },
      S.leagues.map(l => h('button', {
        class: 'adm-league-btn', 'aria-pressed': String(l.id === S.leagueId), onClick: () => { S.leagueId = l.id; renderShell(); }
      }, h('strong', null, l.name), h('span', null, `${leagueTeams(l.id).length} ${l.kind === 'individual' ? 'players' : 'teams'} · ${leagueFlights(l.id).length} flights`))));

    const name = h('input', { type: 'text', placeholder: 'e.g. 4-Ball', required: true, 'aria-label': 'New league name' });
    const kind = h('select', { 'aria-label': 'New league type' }, h('option', { value: 'team' }, 'Teams'), h('option', { value: 'individual' }, 'Individual players'));
    const add = h('form', {
      class: 'adm-inline-form', onSubmit: async e => {
        e.preventDefault();
        const v = name.value.trim();
        if (!v) return;
        const res = await run(S.sb.from('leagues').insert({ season_id: S.seasonId, name: v, kind: kind.value, sort_order: S.leagues.length }).select().single());
        if (res.ok) { S.leagueId = res.data.id; toast(`Added ${v}`); await loadSeason(); }
      }
    }, name, kind, h('button', { class: 'adm-btn small', type: 'submit' }, 'Add league'));

    const league = byId(S.leagues, S.leagueId);
    return [
      intro('Leagues & teams', 'Create each league, add its teams, and put teams into flights once flights are set. Teams can move between flights at any time.'),
      h('div', { class: 'adm-split' },
        h('aside', null, list.childElementCount ? list : h('p', { class: 'adm-muted' }, 'No leagues yet.'), h('h3', null, 'Add a league'), add),
        h('div', null, league ? leaguePanel(league) : h('p', { class: 'adm-empty' }, 'Add your first league to get started.')))
    ];
  }

  function leaguePanel(league) {
    const individual = league.kind === 'individual';
    const flights = leagueFlights(league.id);
    const teams = sortTeams(leagueTeams(league.id), flights);
    const idx = S.leagues.indexOf(league);

    // League details
    const name = h('input', { type: 'text', value: league.name, 'aria-label': 'League name' });
    name.addEventListener('change', async () => {
      const v = name.value.trim();
      if (!v) { name.value = league.name; return; }
      if ((await run(S.sb.from('leagues').update({ name: v }).eq('id', league.id), name)).ok) { league.name = v; renderShell(); }
    });
    const kind = h('select', { 'aria-label': 'League type' },
      h('option', { value: 'team', selected: !individual }, 'Teams (team name + captain)'),
      h('option', { value: 'individual', selected: individual }, 'Individual players (name only)'));
    kind.addEventListener('change', async () => {
      if ((await run(S.sb.from('leagues').update({ kind: kind.value }).eq('id', league.id), kind)).ok) { league.kind = kind.value; renderShell(); }
    });
    const move = dir => async () => {
      const other = S.leagues[idx + dir];
      if (!other) return;
      await run(S.sb.from('leagues').update({ sort_order: idx + dir }).eq('id', league.id));
      await run(S.sb.from('leagues').update({ sort_order: idx }).eq('id', other.id));
      await loadSeason();
    };
    const del = h('button', {
      class: 'adm-btn danger small', onClick: async () => {
        if (!confirm(`Delete ${league.name}? This also deletes its ${teams.length} teams, their flights and all their scores. This can’t be undone.`)) return;
        if ((await run(S.sb.from('leagues').delete().eq('id', league.id))).ok) { toast(`Deleted ${league.name}`); S.leagueId = null; await loadSeason(); }
      }
    }, 'Delete league');

    // Flights
    const flightRows = flights.map((f, i) => {
      const fname = h('input', { type: 'text', value: f.name, 'aria-label': 'Flight name' });
      fname.addEventListener('change', async () => {
        const v = fname.value.trim();
        if (!v) { fname.value = f.name; return; }
        if ((await run(S.sb.from('flights').update({ name: v }).eq('id', f.id), fname)).ok) { f.name = v; renderShell(); }
      });
      const count = teams.filter(t => t.flight_id === f.id).length;
      return h('li', null, fname, h('span', { class: 'adm-muted' }, `${count} ${individual ? 'players' : 'teams'}`),
        h('button', {
          class: 'adm-icon', 'aria-label': `Delete ${f.name}`, title: 'Delete flight', onClick: async () => {
            if (!confirm(`Delete ${f.name}? Its ${count} teams stay in the league but won’t be in a flight.`)) return;
            if ((await run(S.sb.from('flights').delete().eq('id', f.id))).ok) await loadSeason();
          }
        }, '✕'));
    });
    const fnew = h('input', { type: 'text', placeholder: `e.g. Flight ${String.fromCharCode(65 + flights.length)}`, 'aria-label': 'New flight name' });
    const addFlight = h('form', {
      class: 'adm-inline-form', onSubmit: async e => {
        e.preventDefault();
        const v = fnew.value.trim() || fnew.placeholder.replace('e.g. ', '');
        if ((await run(S.sb.from('flights').insert({ league_id: league.id, name: v, sort_order: flights.length }))).ok) { toast(`Added ${v}`); await loadSeason(); }
      }
    }, fnew, h('button', { class: 'adm-btn small', type: 'submit' }, 'Add flight'));

    // Teams
    const teamRows = teams.map(t => teamRow(t, league, flights));
    const tname = h('input', { type: 'text', placeholder: individual ? 'Player name' : 'Team name (optional)', required: individual, 'aria-label': individual ? 'New player name' : 'New team name' });
    const tcapt = individual ? null : h('input', { type: 'text', placeholder: 'Captain', 'aria-label': 'New team captain' });
    const tflight = flights.length ? flightSelect(null, flights, 'New team flight') : null;
    const addTeam = h('form', {
      class: 'adm-inline-form', onSubmit: async e => {
        e.preventDefault();
        const v = tname.value.trim();
        const captain = tcapt ? tcapt.value.trim() : '';
        if (!v && !captain) { toast('Enter a team name or a captain.', 'error'); tname.focus(); return; }
        const row = { league_id: league.id, name: v, captain, flight_id: tflight?.value || null };
        if ((await run(S.sb.from('teams').insert(row))).ok) { toast(`Added ${v || captain}`); await loadSeason(); document.querySelector('[aria-label="New team name"],[aria-label="New player name"]')?.focus(); }
      }
    }, tname, tcapt, tflight, h('button', { class: 'adm-btn small', type: 'submit' }, individual ? 'Add player' : 'Add team'));

    const bulk = h('textarea', { rows: 5, placeholder: individual ? 'One player per line' : 'One team per line: Team name, Captain\nNo team name? Start the line with a comma: , Captain', 'aria-label': 'Add many at once' });
    const bulkForm = h('details', { class: 'adm-bulk' }, h('summary', null, 'Add many at once'),
      h('form', {
        onSubmit: async e => {
          e.preventDefault();
          const rows = bulk.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            // Individual leagues: the whole line is the player's name (stray commas are ignored).
            if (individual) return { league_id: league.id, name: line.replace(/^[\s,]+|[\s,]+$/g, ''), captain: '' };
            const [n, ...c] = line.split(',');
            return { league_id: league.id, name: n.trim(), captain: c.join(',').trim() };
          }).filter(r => r.name || r.captain);
          if (!rows.length) { toast(individual ? 'Type one player name per line.' : 'Type one team per line: Team name, Captain', 'error'); return; }
          if ((await run(S.sb.from('teams').insert(rows))).ok) { toast(`Added ${rows.length}`); bulk.value = ''; await loadSeason(); }
        }
      }, bulk, h('button', { class: 'adm-btn small', type: 'submit' }, 'Add all')));

    return h('div', { class: 'adm-league' },
      h('div', { class: 'adm-league-head' },
        h('div', { class: 'adm-fields' }, h('label', null, 'League name', name), h('label', null, 'Type', kind)),
        h('div', { class: 'adm-actions' },
          h('button', { class: 'adm-btn ghost small', disabled: idx === 0, onClick: move(-1), title: 'Show this tab earlier' }, '← Move'),
          h('button', { class: 'adm-btn ghost small', disabled: idx === S.leagues.length - 1, onClick: move(1), title: 'Show this tab later' }, 'Move →'),
          del)),
      h('h3', null, 'Flights'),
      h('p', { class: 'adm-muted small' }, 'Until at least one team is in a flight, the website shows one leaderboard for this league. Teams not in a flight show under “Not yet in a flight”.'),
      flightRows.length ? h('ul', { class: 'adm-flights' }, flightRows) : null,
      addFlight,
      h('h3', null, individual ? `Players (${teams.length})` : `Teams (${teams.length})`),
      teams.length ? h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table' },
        h('thead', null, h('tr', null, h('th', null, individual ? 'Player' : 'Team name (optional)'), individual ? null : h('th', null, 'Captain'), flights.length ? h('th', null, 'Flight') : null, h('th', null, 'League'), h('th', null, h('span', { class: 'sr-only' }, 'Delete')))),
        h('tbody', null, teamRows))) : h('p', { class: 'adm-muted' }, individual ? 'No players yet.' : 'No teams yet.'),
      h('h3', null, individual ? 'Add a player' : 'Add a team'), addTeam, bulkForm);
  }

  function flightSelect(current, flights, label) {
    return h('select', { 'aria-label': label },
      h('option', { value: '' }, 'No flight'),
      flights.map(f => h('option', { value: f.id, selected: f.id === current }, f.name)));
  }

  function teamRow(t, league, flights) {
    const individual = league.kind === 'individual';
    const name = h('input', { type: 'text', value: t.name, placeholder: individual ? '' : 'No team name', 'aria-label': individual ? 'Player name' : 'Team name' });
    name.addEventListener('change', async () => {
      const v = name.value.trim();
      if (!v && (individual || !t.captain)) { name.value = t.name; toast(individual ? 'A player needs a name.' : 'A team needs a name or a captain.', 'error'); return; }
      if ((await run(S.sb.from('teams').update({ name: v }).eq('id', t.id), name)).ok) t.name = v;
    });
    const capt = individual ? null : h('input', { type: 'text', value: t.captain, 'aria-label': `${L.teamLabel(t)} captain` });
    capt?.addEventListener('change', async () => {
      const v = capt.value.trim();
      if (!v && !t.name) { capt.value = t.captain; toast('A team needs a name or a captain.', 'error'); return; }
      if ((await run(S.sb.from('teams').update({ captain: v }).eq('id', t.id), capt)).ok) t.captain = v;
    });
    const flight = flights.length ? flightSelect(t.flight_id, flights, `${L.teamLabel(t)} flight`) : null;
    flight?.addEventListener('change', async () => {
      const v = flight.value || null;
      if ((await run(S.sb.from('teams').update({ flight_id: v }).eq('id', t.id), flight)).ok) {
        t.flight_id = v;
        toast(`${L.teamLabel(t)} moved to ${v ? byId(flights, v).name : 'no flight'}`);
      }
    });
    const lg = h('select', { 'aria-label': `${L.teamLabel(t)} league` }, S.leagues.map(l => h('option', { value: l.id, selected: l.id === t.league_id }, l.name)));
    lg.addEventListener('change', async () => {
      const target = byId(S.leagues, lg.value);
      if (!confirm(`Move ${L.teamLabel(t)} to ${target.name}? Its scores move with it, and it will be taken out of its flight.`)) { lg.value = t.league_id; return; }
      if ((await run(S.sb.from('teams').update({ league_id: lg.value, flight_id: null }).eq('id', t.id), lg)).ok) { toast(`${L.teamLabel(t)} moved to ${target.name}`); await loadSeason(); }
    });
    const del = h('button', {
      class: 'adm-icon', title: 'Delete', 'aria-label': `Delete ${L.teamLabel(t)}`, onClick: async () => {
        const n = S.scores.filter(s => s.team_id === t.id).length;
        if (!confirm(`Delete ${L.teamLabel(t)}${n ? ` and its ${n} scores` : ''}? This can’t be undone.`)) return;
        if ((await run(S.sb.from('teams').delete().eq('id', t.id))).ok) { toast(`Deleted ${L.teamLabel(t)}`); await loadSeason(); }
      }
    }, '✕');
    return h('tr', null, h('td', null, name), individual ? null : h('td', null, capt), flight ? h('td', null, flight) : null, h('td', null, lg), h('td', { class: 'adm-cell-icon' }, del));
  }

  /* ---------- Scores ---------- */

  function viewScores() {
    if (!S.leagues.length) return [intro('Scores'), h('p', { class: 'adm-empty' }, 'Add a league and its teams first.')];
    const league = byId(S.leagues, S.scoreLeagueId) || S.leagues[0];
    const individual = league.kind === 'individual';
    const flights = leagueFlights(league.id);
    if (S.scoreFlight !== 'all' && !byId(flights, S.scoreFlight)) S.scoreFlight = 'all';
    let teams = sortTeams(leagueTeams(league.id), flights);
    if (S.scoreFlight !== 'all') teams = teams.filter(t => (t.flight_id || 'none') === S.scoreFlight);

    const pills = h('div', { class: 'adm-pills', role: 'group', 'aria-label': 'League' },
      S.leagues.map(l => h('button', { 'aria-pressed': String(l.id === league.id), onClick: () => { S.scoreLeagueId = l.id; renderShell(); } }, l.name)));
    const flightFilter = flights.length ? h('label', { class: 'adm-filter' }, 'Show ',
      h('select', { onChange: e => { S.scoreFlight = e.target.value; renderShell(); } },
        h('option', { value: 'all' }, 'All flights'),
        flights.map(f => h('option', { value: f.id, selected: f.id === S.scoreFlight }, f.name)),
        h('option', { value: 'none', selected: S.scoreFlight === 'none' }, 'Not in a flight'))) : null;
    const jump = h('label', { class: 'adm-filter' }, 'Go to ',
      h('select', { onChange: e => focusWeek(e.target.value) }, h('option', { value: '' }, 'week…'), S.weeks.map(w => h('option', { value: w.id }, weekLabel(w)))));
    const exportBtn = h('button', { class: 'adm-btn ghost small', onClick: () => exportCsv(league) }, 'Download CSV');

    if (!teams.length) {
      return [intro('Scores'), h('div', { class: 'adm-toolbar' }, pills, flightFilter), h('p', { class: 'adm-empty' }, `No ${individual ? 'players' : 'teams'} here yet. Add them under Leagues & teams.`)];
    }

    const head = h('tr', null,
      h('th', { class: 'adm-sticky', scope: 'col' }, individual ? 'Player' : 'Team'),
      S.weeks.map(w => h('th', { scope: 'col', 'data-week': w.id, class: 'adm-week-head' },
        h('span', { class: 'adm-wk' }, 'Wk ' + w.week_number),
        h('span', { class: 'adm-course', title: w.course }, w.course || 'No course'),
        w.par ? h('span', { class: 'adm-par' }, 'Par ' + w.par)
          : h('button', { class: 'adm-par missing', title: 'Rankings use score to par, so this week needs a par', onClick: () => { S.tab = 'schedule'; sessionSet('adm-tab', 'schedule'); renderShell(); } }, 'Add par'),
        publishToggle(w, true))),
      h('th', { scope: 'col', class: 'adm-total-head' }, 'Total'));

    let currentFlight;
    const rows = [];
    teams.forEach((t, r) => {
      if (flights.length && S.scoreFlight === 'all' && t.flight_id !== currentFlight) {
        currentFlight = t.flight_id;
        rows.push(h('tr', { class: 'adm-group' }, h('th', { colspan: S.weeks.length + 2, class: 'adm-sticky' }, byId(flights, t.flight_id)?.name || 'Not in a flight')));
      }
      const total = h('td', { class: 'adm-total' });
      const cells = S.weeks.map((w, c) => {
        const s = scoreOf(t.id, w.id);
        const input = h('input', {
          class: 'adm-score', type: 'text', inputmode: 'numeric', maxlength: 3, value: s ? s.strokes : '',
          'aria-label': `${L.teamLabel(t)}, week ${w.week_number}`, 'data-r': r, 'data-c': c
        });
        input.addEventListener('keydown', gridKeys);
        input.addEventListener('focus', () => input.select());
        input.addEventListener('change', () => saveScore(t, w, input, total));
        flagScore(t, w, input);
        return h('td', { 'data-week': w.id }, input);
      });
      updateTotal(t, total);
      rows.push(h('tr', null, h('th', { scope: 'row', class: 'adm-sticky' }, h('strong', null, L.teamLabel(t)), !individual && t.name && t.captain ? h('small', null, t.captain) : null), cells, total));
    });

    const wrap = h('div', { class: 'adm-table-wrap adm-grid-wrap' }, h('table', { class: 'adm-table adm-grid' }, h('thead', null, head), h('tbody', null, rows)));
    // Start scrolled to the week that needs scores next.
    requestAnimationFrame(() => {
      const next = S.weeks.find(w => !w.published) || S.weeks[S.weeks.length - 1];
      if (next) focusWeek(next.id, false);
    });

    return [
      intro('Scores', 'Type each gross score and press Enter to move down to the next team. Scores save on their own. Leave a box empty if a team missed the week; the leaderboard applies the missed-week rule from Season settings. Turn a week to “Live” when its scores are ready to show on the website.'),
      h('div', { class: 'adm-toolbar' }, pills, h('div', { class: 'adm-toolbar-right' }, flightFilter, jump, exportBtn)),
      wrap
    ];
  }

  function focusWeek(weekId, focusInput = true) {
    if (!weekId) return;
    const wrap = document.querySelector('.adm-grid-wrap');
    const th = wrap?.querySelector(`th[data-week="${CSS.escape(weekId)}"]`);
    if (!th) return;
    const sticky = wrap.querySelector('thead .adm-sticky');
    wrap.scrollLeft = th.offsetLeft - (sticky ? sticky.offsetWidth : 0) - 8;
    document.querySelectorAll('.adm-grid [data-week]').forEach(el => el.classList.toggle('adm-col-on', el.dataset.week === weekId));
    if (focusInput) wrap.querySelector(`td[data-week="${CSS.escape(weekId)}"] input`)?.focus();
  }

  function gridKeys(e) {
    const r = +e.target.dataset.r, c = +e.target.dataset.c;
    let dr = 0, dc = 0;
    if (e.key === 'Enter' || e.key === 'ArrowDown') dr = e.shiftKey && e.key === 'Enter' ? -1 : 1;
    else if (e.key === 'ArrowUp') dr = -1;
    else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) dc = 1;
    else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) dc = -1;
    else return;
    const next = document.querySelector(`.adm-score[data-r="${r + dr}"][data-c="${c + dc}"]`);
    if (next) { e.preventDefault(); next.focus(); } // leaving the box saves it
    else if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  }

  async function saveScore(team, week, input, totalCell) {
    const raw = input.value.trim();
    const existing = scoreOf(team.id, week.id);
    if (raw === '') {
      if (!existing) return;
      const res = await run(S.sb.from('scores').delete().eq('team_id', team.id).eq('week_id', week.id), input);
      if (res.ok) S.scores = S.scores.filter(s => !(s.team_id === team.id && s.week_id === week.id));
    } else {
      const v = Number(raw);
      if (!Number.isInteger(v) || v < 1 || v > 400) {
        input.classList.add('adm-err');
        toast('Scores must be whole numbers, like 68.', 'error');
        return;
      }
      if (existing && existing.strokes === v) return;
      const res = await run(S.sb.from('scores').upsert({ team_id: team.id, week_id: week.id, strokes: v }, { onConflict: 'team_id,week_id' }), input);
      if (res.ok) {
        const row = scoreOf(team.id, week.id);
        if (row) row.strokes = v;
        else S.scores.push({ team_id: team.id, week_id: week.id, strokes: v });
      }
    }
    flagScore(team, week, input);
    updateTotal(team, totalCell);
  }

  // Warn about scores that look like typos (far from the team's other scores).
  function flagScore(team, week, input) {
    const s = scoreOf(team.id, week.id);
    const others = S.scores.filter(x => x.team_id === team.id && x.week_id !== week.id).map(x => x.strokes);
    let warn = '';
    if (s && others.length >= 2) {
      const avg = others.reduce((a, b) => a + b, 0) / others.length;
      if (Math.abs(s.strokes - avg) > 12) warn = `This is ${Math.round(Math.abs(s.strokes - avg))} shots away from ${L.teamLabel(team)}’s average (${Math.round(avg)}). Double-check it.`;
    }
    if (s && week.par && (s.strokes < week.par - 25 || s.strokes > week.par + 50)) warn = `This looks unusual for a par ${week.par} course. Double-check it.`;
    input.classList.toggle('adm-warn', !!warn);
    input.title = warn;
  }

  function updateTotal(team, cell) {
    const list = S.scores.filter(s => s.team_id === team.id).map(s => s.strokes);
    cell.textContent = list.length ? list.reduce((a, b) => a + b, 0) : '';
    cell.title = list.length ? `${list.length} rounds` : '';
  }

  function exportCsv(league) {
    const flights = leagueFlights(league.id);
    const teams = sortTeams(leagueTeams(league.id), flights);
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Team', 'Captain', 'Flight', ...S.weeks.map(w => `Week ${w.week_number} ${w.course}`), 'Total'];
    const lines = [head.map(q).join(',')];
    teams.forEach(t => {
      const sc = S.weeks.map(w => scoreOf(t.id, w.id)?.strokes ?? '');
      const total = sc.filter(v => v !== '').reduce((a, b) => a + b, 0);
      lines.push([t.name, t.captain, byId(flights, t.flight_id)?.name || '', ...sc, total || ''].map(q).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `${L.slug(season().name)}-${L.slug(league.name)}-scores.csv` });
    document.body.append(a);
    a.click();
    a.remove();
  }

  /* ---------- Closest to the pin ---------- */

  function viewCtp() {
    if (!S.weeks.length) return [intro('Closest to the pin'), h('p', { class: 'adm-empty' }, 'Set up the season’s weeks first.')];
    const week = byId(S.weeks, S.ctpWeekId) || S.weeks[0];
    const entries = S.ctp.filter(c => c.week_id === week.id).sort((a, b) => a.hole - b.hole);
    const names = [...new Set([...S.ctp.map(c => c.player), ...S.teams.map(t => t.captain), ...S.leagues.filter(l => l.kind === 'individual').flatMap(l => leagueTeams(l.id).map(t => t.name))].filter(Boolean))].sort();

    const weekSelect = h('select', { 'aria-label': 'Week', onChange: e => { S.ctpWeekId = e.target.value; renderShell(); } },
      S.weeks.map(w => h('option', { value: w.id, selected: w.id === week.id }, weekLabel(w) + (S.ctp.some(c => c.week_id === w.id) ? ' ✓' : ''))));

    const rows = entries.map(c => ctpRow(c));
    const addBtn = h('button', {
      class: 'adm-btn small', onClick: async () => {
        const used = entries.map(e => e.hole);
        const hole = [3, 6, 8, 12, 14, 16, 17, 2, 5, 7, 11, 13, 15].find(n => !used.includes(n)) || 1;
        const res = await run(S.sb.from('ctp_results').insert({ week_id: week.id, hole, player: '' }).select().single());
        if (res.ok) { S.ctp.push(res.data); renderShell(); document.querySelector('.adm-ctp tbody tr:last-child input')?.focus(); }
      }
    }, '+ Add a par 3');

    return [
      intro('Closest to the pin & hole in ones', 'One closest-to-the-pin winner per par 3, across every league. Add each par 3 hole for the week, then the closest player and how far they were from the pin. Hole in ones are further down.'),
      h('div', { class: 'adm-toolbar' }, h('label', { class: 'adm-filter' }, 'Week ', weekSelect), h('div', { class: 'adm-toolbar-right' }, publishToggle(week))),
      h('datalist', { id: 'adm-players' }, names.map(n => h('option', { value: n }))),
      entries.length ? h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table adm-ctp' },
        h('thead', null, h('tr', null, h('th', null, 'Hole'), h('th', null, 'Closest player'), h('th', null, 'Distance'), h('th', null, h('span', { class: 'sr-only' }, 'Delete')))),
        h('tbody', null, rows))) : h('p', { class: 'adm-muted' }, 'No par 3s added for this week yet.'),
      addBtn,
      aceSection(week)
    ];
  }

  /* ---------- Hole in ones ---------- */

  function aceSection(week) {
    const courses = [...new Set(S.weeks.map(w => w.course).filter(Boolean))];
    const rows = S.aces.map(a => aceRow(a));
    const player = h('input', { type: 'text', list: 'adm-players', placeholder: 'Player name', required: true, 'aria-label': 'Hole in one player' });
    const hole = h('input', { type: 'number', min: 1, max: 18, placeholder: 'Hole', required: true, class: 'adm-num', 'aria-label': 'Hole in one hole number' });
    const course = h('input', { type: 'text', list: 'adm-courses', value: week.course || '', placeholder: 'Course', 'aria-label': 'Hole in one course' });
    const date = h('input', { type: 'date', value: week.play_date || new Date().toLocaleDateString('en-CA'), 'aria-label': 'Hole in one date' });
    const form = h('form', {
      class: 'adm-inline-form adm-ace-form', onSubmit: async e => {
        e.preventDefault();
        const n = parseInt(hole.value, 10);
        if (!player.value.trim() || !(n >= 1 && n <= 18)) { toast('Enter the player and a hole from 1 to 18.', 'error'); return; }
        const row = { season_id: S.seasonId, player: player.value.trim(), hole: n, course: course.value.trim(), play_date: date.value || null };
        const res = await run(S.sb.from('hole_in_ones').insert(row).select().single());
        if (res.ok) { S.aces.unshift(res.data); toast(`Hole in one added for ${row.player} ⛳`); renderShell(); }
      }
    }, player, hole, course, date, h('button', { class: 'adm-btn small', type: 'submit' }, 'Add hole in one'));
    return h('div', { class: 'adm-aces' },
      h('h3', null, 'Hole in ones'),
      h('p', { class: 'adm-muted small' }, 'These show on the leaderboard’s Closest to the pin tab as soon as they’re added.'),
      h('datalist', { id: 'adm-courses' }, courses.map(c => h('option', { value: c }))),
      rows.length ? h('div', { class: 'adm-table-wrap' }, h('table', { class: 'adm-table adm-ace-table' },
        h('thead', null, h('tr', null, h('th', null, 'Player'), h('th', null, 'Hole'), h('th', null, 'Course'), h('th', null, 'Date'), h('th', null, h('span', { class: 'sr-only' }, 'Delete')))),
        h('tbody', null, rows))) : h('p', { class: 'adm-muted' }, 'No hole in ones yet this season.'),
      h('h3', null, 'Add a hole in one'),
      form);
  }

  function aceRow(a) {
    const save = (field, input, parse = v => v.trim()) => input.addEventListener('change', async () => {
      const v = parse(input.value);
      if (v === undefined) { input.value = a[field] ?? ''; return; }
      if ((await run(S.sb.from('hole_in_ones').update({ [field]: v }).eq('id', a.id), input)).ok) a[field] = v;
    });
    const player = h('input', { type: 'text', value: a.player, list: 'adm-players', 'aria-label': 'Player' });
    save('player', player, v => v.trim() || undefined);
    const hole = h('input', { type: 'number', min: 1, max: 18, value: a.hole, class: 'adm-num', 'aria-label': 'Hole' });
    save('hole', hole, v => { const n = parseInt(v, 10); return n >= 1 && n <= 18 ? n : undefined; });
    const course = h('input', { type: 'text', value: a.course, list: 'adm-courses', 'aria-label': 'Course' });
    save('course', course);
    const date = h('input', { type: 'date', value: a.play_date || '', 'aria-label': 'Date' });
    save('play_date', date, v => v || null);
    const del = h('button', {
      class: 'adm-icon', title: 'Delete', 'aria-label': `Delete ${a.player}’s hole in one`, onClick: async () => {
        if (!confirm(`Remove ${a.player}’s hole in one?`)) return;
        if ((await run(S.sb.from('hole_in_ones').delete().eq('id', a.id))).ok) { S.aces = S.aces.filter(x => x !== a); renderShell(); }
      }
    }, '✕');
    return h('tr', null, h('td', null, player), h('td', null, hole), h('td', null, course), h('td', null, date), h('td', { class: 'adm-cell-icon' }, del));
  }

  function ctpRow(c) {
    const hole = h('input', { type: 'number', min: 1, max: 18, value: c.hole, class: 'adm-num', 'aria-label': 'Hole number' });
    hole.addEventListener('change', async () => {
      const v = parseInt(hole.value, 10);
      if (!(v >= 1 && v <= 18)) { hole.value = c.hole; toast('Hole must be 1–18', 'error'); return; }
      if ((await run(S.sb.from('ctp_results').update({ hole: v }).eq('id', c.id), hole)).ok) c.hole = v;
    });
    const player = h('input', { type: 'text', value: c.player, list: 'adm-players', placeholder: 'Player name', 'aria-label': `Hole ${c.hole} closest player` });
    player.addEventListener('change', async () => {
      const v = player.value.trim();
      if ((await run(S.sb.from('ctp_results').update({ player: v }).eq('id', c.id), player)).ok) c.player = v;
    });
    const totalIn = c.distance_in == null ? null : Number(c.distance_in);
    const ft = h('input', { type: 'number', min: 0, max: 999, value: totalIn == null ? '' : Math.floor(totalIn / 12), class: 'adm-num', 'aria-label': `Hole ${c.hole} feet` });
    const inch = h('input', { type: 'number', min: 0, max: 11.9, step: 0.5, value: totalIn == null ? '' : Math.round((totalIn % 12) * 10) / 10, class: 'adm-num', 'aria-label': `Hole ${c.hole} inches` });
    const saveDist = async e => {
      if (ft.value === '' && inch.value === '') {
        if ((await run(S.sb.from('ctp_results').update({ distance_in: null }).eq('id', c.id), e.target)).ok) c.distance_in = null;
        return;
      }
      const f = Number(ft.value || 0), i = Number(inch.value || 0);
      if (f < 0 || i < 0 || i >= 12) { toast('Inches must be between 0 and 11', 'error'); return; }
      const v = Math.round((f * 12 + i) * 10) / 10;
      if ((await run(S.sb.from('ctp_results').update({ distance_in: v }).eq('id', c.id), e.target)).ok) c.distance_in = v;
    };
    ft.addEventListener('change', saveDist);
    inch.addEventListener('change', saveDist);
    const del = h('button', {
      class: 'adm-icon', title: 'Delete', 'aria-label': `Delete hole ${c.hole}`, onClick: async () => {
        if (!confirm(`Remove hole ${c.hole} from this week?`)) return;
        if ((await run(S.sb.from('ctp_results').delete().eq('id', c.id))).ok) { S.ctp = S.ctp.filter(x => x !== c); renderShell(); }
      }
    }, '✕');
    return h('tr', null, h('td', null, hole), h('td', null, player),
      h('td', null, h('span', { class: 'adm-dist' }, ft, h('span', null, 'ft'), inch, h('span', null, 'in'))),
      h('td', { class: 'adm-cell-icon' }, del));
  }

  /* ---------- Season settings ---------- */

  function viewSeason() {
    const s = season();
    const name = h('input', { type: 'text', value: s.name, 'aria-label': 'Season name' });
    name.addEventListener('change', async () => {
      const v = name.value.trim();
      if (!v) { name.value = s.name; return; }
      if ((await run(S.sb.from('seasons').update({ name: v }).eq('id', s.id), name)).ok) { s.name = v; renderShell(); }
    });
    const weeks = h('input', { type: 'number', min: 1, max: 30, value: s.week_count, class: 'adm-num', 'aria-label': 'Number of weeks' });
    weeks.addEventListener('change', () => changeWeekCount(s, weeks));
    const counting = h('input', { type: 'number', min: 1, max: 30, value: s.counting_rounds, class: 'adm-num', 'aria-label': 'Rounds that count for playoffs' });
    counting.addEventListener('change', async () => {
      const v = parseInt(counting.value, 10);
      if (!(v >= 1 && v <= 30)) { counting.value = s.counting_rounds; return; }
      if ((await run(S.sb.from('seasons').update({ counting_rounds: v }).eq('id', s.id), counting)).ok) s.counting_rounds = v;
    });

    const rule = h('select', { 'aria-label': 'Missed weeks' },
      h('option', { value: 'worst', selected: (s.missed_rule || 'worst') === 'worst' }, 'Count as the week’s highest score in the league (recommended)'),
      h('option', { value: 'blank', selected: s.missed_rule === 'blank' }, 'Leave blank (not counted)'));
    const penalty = h('input', { type: 'number', min: 0, max: 20, value: s.missed_penalty || 0, class: 'adm-num', 'aria-label': 'Extra strokes for a missed week' });
    const penaltyLabel = h('label', { hidden: s.missed_rule === 'blank' }, 'Extra strokes added to a missed week', penalty, h('small', null, 'Optional. 0 means the missed week counts exactly as the week’s highest score.'));
    rule.addEventListener('change', async () => {
      if ((await run(S.sb.from('seasons').update({ missed_rule: rule.value }).eq('id', s.id), rule)).ok) {
        s.missed_rule = rule.value;
        penaltyLabel.hidden = rule.value === 'blank';
      }
    });
    penalty.addEventListener('change', async () => {
      const v = parseInt(penalty.value, 10);
      if (!(v >= 0 && v <= 20)) { penalty.value = s.missed_penalty || 0; return; }
      if ((await run(S.sb.from('seasons').update({ missed_penalty: v }).eq('id', s.id), penalty)).ok) s.missed_penalty = v;
    });

    const current = s.is_current
      ? h('p', { class: 'adm-ok-text' }, '✓ This is the season the website shows.')
      : h('button', {
        class: 'adm-btn small', onClick: async () => {
          await run(S.sb.from('seasons').update({ is_current: false }).eq('is_current', true));
          if ((await run(S.sb.from('seasons').update({ is_current: true }).eq('id', s.id))).ok) { toast(`${s.name} is now on the website`); await loadSeasons(s.id); }
        }
      }, 'Show this season on the website');

    const del = h('button', {
      class: 'adm-btn danger small', onClick: async () => {
        const typed = prompt(`This deletes ${s.name} with all its leagues, teams, scores and closest-to-the-pin results. It can’t be undone.\n\nType the season name to confirm:`);
        if (typed?.trim() !== s.name) { if (typed != null) toast('Name didn’t match, nothing was deleted.', 'error'); return; }
        if ((await run(S.sb.from('seasons').delete().eq('id', s.id))).ok) { toast('Season deleted'); S.seasonId = null; await loadSeasons(); }
      }
    }, 'Delete this season');

    return [
      intro('Season settings'),
      h('div', { class: 'adm-fields stacked' },
        h('label', null, 'Season name', name),
        h('label', null, 'Number of weeks', weeks),
        h('label', null, 'Weeks that count for playoff standings', counting, h('small', null, 'Each team’s best weeks against par, e.g. best 10 of 16.')),
        h('label', null, 'Missed weeks', rule, h('small', null, 'With the recommended rule, a team that misses a week (after its first round) is given the highest score anyone in its league posted that week, so no one gains by skipping. Weeks before a team’s first round stay blank, for teams that join late.')),
        penaltyLabel),
      h('h3', null, 'On the website'), current,
      newSeasonForm(s),
      h('h3', null, 'Delete'), h('p', { class: 'adm-muted small' }, 'Past seasons stay viewable on the website unless you delete them.'), del
    ];
  }

  async function changeWeekCount(s, input) {
    const v = parseInt(input.value, 10);
    if (!(v >= 1 && v <= 30) || v === s.week_count) { input.value = s.week_count; return; }
    if (v < s.week_count) {
      const extra = S.weeks.filter(w => w.week_number > v);
      const used = extra.filter(w => S.scores.some(x => x.week_id === w.id) || S.ctp.some(x => x.week_id === w.id));
      const msg = used.length ? `Weeks ${used.map(w => w.week_number).join(', ')} already have results. Remove them anyway?` : `Remove weeks ${v + 1}–${s.week_count}?`;
      if (!confirm(msg)) { input.value = s.week_count; return; }
      if (!(await run(S.sb.from('weeks').delete().eq('season_id', s.id).gt('week_number', v))).ok) return;
    } else {
      const have = new Set(S.weeks.map(w => w.week_number));
      const rows = [];
      for (let n = 1; n <= v; n++) if (!have.has(n)) rows.push({ season_id: s.id, week_number: n });
      if (rows.length && !(await run(S.sb.from('weeks').insert(rows))).ok) return;
    }
    if ((await run(S.sb.from('seasons').update({ week_count: v }).eq('id', s.id), input)).ok) { s.week_count = v; await loadSeason(); }
  }

  function newSeasonForm(from) {
    const name = h('input', { type: 'text', placeholder: 'e.g. 2027–28 Winter League', required: true, 'aria-label': 'New season name' });
    const copy = h('input', { type: 'checkbox', checked: !!from });
    return h('div', null,
      h('h3', null, 'Start a new season'),
      h('form', {
        class: 'adm-inline-form', onSubmit: async e => {
          e.preventDefault();
          const id = await createSeason(name.value.trim(), from && copy.checked ? from : null);
          if (id) { toast('New season created'); await loadSeasons(id); }
        }
      }, name, from ? h('label', { class: 'adm-check' }, copy, ' Copy leagues and flights from this season') : null, h('button', { class: 'adm-btn small', type: 'submit' }, 'Create season')));
  }

  async function createSeason(name, copyFrom) {
    if (!name) return null;
    const first = !S.seasons.length;
    const weekCount = copyFrom?.week_count || 16;
    const res = await run(S.sb.from('seasons').insert({ name, is_current: first, week_count: weekCount, counting_rounds: copyFrom?.counting_rounds || 10, missed_rule: copyFrom?.missed_rule || 'worst', missed_penalty: copyFrom?.missed_penalty || 0 }).select().single());
    if (!res.ok) return null;
    const sid = res.data.id;
    await run(S.sb.from('weeks').insert(Array.from({ length: weekCount }, (_, i) => ({ season_id: sid, week_number: i + 1 }))));
    if (copyFrom) {
      for (const l of S.leagues) {
        const nl = await run(S.sb.from('leagues').insert({ season_id: sid, name: l.name, kind: l.kind, sort_order: l.sort_order }).select().single());
        const fl = leagueFlights(l.id);
        if (nl.ok && fl.length) await run(S.sb.from('flights').insert(fl.map(f => ({ league_id: nl.data.id, name: f.name, sort_order: f.sort_order }))));
      }
    }
    return sid;
  }

  function showFirstSeason() {
    app.replaceChildren(h('section', { class: 'adm-card adm-narrow' },
      h('h1', null, 'Welcome'),
      h('p', null, 'Start by creating the season. It comes with 16 weeks; you’ll add courses, leagues and teams next.'),
      newSeasonForm(null)));
  }

  start();
})();
