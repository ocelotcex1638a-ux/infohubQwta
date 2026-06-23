export default function DashboardWidgetsLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-48 bg-white/[0.06] rounded mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 aspect-square">
            <div className="h-3 w-20 bg-white/[0.06] rounded mb-3" />
            <div className="h-8 w-28 bg-white/[0.04] rounded mb-2" />
            <div className="h-2 w-full bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
