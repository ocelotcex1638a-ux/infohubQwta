export default function CarryToolLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-40 bg-white/[0.06] rounded mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-white/[0.06] rounded mb-1.5" />
              <div className="h-9 w-full bg-white/[0.04] rounded-lg border border-white/[0.06]" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="h-4 w-28 bg-white/[0.06] rounded mb-4" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex justify-between mb-3">
              <div className="h-3 w-24 bg-white/[0.06] rounded" />
              <div className="h-3 w-16 bg-white/[0.04] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
