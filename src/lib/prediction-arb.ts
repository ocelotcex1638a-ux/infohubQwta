/**
 * Cross-venue "tracked arb" between Polymarket and Kalshi — the curated
 * counterpart to the fuzzy odds-comparison on /api/prediction-markets.
 *
 * The generic feeds barely overlap, so this module matches only markets
 * that are GENUINELY the same contract on both venues, by structured
 * fields rather than text:
 *
 *   • Crypto — "<asset> price above $<strike> on <date>". Polymarket
 *     phrases it "Will the price of Bitcoin be above $58,000 on June 26?",
 *     Kalshi as a KXBTCD/KXETHD market with floor_strike + close_time.
 *     Matched on asset + strike + resolution DATE. Matching loosely (e.g.
 *     strike only) shows phantom gaps — "$60k on Jun 26" vs "…Jun 27" is
 *     a different question — so the date must align exactly.
 *
 *   • Fed — the FOMC rate MOVE at a given meeting. Polymarket: "Will the
 *     Fed decrease interest rates by 25 bps after the July 2026 meeting?".
 *     Kalshi KXFEDDECISION: yes_sub "Cut 25bps" under event "Fed decision
 *     in Jul 2026?". Matched on meeting month + move bucket — both venues
 *     frame it as the move, so no rate-level arithmetic is needed.
 *
 * All functions here are pure so the matching (and the phantom-arb
 * guards) are unit-tested without hitting the network. The route in
 * /api/prediction-arb does the IO and assembles legs from raw markets.
 */

export type ArbTopic = 'crypto' | 'fed';
export type CryptoAsset = 'BTC' | 'ETH';

/** A single matched market pair shown to the user. */
export interface TrackedPair {
  id: string;
  topic: ArbTopic;
  /** Headline label, e.g. "BTC ≥ $58,000" or "Fed cuts 25 bps". */
  label: string;
  /** Secondary label, e.g. "Jun 26, 2026" or "Jul 2026 meeting". */
  subLabel: string;
  polyOdds: number;   // 0..1
  kalshiOdds: number; // 0..1
  gap: number;        // |polyOdds - kalshiOdds|, 0..1
  polyUrl: string;
  kalshiUrl: string;
  /** Honest caveat when the two contracts aren't perfectly identical
   *  (e.g. crypto settles a few hours apart), so small gaps are expected. */
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Shared date helpers
// ─────────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Resolve a bare "<month> <day>" (no year, as Polymarket gives) to a
 *  YYYY-MM-DD near `now` — the nearest occurrence not more than ~60 days
 *  in the past, since these daily markets are always near-term. */
export function resolveNearDate(monthName: string, day: number, now: Date): string | null {
  const month = MONTHS[monthName.toLowerCase()];
  if (!month || day < 1 || day > 31) return null;
  const y = now.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day);
  // If the same-year date is well in the past, the market is for next year.
  const year = candidate < now.getTime() - 60 * 86_400_000 ? y + 1 : y;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
}

// ─────────────────────────────────────────────────────────────────────
// Crypto
// ─────────────────────────────────────────────────────────────────────

export interface CryptoLeg {
  asset: CryptoAsset;
  strike: number;       // integer dollars (normalized)
  date: string;         // YYYY-MM-DD resolution date
  yesOdds: number;      // 0..1
  url: string;
  /** Resolution timestamp ISO, used to flag settlement-time offsets. */
  closeIso?: string;
}

const POLY_CRYPTO_RE =
  /price of (bitcoin|ethereum) be above \$([\d,]+(?:\.\d+)?) on (\w+) (\d{1,2})/i;

/** Parse a Polymarket crypto question into its structured key, or null. */
export function parsePolymarketCryptoQuestion(
  question: string,
  now: Date,
): { asset: CryptoAsset; strike: number; date: string } | null {
  const m = POLY_CRYPTO_RE.exec(question);
  if (!m) return null;
  const asset: CryptoAsset = m[1].toLowerCase() === 'bitcoin' ? 'BTC' : 'ETH';
  const strike = Math.round(Number(m[2].replace(/,/g, '')));
  if (!Number.isFinite(strike) || strike <= 0) return null;
  const date = resolveNearDate(m[3], Number(m[4]), now);
  if (!date) return null;
  return { asset, strike, date };
}

/** Normalize a Kalshi crypto market's structured fields. Kalshi encodes
 *  "≥ $58,000" as floor_strike 57999.99, so we round to the dollar. */
export function parseKalshiCryptoFields(
  floorStrike: number | null | undefined,
  closeTime: string | null | undefined,
  asset: CryptoAsset,
): { asset: CryptoAsset; strike: number; date: string } | null {
  if (floorStrike == null || !Number.isFinite(floorStrike)) return null;
  if (!closeTime) return null;
  const strike = Math.round(floorStrike);
  if (strike <= 0) return null;
  const date = closeTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { asset, strike, date };
}

const cryptoKey = (asset: string, strike: number, date: string) => `${asset}|${strike}|${date}`;

/** Hours between two ISO timestamps (abs), or null if unparseable. */
function hoursApart(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a), tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / 3_600_000;
}

/** Pair crypto legs on asset + strike + exact resolution date. */
export function matchCryptoLegs(poly: CryptoLeg[], kalshi: CryptoLeg[]): TrackedPair[] {
  const kByKey = new Map<string, CryptoLeg>();
  for (const k of kalshi) kByKey.set(cryptoKey(k.asset, k.strike, k.date), k);

  const pairs: TrackedPair[] = [];
  for (const p of poly) {
    const k = kByKey.get(cryptoKey(p.asset, p.strike, p.date));
    if (!k) continue;
    const gap = Math.abs(p.yesOdds - k.yesOdds);
    const hrs = hoursApart(p.closeIso, k.closeIso);
    const note = hrs != null && hrs >= 2
      ? `Settles ~${Math.round(hrs)}h apart — small gaps are expected, not arb.`
      : undefined;
    pairs.push({
      id: `crypto:${cryptoKey(p.asset, p.strike, p.date)}`,
      topic: 'crypto',
      label: `${p.asset} ≥ $${p.strike.toLocaleString('en-US')}`,
      subLabel: fmtDate(p.date),
      polyOdds: p.yesOdds,
      kalshiOdds: k.yesOdds,
      gap,
      polyUrl: p.url,
      kalshiUrl: k.url,
      note,
    });
  }
  return pairs;
}

// ─────────────────────────────────────────────────────────────────────
// Fed — both venues frame the FOMC outcome as the MOVE
// ─────────────────────────────────────────────────────────────────────

export type FedMove = 'none' | 'cut25' | 'hike25' | 'cut50plus' | 'hike50plus';

const FED_MOVE_LABEL: Record<FedMove, string> = {
  none: 'Fed holds (no change)',
  cut25: 'Fed cuts 25 bps',
  hike25: 'Fed hikes 25 bps',
  cut50plus: 'Fed cuts 50+ bps',
  hike50plus: 'Fed hikes 50+ bps',
};

export interface FedLeg {
  meeting: string;  // 'YYYY-MM'
  move: FedMove;
  yesOdds: number;  // 0..1
  url: string;
}

/** Parse a Polymarket Fed question → meeting month + move bucket. */
export function parsePolymarketFedQuestion(
  question: string,
  now: Date,
): { meeting: string; move: FedMove } | null {
  const q = question.toLowerCase();
  if (!q.includes('fed') && !q.includes('interest rate')) return null;
  const meeting = parseMeetingMonth(q, now);
  if (!meeting) return null;

  let move: FedMove | null = null;
  if (/no change|no.?change|maintain|unchanged/.test(q)) move = 'none';
  else if (/(decrease|cut|lower).*\b50\+?\s*bps|\b50\+?\s*bps.*(decrease|cut)/.test(q)) move = 'cut50plus';
  else if (/(increase|hike|raise).*\b50\+?\s*bps|\b50\+?\s*bps.*(increase|hike)/.test(q)) move = 'hike50plus';
  else if (/(decrease|cut|lower).*25\s*bps/.test(q)) move = 'cut25';
  else if (/(increase|hike|raise).*25\s*bps/.test(q)) move = 'hike25';
  if (!move) return null;
  return { meeting, move };
}

/** Parse a Kalshi KXFEDDECISION market → meeting month + move bucket.
 *  `eventTitle` like "Fed decision in Jul 2026?", `yesSub` like "Cut 25bps". */
export function parseKalshiFed(
  eventTitle: string,
  yesSub: string,
  now: Date,
): { meeting: string; move: FedMove } | null {
  const meeting = parseMeetingMonth(eventTitle.toLowerCase(), now);
  if (!meeting) return null;
  const s = yesSub.toLowerCase();
  let move: FedMove | null = null;
  if (/maintain|0\s*bps|no change/.test(s)) move = 'none';
  else if (/cut\s*>\s*25|cut\s*5\d|cut\s*7\d/.test(s)) move = 'cut50plus';
  else if (/hike\s*>\s*25|hike\s*5\d|hike\s*7\d/.test(s)) move = 'hike50plus';
  else if (/cut\s*25/.test(s)) move = 'cut25';
  else if (/hike\s*25/.test(s)) move = 'hike25';
  if (!move) return null;
  return { meeting, move };
}

/** Extract a 'YYYY-MM' meeting month from text containing a month name +
 *  4-digit year (e.g. "after the July 2026 meeting", "Fed decision in Jul 2026"). */
function parseMeetingMonth(text: string, now: Date): string | null {
  // Long or abbreviated month name followed (within a few words) by a year.
  const re = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{4})/i;
  const m = re.exec(text);
  if (!m) return null;
  const name = m[1].slice(0, 3);
  const idx = MONTH_ABBR.findIndex(a => a.toLowerCase() === name);
  if (idx < 0) return null;
  const year = Number(m[2]);
  if (year < 2024 || year > now.getUTCFullYear() + 5) return null;
  return `${year}-${String(idx + 1).padStart(2, '0')}`;
}

const fedKey = (meeting: string, move: FedMove) => `${meeting}|${move}`;

/** Pair Fed legs on meeting month + move bucket. */
export function matchFedLegs(poly: FedLeg[], kalshi: FedLeg[]): TrackedPair[] {
  const kByKey = new Map<string, FedLeg>();
  for (const k of kalshi) kByKey.set(fedKey(k.meeting, k.move), k);

  const pairs: TrackedPair[] = [];
  for (const p of poly) {
    const k = kByKey.get(fedKey(p.meeting, p.move));
    if (!k) continue;
    const [y, mo] = p.meeting.split('-').map(Number);
    pairs.push({
      id: `fed:${fedKey(p.meeting, p.move)}`,
      topic: 'fed',
      label: FED_MOVE_LABEL[p.move],
      subLabel: `${MONTH_ABBR[(mo || 1) - 1]} ${y} meeting`,
      polyOdds: p.yesOdds,
      kalshiOdds: k.yesOdds,
      gap: Math.abs(p.yesOdds - k.yesOdds),
      polyUrl: p.url,
      kalshiUrl: k.url,
    });
  }
  return pairs;
}

/** Sort matched pairs so the biggest genuine gaps surface first. */
export function sortTrackedPairs(pairs: TrackedPair[]): TrackedPair[] {
  return [...pairs].sort((a, b) => b.gap - a.gap);
}
