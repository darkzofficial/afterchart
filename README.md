# Afterchart

Free trade journal: log trades, track profit & loss, and look up other traders by their @.

## Run locally

Requires Node.js 22.9+ and the [Neon CLI](https://neon.com/docs/cli/install.md).

```bash
npm install
neon env pull   # writes DATABASE_URL + DATABASE_URL_UNPOOLED to .env.local (git-ignored)
npm start
```

Open http://localhost:3000. Tables are created automatically on start (or run `npm run migrate`).

### Database connections (Neon)

- `DATABASE_URL` — **pooled** (`-pooler` host). Used for all app queries.
- `DATABASE_URL_UNPOOLED` — **direct**. Used only by `migrate.js` for schema changes.

### Moderators

Set `MODERATORS` to a comma-separated list of @usernames in your host's environment settings (e.g. `MODERATORS=yourname`). Only the server owner can change it.

## What's inside

- `server.js` — Express API (Postgres via `pg`).
- `chat.js` — live chat API + real-time stream.
- `migrate.js` — schema, applied over the direct connection.
- `neon.ts` / `.neon` — Neon project config and link (from `neon init`).
- `public/` — the website (HTML, CSS, JS). No build step.

## Features

- Sign up / log in (bcrypt-hashed passwords, secure HTTP-only session cookies, rate-limited auth)
- Everything behind login — visitors only see the landing page
- Log trades: symbol, long/short, quantity, entry, exit, fees, dates, notes (leave exit blank for open trades)
- Auto-calculated P&L and % return, live preview while typing
- P&L calendar: each day shows its realized P&L (green/red), trade count and weekly totals; click any day to see its trades or add new ones for that date
- Dashboard: net P&L, win rate, profit factor, max drawdown, avg win/loss, best/worst, equity curve
- Trade log with filters (open / closed / wins / losses) and symbol search; CSV export
- Live chat: topic rooms (#general, #stocks, #forex, #crypto, #futures, #wins-and-losses) with real-time messages over Server-Sent Events, online counts, @mention links, $TICKER highlighting, delete-your-own, rate limiting
- Chat moderation: moderators (set with the `MODERATORS` env var) get a MOD badge, can delete any message, mute members for 1h/24h/7d/permanently (optionally removing their last 24h of messages) and unmute them
- Search bar (press `/`) to find traders by @username and view their public profile, stats and trades
- Settings: display name, bio, public/private profile toggle

## Deploying (free: Render + Neon)

1. Create a free Postgres database on https://neon.tech and copy its connection string.
2. On https://render.com choose **New → Blueprint**, pick this repo (it reads `render.yaml`).
3. In the Neon console's **Connect** dialog, copy the **pooled** string into `DATABASE_URL` and the **direct** (non-pooled) string into `DATABASE_URL_UNPOOLED`, then deploy.
