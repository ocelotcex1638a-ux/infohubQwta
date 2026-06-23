'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
export default function OnboardingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[Onboarding] render error:', error); }, [error]);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="w-10 h-10 text-amber-400 mb-4" />
      <h1 className="text-lg font-bold text-white mb-2">Setup failed to load</h1>
      <p className="text-sm text-neutral-400 mb-6 max-w-sm">Something went wrong during setup. Your account is created — just reload to continue.</p>
      <div className="flex gap-3">
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-sm text-white transition-colors">Try again</button>
        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-sm text-emerald-300 transition-colors">Reload page</button>
      </div>
    </main>
  );
}
