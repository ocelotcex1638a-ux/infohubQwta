export default function ScalperLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-36 bg-white/[0.06] rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-7 w-16 bg-white/[0.06] rounded-full" />
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="h-10 bg-white/[0.04] border-b border-white/[0.06]" />
        {[...Array(20)].map((_, i) => (
          <div key={i} className="h-9 border-b border-white/[0.04] flex items-center px-4 gap-4">
            <div className="h-3 w-16 bg-white/[0.06] rounded" />
            <div className="h-3 w-20 bg-white/[0.06] rounded" />
            <div className="h-3 w-14 bg-white/[0.06] rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
