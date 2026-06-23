export default function ToolsLoading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-8 w-40 bg-white/[0.06] rounded mb-2" />
      <div className="h-4 w-64 bg-white/[0.04] rounded mb-8" />
      <div className="flex gap-2 mb-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-24 bg-white/[0.06] rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="h-4 w-32 bg-white/[0.06] rounded mb-2" />
            <div className="h-3 w-full bg-white/[0.04] rounded mb-1" />
            <div className="h-3 w-4/5 bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
