// Afterchart live chat: topic rooms, messages in Postgres, real-time delivery over Server-Sent Events.
// Single-instance fan-out (in memory), which is right for one Render web service.

const ROOMS = [
  { id: 'general', name: 'general', desc: 'Anything trading' },
  { id: 'stocks', name: 'stocks', desc: 'Equities, options, earnings' },
  { id: 'forex', name: 'forex', desc: 'FX pairs and macro' },
  { id: 'crypto', name: 'crypto', desc: 'BTC, ETH and alts' },
  { id: 'futures', name: 'futures', desc: 'ES, NQ, CL, gold' },
  { id: 'wins-and-losses', name: 'wins-and-losses', desc: 'Share the good and the bad' },
];
const ROOM_IDS = new Set(ROOMS.map((r) => r.id));
const MAX_LEN = 500;
const PAGE = 50;
const MSG_COLS = `m.id, m.room, m.body, m.created_at, u.username, u.display_name`;

const DURATIONS = { '1h': 3600, '24h': 86400, '7d': 7 * 86400, perm: null };

function registerChat(app, { q, one, requireAuth, isModName }) {
  const clients = new Map(); // room -> Set<{ res, userId }>
  ROOMS.forEach((r) => clients.set(r.id, new Set()));

  const online = (room) => new Set([...clients.get(room)].map((c) => c.userId)).size;
  const send = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const broadcast = (room, event, data) => { for (const c of clients.get(room)) send(c.res, event, data); };
  const presence = () => {
    const counts = Object.fromEntries(ROOMS.map((r) => [r.id, online(r.id)]));
    for (const r of ROOMS) for (const c of clients.get(r.id)) send(c.res, 'presence', counts);
  };
  const toMsg = (m) => ({ id: m.id, room: m.room, body: m.body, created_at: new Date(m.created_at).toISOString(),
    username: m.username, display_name: m.display_name, is_mod: isModName(m.username) });
  const isMod = (req) => isModName(req.user.username);
  const requireMod = (req, res, next) => (isMod(req) ? next() : res.status(403).json({ error: 'Moderators only.' }));
  const activeMute = (userId) => one(`SELECT until, reason FROM chat_bans WHERE user_id = $1 AND (until IS NULL OR until > now())`, [userId]);
  const muteInfo = (b) => (b ? { muted: true, until: b.until ? new Date(b.until).toISOString() : null, reason: b.reason } : { muted: false });
  const toUser = (userId, event, data) => { for (const set of clients.values()) for (const c of set) if (c.userId === userId) send(c.res, event, data); };
  const roomOk = (req, res) => {
    if (ROOM_IDS.has(req.params.room)) return true;
    res.status(404).json({ error: 'No such room.' }); return false;
  };

  // per-user send limit: 6 messages / 10 s
  const recent = new Map();
  const tooFast = (userId) => {
    const now = Date.now(), h = (recent.get(userId) || []).filter((x) => now - x < 10e3);
    h.push(now); recent.set(userId, h);
    return h.length > 6;
  };

  app.get('/api/chat/rooms', requireAuth, async (req, res) =>
    res.json({ rooms: ROOMS.map((r) => ({ ...r, online: online(r.id) })),
      me: { is_mod: isMod(req), ...muteInfo(await activeMute(req.user.id)) } }));

  app.get('/api/chat/:room/messages', requireAuth, async (req, res) => {
    if (!roomOk(req, res)) return;
    const before = Number.parseInt(req.query.before, 10);
    const rows = await q(`SELECT ${MSG_COLS} FROM chat_messages m JOIN users u ON u.id = m.user_id
      WHERE m.room = $1 ${Number.isSafeInteger(before) ? 'AND m.id < $2' : ''}
      ORDER BY m.id DESC LIMIT ${PAGE}`, Number.isSafeInteger(before) ? [req.params.room, before] : [req.params.room]);
    res.json({ messages: rows.reverse().map(toMsg), has_more: rows.length === PAGE });
  });

  app.post('/api/chat/:room/messages', requireAuth, async (req, res) => {
    if (!roomOk(req, res)) return;
    const body = String(req.body.body || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!body) return res.status(400).json({ error: 'Message is empty.' });
    if (body.length > MAX_LEN) return res.status(400).json({ error: `Keep it under ${MAX_LEN} characters.` });
    const mute = await activeMute(req.user.id);
    if (mute) return res.status(403).json({ error: mute.until ? `You're muted in chat until ${new Date(mute.until).toUTCString()}.` : `You're muted in chat.`, mute: muteInfo(mute) });
    if (tooFast(req.user.id)) return res.status(429).json({ error: 'Slow down a little — too many messages.' });
    const row = await one(`WITH ins AS (INSERT INTO chat_messages (room, user_id, body) VALUES ($1, $2, $3) RETURNING *)
      SELECT ${MSG_COLS} FROM ins m JOIN users u ON u.id = m.user_id`, [req.params.room, req.user.id, body]);
    const msg = toMsg(row);
    broadcast(msg.room, 'message', msg);
    res.json({ message: msg });
  });

  app.delete('/api/chat/messages/:id', requireAuth, async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const row = Number.isSafeInteger(id) &&
      await one('DELETE FROM chat_messages WHERE id = $1 AND (user_id = $2 OR $3) RETURNING id, room', [id, req.user.id, isMod(req)]);
    if (!row) return res.status(404).json({ error: 'Message not found.' });
    broadcast(row.room, 'delete', { id: row.id });
    res.json({ ok: true });
  });

  // ---- moderation (moderators only) ----
  app.get('/api/chat/bans', requireAuth, requireMod, async (req, res) => {
    const rows = await q(`SELECT u.username, u.display_name, b.until, b.reason, b.created_at, m.username AS banned_by
      FROM chat_bans b JOIN users u ON u.id = b.user_id LEFT JOIN users m ON m.id = b.banned_by
      WHERE b.until IS NULL OR b.until > now() ORDER BY b.created_at DESC`);
    res.json({ bans: rows.map((r) => ({ ...r, until: r.until && new Date(r.until).toISOString(), created_at: new Date(r.created_at).toISOString() })) });
  });

  app.post('/api/chat/bans', requireAuth, requireMod, async (req, res) => {
    const username = String(req.body.username || '').replace(/^@/, '').toLowerCase();
    const duration = String(req.body.duration || '');
    const reason = String(req.body.reason || '').trim().slice(0, 200);
    if (!(duration in DURATIONS)) return res.status(400).json({ error: 'Pick a mute length.' });
    const target = await one('SELECT id, username FROM users WHERE username = $1', [username]);
    if (!target) return res.status(404).json({ error: 'No trader with that @username.' });
    if (target.id === req.user.id) return res.status(400).json({ error: "You can't mute yourself." });
    if (isModName(target.username)) return res.status(400).json({ error: "Moderators can't be muted." });
    const secs = DURATIONS[duration];
    const ban = await one(`INSERT INTO chat_bans (user_id, until, reason, banned_by) VALUES ($1, ${secs ? `now() + make_interval(secs => ${secs})` : 'NULL'}, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET until = EXCLUDED.until, reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, created_at = now()
      RETURNING until, reason`, [target.id, reason, req.user.id]);
    let removed = 0;
    if (req.body.purge) {
      const gone = await q(`DELETE FROM chat_messages WHERE user_id = $1 AND created_at > now() - interval '24 hours' RETURNING id, room`, [target.id]);
      gone.forEach((g) => broadcast(g.room, 'delete', { id: g.id }));
      removed = gone.length;
    }
    toUser(target.id, 'muted', muteInfo(ban));
    console.log(`[mod] @${req.user.username} muted @${target.username} (${duration}${removed ? `, removed ${removed} msgs` : ''})`);
    res.json({ ok: true, removed, mute: muteInfo(ban) });
  });

  app.delete('/api/chat/bans/:username', requireAuth, requireMod, async (req, res) => {
    const target = await one('SELECT id, username FROM users WHERE username = $1', [String(req.params.username).toLowerCase()]);
    if (!target) return res.status(404).json({ error: 'No trader with that @username.' });
    await q('DELETE FROM chat_bans WHERE user_id = $1', [target.id]);
    toUser(target.id, 'unmuted', { muted: false });
    console.log(`[mod] @${req.user.username} unmuted @${target.username}`);
    res.json({ ok: true });
  });

  // live stream for one room
  app.get('/api/chat/:room/stream', requireAuth, (req, res) => {
    if (!roomOk(req, res)) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const client = { res, userId: req.user.id };
    const set = clients.get(req.params.room);
    set.add(client);
    presence();
    const ping = setInterval(() => res.write(': ping\n\n'), 25e3); // keeps proxies from closing idle streams
    req.on('close', () => { clearInterval(ping); set.delete(client); presence(); });
  });

  // keep the table from growing forever: retain the latest 2,000 messages per room
  setInterval(() => {
    q(`DELETE FROM chat_messages m USING (
         SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY room ORDER BY id DESC) rn FROM chat_messages) x WHERE rn > 2000
       ) old WHERE m.id = old.id`).catch((e) => console.error('chat prune failed:', e.message));
  }, 6 * 3600e3).unref();
}

module.exports = { registerChat, ROOMS };
