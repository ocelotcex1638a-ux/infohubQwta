export default function AccountLoading() {
  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-8 w-44 bg-white/[0.06] rounded mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="h-3 w-20 bg-white/[0.06] rounded mb-2" />
            <div className="h-6 w-16 bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="h-4 w-32 bg-white/[0.06] rounded mb-3" />
            <div className="h-8 w-full bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
