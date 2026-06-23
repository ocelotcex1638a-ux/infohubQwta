export default function PositionCopyFormLoading() {
  return (
    <div className="max-w-[600px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-6 w-48 bg-white/[0.06] rounded mb-6" />
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="h-3 w-20 bg-white/[0.06] rounded mb-1.5" />
            <div className="h-9 w-full bg-white/[0.04] rounded-lg border border-white/[0.06]" />
          </div>
        ))}
        <div className="h-9 w-full bg-emerald-500/10 rounded-lg" />
      </div>
    </div>
  );
}
