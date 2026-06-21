'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DISMISSED_KEY = 'ih-wheel-float-v1';

export default function LuckyWheelFloat() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISSED_KEY)) setVisible(true);
    } catch {}
  }, []);

  function dismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch {}
    setVisible(false);
  }

  if (!visible || pathname === '/wheel') return null;

  return (
    <div className="fixed bottom-5 left-5 z-50 flex items-center gap-1.5">
      <Link
        href="/wheel"
        className="flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm text-black shadow-lg hover:opacity-90 active:scale-95 transition-all"
        style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
      >
        <span aria-hidden>🎡</span>
        Spin to Win
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss wheel button"
        className="w-6 h-6 flex items-center justify-center rounded-full bg-hub-secondary border border-hub-border text-hub-text-muted hover:text-white transition-colors text-sm leading-none"
      >
        ×
      </button>
    </div>
  );
}
