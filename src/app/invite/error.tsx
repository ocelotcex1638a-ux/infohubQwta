'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
export default function InviteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[Invite] render error:', error); }, [error]);
  return (
    <main className="max-w-[700px] mx-auto px-4 sm:px-6 py-20 flex flex-col items-center justify-center text-center">
      <AlertTriangle className="w-10 h-10 text-amber-400 mb-4" />
      <h1 className="text-lg font-bold text-white mb-2">Failed to load invite page</h1>
      <p className="text-sm text-neutral-400 mb-6 max-w-sm">The referral invite page could not be loaded.</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-sm text-emerald-300 transition-colors">Reload page</button>
    </main>
  );
}
