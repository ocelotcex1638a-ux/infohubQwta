export default function PricingLoading() {
  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-8 w-48 bg-white/[0.06] rounded mb-2 mx-auto" />
      <div className="h-4 w-64 bg-white/[0.04] rounded mb-8 mx-auto" />
      <div className="flex justify-center gap-2 mb-8">
        <div className="h-8 w-24 bg-white/[0.06] rounded-full" />
        <div className="h-8 w-24 bg-white/[0.04] rounded-full" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="h-4 w-16 bg-white/[0.06] rounded mb-3" />
            <div className="h-8 w-20 bg-white/[0.04] rounded mb-4" />
            <div className="space-y-2">
              {[...Array(5)].map((_, j) => (
                <div key={j} className="h-3 w-full bg-white/[0.04] rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
