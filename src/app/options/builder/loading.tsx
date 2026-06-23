export default function OptionsBuilderLoading() {
  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 animate-pulse">
      <div className="h-7 w-48 bg-white/[0.06] rounded mb-4" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i}>
              <div className="h-3 w-20 bg-white/[0.06] rounded mb-1.5" />
              <div className="h-9 w-full bg-white/[0.04] rounded-lg border border-white/[0.06]" />
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 h-64 bg-white/[0.04] rounded-xl border border-white/[0.06]" />
      </div>
    </div>
  );
}
