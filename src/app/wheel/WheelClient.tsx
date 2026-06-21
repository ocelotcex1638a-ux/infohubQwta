'use client';
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Copy, Check, ArrowRight, Zap } from 'lucide-react';

// ─── Segment data — order must match SEGMENTS in /api/wheel/spin/route.ts ───
const SEGS = [
  { line1: '10%',    line2: 'OFF',   color: '#f59e0b', textColor: '#000', glowColor: 'rgba(245,158,11,0.6)' },
  { line1: 'TRADER', line2: 'FREE',  color: '#10b981', textColor: '#fff', glowColor: 'rgba(16,185,129,0.6)' },
  { line1: '5%',     line2: 'OFF',   color: '#6366f1', textColor: '#fff', glowColor: 'rgba(99,102,241,0.6)' },
  { line1: '20%',    line2: 'OFF',   color: '#f97316', textColor: '#fff', glowColor: 'rgba(249,115,22,0.6)' },
  { line1: '10%',    line2: 'OFF',   color: '#a855f7', textColor: '#fff', glowColor: 'rgba(168,85,247,0.6)' },
  { line1: '15%',    line2: 'OFF',   color: '#06b6d4', textColor: '#000', glowColor: 'rgba(6,182,212,0.6)' },
  { line1: '30%',    line2: 'OFF',   color: '#ec4899', textColor: '#fff', glowColor: 'rgba(236,72,153,0.6)' },
  { line1: 'PRO',    line2: 'FREE',  color: '#eab308', textColor: '#000', glowColor: 'rgba(234,179,8,0.6)'  },
] as const;

const PRIZE_LABELS = [
  '5% off',
  '10% off',
  '10% off',
  '15% off',
  '20% off',
  '30% off',
  '1 mo Trader FREE',
  '1 mo Pro FREE',
];

// ─── SVG helpers ─────────────────────────────────────────────────────────────
const CX = 200, CY = 200, R = 175;

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
  const [pulseGlow, setPulseGlow] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (session?.user?.email) setEmail(session.user.email);
  }, [session?.user?.email]);

  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  // Idle pulse glow animation
  useEffect(() => {
    if (phase !== 'idle') return;
    const id = setInterval(() => setPulseGlow(p => !p), 1800);
    return () => clearInterval(id);
  }, [phase]);

  async function handleSpin(e: React.FormEvent) {
    e.preventDefault();
    if (phase !== 'idle') return;
    setError(null);
    setPhase('loading');
    setPulseGlow(false);

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
  const spinDuration = prize?.alreadySpun ? '3s' : '4.5s';
  const isLoggedIn = !!session?.user?.email;
  const winSeg = prize ? SEGS[prize.segment] : null;
  const winColor = winSeg?.color ?? '#f59e0b';
  const winGlow = winSeg?.glowColor ?? 'rgba(245,158,11,0.5)';

  return (
    <div className="min-h-screen bg-hub-black flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">

      {/* Background radial glow */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-1000"
        style={{
          background: showResult
            ? `radial-gradient(ellipse 60% 50% at 50% 40%, ${winGlow} 0%, transparent 70%)`
            : `radial-gradient(ellipse 50% 40% at 50% 35%, rgba(234,179,8,${pulseGlow ? '0.10' : '0.05'}) 0%, transparent 65%)`,
          opacity: 1,
        }}
      />

      {/* Back link */}
      <Link
        href="/"
        className="absolute top-5 left-5 text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors font-mono tracking-wider flex items-center gap-1"
      >
        ← InfoHub
      </Link>

      {/* Header */}
      <div className="text-center mb-6 relative z-10">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-400/20 rounded-full px-3 py-1 text-[11px] font-bold text-amber-300 uppercase tracking-widest mb-3">
          <Zap className="w-3 h-3" />
          Limited · 1 spin per email
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-none">
          Lucky <span className="text-amber-400">Wheel</span>
        </h1>
        <p className="text-sm text-neutral-500 mt-2 max-w-[260px] mx-auto">
          Spin once. Win a discount on any InfoHub plan — instantly.
        </p>
      </div>

      {/* Wheel container */}
      <div className="relative mb-6 z-10">
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-all duration-1000"
          style={{
            boxShadow: showResult
              ? `0 0 80px 20px ${winGlow}, 0 0 160px 40px ${winGlow.replace('0.6', '0.2')}`
              : `0 0 40px 8px rgba(234,179,8,${pulseGlow ? '0.18' : '0.08'})`,
          }}
        />

        <svg
          viewBox="0 0 400 400"
          width={340}
          height={340}
          className="block overflow-visible drop-shadow-2xl"
          aria-hidden="true"
        >
          {/* Outer decorative ring */}
          <circle cx={CX} cy={CY} r={R + 12} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
          <circle cx={CX} cy={CY} r={R + 8} fill="none" stroke="rgba(234,179,8,0.20)" strokeWidth="1.5" />

          {/* Tick marks on rim */}
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i * 15 * Math.PI) / 180;
            const r1 = R + 5, r2 = R + 9;
            return (
              <line
                key={i}
                x1={(CX + r1 * Math.sin(a)).toFixed(2)}
                y1={(CY - r1 * Math.cos(a)).toFixed(2)}
                x2={(CX + r2 * Math.sin(a)).toFixed(2)}
                y2={(CY - r2 * Math.cos(a)).toFixed(2)}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="1.5"
              />
            );
          })}

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
              const [tx, ty] = toXY(midDeg, R * 0.63);
              return (
                <g key={i}>
                  <path d={segPath(i)} fill={seg.color} />
                  {/* Subtle inner segment divider lines */}
                  <path d={segPath(i)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
                  <text
                    x={tx.toFixed(2)}
                    y={ty.toFixed(2)}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={seg.textColor}
                    fontSize="12"
                    fontWeight="900"
                    fontFamily="Inter, system-ui, sans-serif"
                    transform={`rotate(${midDeg.toFixed(1)}, ${tx.toFixed(2)}, ${ty.toFixed(2)})`}
                    style={{ letterSpacing: '0.05em' }}
                  >
                    <tspan x={tx.toFixed(2)} dy="-0.6em">{seg.line1}</tspan>
                    <tspan x={tx.toFixed(2)} dy="1.2em">{seg.line2}</tspan>
                  </text>
                </g>
              );
            })}
          </g>

          {/* Center cap — gradient */}
          <circle cx={CX} cy={CY} r={28} fill="url(#capGrad)" />
          <circle cx={CX} cy={CY} r={28} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
          <circle cx={CX} cy={CY} r={16} fill="#0d0d0d" />

          {/* InfoHub dot in center */}
          <circle cx={CX} cy={CY} r={5} fill="#eab308" />

          {/* Pointer triangle at top */}
          <polygon
            points={`${CX},${CY - R + 2} ${CX - 13},${CY - R - 20} ${CX + 13},${CY - R - 20}`}
            fill="#f59e0b"
            filter="url(#pointerGlow)"
          />
          <polygon
            points={`${CX},${CY - R + 2} ${CX - 13},${CY - R - 20} ${CX + 13},${CY - R - 20}`}
            fill="none"
            stroke="#0d0d0d"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />

          {/* Defs */}
          <defs>
            <radialGradient id="capGrad" cx="50%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#2a2a2a" />
              <stop offset="100%" stopColor="#0d0d0d" />
            </radialGradient>
            <filter id="pointerGlow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      </div>

      {/* Form / Result */}
      <div className="w-full max-w-[360px] relative z-10">
        {!showResult ? (
          <form onSubmit={handleSpin} className="space-y-3">
            {isLoggedIn ? (
              <div className="text-center text-xs text-neutral-500 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5">
                Spinning as{' '}
                <span className="text-white font-semibold">{session.user!.email}</span>
              </div>
            ) : (
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-neutral-600 text-sm focus:outline-none focus:border-amber-400/50 focus:bg-white/[0.06] transition-all"
              />
            )}

            {error && (
              <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={phase !== 'idle'}
              className="w-full py-4 rounded-xl font-black text-lg tracking-wide transition-all active:scale-[0.98] relative overflow-hidden"
              style={{
                background: phase !== 'idle'
                  ? 'rgba(234,179,8,0.3)'
                  : 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                color: phase !== 'idle' ? '#888' : '#000',
                boxShadow: phase === 'idle' ? '0 0 32px rgba(245,158,11,0.3), 0 4px 16px rgba(0,0,0,0.4)' : 'none',
              }}
            >
              {phase === 'loading'
                ? 'Getting your prize…'
                : phase === 'spinning'
                ? 'Spinning…'
                : '🎡  SPIN THE WHEEL'}
            </button>

            <p className="text-center text-[11px] text-neutral-600">
              One spin per email · Valid 30 days · Applied at checkout
            </p>

            {/* Prize preview strip */}
            <div className="pt-2">
              <p className="text-[10px] uppercase tracking-widest text-neutral-600 text-center mb-2 font-semibold">
                Possible prizes
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {PRIZE_LABELS.map((label, i) => (
                  <span
                    key={i}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{
                      background: SEGS[i % SEGS.length].color + '18',
                      borderColor: SEGS[i % SEGS.length].color + '40',
                      color: SEGS[i % SEGS.length].color,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            {phase === 'already' && (
              <div className="text-center text-xs font-bold uppercase tracking-widest py-1.5 px-3 rounded-lg border"
                style={{ color: winColor, borderColor: winColor + '40', background: winColor + '12' }}>
                You already spun — here&apos;s your prize
              </div>
            )}

            {/* Prize card */}
            <div
              className="rounded-2xl border p-6 text-center space-y-4 relative overflow-hidden"
              style={{
                borderColor: winColor + '50',
                background: `linear-gradient(135deg, ${winColor}10 0%, ${winColor}06 100%)`,
                boxShadow: `0 0 40px ${winColor}20`,
              }}
            >
              {/* Decorative shine */}
              <div
                className="absolute top-0 left-0 right-0 h-px opacity-60"
                style={{ background: `linear-gradient(90deg, transparent, ${winColor}80, transparent)` }}
              />

              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1" style={{ color: winColor }}>
                  {phase === 'already' ? 'Your prize' : '🎉 You won'}
                </p>
                <p className="text-3xl font-black text-white leading-tight">
                  {prize?.prizeText}
                </p>
              </div>

              <div>
                <p className="text-[10px] text-neutral-500 mb-2 uppercase tracking-wider">Promo code</p>
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="font-mono font-black text-xl tracking-[0.15em] text-white px-4 py-2.5 rounded-xl border select-all"
                    style={{
                      background: 'rgba(0,0,0,0.4)',
                      borderColor: winColor + '40',
                    }}
                  >
                    {prize?.promoCode}
                  </span>
                  <button
                    onClick={copyCode}
                    className="p-2.5 rounded-xl border transition-all"
                    style={
                      copied
                        ? { background: winColor + '25', borderColor: winColor, color: winColor }
                        : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)', color: '#888' }
                    }
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-neutral-500">
                Code sent to <span className="text-neutral-300">{email}</span> · Valid 30 days
              </p>
            </div>

            <Link
              href={`/pricing?promo=${encodeURIComponent(prize?.promoCode ?? '')}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-black text-base text-black transition-all hover:opacity-90 active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${winColor}, ${winColor}cc)`,
                boxShadow: `0 4px 20px ${winGlow}`,
              }}
            >
              Claim at checkout
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/"
              className="block text-center text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              ← Back to InfoHub
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
