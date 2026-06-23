export default function EtfCounterfactualLoading() {
  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-56 bg-white/[0.06] rounded mb-4" />
      <div className="h-64 bg-white/[0.04] rounded-xl border border-white/[0.06] mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="h-3 w-20 bg-white/[0.06] rounded mb-2" />
            <div className="h-6 w-24 bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
