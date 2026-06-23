export default function WhaleLiqLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-44 bg-white/[0.06] rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-7 w-16 bg-white/[0.06] rounded-full" />
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="h-10 bg-white/[0.04] border-b border-white/[0.06]" />
        {[...Array(18)].map((_, i) => (
          <div key={i} className="h-10 border-b border-white/[0.04] flex items-center px-4 gap-4">
            <div className="h-3 w-16 bg-white/[0.06] rounded" />
            <div className="h-3 w-20 bg-white/[0.06] rounded" />
            <div className="h-3 w-24 bg-white/[0.06] rounded" />
            <div className="h-5 w-16 bg-red-500/20 rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
