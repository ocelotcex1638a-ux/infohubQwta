export default function SkewLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-32 bg-white/[0.06] rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {['BTC', 'ETH', 'SOL'].map(s => (
          <div key={s} className="h-7 w-14 bg-white/[0.06] rounded-full" />
        ))}
      </div>
      <div className="h-64 bg-white/[0.04] rounded-xl border border-white/[0.06] mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="h-3 w-16 bg-white/[0.06] rounded mb-2" />
            <div className="h-6 w-20 bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
