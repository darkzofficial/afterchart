// Afterchart schema migrations.
// Runs over Neon's DIRECT (unpooled) connection: DDL and session state don't belong on the
// PgBouncer pooler. Safe to run repeatedly. Runs automatically on server start, or manually:
//   npm run migrate
const { Client } = require('pg');

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trades (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('long','short')),
      quantity DOUBLE PRECISION NOT NULL,
      entry_price DOUBLE PRECISION NOT NULL,
      exit_price DOUBLE PRECISION,
      fees DOUBLE PRECISION NOT NULL DEFAULT 0,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, opened_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `;

async function runMigrations() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('Missing DATABASE_URL_UNPOOLED / DATABASE_URL.');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(SCHEMA);
  } finally {
    await client.end();
  }
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(() => console.log('Migrations applied.'))
    .catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
}
