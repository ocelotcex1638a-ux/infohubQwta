export default function StatusLoading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-8 w-56 bg-white/[0.06] rounded mb-2 mx-auto" />
      <div className="h-4 w-40 bg-white/[0.04] rounded mb-8 mx-auto" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="h-3 w-24 bg-white/[0.06] rounded mb-3" />
            <div className="h-6 w-20 bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="h-10 bg-white/[0.04] border-b border-white/[0.06]" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 border-b border-white/[0.04] flex items-center px-4 gap-4">
            <div className="h-2 w-2 rounded-full bg-white/[0.06]" />
            <div className="h-3 w-32 bg-white/[0.06] rounded" />
            <div className="h-3 w-20 bg-white/[0.04] rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
