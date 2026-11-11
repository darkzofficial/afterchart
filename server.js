// Afterchart — free trade journal
// Run: npm start  (Node 22+)
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const path = require('node:path');
const { Pool } = require('pg');
const { runMigrations } = require('./migrate');

const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 30;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Run `neon env pull` to write .env.local, or set it in your host.');
  process.exit(1);
}
// App traffic uses Neon's pooled connection string (DATABASE_URL, "-pooler" host).
// Schema changes use the direct one instead; see migrate.js.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
pool.on('error', (e) => console.error('Postgres pool error:', e.message)); // e.g. compute scaled to zero
const USER_COLS = 'u.id, u.username, u.display_name, u.email, u.bio, u.is_public, u.created_at';
const TRADE_SELECT = 'id, symbol, side, quantity, entry_price, exit_price, fees, opened_at, closed_at, notes';
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];


// ---------- helpers ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) {
      try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
    }
  });
  return out;
}

function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader('Set-Cookie',
    `ac_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${IS_PROD ? '; Secure' : ''}`);
}

async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [sha256(token), userId, expires]);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
}

function publicUser(u) {
  return {
    username: u.username, display_name: u.display_name, bio: u.bio,
    is_public: !!u.is_public, created_at: new Date(u.created_at).toISOString(),
  };
}
const privateUser = (u) => ({ ...publicUser(u), email: u.email });

function tradePnl(t) {
  if (t.exit_price === null || t.exit_price === undefined) return null;
  const dir = t.side === 'long' ? 1 : -1;
  return (t.exit_price - t.entry_price) * t.quantity * dir - (t.fees || 0);
}

function decorate(t) {
  const pnl = tradePnl(t);
  const cost = t.entry_price * t.quantity;
  const { user_id, ...rest } = t;
  return { ...rest, status: pnl === null ? 'open' : 'closed', pnl,
    return_pct: pnl === null || !cost ? null : (pnl / cost) * 100 };
}

function stats(trades) {
  const closed = trades.filter((t) => t.status === 'closed')
    .sort((a, b) => (a.closed_at || a.opened_at).localeCompare(b.closed_at || b.opened_at) || a.id - b.id);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const sum = (a) => a.reduce((s, t) => s + t.pnl, 0);
  const grossWin = sum(wins), grossLoss = Math.abs(sum(losses));
  let eq = 0, peak = 0, maxDD = 0;
  const equity = closed.map((t) => {
    eq += t.pnl; peak = Math.max(peak, eq); maxDD = Math.max(maxDD, peak - eq);
    return { date: t.closed_at || t.opened_at, value: +eq.toFixed(2), symbol: t.symbol };
  });
  return {
    total_trades: trades.length,
    open_trades: trades.length - closed.length,
    closed_trades: closed.length,
    net_pnl: sum(closed),
    win_rate: closed.length ? (wins.length / closed.length) * 100 : null,
    avg_win: wins.length ? grossWin / wins.length : null,
    avg_loss: losses.length ? -grossLoss / losses.length : null,
    profit_factor: grossLoss ? grossWin / grossLoss : null,
    best: closed.length ? Math.max(...closed.map((t) => t.pnl)) : null,
    worst: closed.length ? Math.min(...closed.map((t) => t.pnl)) : null,
    max_drawdown: maxDD,
    equity,
  };
}

async function userTrades(userId) {
  return (await q(`SELECT ${TRADE_SELECT} FROM trades WHERE user_id = $1 ORDER BY opened_at DESC, id DESC`, [userId])).map(decorate);
}

// validation
const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

function validateTrade(b) {
  const errs = [];
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const t = {
    symbol: String(b.symbol || '').trim().toUpperCase().slice(0, 20),
    side: b.side === 'short' ? 'short' : 'long',
    quantity: num(b.quantity),
    entry_price: num(b.entry_price),
    exit_price: num(b.exit_price),
    fees: num(b.fees) ?? 0,
    opened_at: String(b.opened_at || '').trim(),
    closed_at: b.closed_at ? String(b.closed_at).trim() : null,
    notes: String(b.notes || '').slice(0, 2000),
  };
  if (!t.symbol) errs.push('Symbol is required.');
  if (!(t.quantity > 0) || !Number.isFinite(t.quantity)) errs.push('Quantity must be greater than 0.');
  if (t.entry_price === null || !(t.entry_price >= 0) || !Number.isFinite(t.entry_price)) errs.push('Entry price is required.');
  if (t.exit_price !== null && (!(t.exit_price >= 0) || !Number.isFinite(t.exit_price))) errs.push('Exit price must be a positive number.');
  if (!Number.isFinite(t.fees) || t.fees < 0) errs.push('Fees must be 0 or more.');
  if (!DATE_RE.test(t.opened_at)) errs.push('Open date is required.');
  if (t.closed_at && !DATE_RE.test(t.closed_at)) errs.push('Close date is invalid.');
  if (t.exit_price !== null && !t.closed_at) t.closed_at = t.opened_at;
  if (t.exit_price === null) t.closed_at = null;
  return { t, errs };
}

// simple in-memory rate limiter for auth endpoints
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = req.ip + req.path;
    const now = Date.now();
    const h = (hits.get(key) || []).filter((x) => now - x < windowMs);
    h.push(now); hits.set(key, h);
    if (h.length > max) return res.status(429).json({ error: 'Too many attempts. Try again shortly.' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (now - h[h.length - 1] > 36e5) hits.delete(k); }, 6e5).unref();

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.get('/healthz', (req, res) => res.send('ok'));

// auth middleware (API only)
app.use('/api', async (req, res, next) => {
  const token = parseCookies(req.headers.cookie).ac_session;
  if (token) {
    req.user = await one(`SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = $1 AND s.expires_at > $2`, [sha256(token), Date.now()]);
  }
  next();
});
const requireAuth = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: 'Please log in.' });

// CSRF guard: mutating API requests must be JSON (cannot be sent cross-site by a plain form)
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json'))
    return res.status(415).json({ error: 'JSON required.' });
  next();
});

app.post('/api/signup', rateLimit(10, 15 * 60e3), async (req, res) => {
  const username = String(req.body.username || '').trim().replace(/^@/, '').toLowerCase();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const display_name = String(req.body.display_name || '').trim().slice(0, 50) || username;
  if (!USERNAME_RE.test(username))
    return res.status(400).json({ error: 'Username must be 3–20 letters, numbers or underscores.' });
  if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: 'Enter a valid email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 200) return res.status(400).json({ error: 'Password is too long.' });
  const clash = await one('SELECT username FROM users WHERE username = $1 OR email = $2', [username, email]);
  if (clash) return res.status(409).json({
    error: clash.username === username ? 'That @username is taken.' : 'That email is already registered.' });
  const hash = await bcrypt.hash(password, 11);
  let u;
  try {
    u = await one(`INSERT INTO users (username, display_name, email, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, username, display_name, email, bio, is_public, created_at`,
      [username, display_name, email, hash]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That @username or email is already registered.' });
    throw e;
  }
  await createSession(res, u.id);
  res.json({ user: privateUser(u) });
});

app.post('/api/login', rateLimit(15, 15 * 60e3), async (req, res) => {
  const id = String(req.body.identifier || '').trim().replace(/^@/, '').toLowerCase();
  const password = String(req.body.password || '').slice(0, 200);
  const u = await one('SELECT id, username, display_name, email, bio, is_public, created_at, password_hash FROM users WHERE username = $1 OR email = $1', [id]);
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  await createSession(res, u.id);
  res.json({ user: privateUser(u) });
});

app.post('/api/logout', async (req, res) => {
  const token = parseCookies(req.headers.cookie).ac_session;
  if (token) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: privateUser(req.user) }));

app.patch('/api/me', requireAuth, async (req, res) => {
  const display_name = String(req.body.display_name ?? req.user.display_name).trim().slice(0, 50) || req.user.username;
  const bio = String(req.body.bio ?? req.user.bio).slice(0, 280);
  const is_public = req.body.is_public === undefined ? req.user.is_public : !!req.body.is_public;
  const u = await one('UPDATE users SET display_name = $1, bio = $2, is_public = $3 WHERE id = $4 RETURNING id, username, display_name, email, bio, is_public, created_at',
    [display_name, bio, is_public, req.user.id]);
  res.json({ user: privateUser(u) });
});

app.get('/api/trades', requireAuth, async (req, res) => {
  const trades = await userTrades(req.user.id);
  res.json({ trades, stats: stats(trades) });
});

const TRADE_COLS = [ 'symbol', 'side', 'quantity', 'entry_price', 'exit_price', 'fees', 'opened_at', 'closed_at', 'notes' ];

app.post('/api/trades', requireAuth, async (req, res) => {
  const { t, errs } = validateTrade(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' ') });
  const row = await one(`INSERT INTO trades (user_id, ${TRADE_COLS.join(', ')})
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${TRADE_SELECT}`, [req.user.id, ...TRADE_COLS.map((c) => t[c])]);
  res.json({ trade: decorate(row) });
});

app.put('/api/trades/:id', requireAuth, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const { t, errs } = validateTrade(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' ') });
  const row = Number.isSafeInteger(id) && await one(`UPDATE trades SET symbol=$1, side=$2, quantity=$3, entry_price=$4, exit_price=$5,
    fees=$6, opened_at=$7, closed_at=$8, notes=$9 WHERE id = $10 AND user_id = $11 RETURNING ${TRADE_SELECT}`,
    [...TRADE_COLS.map((c) => t[c]), id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Trade not found.' });
  res.json({ trade: decorate(row) });
});

app.delete('/api/trades/:id', requireAuth, async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const row = Number.isSafeInteger(id) && await one('DELETE FROM trades WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.user.id]);
  if (!row) return res.status(404).json({ error: 'Trade not found.' });
  res.json({ ok: true });
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  const term = String(req.query.q || '').trim().replace(/^@/, '').slice(0, 30);
  if (!term) return res.json({ users: [] });
  const escaped = term.replace(/[%_\\]/g, (c) => '\\' + c);
  const rows = await q(`
    SELECT u.username, u.display_name, u.bio, u.is_public, u.created_at, (SELECT COUNT(*)::int FROM trades t WHERE t.user_id = u.id) AS trade_count
    FROM users u WHERE u.username ILIKE $1 OR u.display_name ILIKE $1
    ORDER BY (u.username = lower($2)) DESC, (u.username ILIKE $3) DESC, u.username LIMIT 10`,
    ['%' + escaped + '%', term, escaped + '%']);
  res.json({ users: rows.map((u) => ({ ...publicUser(u), trade_count: u.is_public ? u.trade_count : null })) });
});

app.get('/api/users/:username', requireAuth, async (req, res) => {
  const u = await one('SELECT id, username, display_name, bio, is_public, created_at FROM users WHERE username = $1', [String(req.params.username).replace(/^@/, '').toLowerCase()]);
  if (!u) return res.status(404).json({ error: 'No trader with that @username.' });
  const isSelf = u.id === req.user.id;
  if (!u.is_public && !isSelf) return res.json({ user: publicUser(u), private: true, is_self: false });
  const trades = await userTrades(u.id);
  res.json({ user: publicUser(u), is_self: isSelf, trades, stats: stats(trades) });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// errors (Express 5 forwards rejected async handlers here)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  console.error(err);
  res.status(500).json({ error: 'Server error. Please try again.' });
});

// purge expired sessions hourly
setInterval(() => q('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]).catch(console.error), 3600e3).unref();

runMigrations()
  .then(() => app.listen(PORT, () => console.log(`Afterchart running on http://localhost:${PORT}`)))
  .catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
