Migration instructions — add `venue` to `hl_watched_wallets`

This repository contains the migration SQL file:

  db/migrations/2026-06-08-add-venue-to-hl_watched_wallets.sql

This migration adds a `venue` column and updates the unique constraint
so rows are unique per `(user_id, address, venue)`.

Important: run this in staging first and take a DB backup.

1) Using `psql` (recommended):

- Export a connection string with SSL enabled (example):

  set DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=require

- Run the migration file:

  psql "%DATABASE_URL%" -f db/migrations/2026-06-08-add-venue-to-hl_watched_wallets.sql

2) Using the project's `postgres` client (Node):

- Quick one-liner (requires `node` + `npm install` of deps and `DATABASE_URL` set):

  node -e "(async()=>{const fs=require('fs');const postgres=require('postgres');const sql=postgres(process.env.DATABASE_URL);const s=fs.readFileSync('db/migrations/2026-06-08-add-venue-to-hl_watched_wallets.sql','utf8');await sql.unsafe(s);console.log('migration applied');process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"

3) Safety checklist before applying:
- Backup DB snapshot / pg_dump.
- Run on staging first and exercise `/api/watch/wallets` POST and the snapshot cron.
- Confirm the new unique constraint exists and pre-existing rows keep `venue='hyperliquid'`.
- Check `hl_position_snapshots` primary key is (address, venue) and `hl_position_events` has `venue`.

4) Rollback (manual):
- There is no automatic rollback. If needed, restore from backup.

If you'd like, I can:
- Prepare a small `npm` script to run this migration.
- Create a staging checklist PR with the exact commands used and verification queries.

