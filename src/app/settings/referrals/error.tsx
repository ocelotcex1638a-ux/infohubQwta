'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
export default function ReferralSettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[ReferralSettings] render error:', error); }, [error]);
  return (
    <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-20 flex flex-col items-center justify-center text-center">
      <AlertTriangle className="w-10 h-10 text-amber-400 mb-4" />
      <h1 className="text-lg font-bold text-white mb-2">Failed to load referral dashboard</h1>
      <p className="text-sm text-neutral-400 mb-6 max-w-sm">Could not load your referral stats. Your referral code and commissions are safe.</p>
      <div className="flex gap-3">
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-sm text-white transition-colors">Try again</button>
        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-sm text-emerald-300 transition-colors">Reload page</button>
      </div>
    </main>
  );
}
