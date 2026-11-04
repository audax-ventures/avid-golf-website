/* Live league leaderboard (leaderboard.html). On league.html it only fills the weekly highlights.
   Reads from Supabase (settings in content.js). Add ?preview=demo to the URL to see sample data. */
(() => {
  const L = window.AVIDLeague;
  const root = document.getElementById('leaderboard');
  const highlights = document.getElementById('weekly-winners');
  if (!L || (!root && !highlights)) return;

  const { esc, slug, formatDistance, formatToPar, teamLabel } = L;
  const demo = new URLSearchParams(location.search).get('preview') === 'demo';
  const CTP_TAB = 'closest-to-the-pin';

  const state = {
    data: null,
    tab: null,          // league id, or CTP_TAB
    flight: 'all',      // 'all' or a flight id
    view: 'total',      // 'total' or 'playoff'
    expanded: new Set(),
    hit: null,          // team id highlighted by search
    live: false,
    seasonId: null,
    error: false
  };
  let client = null;
  let refreshTimer = null;
  let lastFetch = 0;

  /* ---------- Data ---------- */

  async function fetchData(sb, seasonId) {
    const { data: seasons, error } = await sb.from('seasons').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const season = seasons.find(s => s.id === seasonId) || seasons.find(s => s.is_current) || seasons[0];
    if (!season) return { seasons: [], season: null };
    const [weeks, leagues] = await Promise.all([
      sb.from('weeks').select('*').eq('season_id', season.id).order('week_number'),
      sb.from('leagues').select('*').eq('season_id', season.id).order('sort_order').order('created_at')
    ]);
    if (weeks.error) throw weeks.error;
    if (leagues.error) throw leagues.error;
    const leagueIds = leagues.data.map(l => l.id);
    const weekIds = weeks.data.map(w => w.id);
    const none = Promise.resolve([]);
    const [flights, teams, scores, ctp] = await Promise.all([
      leagueIds.length ? L.selectAll(() => sb.from('flights').select('*').in('league_id', leagueIds).order('sort_order').order('created_at')) : none,
      leagueIds.length ? L.selectAll(() => sb.from('teams').select('*').in('league_id', leagueIds).order('name')) : none,
      weekIds.length ? L.selectAll(() => sb.from('scores').select('*').in('week_id', weekIds).order('team_id')) : none,
      weekIds.length ? L.selectAll(() => sb.from('ctp_results').select('*').in('week_id', weekIds).order('hole')) : none
    ]);
    // Hole in ones are optional: if the table isn't set up yet, the rest still loads.
    const aces = await sb.from('hole_in_ones').select('*').eq('season_id', season.id)
      .order('play_date', { ascending: false }).order('created_at', { ascending: false })
      .then(r => r.error ? [] : r.data, () => []);
    return { seasons, season, weeks: weeks.data, leagues: leagues.data, flights, teams, scores, ctp, aces };
  }

  async function load() {
    try {
      state.data = demo ? sampleData() : await fetchData(client, state.seasonId);
      state.error = false;
    } catch (err) {
      console.error('Leaderboard:', err);
      state.error = true;
    }
    lastFetch = Date.now();
    render();
  }

  function scheduleRefresh(delay = 700) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(load, delay);
  }

  /* ---------- Standings maths ---------- */

  function buildModel(d) {
    const weeks = d.weeks || [];
    const weekById = new Map(weeks.map(w => [w.id, w]));
    // The database already hides unpublished weeks from the public; this is a second guard.
    const shown = new Set(weeks.filter(w => w.published).map(w => w.id));
    d = { ...d, scores: (d.scores || []).filter(s => shown.has(s.week_id)), ctp: (d.ctp || []).filter(c => shown.has(c.week_id)) };
    const scoreMap = new Map();
    let updated = 0;
    for (const s of d.scores || []) {
      if (!weekById.has(s.week_id)) continue;
      scoreMap.set(s.team_id + '|' + s.week_id, s.strokes);
      updated = Math.max(updated, Date.parse(s.updated_at) || 0);
    }
    for (const c of d.ctp || []) updated = Math.max(updated, Date.parse(c.updated_at) || 0);
    const scoredWeeks = new Set((d.scores || []).map(s => weekById.get(s.week_id)?.week_number).filter(Boolean));
    const latestWeek = scoredWeeks.size ? Math.max(...scoredWeeks) : 0;
    // Highest score posted each week in each league, used for missed weeks.
    const leagueOf = new Map((d.teams || []).map(t => [t.id, t.league_id]));
    const highs = new Map();
    for (const s of d.scores || []) {
      const key = leagueOf.get(s.team_id) + '|' + s.week_id;
      highs.set(key, Math.max(highs.get(key) ?? -Infinity, s.strokes));
    }
    return {
      weeks, weekById, scoreMap, latestWeek, updated, highs,
      counting: d.season?.counting_rounds || 10,
      weekCount: d.season?.week_count || weeks.length,
      missedRule: d.season?.missed_rule || 'worst',
      missedPenalty: d.season?.missed_penalty || 0
    };
  }

  // A team's rounds. With the "worst" rule, a week the team missed (after its first round)
  // counts as the highest score posted that week in its league, plus any penalty strokes.
  // The newest week is still being filled in, so a missing score there stays blank.
  function statsFor(team, m, uptoWeek) {
    const rounds = [];
    const firstWeek = Math.min(...m.weeks.filter(w => m.scoreMap.has(team.id + '|' + w.id)).map(w => w.week_number));
    for (const w of m.weeks) {
      if (w.week_number > uptoWeek || w.week_number > m.latestWeek) continue;
      const s = m.scoreMap.get(team.id + '|' + w.id);
      if (s != null) { rounds.push({ week: w, strokes: s }); continue; }
      const high = m.highs.get(team.league_id + '|' + w.id);
      const finished = w.week_number < Math.min(uptoWeek, m.latestWeek);
      if (m.missedRule === 'worst' && finished && high != null && w.week_number > firstWeek) {
        rounds.push({ week: w, strokes: high + m.missedPenalty, missed: true });
      }
    }
    // Ranking is by score to par, so a round only counts once its week has a par.
    const rated = rounds.filter(r => r.week.par);
    const sum = list => list.reduce((a, r) => a + r.strokes, 0);
    const toPar = list => list.length ? list.reduce((a, r) => a + r.strokes - r.week.par, 0) : null;
    const best = [...rated].sort((a, b) => (a.strokes - a.week.par) - (b.strokes - b.week.par) || a.week.week_number - b.week.week_number).slice(0, m.counting);
    return {
      rounds,
      played: rounds.filter(r => !r.missed).length,
      byWeek: new Map(rounds.map(r => [r.week.id, r])),
      total: rounds.length ? sum(rounds) : null,
      toPar: toPar(rated),
      best: best.length ? sum(best) : null,
      bestToPar: toPar(best),
      counted: new Set(best.map(r => r.week.id))
    };
  }

  // Lowest score first. Equal scores share a position (shown as T3).
  function rank(rows, key) {
    const sorted = [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null && y == null) return teamLabel(a.team).localeCompare(teamLabel(b.team));
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y || teamLabel(a.team).localeCompare(teamLabel(b.team));
    });
    const counts = new Map();
    sorted.forEach(r => r[key] != null && counts.set(r[key], (counts.get(r[key]) || 0) + 1));
    let pos = 0;
    let prev;
    sorted.forEach((r, i) => {
      if (r[key] == null) { r.pos = null; return; }
      if (r[key] !== prev) { pos = i + 1; prev = r[key]; }
      r.pos = pos;
      r.tied = counts.get(r[key]) > 1;
    });
    return sorted;
  }

  function standings(teams, m, view) {
    const key = view === 'playoff' ? 'bestToPar' : 'toPar';
    const rows = rank(teams.map(team => ({ team, ...statsFor(team, m, Infinity) })), key);
    if (m.latestWeek > 1) {
      const before = rank(teams.map(team => ({ team, ...statsFor(team, m, m.latestWeek - 1) })), key);
      const prevPos = new Map(before.map(r => [r.team.id, r.pos]));
      rows.forEach(r => {
        const p = prevPos.get(r.team.id);
        r.move = r.pos != null && p != null ? p - r.pos : null;
      });
    }
    return rows;
  }

  function lowRounds(teams, m) {
    const low = new Map();
    for (const w of m.weeks) {
      const vals = teams.map(t => m.scoreMap.get(t.id + '|' + w.id)).filter(v => v != null);
      if (vals.length > 1) low.set(w.id, Math.min(...vals));
    }
    return low;
  }

  /* ---------- Rendering ---------- */

  function leaguesOf(d) { return d.leagues || []; }
  function flightsOf(d, leagueId) { return (d.flights || []).filter(f => f.league_id === leagueId); }
  function teamsOf(d, leagueId) { return (d.teams || []).filter(t => t.league_id === leagueId); }
  function hasFlights(d, leagueId) {
    const ids = new Set(flightsOf(d, leagueId).map(f => f.id));
    return teamsOf(d, leagueId).some(t => ids.has(t.flight_id));
  }

  function emptyBoard(title, text) {
    return `<div class="league-scoreboard"><div class="scoreboard-top"><span>AVID / LEAGUE STANDINGS</span><span class="board-status">Awaiting season</span></div>
      <div class="scoreboard-empty"><span class="scoreboard-mark" aria-hidden="true">—</span><div><h3>${title}</h3><p>${text}</p></div></div>
      <div class="scoreboard-bottom"><span>THE FIELD IS STILL TAKING SHAPE.</span><a href="#join">Interested in playing?</a></div></div>`;
  }

  let rendering = false;
  function render() {
    if (rendering) return; // replacing the page can fire a blur/input event that asks to render again
    rendering = true;
    try { draw(); } finally { rendering = false; }
  }

  function draw() {
    const d = state.data;
    if (!root) { // league.html: only the weekly highlights
      if (d && d.season) renderHighlights(d, buildModel(d));
      return;
    }
    if (state.error && !d) {
      root.innerHTML = emptyBoard('Standings are taking<br>a short break.', 'We couldn’t load the leaderboard just now. Please refresh the page in a moment.');
      return;
    }
    if (!d || !d.season || !leaguesOf(d).length) {
      root.innerHTML = emptyBoard('A fresh season.<br>A clean scorecard.', 'No standings yet. The leaderboard will appear here when the new season’s scores are available.');
      return;
    }
    const m = buildModel(d);
    const leagues = leaguesOf(d);
    const hasCtp = (d.ctp || []).some(c => c.player);
    if (state.tab !== CTP_TAB && !leagues.some(l => l.id === state.tab)) state.tab = leagues[0].id;
    if (state.tab === CTP_TAB && !hasCtp && !d.weeks.length) state.tab = leagues[0].id;

    const tabs = leagues.map(l => tabButton(l.id, l.name)).join('') + tabButton(CTP_TAB, 'Closest to the pin');
    const view = state.tab === CTP_TAB ? { tools: '', body: renderCtp(d, m) } : renderLeague(d, m, leagues.find(l => l.id === state.tab));
    renderHero(d, m);

    root.innerHTML = `<div class="league-scoreboard lb">
      <div class="lb-head">
        <div class="lb-head-row">
          <div class="lb-tabs" role="tablist" aria-label="Leagues">${tabs}</div>
          ${view.tools}
        </div>
      </div>
      <div class="lb-panel" role="tabpanel" id="lb-panel" aria-labelledby="lb-tab-${esc(state.tab)}">
        ${view.body}
      </div>
      <div class="scoreboard-bottom lb-bottom">
        <span class="lb-legend">${state.tab === CTP_TAB ? 'ONE WINNER PER PAR 3, EVERY WEEK, ACROSS ALL LEAGUES.' :
          `<span><i class="lb-key-under">−2</i> Under par</span><span><i class="lb-key-low"></i> Low round of the week</span>${m.missedRule === 'worst' ? `<span><i class="lb-key-missed">78</i> Missed week (counts as the week’s high score${m.missedPenalty ? ' +' + m.missedPenalty : ''})</span>` : ''}${state.view === 'playoff' ? `<span><i class="lb-key-drop">74</i> Not counted</span>` : ''}`}</span>
        <span class="lb-bottom-actions">${seasonPicker(d)}<button type="button" class="lb-share">Share this view</button></span>
      </div>
    </div>`;
    bind();
    if (state.hit) {
      const row = root.querySelector(`.lb-row[data-team="${CSS.escape(state.hit)}"]`);
      if (row) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => { state.hit = null; row.classList.remove('lb-hit'); }, 2600);
      }
    }
    renderHighlights(d, m);
  }

  // The current week is the latest week whose start date (set in the admin) has arrived.
  function currentWeek(m) {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the visitor's time zone
    const dated = m.weeks.filter(w => w.play_date).sort((a, b) => a.week_number - b.week_number);
    if (dated.length) {
      const started = dated.filter(w => w.play_date <= today);
      if (started.length) return { week: started[started.length - 1], upcoming: false };
      return { week: dated[0], upcoming: true };
    }
    const played = m.weeks.find(w => w.week_number === m.latestWeek);
    return { week: played || m.weeks[0], upcoming: !played };
  }

  function shortDate(iso) {
    const [y, mo, d] = iso.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  // Page header: live status, current week, and each league's leader.
  function renderHero(d, m) {
    const season = document.getElementById('lb-hero-season');
    if (season) season.textContent = d.season.name;
    const live = document.getElementById('lb-hero-live');
    if (live) {
      live.innerHTML = `${demo ? '<span class="lb-sample">Sample data</span>' : ''}<span class="lb-live-chip${state.live || demo ? ' on' : ''}">${state.live || demo ? '<span class="lb-live" aria-hidden="true"></span>Live' : 'Standings'}</span><span class="lb-updated" data-updated="${m.updated || ''}">${updatedText(m.updated)}</span>`;
      live.hidden = false;
    }
    const box = document.getElementById('lb-hero-stats');
    if (box) {
      const cw = currentWeek(m);
      const stat = (label, value, sub, cls) => `<div class="${cls || ''}"><dt>${label}</dt><dd>${value}</dd>${sub ? `<span class="lb-hero-sub">${sub}</span>` : ''}</div>`;
      const aces = (d.aces || []).length;
      box.innerHTML = (cw.week ? stat(cw.upcoming && cw.week.play_date ? `Starts ${esc(shortDate(cw.week.play_date))}` : 'Current week', `Week ${cw.week.week_number}`, esc(cw.week.course || 'Course to be announced'), 'wide') : '')
        + stat('Teams &amp; players', (d.teams || []).length)
        + (aces ? stat(aces === 1 ? 'Hole in one' : 'Hole in ones', aces) : '');
      box.hidden = false;
    }
    const lead = document.getElementById('lb-hero-leaders');
    if (lead) {
      const cards = leaguesOf(d).map(l => {
        const top = standings(teamsOf(d, l.id), m, 'total').filter(r => r.pos === 1);
        if (!top.length) return '';
        const r = top[0];
        return `<a class="lb-leader" href="#standings/${esc(slug(l.name))}">
          <span class="lb-leader-league">${esc(l.name)} leader${top.length > 1 ? ' · tied' : ''}</span>
          <strong>${esc(teamLabel(r.team))}${top.length > 1 ? ` <small>+${top.length - 1}</small>` : ''}</strong>
          <span class="lb-leader-par${r.toPar < 0 ? ' under' : ''}">${formatToPar(r.toPar)}</span>
        </a>`;
      }).join('');
      lead.innerHTML = cards;
      lead.hidden = !cards;
    }
  }

  function tabButton(id, name) {
    const on = state.tab === id;
    return `<button type="button" role="tab" id="lb-tab-${esc(id)}" class="lb-tab" data-tab="${esc(id)}" aria-selected="${on}" aria-controls="lb-panel" tabindex="${on ? 0 : -1}">${esc(name)}</button>`;
  }

  function seasonPicker(d) {
    if ((d.seasons || []).length < 2) return '';
    return `<label class="lb-season">Season <select>${d.seasons.map(s => `<option value="${esc(s.id)}"${s.id === d.season.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>`;
  }

  function updatedText(ms) {
    if (!ms) return '';
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `Updated ${hrs} hr${hrs > 1 ? 's' : ''} ago`;
    return 'Updated ' + new Date(ms).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }

  function renderLeague(d, m, league) {
    const teams = teamsOf(d, league.id);
    const individual = league.kind === 'individual';
    const flights = flightsOf(d, league.id);
    const flighted = hasFlights(d, league.id);
    if (state.flight !== 'all' && !flights.some(f => f.id === state.flight)) state.flight = 'all';

    const searchList = (d.teams || []).map(t => {
      const lg = leaguesOf(d).find(l => l.id === t.league_id);
      return `<option value="${esc(teamLabel(t))}">${esc(lg ? lg.name : '')}</option>`;
    }).join('');

    const flightPick = flighted ? `<label class="lb-flight-pick"><span class="sr-only">Flight</span>
        <select>${[['all', 'All flights'], ...flights.filter(f => teams.some(t => t.flight_id === f.id)).map(f => [f.id, f.name])]
          .map(([id, name]) => `<option value="${esc(id)}"${state.flight === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>
      </label>` : '';

    const toolbar = `<div class="lb-toolbar">
      <div class="lb-tools">${flightPick}
        <div class="lb-view" role="group" aria-label="Standings view">
          <button type="button" data-view="total" aria-pressed="${state.view === 'total'}">Season total</button>
          <button type="button" data-view="playoff" aria-pressed="${state.view === 'playoff'}">Playoff race · best ${m.counting}</button>
        </div>
        <label class="lb-search"><span class="sr-only">Find a ${individual ? 'player' : 'team'}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
          <input type="search" list="lb-team-list" placeholder="Find my ${individual ? 'name' : 'team'}" autocomplete="off">
          <datalist id="lb-team-list">${searchList}</datalist>
        </label>
      </div>
    </div>`;

    if (!teams.length) {
      return { tools: toolbar, body: `<p class="lb-empty">${individual ? 'Players' : 'Teams'} for this league will appear here soon.</p>` };
    }

    const low = lowRounds(teams, m);
    let groups;
    if (flighted) {
      const visible = state.flight === 'all' ? flights : flights.filter(f => f.id === state.flight);
      groups = visible.map(f => ({ title: f.name, teams: teams.filter(t => t.flight_id === f.id) })).filter(g => g.teams.length);
      const unassigned = teams.filter(t => !flights.some(f => f.id === t.flight_id));
      if (state.flight === 'all' && unassigned.length) groups.push({ title: 'Not yet in a flight', teams: unassigned });
    } else {
      groups = [{ title: null, teams }];
    }

    const playoffNote = state.view === 'playoff'
      ? `<p class="lb-note">Playoff standings count each ${individual ? 'player' : 'team'}’s best ${m.counting} weeks, measured against par. Rounds that don’t count are crossed out.</p>` : '';

    return { tools: toolbar, body: playoffNote + groups.map(g => `<div class="lb-group">
        ${g.title ? `<h3 class="lb-group-title">${esc(g.title)}<span>${g.teams.length} ${individual ? 'player' : 'team'}${g.teams.length === 1 ? '' : 's'}</span></h3>` : ''}
        ${renderTable(g.teams, m, low, league, g.title)}
      </div>`).join('') };
  }

  function chip(id, name) {
    return `<button type="button" class="lb-chip" data-flight="${esc(id)}" aria-pressed="${state.flight === id}">${esc(name)}</button>`;
  }

  function renderTable(teams, m, low, league, groupTitle) {
    const individual = league.kind === 'individual';
    const playoff = state.view === 'playoff';
    const rows = standings(teams, m, state.view);
    const latest = m.weeks.find(w => w.week_number === m.latestWeek);
    const label = `${league.name}${groupTitle ? ' ' + groupTitle : ''} standings. Scroll sideways to see every week.`;

    const head = `<tr>
      <th scope="col" class="lb-pos">Pos</th>
      <th scope="col" class="lb-name">${individual ? 'Player' : 'Team'}</th>
      <th scope="col" class="lb-topar"><span class="lb-long">To par</span><span class="lb-short" aria-hidden="true">+/−</span></th>
      <th scope="col" class="lb-last">${latest ? 'Wk ' + latest.week_number : 'Last'}</th>
      ${m.weeks.map(w => `<th scope="col" class="lb-week${w.published && w.week_number <= m.latestWeek ? '' : ' lb-upcoming'}">
        <span class="lb-wk">Wk ${w.week_number}</span>
        <span class="lb-course" title="${esc(w.course)}">${esc(w.course || 'Course TBA')}</span>
        ${w.par ? `<span class="lb-wpar">Par ${w.par}</span>` : ''}
      </th>`).join('')}
    </tr>`;

    const body = rows.map(r => {
      const t = r.team;
      const open = state.expanded.has(t.id);
      const toPar = playoff ? r.bestToPar : r.toPar;
      const move = r.move ? `<span class="lb-move ${r.move > 0 ? 'up' : 'down'}" aria-label="${r.move > 0 ? 'Up' : 'Down'} ${Math.abs(r.move)} since last week">${r.move > 0 ? '▲' : '▼'}${Math.abs(r.move)}</span>` : '';
      const last = latest ? r.byWeek.get(latest.id) : null;
      const cells = m.weeks.map(w => scoreCell(r.byWeek.get(w.id), w, low, playoff, r.counted)).join('');
      const detail = m.weeks.filter(w => r.byWeek.has(w.id)).map(w => {
        const { strokes: s, missed } = r.byWeek.get(w.id);
        const dropped = playoff && !r.counted.has(w.id);
        return `<li class="${dropped ? 'lb-dropped' : ''}${missed ? ' lb-missed' : ''}"><span>Wk ${w.week_number}</span><span>${missed ? 'Missed week' : esc(w.course || 'Course TBA')}</span><strong class="${missed ? '' : parClass(s, w)}">${s}${w.par ? ` <small>(${formatToPar(s - w.par)})</small>` : ''}</strong></li>`;
      }).join('');
      return `<tr class="lb-row${state.hit === t.id ? ' lb-hit' : ''}${r.pos === 1 ? ' lb-lead' : ''}" data-team="${esc(t.id)}">
        <td class="lb-pos">${r.pos == null ? '—' : (r.tied ? 'T' : '') + r.pos}${move}</td>
        <th scope="row" class="lb-name"><button type="button" class="lb-expand" aria-expanded="${open}" aria-controls="lb-d-${esc(t.id)}">
          <span class="lb-team">${esc(teamLabel(t))}</span>${!individual && t.name && t.captain ? `<span class="lb-captain">${esc(t.captain)}</span>` : ''}
        </button></th>
        <td class="lb-topar ${toPar < 0 ? 'lb-under' : ''}">${formatToPar(toPar)}</td>
        <td class="lb-last ${last ? (last.missed ? 'lb-missed' : parClass(last.strokes, latest)) : ''}">${last ? last.strokes : ''}</td>
        ${cells}
      </tr>
      <tr class="lb-detail" id="lb-d-${esc(t.id)}"${open ? '' : ' hidden'}><td colspan="4">
        ${detail ? `<ul>${detail}</ul>` : '<p>No scores yet.</p>'}
      </td></tr>`;
    }).join('');

    return `<div class="lb-scroll"><div class="lb-table-wrap" role="region" aria-label="${esc(label)}" tabindex="0"><table class="lb-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
  }

  function parClass(strokes, week) {
    if (!week || !week.par) return '';
    if (strokes < week.par) return 'lb-under';
    if (strokes === week.par) return 'lb-even';
    return '';
  }

  function scoreCell(round, week, low, playoff, counted) {
    if (!round) return `<td class="lb-score"></td>`;
    const s = round.strokes;
    if (round.missed) {
      return `<td class="lb-score lb-missed${playoff && !counted.has(week.id) ? ' lb-dropped' : ''}" title="Missed week: counted as the week’s highest score">${s}</td>`;
    }
    const cls = ['lb-score', parClass(s, week)];
    const isLow = low.get(week.id) === s;
    if (isLow) cls.push('lb-low');
    if (playoff && !counted.has(week.id)) cls.push('lb-dropped');
    const title = isLow ? ' title="Low round of the week"' : '';
    return `<td class="${cls.join(' ')}"${title}>${s}</td>`;
  }

  function ctpWinners(d, m) {
    return (d.ctp || []).filter(c => c.player && m.weekById.get(c.week_id)?.published);
  }

  function seasonBest(list) {
    return list.filter(c => c.distance_in != null).sort((a, b) => a.distance_in - b.distance_in)[0];
  }

  function formatDate(iso) {
    if (!iso) return '';
    const [y, mo, day] = iso.split('-').map(Number);
    return new Date(y, mo - 1, day).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderAces(d) {
    const aces = d.aces || [];
    if (!aces.length) return '';
    return `<section class="ace-board" aria-label="Hole in ones">
      <header><span class="ace-label">Hole-in-one club</span><span class="ace-count">${aces.length} this season</span></header>
      <ul>${aces.map(a => `<li>
        <span class="ace-badge" aria-hidden="true">ACE</span>
        <span class="ace-who"><strong>${esc(a.player)}</strong><span>Hole ${a.hole}${a.course ? ' · ' + esc(a.course) : ''}</span></span>
        ${a.play_date ? `<time datetime="${esc(a.play_date)}">${esc(formatDate(a.play_date))}</time>` : ''}
      </li>`).join('')}</ul>
    </section>`;
  }

  function renderCtp(d, m) {
    const list = ctpWinners(d, m);
    const aces = renderAces(d);
    if (!list.length) return aces + `<p class="lb-empty">Closest to the pin winners will be posted here after each week’s play.</p>`;
    const best = seasonBest(list);
    const bestWeek = best && m.weekById.get(best.week_id);
    const byWeek = [...m.weeks].reverse().map(w => ({ w, rows: list.filter(c => c.week_id === w.id).sort((a, b) => a.hole - b.hole) })).filter(g => g.rows.length);
    return `${aces}${best ? `<div class="ctp-best">
        <span class="ctp-best-label">Closest of the season</span>
        <strong>${esc(best.player)}</strong>
        <span class="ctp-best-dist">${esc(formatDistance(best.distance_in))}</span>
        <span class="ctp-best-where">Week ${bestWeek.week_number} · Hole ${best.hole}${bestWeek.course ? ' · ' + esc(bestWeek.course) : ''}</span>
      </div>` : ''}
      <div class="ctp-grid">${byWeek.map(g => `<article class="ctp-card">
        <header><span class="lb-wk">Week ${g.w.week_number}</span><h3>${esc(g.w.course || 'Course TBA')}</h3></header>
        <ul>${g.rows.map(c => `<li${best && c.id === best.id ? ' class="ctp-record"' : ''}><span class="ctp-hole">Hole ${c.hole}</span><span class="ctp-player">${esc(c.player)}</span><span class="ctp-dist">${esc(formatDistance(c.distance_in))}</span></li>`).join('')}</ul>
      </article>`).join('')}</div>`;
  }

  // Fills the "Weekly highlights" section further down the page.
  function renderHighlights(d, m) {
    const box = document.getElementById('weekly-winners');
    if (!box) return;
    const list = ctpWinners(d, m);
    const ace = (d.aces || [])[0];
    if (!list.length && !ace) return;
    const aceLine = ace ? `<p class="ctp-highlight-ace"><span class="ace-badge" aria-hidden="true">ACE</span><span><strong>Hole in one!</strong> ${esc(ace.player)}, hole ${ace.hole}${ace.course ? ' at ' + esc(ace.course) : ''}${ace.play_date ? ' · ' + esc(formatDate(ace.play_date)) : ''}</span></p>` : '';
    if (!list.length) {
      box.className = 'ctp-highlight';
      box.innerHTML = `<span class="eyebrow">WINNERS CIRCLE</span>${aceLine}<a class="text-link" href="leaderboard.html${demo ? '?preview=demo' : ''}#standings/${CTP_TAB}">See the leaderboard</a>`;
      return;
    }
    const lastWeek = m.weeks.filter(w => list.some(c => c.week_id === w.id)).pop();
    const rows = list.filter(c => c.week_id === lastWeek.id).sort((a, b) => a.hole - b.hole);
    const best = seasonBest(list);
    box.className = 'ctp-highlight';
    box.innerHTML = `<span class="eyebrow">CLOSEST TO THE PIN · WEEK ${lastWeek.week_number}</span>
      <h3>${esc(lastWeek.course || 'This week’s winners')}</h3>
      <ul>${rows.map(c => `<li><span>Hole ${c.hole}</span><strong>${esc(c.player)}</strong><span>${esc(formatDistance(c.distance_in))}</span></li>`).join('')}</ul>
      ${best ? `<p class="ctp-highlight-best">Season best: <strong>${esc(best.player)}</strong>, ${esc(formatDistance(best.distance_in))}</p>` : ''}
      ${aceLine}
      <a class="text-link" href="leaderboard.html${demo ? '?preview=demo' : ''}#standings/${CTP_TAB}" data-ctp-link>See every week</a>`;
    if (root) {
      box.querySelector('[data-ctp-link]').addEventListener('click', e => {
        e.preventDefault();
        selectTab(CTP_TAB);
        document.getElementById('standings').scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  /* ---------- Interaction ---------- */

  function bind() {
    const tabs = [...root.querySelectorAll('.lb-tab')];
    tabs.forEach((btn, i) => {
      btn.addEventListener('click', () => selectTab(btn.dataset.tab));
      btn.addEventListener('keydown', e => {
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        selectTab(next.dataset.tab);
        root.querySelector(`.lb-tab[data-tab="${CSS.escape(next.dataset.tab)}"]`)?.focus();
      });
    });
    root.querySelector('.lb-flight-pick select')?.addEventListener('change', e => {
      state.flight = e.target.value;
      updateHash();
      render();
    });
    root.querySelectorAll('.lb-chip').forEach(btn => btn.addEventListener('click', () => {
      state.flight = btn.dataset.flight;
      updateHash();
      render();
    }));
    root.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      render();
    }));
    root.querySelectorAll('.lb-expand').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.lb-row').dataset.team;
      const open = !state.expanded.has(id);
      open ? state.expanded.add(id) : state.expanded.delete(id);
      btn.setAttribute('aria-expanded', open);
      document.getElementById('lb-d-' + id).hidden = !open;
    }));
    const search = root.querySelector('.lb-search input');
    if (search) {
      // Picking a name from the suggestions jumps straight to it.
      search.addEventListener('input', () => {
        const v = search.value.trim().toLowerCase();
        if (v && (state.data?.teams || []).some(t => teamLabel(t).toLowerCase() === v)) findTeam(search.value);
      });
      search.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findTeam(search.value); } });
    }
    root.querySelector('.lb-season select')?.addEventListener('change', e => {
      state.seasonId = e.target.value;
      state.tab = null;
      state.flight = 'all';
      load();
    });
    root.querySelector('.lb-share')?.addEventListener('click', share);
    root.querySelectorAll('.lb-table-wrap').forEach(wrap => {
      wrap.addEventListener('scroll', () => markScroll(wrap), { passive: true });
      markScroll(wrap);
    });
  }

  // Fades the right edge while more weeks are hidden off to the side.
  function markScroll(wrap) {
    const head = wrap.querySelector('thead');
    if (head) wrap.parentElement.style.setProperty('--head-h', head.offsetHeight + 'px'); // fade starts under the dark header
    wrap.parentElement.classList.toggle('lb-more', wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 4);
  }

  function selectTab(id) {
    state.tab = id;
    state.flight = 'all';
    updateHash();
    render();
  }

  function findTeam(query) {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const teams = state.data?.teams || [];
    const label = t => teamLabel(t).toLowerCase();
    const team = teams.find(t => label(t) === q) || teams.find(t => label(t).includes(q) || (t.captain || '').toLowerCase().includes(q));
    const search = root.querySelector('.lb-search input');
    if (!team) {
      search?.setCustomValidity('No match found');
      search?.reportValidity();
      setTimeout(() => search?.setCustomValidity(''), 1500);
      return;
    }
    state.tab = team.league_id;
    state.flight = hasFlights(state.data, team.league_id) && team.flight_id ? team.flight_id : 'all';
    state.hit = team.id;
    updateHash();
    render();
  }

  function currentPath() {
    const d = state.data;
    if (!d) return '';
    if (state.tab === CTP_TAB) return CTP_TAB;
    const league = leaguesOf(d).find(l => l.id === state.tab);
    if (!league) return '';
    const flight = state.flight !== 'all' && flightsOf(d, league.id).find(f => f.id === state.flight);
    return slug(league.name) + (flight ? '/' + slug(flight.name) : '');
  }

  function updateHash() {
    const path = currentPath();
    if (path) history.replaceState(null, '', '#standings/' + path);
  }

  function applyHash() {
    const m = location.hash.match(/^#standings\/([^/]+)(?:\/([^/]+))?/);
    if (!m || !state.data) return false;
    const [, leagueSlug, flightSlug] = m;
    if (leagueSlug === CTP_TAB) { state.tab = CTP_TAB; return true; }
    const league = leaguesOf(state.data).find(l => slug(l.name) === leagueSlug);
    if (!league) return false;
    state.tab = league.id;
    const flight = flightSlug && flightsOf(state.data, league.id).find(f => slug(f.name) === flightSlug);
    state.flight = flight ? flight.id : 'all';
    return true;
  }

  async function share() {
    updateHash();
    const url = location.href;
    const btn = root.querySelector('.lb-share');
    try {
      if (navigator.share && matchMedia('(pointer:coarse)').matches) {
        await navigator.share({ title: 'AVID Golf league standings', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Link copied';
    } catch {
      btn.textContent = 'Copy the address bar link';
    }
    setTimeout(() => { if (btn.isConnected) btn.textContent = 'Share this view'; }, 2200);
  }

  /* ---------- Start ---------- */

  async function start() {
    if (!demo) {
      try {
        client = await L.getClient();
      } catch (err) {
        console.error('Leaderboard:', err);
      }
      if (!client) { render(); return; } // Not set up yet: show the "fresh season" card instead of the loading skeleton.
    }
    await load();
    if (root && applyHash()) {
      render();
      requestAnimationFrame(() => document.getElementById('standings')?.scrollIntoView());
    }
    window.addEventListener('hashchange', () => { if (applyHash()) { render(); document.getElementById('standings')?.scrollIntoView({ behavior: 'smooth' }); } });
    window.addEventListener('resize', () => root.querySelectorAll('.lb-table-wrap').forEach(markScroll), { passive: true });
    setInterval(() => {
      document.querySelectorAll('.lb-updated').forEach(el => { el.textContent = updatedText(Number(el.dataset.updated)); });
    }, 30000);
    if (demo) return;

    client.channel('league-leaderboard')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => scheduleRefresh())
      .subscribe(status => {
        const live = status === 'SUBSCRIBED';
        if (live !== state.live) { state.live = live; render(); }
      });
    // Backup in case live updates are blocked: refresh every 2 minutes, and when the tab comes back.
    setInterval(() => { if (!state.live && !document.hidden) load(); }, 120000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastFetch > 60000) load();
    });
  }

  /* ---------- Sample data for ?preview=demo ---------- */

  function sampleData() {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const between = (a, b) => Math.round(a + rand() * (b - a));
    const id = (p, n) => `${p}-${n}`;
    const courses = ['Pebble Beach Golf Links', 'St Andrews Old Course', 'TPC Sawgrass', 'Bethpage Black', 'Whistling Straits', 'Banff Springs', 'Pinehurst No. 2', 'Royal Portrush', 'Cabot Cliffs', 'Kiawah Ocean Course', 'Oakmont', 'Carnoustie', 'Torrey Pines South', 'Muirfield Village', 'Shinnecock Hills', 'Harbour Town'];
    const season = { id: 's1', name: '2026–27 Winter League', is_current: true, week_count: 16, counting_rounds: 10, missed_rule: 'worst', missed_penalty: 0 };
    const playedWeeks = 7;
    const dayMs = 864e5;
    const weeks = courses.map((c, i) => ({ id: id('w', i + 1), season_id: 's1', week_number: i + 1, course: c, par: i % 5 === 3 ? 71 : 72, published: i < playedWeeks, play_date: new Date(Date.now() + (i - playedWeeks + 1) * 7 * dayMs - 2 * dayMs).toLocaleDateString('en-CA') }));
    const leagues = [
      { id: 'l1', name: '4-Ball', kind: 'team' },
      { id: 'l2', name: '2-Ball', kind: 'team' },
      { id: 'l3', name: 'Individual', kind: 'individual' }
    ];
    const flights = [{ id: 'f1', league_id: 'l1', name: 'Flight A' }, { id: 'f2', league_id: 'l1', name: 'Flight B' }];
    const teamNames = ['Grip It & Sip It', 'The Mulligans', 'Fore Play', 'Bogey Brothers', 'Sand Trappers', 'Shank Redemption', 'Par-Tee Animals', 'Birdie Juice', 'Tee Time Titans', 'Ball Busters'];
    const captains = ['Mike Thompson', 'Jen Kowalski', 'Ravi Patel', 'Dave Chen', 'Sarah Martin', 'Tom Wiebe', 'Kelly Friesen', 'Chris Dueck', 'Amanda Lee', 'Josh Reimer'];
    const pairs = ['Long & Straight', 'Two Putts', 'Chip Happens', 'Hook & Slice', 'Eagle Eyes', 'Back Nine Bandits', 'Duff Daddies', 'Green Machines'];
    const players = ['Alex Novak', 'Brett Klassen', 'Carla Santos', 'Derek Hiebert', 'Emma Wong', 'Frank Lavallee', 'Grace Penner', 'Hassan Ali', 'Ian McLeod'];
    const teams = [];
    teamNames.forEach((n, i) => teams.push({ id: id('t', i), league_id: 'l1', flight_id: i < 5 ? 'f1' : 'f2', name: n, captain: captains[i], skill: i < 5 ? 0 : 5 }));
    pairs.forEach((n, i) => teams.push({ id: id('p', i), league_id: 'l2', flight_id: null, name: n, captain: captains[(i + 3) % 10], skill: i }));
    players.forEach((n, i) => teams.push({ id: id('i', i), league_id: 'l3', flight_id: null, name: n, captain: '', skill: i * 2 }));
    const base = { l1: 64, l2: 68, l3: 76 };
    const scores = [];
    const now = Date.now();
    teams.forEach(t => {
      weeks.slice(0, playedWeeks).forEach((w, i) => {
        if (rand() < 0.08) return; // missed week
        scores.push({ team_id: t.id, week_id: w.id, strokes: base[t.league_id] + t.skill + between(-3, 4) + (w.par - 72), updated_at: new Date(now - (playedWeeks - i) * 6048e5 + (i === playedWeeks - 1 ? 5.9e8 : 0)).toISOString() });
      });
    });
    const ctpNames = [...captains, ...players];
    const ctp = [];
    weeks.slice(0, playedWeeks).forEach(w => [3, 7, 12, 16].forEach(h => ctp.push({ id: `${w.id}-${h}`, week_id: w.id, hole: h, player: ctpNames[between(0, ctpNames.length - 1)], distance_in: between(14, 160), updated_at: new Date(now - 3.6e6).toISOString() })));
    const aces = [{ id: 'a1', season_id: 's1', player: 'Kelly Friesen', hole: 7, course: 'Banff Springs', play_date: '2026-12-09' }];
    return { seasons: [season], season, weeks, leagues, flights, teams, scores, ctp, aces };
  }

  start();
})();
