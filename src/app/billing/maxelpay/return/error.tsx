'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
export default function BillingReturnError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[BillingReturn] render error:', error); }, [error]);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="w-10 h-10 text-amber-400 mb-4" />
      <h1 className="text-lg font-bold text-white mb-2">Payment confirmation failed to load</h1>
      <p className="text-sm text-neutral-400 mb-2 max-w-sm">If your payment was successful, your subscription will activate within a few minutes. Check your account in /settings.</p>
      <p className="text-xs text-neutral-500 mb-6">Your payment was not lost — this is a display error only.</p>
      <div className="flex gap-3">
        <a href="/settings" className="px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-sm text-white transition-colors">Go to settings</a>
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-sm text-emerald-300 transition-colors">Retry</button>
      </div>
    </main>
  );
}
