/* Afterchart — client */
(() => {
  'use strict';

  // ---------- state & utils ----------
  const state = { user: null, trades: [], stats: null, filter: 'all', symbolQ: '' };
  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $('#app');

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const money = (n, sign = true) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '−$' : sign && n > 0 ? '+$' : '$') + s;
  };
  const num = (n, d = 2) => (n === null || n === undefined ? '—'
    : Number(n).toLocaleString('en-US', { maximumFractionDigits: d }));
  const pct = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`);
  const cls = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  const fmtDate = (d) => {
    if (!d) return '—';
    const dt = new Date(d.length === 10 ? d + 'T00:00:00' : d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const initial = (u) => esc((u.display_name || u.username || '?').trim()[0].toUpperCase());

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; throw e; }
    return data;
  }

  // ---------- icons ----------
  const logo = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#04110f" stroke="rgba(30,242,192,.35)"/><path d="M6 22 L12 16 L16 19 L25 9" fill="none" stroke="#1ef2c0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25" cy="9" r="2.6" fill="#1ef2c0"/></svg>`;
  const ic = {
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    log: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    chart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    users: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
    lock: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  };

  // ---------- router ----------
  function go(path, replace = false) {
    if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
    render();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (a && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); go(a.getAttribute('href')); }
  });
  window.addEventListener('popstate', render);

  async function render() {
    closeModal();
    const p = location.pathname.replace(/\/+$/, '') || '/';
    const authed = !!state.user;
    document.body.classList.toggle('in-app', authed);
    window.scrollTo(0, 0);

    if (p === '/login' || p === '/signup') {
      if (authed) return go('/dashboard', true);
      return p === '/login' ? renderLogin() : renderSignup();
    }
    if (p === '/') return authed ? go('/dashboard', true) : renderLanding();
    if (!authed) {
      sessionStorage.setItem('ac_next', p);
      return go('/login', true);
    }
    if (p === '/dashboard') return renderDashboard();
    if (p === '/settings') return renderSettings();
    const m = p.match(/^\/(?:u\/|@)([A-Za-z0-9_]+)$/);
    if (m) return renderProfile(m[1]);
    shell(`<div class="empty"><h3>Page not found</h3><p><a href="/dashboard" data-link>Back to dashboard</a></p></div>`);
  }

  // ---------- public nav / landing ----------
  const publicNav = () => `
    <nav class="nav"><div class="container nav-inner">
      <a class="brand" href="/" data-link>${logo}<span class="word">Afterchart</span></a>
      <div class="spacer"></div>
      <a class="btn btn-ghost" href="/login" data-link>Log in</a>
      <a class="btn btn-primary" href="/signup" data-link>Get started</a>
    </div></nav>`;

  function renderLanding() {
    const demoEq = [0, 120, 80, 260, 410, 350, 520, 480, 690, 640, 820, 960, 900, 1130, 1280, 1210, 1420, 1610];
    app.innerHTML = `
      ${publicNav()}
      <main class="container">
        <section class="hero">
          <div>
            <span class="pill"><span class="dot"></span>100% free — no card required</span>
            <h1>Every trade,<br/><span class="glowtext">accounted for.</span></h1>
            <p class="lead">Afterchart is the clean, no-noise trade journal. Log your entries and exits, see your real profit &amp; loss, and learn from traders you follow by their @.</p>
            <div class="hero-cta">
              <a class="btn btn-primary btn-lg" href="/signup" data-link>Create free account</a>
              <a class="btn btn-lg" href="/login" data-link>Log in</a>
            </div>
          </div>
          <div class="card preview" aria-label="Dashboard preview">
            <div class="preview-stats">
              <div class="mini"><div class="k">Net P&amp;L</div><div class="v pos">+$1,610.00</div></div>
              <div class="mini"><div class="k">Win rate</div><div class="v">64.7%</div></div>
              <div class="mini"><div class="k">Profit factor</div><div class="v">2.31</div></div>
            </div>
            <div class="chart-wrap" style="height:180px" id="demo-chart"></div>
            <div class="preview-rows">
              <div class="prow"><span><b>NVDA</b> <span class="tag long">Long</span></span><span class="pos">+$412.50</span></div>
              <div class="prow"><span><b>EURUSD</b> <span class="tag short">Short</span></span><span class="neg">−$86.20</span></div>
              <div class="prow"><span><b>BTC</b> <span class="tag long">Long</span></span><span class="pos">+$230.00</span></div>
            </div>
          </div>
        </section>

        <section class="features">
          <div class="card feature"><div class="ico">${ic.log}</div><h3>Log trades in seconds</h3>
            <p>Symbol, side, size, entry, exit, fees. Afterchart calculates P&amp;L and return for you — stocks, forex, crypto, futures.</p></div>
          <div class="card feature"><div class="ico">${ic.chart}</div><h3>Know your real edge</h3>
            <p>Equity curve, win rate, profit factor, average win vs. loss and max drawdown — the numbers that actually matter.</p></div>
          <div class="card feature"><div class="ico">${ic.users}</div><h3>Search traders by @</h3>
            <p>Look up any member's public profile to see their results and trade history. Keep yours private with one toggle.</p></div>
        </section>

        <section class="card cta-band">
          <div class="eyebrow">Free for now. Seriously.</div>
          <h2>Start your journal today.</h2>
          <p>Takes 20 seconds. No subscription, no card, no catch.</p>
          <a class="btn btn-primary btn-lg" href="/signup" data-link>Get started — it's free</a>
        </section>
      </main>
      <footer class="footer"><div class="container"><span>© ${new Date().getFullYear()} Afterchart</span><span>Not financial advice. Track responsibly.</span></div></footer>`;
    drawEquity($('#demo-chart'), demoEq.map((v, i) => ({ value: v, date: '', label: `Trade ${i}` })), { compact: true });
  }

  // ---------- auth ----------
  function renderLogin() {
    app.innerHTML = `${publicNav()}
      <main class="auth-wrap"><form class="card auth-card" id="f" novalidate>
        <h1>Welcome back</h1><p class="sub">Log in to your Afterchart journal.</p>
        <div class="stack">
          <div id="err"></div>
          <div class="field"><label for="identifier">Email or @username</label>
            <input class="input" id="identifier" name="identifier" autocomplete="username" required autofocus /></div>
          <div class="field"><label for="password">Password</label>
            <input class="input" id="password" name="password" type="password" autocomplete="current-password" required /></div>
          <button class="btn btn-primary btn-lg" type="submit">Log in</button>
        </div>
        <p class="auth-alt">New to Afterchart? <a href="/signup" data-link>Create a free account</a></p>
      </form></main>`;
    bindAuth('/login');
  }

  function renderSignup() {
    app.innerHTML = `${publicNav()}
      <main class="auth-wrap"><form class="card auth-card" id="f" novalidate>
        <h1>Create your account</h1><p class="sub">Free forever for early members. No card needed.</p>
        <div class="stack">
          <div id="err"></div>
          <div class="field"><label for="username">Username</label>
            <div class="input-prefix"><span>@</span><input class="input" id="username" name="username" autocomplete="username"
              maxlength="20" pattern="[A-Za-z0-9_]{3,20}" placeholder="yourhandle" required autofocus /></div>
            <span class="hint">3–20 characters: letters, numbers, underscores. This is how others find you.</span></div>
          <div class="field"><label for="display_name">Display name <span class="muted">(optional)</span></label>
            <input class="input" id="display_name" name="display_name" maxlength="50" autocomplete="name" /></div>
          <div class="field"><label for="email">Email</label>
            <input class="input" id="email" name="email" type="email" autocomplete="email" required /></div>
          <div class="field"><label for="password">Password</label>
            <input class="input" id="password" name="password" type="password" minlength="8" autocomplete="new-password" required />
            <span class="hint">At least 8 characters.</span></div>
          <button class="btn btn-primary btn-lg" type="submit">Create account</button>
        </div>
        <p class="auth-alt">Already have an account? <a href="/login" data-link>Log in</a></p>
      </form></main>`;
    bindAuth('/signup');
  }

  function bindAuth(endpoint) {
    const f = $('#f');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      $('#err').innerHTML = '';
      try {
        const body = Object.fromEntries(new FormData(f));
        const { user } = await api(endpoint, { method: 'POST', body });
        state.user = user;
        const next = sessionStorage.getItem('ac_next');
        sessionStorage.removeItem('ac_next');
        go(next && next !== '/' ? next : '/dashboard', true);
        if (endpoint === '/signup') toast(`Welcome to Afterchart, @${user.username}`);
      } catch (err) {
        $('#err').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
  }

  // ---------- app shell ----------
  function shell(content, active = '') {
    const u = state.user;
    app.innerHTML = `
      <nav class="nav"><div class="container nav-inner">
        <a class="brand" href="/dashboard" data-link>${logo}<span class="word">Afterchart</span></a>
        <div class="nav-links">
          <a class="nav-link ${active === 'dash' ? 'active' : ''}" href="/dashboard" data-link>Dashboard</a>
          <a class="nav-link ${active === 'me' ? 'active' : ''}" href="/u/${esc(u.username)}" data-link>My profile</a>
        </div>
        <div class="spacer"></div>
        <div class="search" id="search">
          ${ic.search}
          <input class="input" id="search-input" placeholder="Search traders by @" autocomplete="off" aria-label="Search traders" />
          <kbd>/</kbd>
          <div class="search-results" id="search-results" hidden></div>
        </div>
        <div class="menu" id="menu">
          <button class="menu-btn" id="menu-btn" aria-label="Account menu" aria-haspopup="true"><span class="avatar">${initial(u)}</span></button>
          <div class="menu-list" id="menu-list" hidden>
            <div class="who"><b>${esc(u.display_name)}</b><span>@${esc(u.username)}</span></div>
            <a href="/dashboard" data-link>Dashboard</a>
            <a href="/u/${esc(u.username)}" data-link>My public profile</a>
            <a href="/settings" data-link>Settings</a>
            <button id="logout">Log out</button>
          </div>
        </div>
      </div></nav>
      <main class="container page">${content}</main>`;
    bindSearch();
    const mb = $('#menu-btn'), ml = $('#menu-list');
    mb.onclick = (e) => { e.stopPropagation(); ml.hidden = !ml.hidden; };
    document.addEventListener('click', () => { if (ml) ml.hidden = true; }, { once: true });
    $('#logout').onclick = async () => {
      await api('/logout', { method: 'POST', body: {} }).catch(() => {});
      state.user = null; state.trades = []; state.stats = null;
      go('/', true);
    };
  }

  function bindSearch() {
    const input = $('#search-input'), box = $('#search-results');
    let timer, idx = -1, items = [];
    const close = () => { box.hidden = true; idx = -1; };
    const paint = () => box.querySelectorAll('.sr-item').forEach((el, i) => el.classList.toggle('hi', i === idx));
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim().replace(/^@/, '');
      if (!q) return close();
      timer = setTimeout(async () => {
        try {
          const { users } = await api('/users/search?q=' + encodeURIComponent(q));
          items = users; idx = users.length ? 0 : -1;
          box.innerHTML = users.length ? users.map((u) => `
            <a class="sr-item" href="/u/${esc(u.username)}" data-link>
              <span class="avatar">${initial(u)}</span>
              <span><b>${esc(u.display_name)}</b> <span class="mono muted">@${esc(u.username)}</span>
              <div class="meta">${u.is_public ? `${u.trade_count} trade${u.trade_count === 1 ? '' : 's'}` : 'Private profile'}</div></span>
            </a>`).join('') : `<div class="sr-empty">No traders match “@${esc(q)}”.</div>`;
          box.hidden = false; paint();
        } catch { close(); }
      }, 180);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.blur(); return close(); }
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; paint(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; paint(); }
      if (e.key === 'Enter' && idx > -1) { e.preventDefault(); const u = items[idx].username; close(); input.value = ''; go('/u/' + u); }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }
  document.addEventListener('keydown', (e) => {
    const si = $('#search-input');
    if (e.key === '/' && si && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); si.focus(); }
  });

  // ---------- stats + chart ----------
  function statsGrid(s) {
    const pf = s.profit_factor;
    return `<div class="stats">
      <div class="card stat hero-stat"><div class="k">Net P&amp;L</div><div class="v ${cls(s.net_pnl)}">${money(s.net_pnl)}</div>
        <div class="s">${s.closed_trades} closed · ${s.open_trades} open</div></div>
      <div class="card stat"><div class="k">Win rate</div><div class="v">${s.win_rate === null ? '—' : s.win_rate.toFixed(1) + '%'}</div>
        <div class="s">${s.closed_trades ? 'of closed trades' : 'no closed trades yet'}</div></div>
      <div class="card stat"><div class="k">Profit factor</div><div class="v ${pf === null ? '' : pf >= 1 ? 'pos' : 'neg'}">${pf === null ? (s.avg_win && !s.avg_loss ? '∞' : '—') : pf.toFixed(2)}</div>
        <div class="s">gross win ÷ gross loss</div></div>
      <div class="card stat"><div class="k">Max drawdown</div><div class="v ${s.max_drawdown ? 'neg' : ''}">${s.max_drawdown ? money(-s.max_drawdown) : '$0.00'}</div>
        <div class="s">peak-to-trough</div></div>
      <div class="card stat"><div class="k">Avg win</div><div class="v pos">${money(s.avg_win)}</div></div>
      <div class="card stat"><div class="k">Avg loss</div><div class="v neg">${money(s.avg_loss)}</div></div>
      <div class="card stat"><div class="k">Best trade</div><div class="v ${cls(s.best)}">${money(s.best)}</div></div>
      <div class="card stat"><div class="k">Worst trade</div><div class="v ${cls(s.worst)}">${money(s.worst)}</div></div>
    </div>`;
  }

  function chartCard(s) {
    return `<div class="card chart-card">
      <div class="card-head"><h2 class="card-title">Equity curve</h2>
        <span class="mono ${cls(s.net_pnl)}">${money(s.net_pnl)}</span></div>
      <div class="chart-wrap" id="equity"></div></div>`;
  }

  function drawEquity(el, points, opts = {}) {
    if (!el) return;
    const pts = opts.compact ? points : [{ value: 0, date: '', label: 'Start' }, ...points];
    if (pts.length < 2) {
      el.innerHTML = `<div class="chart-empty">Close a trade to start your equity curve.</div>`;
      return;
    }
    const draw = () => {
      const W = el.clientWidth - 16, H = el.clientHeight - 8;
      if (W <= 0) return;
      const padL = opts.compact ? 4 : 56, padR = 8, padT = 12, padB = opts.compact ? 6 : 24;
      const vals = pts.map((p) => p.value);
      let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
      if (min === max) { max += 1; min -= 1; }
      const span = max - min; min -= span * 0.08; max += span * 0.08;
      const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
      const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
      const area = `${line}L${x(pts.length - 1).toFixed(1)},${y(min)}L${x(0)},${y(min)}Z`;
      const last = vals[vals.length - 1];
      const color = last >= 0 ? '#1ef2c0' : '#ff5d7d';
      const ticks = [];
      if (!opts.compact) {
        const raw = (max - min) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw);
        for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);
      }
      const id = 'g' + Math.random().toString(36).slice(2, 7);
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".35"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient>
          <filter id="${id}f"><feGaussianBlur stdDeviation="4"/></filter></defs>
        ${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" stroke="rgba(110,255,220,.07)"/>
          <text x="${padL - 10}" y="${y(t) + 4}" fill="#5b7670" font-size="11" font-family="JetBrains Mono" text-anchor="end">${compactMoney(t)}</text>`).join('')}
        ${!opts.compact ? `<line x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(110,255,220,.25)" stroke-dasharray="3 4"/>` : ''}
        <path d="${area}" fill="url(#${id})"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="5" opacity=".35" filter="url(#${id}f)"/>
        <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(pts.length - 1)}" cy="${y(last)}" r="4" fill="${color}"/>
        <line id="${id}h" x1="0" x2="0" y1="${padT}" y2="${H - padB}" stroke="rgba(232,246,242,.25)" visibility="hidden"/>
        <circle id="${id}c" r="5" fill="${color}" stroke="#030807" stroke-width="2" visibility="hidden"/>
      </svg>`;
      if (opts.compact) return;
      const svg = el.querySelector('svg'), hl = el.querySelector(`#${id}h`), hc = el.querySelector(`#${id}c`);
      let tip = el.querySelector('.tip');
      if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; el.appendChild(tip); }
      svg.onmousemove = (e) => {
        const r = svg.getBoundingClientRect();
        const mx = ((e.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(pts.length - 1, Math.round(((mx - padL) / (W - padL - padR)) * (pts.length - 1))));
        const p = pts[i], px = x(i), py = y(p.value);
        hl.setAttribute('x1', px); hl.setAttribute('x2', px); hl.setAttribute('visibility', 'visible');
        hc.setAttribute('cx', px); hc.setAttribute('cy', py); hc.setAttribute('visibility', 'visible');
        tip.hidden = false;
        tip.style.left = (px / W) * r.width + 8 + 'px';
        tip.style.top = (py / H) * r.height + 8 + 'px';
        tip.innerHTML = `<div class="${cls(p.value)}">${money(p.value)}</div><div class="d">${p.symbol ? esc(p.symbol) + ' · ' : ''}${p.date ? fmtDate(p.date) : esc(p.label || '')}</div>`;
      };
      svg.onmouseleave = () => { hl.setAttribute('visibility', 'hidden'); hc.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    };
    draw();
    if (el._ro) el._ro.disconnect();
    el._ro = new ResizeObserver(() => draw());
    el._ro.observe(el);
  }
  const compactMoney = (v) => {
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}k`;
    return `${s}$${a.toFixed(0)}`;
  };

  // ---------- trades table ----------
  function tradeRows(trades, editable) {
    if (!trades.length) return '';
    return trades.map((t) => `
      <tr class="${editable ? 'click' : ''}" data-id="${t.id}">
        <td><span class="sym">${esc(t.symbol)}</span></td>
        <td><span class="tag ${t.side}">${t.side}</span></td>
        <td class="mono muted">${fmtDate(t.opened_at)}</td>
        <td class="mono r">${num(t.quantity, 6)}</td>
        <td class="mono r">${num(t.entry_price, 6)}</td>
        <td class="mono r">${t.exit_price === null ? '<span class="tag open">Open</span>' : num(t.exit_price, 6)}</td>
        <td class="mono r ${cls(t.pnl)}">${t.pnl === null ? '—' : money(t.pnl)}</td>
        <td class="mono r ${cls(t.return_pct)}">${pct(t.return_pct)}</td>
        <td class="note-cell" title="${esc(t.notes)}">${esc(t.notes) || '<span class="muted">—</span>'}</td>
      </tr>`).join('');
  }

  function tradesTable(trades, { editable, emptyHtml }) {
    return `<div class="table-wrap"><table class="trades">
      <thead><tr><th>Symbol</th><th>Side</th><th>Opened</th><th class="r">Qty</th><th class="r">Entry</th><th class="r">Exit</th>
        <th class="r">P&amp;L</th><th class="r">Return</th><th>Notes</th></tr></thead>
      <tbody id="tbody">${tradeRows(trades, editable)}</tbody></table>
      ${trades.length ? '' : emptyHtml}</div>`;
  }

  const filters = {
    all: () => true, open: (t) => t.status === 'open', closed: (t) => t.status === 'closed',
    wins: (t) => t.pnl > 0, losses: (t) => t.pnl < 0,
  };

  // ---------- dashboard ----------
  async function loadMine() {
    const { trades, stats } = await api('/trades');
    state.trades = trades; state.stats = stats;
  }

  async function renderDashboard() {
    shell(`<div class="loading"><span class="spinner"></span></div>`, 'dash');
    try { await loadMine(); } catch (e) { return handleErr(e); }
    const u = state.user, s = state.stats;
    shell(`
      <div class="page-head">
        <div><div class="eyebrow">Dashboard</div><h1>Welcome back, ${esc(u.display_name)}</h1></div>
        <div class="actions">
          <button class="btn" id="export" ${state.trades.length ? '' : 'disabled'}>${ic.down} Export CSV</button>
          <button class="btn btn-primary" id="new-trade">${ic.plus} New trade</button>
        </div>
      </div>
      ${statsGrid(s)}
      ${chartCard(s)}
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">Trade log</h2>
          <div class="toolbar">
            <input class="input" id="sym-filter" placeholder="Filter symbol…" value="${esc(state.symbolQ)}" />
            <div class="seg" id="filters">${Object.keys(filters).map((k) =>
              `<button data-f="${k}" class="${state.filter === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
          </div>
        </div>
        <div id="table-slot"></div>
      </div>`, 'dash');
    drawEquity($('#equity'), s.equity);
    paintTable();
    $('#new-trade').onclick = () => tradeModal();
    $('#export').onclick = exportCsv;
    $('#filters').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.filter = b.dataset.f;
      $('#filters').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      paintTable();
    };
    $('#sym-filter').oninput = (e) => { state.symbolQ = e.target.value; paintTable(); };
  }

  function paintTable() {
    const q = state.symbolQ.trim().toUpperCase();
    const list = state.trades.filter(filters[state.filter]).filter((t) => !q || t.symbol.includes(q));
    const none = !state.trades.length;
    $('#table-slot').innerHTML = tradesTable(list, {
      editable: true,
      emptyHtml: none
        ? `<div class="empty"><span class="ico">${ic.log}</span><h3>No trades yet</h3><p>Log your first trade to start tracking your P&amp;L.</p>
           <button class="btn btn-primary" id="empty-new">${ic.plus} Log a trade</button></div>`
        : `<div class="empty"><p>No trades match this filter.</p></div>`,
    });
    const en = $('#empty-new'); if (en) en.onclick = () => tradeModal();
    $('#tbody').onclick = (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      tradeModal(state.trades.find((t) => t.id === Number(tr.dataset.id)));
    };
  }

  function exportCsv() {
    const cols = ['symbol', 'side', 'quantity', 'entry_price', 'exit_price', 'fees', 'opened_at', 'closed_at', 'pnl', 'return_pct', 'notes'];
    const q = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.join(','), ...state.trades.map((t) => cols.map((c) =>
      q(typeof t[c] === 'number' && (c === 'pnl' || c === 'return_pct') ? t[c].toFixed(2) : t[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `afterchart-${state.user.username}-${today()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- trade modal ----------
  function closeModal() { const r = $('#modal-root'); if (r) r.innerHTML = ''; document.onkeydown = null; }

  function tradeModal(t) {
    const editing = !!t;
    t = t || { symbol: '', side: 'long', quantity: '', entry_price: '', exit_price: null, fees: 0, opened_at: today(), closed_at: null, notes: '' };
    let side = t.side;
    const v = (x) => (x === null || x === undefined ? '' : esc(x));
    $('#modal-root').innerHTML = `
      <div class="modal-bg" id="mbg"><form class="modal" id="tf" novalidate role="dialog" aria-modal="true" aria-labelledby="mt">
        <div class="modal-head"><h2 id="mt">${editing ? 'Edit trade' : 'New trade'}</h2>
          <button type="button" class="btn btn-ghost btn-sm" id="mclose" aria-label="Close">${ic.x}</button></div>
        <div class="modal-body">
          <div id="terr"></div>
          <div class="grid-2">
            <div class="field"><label for="symbol">Symbol</label>
              <input class="input mono" id="symbol" name="symbol" value="${v(t.symbol)}" placeholder="AAPL, EURUSD, BTC…" maxlength="20" required /></div>
            <div class="field"><label>Side</label>
              <div class="seg" id="side"><button type="button" data-s="long" class="long ${side === 'long' ? 'on' : ''}">Long</button>
              <button type="button" data-s="short" class="short ${side === 'short' ? 'on' : ''}">Short</button></div></div>
          </div>
          <div class="grid-3">
            <div class="field"><label for="quantity">Quantity</label><input class="input mono" id="quantity" name="quantity" type="number" step="any" min="0" value="${v(t.quantity)}" required /></div>
            <div class="field"><label for="entry_price">Entry price</label><input class="input mono" id="entry_price" name="entry_price" type="number" step="any" min="0" value="${v(t.entry_price)}" required /></div>
            <div class="field"><label for="exit_price">Exit price</label><input class="input mono" id="exit_price" name="exit_price" type="number" step="any" min="0" value="${v(t.exit_price)}" placeholder="Open" /></div>
          </div>
          <div class="grid-3">
            <div class="field"><label for="fees">Fees</label><input class="input mono" id="fees" name="fees" type="number" step="any" min="0" value="${v(t.fees)}" /></div>
            <div class="field"><label for="opened_at">Opened</label><input class="input" id="opened_at" name="opened_at" type="date" value="${v((t.opened_at || '').slice(0, 10))}" required /></div>
            <div class="field"><label for="closed_at">Closed</label><input class="input" id="closed_at" name="closed_at" type="date" value="${v((t.closed_at || '').slice(0, 10))}" /></div>
          </div>
          <div class="field"><label for="notes">Notes</label><textarea class="input" id="notes" name="notes" maxlength="2000" placeholder="Setup, reasoning, what you'd do differently…">${v(t.notes)}</textarea></div>
          <div class="pnl-preview"><span class="muted">Estimated P&amp;L</span><span class="v" id="pv">—</span></div>
          <span class="hint">Leave exit price empty to keep the trade open. Quantity = shares, units, contracts or coins.</span>
        </div>
        <div class="modal-foot">
          <div>${editing ? `<button type="button" class="btn btn-danger" id="del">Delete</button>` : ''}</div>
          <div style="display:flex;gap:8px"><button type="button" class="btn" id="mcancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${editing ? 'Save changes' : 'Add trade'}</button></div>
        </div>
      </form></div>`;
    const f = $('#tf');
    const preview = () => {
      const g = (n) => parseFloat(f.elements[n].value);
      const q = g('quantity'), en = g('entry_price'), ex = g('exit_price'), fee = g('fees') || 0;
      const pv = $('#pv');
      if ([q, en, ex].some(Number.isNaN)) { pv.textContent = f.elements.exit_price.value === '' ? 'Open' : '—'; pv.className = 'v'; return; }
      const p = (ex - en) * q * (side === 'long' ? 1 : -1) - fee;
      pv.textContent = money(p); pv.className = 'v ' + cls(p);
    };
    preview();
    f.addEventListener('input', preview);
    $('#side').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      side = b.dataset.s;
      $('#side').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      preview();
    };
    const close = () => closeModal();
    $('#mclose').onclick = close; $('#mcancel').onclick = close;
    $('#mbg').onmousedown = (e) => { if (e.target.id === 'mbg') close(); };
    document.onkeydown = (e) => { if (e.key === 'Escape') close(); };
    setTimeout(() => f.elements.symbol.focus(), 30);

    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = { ...Object.fromEntries(new FormData(f)), side };
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        await api(editing ? `/trades/${t.id}` : '/trades', { method: editing ? 'PUT' : 'POST', body });
        closeModal(); toast(editing ? 'Trade updated' : 'Trade added');
        renderDashboard();
      } catch (err) {
        $('#terr').innerHTML = `<div class="error-box">${esc(err.message)}</div>`; btn.disabled = false;
      }
    };
    const del = $('#del');
    if (del) del.onclick = async () => {
      if (!confirm(`Delete this ${t.symbol} trade? This can't be undone.`)) return;
      try { await api(`/trades/${t.id}`, { method: 'DELETE', body: {} }); closeModal(); toast('Trade deleted'); renderDashboard(); }
      catch (err) { $('#terr').innerHTML = `<div class="error-box">${esc(err.message)}</div>`; }
    };
  }

  // ---------- profile ----------
  async function renderProfile(username) {
    shell(`<div class="loading"><span class="spinner"></span></div>`);
    let data;
    try { data = await api('/users/' + encodeURIComponent(username)); }
    catch (e) {
      if (e.status === 404) return shell(`<div class="card empty"><span class="ico">${ic.users}</span><h3>@${esc(username)} not found</h3>
        <p>Try searching for another trader in the bar above.</p></div>`);
      return handleErr(e);
    }
    const u = data.user, isSelf = data.is_self;
    const joined = new Date(u.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const head = `<div class="card profile-head">
      <span class="avatar lg">${initial(u)}</span>
      <div style="flex:1;min-width:200px">
        <h1>${esc(u.display_name)}</h1><div class="handle">@${esc(u.username)}</div>
        ${u.bio ? `<p class="bio">${esc(u.bio)}</p>` : ''}
        <div class="joined">Joined ${joined}${isSelf ? ` · ${u.is_public ? 'Public profile' : 'Private — only you can see this'}` : ''}</div>
      </div>
      ${isSelf ? `<a class="btn" href="/settings" data-link>Edit profile</a>` : ''}
    </div>`;
    if (data.private) {
      return shell(`${head}<div class="card empty"><span class="ico">${ic.lock}</span><h3>This profile is private</h3>
        <p>@${esc(u.username)} has chosen to keep their trades private.</p></div>`);
    }
    shell(`${head}${statsGrid(data.stats)}${chartCard(data.stats)}
      <div class="card"><div class="card-head"><h2 class="card-title">Trades</h2><span class="muted" style="font-size:13px">${data.trades.length} total</span></div>
      ${tradesTable(data.trades, { editable: false, emptyHtml: `<div class="empty"><p>${isSelf ? "You haven't" : `@${esc(u.username)} hasn't`} logged any trades yet.</p></div>` })}</div>`,
      isSelf ? 'me' : '');
    drawEquity($('#equity'), data.stats.equity);
  }

  // ---------- settings ----------
  function renderSettings() {
    const u = state.user;
    shell(`<div class="page-head"><div><div class="eyebrow">Account</div><h1>Settings</h1></div></div>
      <form class="card card-pad settings stack" id="sf" novalidate>
        <div id="serr"></div>
        <div class="grid-2">
          <div class="field"><label>Username</label><input class="input mono" value="@${esc(u.username)}" disabled /></div>
          <div class="field"><label>Email</label><input class="input" value="${esc(u.email || '')}" disabled /></div>
        </div>
        <div class="field"><label for="display_name">Display name</label>
          <input class="input" id="display_name" name="display_name" maxlength="50" value="${esc(u.display_name)}" /></div>
        <div class="field"><label for="bio">Bio</label>
          <textarea class="input" id="bio" name="bio" maxlength="280" placeholder="What do you trade? What's your style?">${esc(u.bio)}</textarea>
          <span class="hint">Shown on your public profile. Max 280 characters.</span></div>
        <label class="switch"><input type="checkbox" name="is_public" ${u.is_public ? 'checked' : ''} />
          <div><b>Public profile</b><span>Let other members see your stats and trades when they search your @.</span></div></label>
        <div><button class="btn btn-primary" type="submit">Save changes</button></div>
      </form>`);
    $('#sf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        const { user } = await api('/me', { method: 'PATCH', body: {
          display_name: f.display_name.value, bio: f.bio.value, is_public: f.is_public.checked } });
        state.user = { ...state.user, ...user };
        toast('Settings saved'); renderSettings();
      } catch (err) { $('#serr').innerHTML = `<div class="error-box">${esc(err.message)}</div>`; }
    };
  }

  function handleErr(e) {
    if (e.status === 401) { state.user = null; return go('/login', true); }
    shell(`<div class="card empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p></div>`);
  }

  // ---------- boot ----------
  (async () => {
    try { state.user = (await api('/me')).user; } catch { state.user = null; }
    render();
  })();
})();
