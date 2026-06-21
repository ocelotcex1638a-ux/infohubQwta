'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import StreamBars from './StreamBars';
import SatPing from './SatPing';
import ExchangeStrip from './ExchangeStrip';
import ThroughputCounter from './ThroughputCounter';
import SupportChat from '@/components/SupportChat';
import { useAggregatorHealth } from '@/hooks/useAggregatorHealth';

interface StatusBarProps { version?: string; className?: string; }

/** Reusable thin separator between status-bar groups */
function Sep({ hidden }: { hidden?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden
      className={hidden === 'sm' ? 'hidden sm:inline-block' : hidden === 'md' ? 'hidden md:inline-block' : undefined}
      style={{ width: 1, height: 14, background: 'var(--hub-border)', opacity: 0.5, flexShrink: 0 }}
    />
  );
}

/** Streaming/degraded/offline badge — was previously hardcoded to
 *  always read "STREAMING" in green regardless of actual aggregator
 *  health. Now reads from the shared useAggregatorHealth hook. */
function StreamStatusBadge() {
  const { status } = useAggregatorHealth();

  const config = {
    streaming: { label: 'STREAMING', color: 'var(--pump-mild)' },
    degraded:  { label: 'DEGRADED',  color: 'var(--hub-accent)' },
    offline:   { label: 'OFFLINE',   color: 'var(--rekt-mild)' },
    unknown:   { label: 'CONNECTING', color: 'var(--fg-muted)' },
  }[status];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      color: config.color, fontWeight: 700, letterSpacing: '0.06em',
    }}>
      <StreamBars height={11} bars={4} color={config.color} />
      <span>{config.label}</span>
    </span>
  );
}

// ── What's New data ──────────────────────────────────────────────────────────

type WhatsNewTag = 'new' | 'improved' | 'fix';

interface WhatsNewItem {
  tag: WhatsNewTag;
  label: string;
  href: string;
  /** Short description for tooltip / subtitle */
  desc: string;
  /** ISO date for display */
  date: string;
}

const WHATS_NEW: WhatsNewItem[] = [
  {
    tag: 'new',
    label: 'Daily Digest',
    href: '/today',
    desc: 'Shareable daily snapshot — prices, carry, movers, OI, trade ideas',
    date: '2026-06-21',
  },
  {
    tag: 'improved',
    label: 'Daily Digest · Trade Ideas',
    href: '/today',
    desc: 'Derives 1-3 actionable carry/OI ideas algorithmically — no AI needed',
    date: '2026-06-21',
  },
  {
    tag: 'new',
    label: 'DEX Whale Tracker',
    href: '/whales',
    desc: 'Real-time $100K+ fills from Hyperliquid, filtered by coin & size',
    date: '2026-06-20',
  },
  {
    tag: 'improved',
    label: 'Live Signals · Telegram CTA',
    href: '/signals',
    desc: 'One-click connect to get signal alerts pushed to your Telegram',
    date: '2026-06-21',
  },
  {
    tag: 'improved',
    label: 'Home · Community section',
    href: '/',
    desc: 'Telegram & X links now surface on the home page',
    date: '2026-06-21',
  },
  {
    tag: 'improved',
    label: 'Mobile controls',
    href: '/funding',
    desc: 'Funding, whale, and heatmap filter rows now scroll on narrow screens',
    date: '2026-06-21',
  },
  {
    tag: 'new',
    label: 'Billing flow',
    href: '/pricing',
    desc: 'NowPayments checkout live — crypto billing for Trader / Pro / Whale',
    date: '2026-06-18',
  },
  {
    tag: 'improved',
    label: 'Lucky Wheel promo',
    href: '/pricing',
    desc: 'Spin the wheel for a random tier discount — auto-applied at checkout',
    date: '2026-06-18',
  },
  {
    tag: 'new',
    label: 'Smart Money confluence',
    href: '/smart-money',
    desc: 'Composite confluence score — agreement across HL traders + on-chain signals',
    date: '2026-06-15',
  },
  {
    tag: 'improved',
    label: 'Breakouts · CoinGecko links',
    href: '/breakouts',
    desc: 'Token logos + external CoinGecko links on every breakout row',
    date: '2026-06-15',
  },
];

const TAG_STYLE: Record<WhatsNewTag, { label: string; bg: string; color: string }> = {
  new:      { label: 'NEW',      bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
  improved: { label: 'IMPROVED', bg: 'rgba(255,184,0,0.12)',  color: 'var(--hub-accent)' },
  fix:      { label: 'FIX',      bg: 'rgba(239,68,68,0.12)',  color: '#f87171' },
};

function WhatsNewPopover({ open, onClose, anchorRef }: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  // Position above the trigger button
  const rect = anchorRef.current?.getBoundingClientRect();
  const left = rect ? Math.max(8, rect.right - 320) : 8;
  const bottom = rect ? window.innerHeight - rect.top + 6 : 50;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="What's new"
      style={{
        position: 'fixed',
        left,
        bottom,
        width: 320,
        zIndex: 9999,
        background: 'linear-gradient(180deg, #0f1520 0%, #0a0e18 100%)',
        border: '1px solid rgba(255,184,0,0.2)',
        borderRadius: 12,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <SatPing size={9} color="var(--hub-accent)" />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--hub-accent)', textTransform: 'uppercase' }}>
            What&apos;s New
          </span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>Recent releases</span>
      </div>

      {/* Items */}
      <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0' }}>
        {WHATS_NEW.map((item, i) => {
          const ts = TAG_STYLE[item.tag];
          return (
            <Link
              key={i}
              href={item.href}
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 14px',
                textDecoration: 'none',
                transition: 'background 120ms',
              }}
              className="whats-new-row"
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '2px 6px', borderRadius: 4,
                background: ts.bg, color: ts.color,
                fontSize: 8, fontWeight: 800, letterSpacing: '0.06em',
                textTransform: 'uppercase', flexShrink: 0, marginTop: 1,
              }}>
                {ts.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-default)', lineHeight: 1.3 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-muted)', lineHeight: 1.4, marginTop: 2 }}>
                  {item.desc}
                </div>
              </div>
              <span style={{ fontSize: 9, color: 'var(--fg-subtle)', flexShrink: 0, marginTop: 2 }}>
                {item.date.slice(5).replace('-', '/')}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 9, color: 'var(--fg-subtle)' }}>v2.1 · June 2026</span>
        <Link
          href="/changelog"
          onClick={onClose}
          style={{ fontSize: 9, color: 'var(--hub-accent)', textDecoration: 'none', fontWeight: 700 }}
        >
          Full changelog →
        </Link>
      </div>

      <style jsx>{`
        .whats-new-row:hover {
          background: rgba(255, 255, 255, 0.04) !important;
        }
      `}</style>
    </div>
  );
}

export default function StatusBar({ version = 'v2.0', className }: StatusBarProps) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin';
  const [popoverOpen, setPopoverOpen] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);

  return (
    <footer
      className={className}
      style={{
        height: 36, flexShrink: 0,
        background: 'linear-gradient(180deg, rgba(13,17,27,0.98) 0%, rgba(7,9,14,0.96) 100%)',
        borderTop: '1px solid var(--hub-border-subtle)',
        display: 'flex', alignItems: 'center',
        padding: '0 18px', gap: 12,
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-subtle)',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}
      aria-label="System status"
    >
      <StreamStatusBadge />
      <Sep />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {/* Real venue count from aggregator /health — same shared
            hook the STREAMING badge above uses. */}
        <ThroughputCounter />
        <span className="hidden md:inline-flex"><ExchangeStrip compact /></span>
      </span>

      <div style={{ flex: 1, minWidth: 12 }} />

      {/* Compliance reminder (large screens only) */}
      <span
        className="hidden 2xl:inline-flex"
        style={{
          alignItems: 'center', gap: 6,
          color: 'var(--fg-faint)', fontSize: 9,
          textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--rekt-mild)', opacity: 0.6, flexShrink: 0 }}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9"  x2="12"    y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>
          Not financial advice
          <span style={{ color: 'var(--hub-border)', margin: '0 6px' }}>·</span>
          Third-party data
          <span style={{ color: 'var(--hub-border)', margin: '0 6px' }}>·</span>
          DYOR
        </span>
      </span>

      {/* What's New badge — opens inline popover for all users */}
      <button
        ref={badgeRef}
        onClick={() => setPopoverOpen(v => !v)}
        aria-expanded={popoverOpen}
        aria-haspopup="dialog"
        title={`InfoHub ${version} — see recent releases`}
        className="status-bar-version"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 11px', borderRadius: 999, cursor: 'pointer',
          background: popoverOpen
            ? 'linear-gradient(180deg, rgba(255,184,0,0.18) 0%, rgba(255,184,0,0.08) 100%)'
            : 'linear-gradient(180deg, rgba(255,184,0,0.14) 0%, rgba(255,184,0,0.06) 100%)',
          border: `1px solid ${popoverOpen ? 'rgba(255,184,0,0.38)' : 'rgba(255,184,0,0.24)'}`,
          color: 'var(--hub-accent)',
          fontWeight: 700, letterSpacing: '0.04em', fontSize: 9,
          textTransform: 'uppercase', flexShrink: 0,
          marginLeft: 4,
          transition: 'background 150ms, border-color 150ms, transform 150ms, box-shadow 150ms',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <SatPing size={10} color="var(--hub-accent)" />
        <span>WHAT&apos;S NEW</span>
        {/* unread dot — always shown since we don't persist a "seen" state */}
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'var(--hub-accent)',
          marginLeft: 1,
          boxShadow: '0 0 5px var(--hub-accent)',
          animation: 'pulse 2s ease-in-out infinite',
        }} />
      </button>

      {/* Changelog link for admins (separate, smaller) */}
      {isAdmin && (
        <Link
          href="/changelog"
          title="Admin changelog"
          style={{
            fontSize: 9, color: 'var(--fg-subtle)', textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontWeight: 600,
            letterSpacing: '0.04em', flexShrink: 0,
          }}
        >
          CHANGELOG
        </Link>
      )}

      {/* Support chat — sits next to the InfoHub badge so it's findable
          from every page. The component handles its own logged-out state
          + side panel; we just render the trigger button here. */}
      <SupportChat />

      <WhatsNewPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorRef={badgeRef}
      />

      <style jsx>{`
        .status-bar-version:hover {
          background: linear-gradient(180deg, rgba(255,184,0,0.18) 0%, rgba(255,184,0,0.08) 100%) !important;
          border-color: rgba(255,184,0,0.38) !important;
          transform: translateY(-1px);
          box-shadow: 0 10px 20px -16px rgba(255,184,0,0.85);
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </footer>
  );
}
