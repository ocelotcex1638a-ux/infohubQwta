'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
export default function AffiliatesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[Admin/Affiliates] render error:', error); }, [error]);
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <AlertTriangle className="w-8 h-8 text-amber-400 mb-3" />
      <p className="text-sm font-semibold text-white mb-1">Failed to load affiliates panel</p>
      <p className="text-xs text-neutral-400 mb-4">An error occurred loading affiliate data.</p>
      <div className="flex gap-2">
        <button onClick={reset} className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-xs text-white transition-colors">Try again</button>
        <button onClick={() => window.location.reload()} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-xs text-emerald-300 transition-colors">Reload</button>
      </div>
    </div>
  );
}
