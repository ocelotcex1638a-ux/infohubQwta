-- verify-retention.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Throwaway verification for the funding/OI/liquidation daily-archive retention
-- (commits 67d2ea57, 51ce73d4, a50da322, eec13749). Proves the new SQL actually
-- runs against the LIVE schema, uses indexes (no seq-scan of the heavy tables),
-- and that the rollup math reconstructs the same numbers as a direct aggregate.
--
-- NON-DESTRUCTIVE: everything runs inside a transaction that ROLLBACKs at the
-- end, so no rows persist. Safe to run on production. (The CREATE TABLE IF NOT
-- EXISTS statements mirror initDB; if the tables already exist they're no-ops.)
--
-- Run it:
--     psql "$DATABASE_URL" -f verify-retention.sql
--   or paste into the Neon / DO managed-PG SQL console and run.
--
-- What to look for:
--   * No errors (every statement returns a result, not a syntax/type error).
--   * The EXPLAIN plans show an *Index Scan* / *Index Cond* on `ts`, NOT a
--     "Seq Scan on funding_snapshots" — that's the whole point of the ts-range
--     bound vs DATE(ts).
--   * In each "archive vs raw" check, archive_val ≈ raw_val (diff ~0; tiny
--     floating-point error is fine). A large diff means the rollup math is wrong.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── DDL validity (mirrors initDB) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funding_snapshots_daily (
  symbol     TEXT NOT NULL,
  exchange   TEXT NOT NULL,
  day        DATE NOT NULL,
  rate_sum   DOUBLE PRECISION NOT NULL,
  rate_count INTEGER NOT NULL,
  rate_avg   REAL NOT NULL,
  PRIMARY KEY (symbol, exchange, day)
);
CREATE TABLE IF NOT EXISTS oi_snapshots_daily (
  symbol       TEXT NOT NULL,
  exchange     TEXT NOT NULL,
  day          DATE NOT NULL,
  oi_usd_avg   REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  PRIMARY KEY (symbol, exchange, day)
);
CREATE TABLE IF NOT EXISTS liquidation_snapshots_daily (
  symbol          TEXT NOT NULL,
  exchange        TEXT NOT NULL,
  day             DATE NOT NULL,
  value_usd       DOUBLE PRECISION NOT NULL,
  long_value_usd  DOUBLE PRECISION NOT NULL,
  short_value_usd DOUBLE PRECISION NOT NULL,
  event_count     INTEGER NOT NULL,
  PRIMARY KEY (symbol, exchange, day)
);

-- ════════════════════════════════════════════════════════════════════════════
-- FUNDING
-- ════════════════════════════════════════════════════════════════════════════

-- Plan check: the rollup's ts-range predicate (cold-start shape: floor =
-- CURRENT_DATE-2) must be an INDEX scan, not a seq-scan of funding_snapshots.
EXPLAIN
SELECT symbol, exchange, DATE(ts) AS day,
       SUM(rate)::double precision, COUNT(rate)::int, AVG(rate)::real
FROM funding_snapshots
WHERE rate IS NOT NULL
  AND ts >= (CURRENT_DATE - 2 + 1)::timestamptz
  AND ts <  CURRENT_DATE::timestamptz
GROUP BY symbol, exchange, DATE(ts);

-- Full rollup over ALL complete days currently in raw (the live cursor would
-- only do the last day; here we exercise every day present so the correctness
-- check below has data to compare).
INSERT INTO funding_snapshots_daily (symbol, exchange, day, rate_sum, rate_count, rate_avg)
SELECT symbol, exchange, DATE(ts) AS day,
       SUM(rate)::double precision, COUNT(rate)::int, AVG(rate)::real
FROM funding_snapshots
WHERE rate IS NOT NULL AND DATE(ts) < CURRENT_DATE
GROUP BY symbol, exchange, DATE(ts)
ON CONFLICT (symbol, exchange, day) DO UPDATE
  SET rate_sum = EXCLUDED.rate_sum, rate_count = EXCLUDED.rate_count, rate_avg = EXCLUDED.rate_avg;

SELECT 'funding: rows archived' AS step,
       COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
       MIN(day) AS earliest, MAX(day) AS latest
FROM funding_snapshots_daily;

-- Correctness: the cross-venue daily average reconstructed from the archive
-- (SUM(rate_sum)/SUM(rate_count)) must equal a direct AVG(rate) over raw for
-- the same symbol/day — this is exactly what getBulkFundingHistory returns.
WITH sample AS (
  SELECT symbol, day FROM funding_snapshots_daily ORDER BY day DESC, symbol LIMIT 3
)
SELECT 'funding: archive vs raw' AS step, s.symbol, s.day,
       (SELECT SUM(rate_sum) / NULLIF(SUM(rate_count), 0)
          FROM funding_snapshots_daily d WHERE d.symbol = s.symbol AND d.day = s.day) AS archive_avg,
       (SELECT AVG(rate)
          FROM funding_snapshots f WHERE f.symbol = s.symbol AND DATE(f.ts) = s.day AND f.rate IS NOT NULL) AS raw_avg
FROM sample s;

-- ════════════════════════════════════════════════════════════════════════════
-- OPEN INTEREST
-- ════════════════════════════════════════════════════════════════════════════

EXPLAIN
SELECT symbol, exchange, DATE(ts) AS day, AVG(oi_usd)::real, COUNT(*)::int
FROM oi_snapshots
WHERE ts >= (CURRENT_DATE - 2 + 1)::timestamptz AND ts < CURRENT_DATE::timestamptz
GROUP BY symbol, exchange, DATE(ts);

INSERT INTO oi_snapshots_daily (symbol, exchange, day, oi_usd_avg, sample_count)
SELECT symbol, exchange, DATE(ts) AS day, AVG(oi_usd)::real, COUNT(*)::int
FROM oi_snapshots
WHERE DATE(ts) < CURRENT_DATE
GROUP BY symbol, exchange, DATE(ts)
ON CONFLICT (symbol, exchange, day) DO UPDATE
  SET oi_usd_avg = EXCLUDED.oi_usd_avg, sample_count = EXCLUDED.sample_count;

SELECT 'oi: rows archived' AS step,
       COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
       MIN(day) AS earliest, MAX(day) AS latest
FROM oi_snapshots_daily;

-- Correctness: per-venue archived daily mean must equal direct AVG(oi_usd).
WITH sample AS (
  SELECT symbol, exchange, day FROM oi_snapshots_daily ORDER BY day DESC, symbol LIMIT 3
)
SELECT 'oi: archive vs raw' AS step, s.symbol, s.exchange, s.day,
       (SELECT oi_usd_avg FROM oi_snapshots_daily d
         WHERE d.symbol = s.symbol AND d.exchange = s.exchange AND d.day = s.day) AS archive_avg,
       (SELECT AVG(oi_usd) FROM oi_snapshots o
         WHERE o.symbol = s.symbol AND o.exchange = s.exchange AND DATE(o.ts) = s.day) AS raw_avg
FROM sample s;

-- ════════════════════════════════════════════════════════════════════════════
-- LIQUIDATIONS
-- ════════════════════════════════════════════════════════════════════════════

EXPLAIN
SELECT symbol, exchange, DATE(ts) AS day,
       SUM(value_usd)::double precision, COUNT(*)::int
FROM liquidation_snapshots
WHERE ts >= (CURRENT_DATE - 2 + 1)::timestamptz AND ts < CURRENT_DATE::timestamptz
GROUP BY symbol, exchange, DATE(ts);

INSERT INTO liquidation_snapshots_daily (symbol, exchange, day, value_usd, long_value_usd, short_value_usd, event_count)
SELECT symbol, exchange, DATE(ts) AS day,
       SUM(value_usd)::double precision,
       SUM(CASE WHEN side = 'long'  THEN value_usd ELSE 0 END)::double precision,
       SUM(CASE WHEN side = 'short' THEN value_usd ELSE 0 END)::double precision,
       COUNT(*)::int
FROM liquidation_snapshots
WHERE DATE(ts) < CURRENT_DATE
GROUP BY symbol, exchange, DATE(ts)
ON CONFLICT (symbol, exchange, day) DO UPDATE
  SET value_usd = EXCLUDED.value_usd, long_value_usd = EXCLUDED.long_value_usd,
      short_value_usd = EXCLUDED.short_value_usd, event_count = EXCLUDED.event_count;

SELECT 'liq: rows archived' AS step,
       COUNT(*) AS rows, COUNT(DISTINCT symbol) AS symbols,
       MIN(day) AS earliest, MAX(day) AS latest
FROM liquidation_snapshots_daily;

-- Correctness: per-venue archived daily total must equal direct SUM(value_usd).
WITH sample AS (
  SELECT symbol, exchange, day FROM liquidation_snapshots_daily ORDER BY day DESC, symbol LIMIT 3
)
SELECT 'liq: archive vs raw' AS step, s.symbol, s.exchange, s.day,
       (SELECT value_usd FROM liquidation_snapshots_daily d
         WHERE d.symbol = s.symbol AND d.exchange = s.exchange AND d.day = s.day) AS archive_value,
       (SELECT SUM(value_usd) FROM liquidation_snapshots l
         WHERE l.symbol = s.symbol AND l.exchange = s.exchange AND DATE(l.ts) = s.day) AS raw_value
FROM sample s;

-- ── Done — discard everything. ───────────────────────────────────────────────
ROLLBACK;
