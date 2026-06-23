'use client';
import { useEffect } from 'react';
export default function SpreadsEmbedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[SpreadsEmbed] render error:', error); }, [error]);
  return (
    <div className="flex items-center justify-center h-full min-h-[200px] text-center px-4">
      <div>
        <p className="text-sm text-neutral-400 mb-3">Spread widget failed to load.</p>
        <button onClick={reset} className="px-3 py-1.5 rounded bg-white/[0.08] text-xs text-white hover:bg-white/[0.12] transition-colors">Retry</button>
      </div>
    </div>
  );
}
