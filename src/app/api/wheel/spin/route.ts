import { NextRequest, NextResponse } from 'next/server';
import { getSQL, initDB } from '@/lib/db';
import { sendWheelPrize } from '@/lib/email/templates';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Must match SEGS array order in WheelClient.tsx exactly
const SEGMENTS = [
  { id: '10OFF',   prizeText: '10% OFF your first month',  weight: 20 },
  { id: 'TRADER',  prizeText: '1 month Trader tier FREE',  weight: 5  },
  { id: '5OFF',    prizeText: '5% OFF your first month',   weight: 25 },
  { id: '20OFF',   prizeText: '20% OFF your first month',  weight: 15 },
  { id: '10OFFB',  prizeText: '10% OFF your first month',  weight: 15 },
  { id: '15OFF',   prizeText: '15% OFF your first month',  weight: 12 },
  { id: '30OFF',   prizeText: '30% OFF your first month',  weight: 6  },
  { id: 'PRO',     prizeText: '1 month Pro tier FREE',     weight: 2  },
] as const;
// Weights must sum to 100
// 20+5+25+15+15+12+6+2 = 100 ✓

function pickSegment(email: string): number {
  const hash = crypto
    .createHash('sha256')
    .update(email.toLowerCase().trim() + ':infohub-wheel-2026')
    .digest('hex');
  const n = parseInt(hash.slice(0, 8), 16) % 100;
  let cum = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    cum += SEGMENTS[i].weight;
    if (n < cum) return i;
  }
  return 0;
}

function generateCode(segId: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join('');
  const key = segId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
  return `IH-${key}-${suffix}`;
}

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  await initDB();
  const sql = getSQL();

  // Return existing prize if already spun
  const existing = await sql`
    SELECT prize_id, promo_code, segment FROM wheel_spins WHERE email = ${email}
  `;
  if (existing.length > 0) {
    const row = existing[0];
    const seg = SEGMENTS[row.segment as number] ?? SEGMENTS[0];
    return NextResponse.json({
      segment: row.segment,
      promoCode: row.promo_code,
      prizeText: seg.prizeText,
      alreadySpun: true,
    });
  }

  const segIdx = pickSegment(email);
  const seg = SEGMENTS[segIdx];
  const promoCode = generateCode(seg.id);

  await sql`
    INSERT INTO wheel_spins (email, prize_id, promo_code, segment)
    VALUES (${email}, ${seg.id}, ${promoCode}, ${segIdx})
    ON CONFLICT (email) DO NOTHING
  `;

  // Fire-and-forget — don't let email delivery delay block the spin response
  sendWheelPrize({ to: email, prizeText: seg.prizeText, promoCode }).catch(() => {});

  return NextResponse.json({
    segment: segIdx,
    promoCode,
    prizeText: seg.prizeText,
    alreadySpun: false,
  });
}
