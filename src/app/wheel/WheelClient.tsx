'use client';
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

// ─── Segment data — order must match SEGMENTS in /api/wheel/spin/route.ts ───
const SEGS = [
  { line1: '10%',    line2: 'OFF',   color: '#f59e0b', dark: true  },
  { line1: 'TRADER', line2: 'FREE',  color: '#10b981', dark: false },
  { line1: '5%',     line2: 'OFF',   color: '#3b82f6', dark: false },
  { line1: '20%',    line2: 'OFF',   color: '#f97316', dark: false },
  { line1: '10%',    line2: 'OFF',   color: '#a855f7', dark: false },
  { line1: '15%',    line2: 'OFF',   color: '#06b6d4', dark: true  },
  { line1: '30%',    line2: 'OFF',   color: '#ec4899', dark: false },
  { line1: 'PRO',    line2: 'FREE',  color: '#eab308', dark: true  },
] as const;

// ─── SVG helpers ─────────────────────────────────────────────────────────────
const CX = 200, CY = 200, R = 178;

function toXY(deg: number, r = R): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

function segPath(i: number): string {
  const [sx, sy] = toXY(i * 45);
  const [ex, ey] = toXY((i + 1) * 45);
  return `M ${CX} ${CY} L ${sx.toFixed(2)} ${sy.toFixed(2)} A ${R} ${R} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'loading' | 'spinning' | 'result' | 'already';

interface Prize {
  segment: number;
  promoCode: string;
  prizeText: string;
  alreadySpun: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function WheelClient() {
  const { data: session } = useSession();
  const [email, setEmail] = useState('');
  const [rotation, setRotation] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [prize, setPrize] = useState<Prize | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (session?.user?.email) setEmail(session.user.email);
  }, [session?.user?.email]);

  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  async function handleSpin(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== 'idle') return;
    setError(null);
    setPhase('loading');

    try {
      const res = await fetch('/api/wheel/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data: Prize & { error?: string } = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        setPhase('idle');
        return;
      }

      setPrize(data);

      const segCenter = (data.segment + 0.5) * 45;
      const baseOffset = (360 - segCenter + 360) % 360;

      if (data.alreadySpun) {
        setRotation(3 * 360 + baseOffset);
        setPhase('spinning');
        revealTimer.current = setTimeout(() => setPhase('already'), 3200);
      } else {
        const jitter = (Math.random() - 0.5) * 18;
        setRotation(5 * 360 + baseOffset + jitter);
        setPhase('spinning');
        revealTimer.current = setTimeout(() => setPhase('result'), 4900);
      }
    } catch {
      setError('Network error — please try again.');
      setPhase('idle');
    }
  }

  async function copyCode() {
    if (!prize) return;
    try {
      await navigator.clipboard.writeText(prize.promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const isSpinning = phase === 'spinning';
  const showResult = phase === 'result' || phase === 'already';
  const winColor = prize ? (SEGS[prize.segment]?.color ?? '#f59e0b') : '#f59e0b';
  const spinDuration = prize?.alreadySpun ? '3s' : '4.5s';
  const isLoggedIn = !!session?.user?.email;

  return (
    <div className="min-h-screen bg-hub-black flex flex-col items-center justify-center px-4 py-12">

      {/* Header */}
      <div className="text-center mb-8 space-y-2">
        <Link href="/" className="inline-block mb-4 opacity-50 hover:opacity-100 transition-opacity">
          <span className="font-mono font-bold text-hub-accent text-lg tracking-wide">InfoHub</span>
        </Link>
        <h1 className="text-3xl sm:text-4xl font-black text-white">Lucky Wheel</h1>
        <p className="text-sm text-hub-text-muted max-w-xs mx-auto leading-relaxed">
          One spin per email. Win a discount on any InfoHub plan.
        </p>
      </div>

      {/* Wheel */}
      <div className="relative mb-8">
        <svg
          viewBox="0 0 400 400"
          width={320}
          height={320}
          className="block overflow-visible"
          aria-hidden="true"
        >
          {/* Spinning group */}
          <g
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${CX}px ${CY}px`,
              transition: isSpinning
                ? `transform ${spinDuration} cubic-bezier(0.17, 0.67, 0.12, 0.99)`
                : 'none',
              willChange: 'transform',
            }}
          >
            {SEGS.map((seg, i) => {
              const midDeg = (i + 0.5) * 45;
              const [tx, ty] = toXY(midDeg, R * 0.62);
              return (
                <g key={i}>
                  <path d={segPath(i)} fill={seg.color} stroke="#0d0d0d" strokeWidth="2" />
                  <text
                    x={tx.toFixed(2)}
                    y={ty.toFixed(2)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={seg.dark ? '#000' : '#fff'}
                    fontSize="13"
                    fontWeight="800"
                    fontFamily="Inter, system-ui, sans-serif"
                    transform={`rotate(${midDeg.toFixed(1)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`}
                  >
                    <tspan x={tx.toFixed(2)} dy="-0.55em">{seg.line1}</tspan>
                    <tspan x={tx.toFixed(2)} dy="1.1em">{seg.line2}</tspan>
                  </text>
                </g>
              );
            })}
          </g>

          {/* Outer rim */}
          <circle cx={CX} cy={CY} r={R + 5} fill="none" stroke="#2a2a2a" strokeWidth="3" />

          {/* Center cap */}
          <circle cx={CX} cy={CY} r={30} fill="#0d0d0d" stroke="#2a2a2a" strokeWidth="2" />
          <circle cx={CX} cy={CY} r={18} fill="#151515" />

          {/* Pointer — fixed, points down at the top of the wheel */}
          <polygon
            points={`${CX},26 ${CX - 11},4 ${CX + 11},4`}
            fill="#f59e0b"
            stroke="#0d0d0d"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>

        {/* Win glow */}
        {showResult && (
          <div
            className="absolute inset-0 rounded-full -z-10 pointer-events-none blur-3xl"
            style={{ background: winColor, opacity: 0.15 }}
          />
        )}
      </div>

      {/* Form / Result */}
      <div className="w-full max-w-[340px]">
        {!showResult ? (
          <form onSubmit={handleSpin} className="space-y-3">
            {isLoggedIn ? (
              <p className="text-center text-xs text-hub-text-muted">
                Spinning as{' '}
                <span className="text-white font-medium">{session.user!.email}</span>
              </p>
            ) : (
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-hub-secondary border border-hub-border rounded-xl px-4 py-3 text-white placeholder-hub-text-muted text-sm focus:outline-none focus:border-hub-accent transition-colors"
              />
            )}

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={phase !== 'idle'}
              className="w-full py-3.5 rounded-xl font-black text-lg tracking-wide bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-amber-500/20 active:scale-[0.98]"
            >
              {phase === 'loading' ? 'Getting prize…' : phase === 'spinning' ? 'Spinning…' : '🎡 SPIN'}
            </button>

            <p className="text-center text-xs text-hub-text-muted">
              One spin per email · Code emailed to you
            </p>
          </form>
        ) : (
          <div className="space-y-4">
            {phase === 'already' && (
              <p className="text-center text-xs font-semibold uppercase tracking-widest" style={{ color: winColor }}>
                Your previously won prize
              </p>
            )}

            <div
              className="rounded-2xl border p-5 text-center space-y-3"
              style={{ borderColor: winColor + '50', background: winColor + '0f' }}
            >
              <p className="text-xs uppercase tracking-widest" style={{ color: winColor }}>
                You won
              </p>
              <p className="text-2xl font-black text-white leading-tight">
                {prize?.prizeText}
              </p>
              <div>
                <p className="text-xs text-hub-text-muted mb-2">Your promo code</p>
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="font-mono font-bold text-xl tracking-widest text-white bg-hub-secondary rounded-lg px-4 py-2.5 border border-hub-border"
                  >
                    {prize?.promoCode}
                  </span>
                  <button
                    onClick={copyCode}
                    className="px-3 py-2.5 rounded-lg text-xs font-bold transition-all"
                    style={
                      copied
                        ? { background: winColor + '25', color: winColor }
                        : { background: '#1a1a1a', color: '#888' }
                    }
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <p className="text-center text-xs text-hub-text-muted">
              Valid 30 days · Code also sent to {email}
            </p>

            <Link
              href="/pricing"
              className="block w-full py-3 rounded-xl font-bold text-sm text-center text-black transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: winColor }}
            >
              Upgrade now →
            </Link>

            <Link
              href="/"
              className="block text-center text-xs text-hub-text-muted hover:text-white transition-colors"
            >
              ← Back to InfoHub
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
