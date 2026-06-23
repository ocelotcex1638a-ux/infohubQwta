export default function ConnectionsLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-7 w-52 bg-white/[0.06] rounded mb-4" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4">
            <div className="h-8 w-8 bg-white/[0.06] rounded-full shrink-0" />
            <div>
              <div className="h-3 w-24 bg-white/[0.06] rounded mb-1.5" />
              <div className="h-2.5 w-36 bg-white/[0.04] rounded" />
            </div>
            <div className="h-7 w-20 bg-white/[0.06] rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
