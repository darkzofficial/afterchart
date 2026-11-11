# Afterchart

Free trade journal: log trades, track profit & loss, and look up other traders by their @.

## Run locally

Requires Node.js 20+ and a Postgres database (a free one from https://neon.tech works).

```bash
npm install
DATABASE_URL="postgres://..." npm start
```

Tables are created automatically on first start.

Open http://localhost:3000

## What's inside

- `server.js` — Express API + Postgres database.
- `public/` — the website (HTML, CSS, JS). No build step.

## Features

- Sign up / log in (bcrypt-hashed passwords, secure HTTP-only session cookies, rate-limited auth)
- Everything behind login — visitors only see the landing page
- Log trades: symbol, long/short, quantity, entry, exit, fees, dates, notes (leave exit blank for open trades)
- Auto-calculated P&L and % return, live preview while typing
- Dashboard: net P&L, win rate, profit factor, max drawdown, avg win/loss, best/worst, equity curve
- Trade log with filters (open / closed / wins / losses) and symbol search; CSV export
- Search bar (press `/`) to find traders by @username and view their public profile, stats and trades
- Settings: display name, bio, public/private profile toggle

## Deploying (free: Render + Neon)

1. Create a free Postgres database on https://neon.tech and copy its connection string.
2. On https://render.com choose **New → Blueprint**, pick this repo (it reads `render.yaml`).
3. Paste the Neon connection string as `DATABASE_URL` and deploy.
