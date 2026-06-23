export default function VolSurfaceLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-40 bg-white/[0.06] rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {['BTC', 'ETH', 'SOL'].map(s => (
          <div key={s} className="h-7 w-14 bg-white/[0.06] rounded-full" />
        ))}
      </div>
      <div className="h-80 bg-white/[0.04] rounded-xl border border-white/[0.06]" />
    </div>
  );
}
