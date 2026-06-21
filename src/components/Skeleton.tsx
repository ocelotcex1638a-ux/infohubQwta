'use client';

/**
 * Shimmer skeleton primitives — drop-in loading states.
 *
 * Usage:
 *   <Skeleton />                        — single line, full width
 *   <Skeleton width="w-24" height="h-4" />
 *   <SkeletonBlock height="h-40" />     — card-shaped block
 *   <SkeletonTable rows={5} cols={4} /> — table skeleton
 *   <SkeletonCard />                    — card with text lines
 */

interface SkeletonProps {
  width?: string;
  height?: string;
  rounded?: string;
  className?: string;
}

export function Skeleton({
  width = 'w-full',
  height = 'h-3',
  rounded = 'rounded',
  className = '',
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-white/[0.06] ${width} ${height} ${rounded} ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonBlock({
  height = 'h-32',
  className = '',
}: {
  height?: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse ${height} ${className}`}
      aria-hidden="true"
    />
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = '',
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      <div className="flex gap-3 pb-2 border-b border-white/[0.06]">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="flex-1 h-3 rounded animate-pulse bg-white/[0.06]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 py-1.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className={`flex-1 h-4 rounded animate-pulse bg-white/[0.06] ${c === 0 ? 'max-w-[80px]' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3 ${className}`}
      aria-hidden="true"
    >
      <div className="w-1/3 h-3 rounded animate-pulse bg-white/[0.06]" />
      <div className="w-1/2 h-5 rounded animate-pulse bg-white/[0.06]" />
      <div className="w-full h-3 rounded animate-pulse bg-white/[0.06]" />
      <div className="w-4/5 h-3 rounded animate-pulse bg-white/[0.06]" />
    </div>
  );
}
