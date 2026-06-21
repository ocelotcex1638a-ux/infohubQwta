'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import {
  ArrowLeftRight, TrendingUp, Zap, Sigma, PiggyBank, ChevronRight, CheckCircle,
} from 'lucide-react';

// ── Trader personas ────────────────────────────────────────────────────────────

const STYLES = [
  {
    id: 'arb',
    label: 'Funding & Arb',
    emoji: '⚡',
    icon: ArrowLeftRight,
    blurb: 'I trade cross-venue carry, basis and funding-rate spreads.',
    redirect: '/signals',
    accentClass: 'border-hub-yellow/40 bg-hub-yellow/[0.06] hover:border-hub-yellow/60',
    iconClass: 'text-hub-yellow',
    tagClass: 'text-hub-yellow bg-hub-yellow/10 border-hub-yellow/20',
    tags: ['Live Signals', 'Carry Calculator', 'Spreads', 'Funding Arb'],
  },
  {
    id: 'directional',
    label: 'Directional & Swing',
    emoji: '📈',
    icon: TrendingUp,
    blurb: 'I trade trend, breakout and momentum — hours to days.',
    redirect: '/chart',
    accentClass: 'border-emerald-500/30 bg-emerald-500/[0.04] hover:border-emerald-500/50',
    iconClass: 'text-emerald-400',
    tagClass: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    tags: ['Chart', 'Screener', 'Breakouts', 'Momentum'],
  },
  {
    id: 'intraday',
    label: 'Intraday & Scalper',
    emoji: '🎯',
    icon: Zap,
    blurb: 'I scalp — microstructure, flow and fast moves.',
    redirect: '/tape',
    accentClass: 'border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/50',
    iconClass: 'text-amber-400',
    tagClass: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    tags: ['Trade Tape', 'DEX Whales', 'Scalper Cockpit', 'Liquidations', 'Long/Short'],
  },
  {
    id: 'options',
    label: 'Options Trader',
    emoji: '🧮',
    icon: Sigma,
    blurb: 'I trade IV, skew, max pain and multi-leg structures.',
    redirect: '/vol-surface',
    accentClass: 'border-violet-500/30 bg-violet-500/[0.04] hover:border-violet-500/50',
    iconClass: 'text-violet-400',
    tagClass: 'text-violet-400 bg-violet-400/10 border-violet-400/20',
    tags: ['Vol Surface', 'Options', 'Strategy Builder', 'RV vs IV'],
  },
  {
    id: 'spot',
    label: 'HODLer & Spot',
    emoji: '💎',
    icon: PiggyBank,
    blurb: 'I accumulate, DCA and monitor the macro cycle.',
    redirect: '/dashboard',
    accentClass: 'border-sky-500/30 bg-sky-500/[0.04] hover:border-sky-500/50',
    iconClass: 'text-sky-400',
    tagClass: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    tags: ['Portfolio', 'Market Cycle', 'ETF Flows', 'On-Chain'],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/account/trading-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const style = STYLES.find((s) => s.id === selected)!;
      router.push(style.redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSaving(false);
    }
  }

  function handleSkip() {
    router.push('/home');
  }

  return (
    <div className="min-h-screen bg-hub-black flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, var(--hub-accent), transparent 70%)' }} />
      </div>

      <div className="w-full max-w-[720px] relative z-10">

        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <Logo variant="full" size="lg" />
          <div className="mt-6 text-center">
            <h1 className="text-2xl font-bold text-white mb-2">
              What describes you best?
            </h1>
            <p className="text-neutral-400 text-sm max-w-sm mx-auto">
              We&apos;ll take you straight to your most useful tools. You can change this later in settings.
            </p>
          </div>
        </div>

        {/* Style cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {STYLES.map((style) => {
            const Icon = style.icon;
            const isSelected = selected === style.id;
            return (
              <button
                key={style.id}
                onClick={() => setSelected(style.id)}
                className={`group text-left p-4 rounded-2xl border transition-all duration-150 ${style.accentClass} ${
                  isSelected
                    ? 'ring-2 ring-offset-1 ring-offset-hub-black ring-white/30'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.04] ${style.iconClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                </div>
                <div className="font-bold text-sm text-white mb-1">{style.label}</div>
                <div className="text-[12px] text-neutral-400 leading-snug mb-3">{style.blurb}</div>
                <div className="flex flex-wrap gap-1">
                  {style.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${style.tagClass}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-400 mb-4">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handleSkip}
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Skip for now →
          </button>
          <button
            onClick={handleContinue}
            disabled={!selected || saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm
              bg-hub-yellow text-hub-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors"
          >
            {saving ? 'Saving…' : 'Take me there'}
            {!saving && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
