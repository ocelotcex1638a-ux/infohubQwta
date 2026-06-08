-- Add venue column to hl_watched_wallets and switch unique constraint
BEGIN;

ALTER TABLE hl_watched_wallets
  ADD COLUMN IF NOT EXISTS venue TEXT NOT NULL DEFAULT 'hyperliquid';

-- Drop old unique constraint if present (name may vary across installs)
ALTER TABLE hl_watched_wallets
  DROP CONSTRAINT IF EXISTS hl_watched_wallets_user_id_address_key;

-- Add new unique constraint on (user_id, address, venue)
ALTER TABLE hl_watched_wallets
  ADD CONSTRAINT hl_watched_wallets_user_id_address_venue_key UNIQUE (user_id, address, venue);

COMMIT;
