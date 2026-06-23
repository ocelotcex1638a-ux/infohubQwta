export default function DevelopersLoading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-8 w-48 bg-white/[0.06] rounded mb-2" />
      <div className="h-4 w-72 bg-white/[0.04] rounded mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="h-5 w-32 bg-white/[0.06] rounded mb-3" />
            <div className="h-3 w-full bg-white/[0.04] rounded mb-2" />
            <div className="h-3 w-4/5 bg-white/[0.04] rounded mb-4" />
            <div className="h-8 w-24 bg-white/[0.06] rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="h-5 w-40 bg-white/[0.06] rounded mb-4" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-3 w-full bg-white/[0.04] rounded mb-2" />
        ))}
      </div>
    </div>
  );
}
