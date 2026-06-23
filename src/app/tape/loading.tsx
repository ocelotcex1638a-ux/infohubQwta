export default function TapeLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-32 bg-white/[0.06] rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {['BTC', 'ETH', 'SOL', 'ALL'].map(s => (
          <div key={s} className="h-7 w-14 bg-white/[0.06] rounded-full" />
        ))}
      </div>
      <div className="space-y-1">
        {[...Array(25)].map((_, i) => (
          <div key={i} className="h-9 rounded border border-white/[0.04] flex items-center px-3 gap-3">
            <div className="h-2.5 w-16 bg-white/[0.06] rounded" />
            <div className="h-2.5 w-12 bg-white/[0.06] rounded" />
            <div className="h-2.5 w-20 bg-white/[0.04] rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
