export default function ApiKeysLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-7 w-36 bg-white/[0.06] rounded mb-4" />
      <div className="h-10 w-32 bg-white/[0.06] rounded mb-4" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex items-center gap-4">
            <div className="h-3 w-40 bg-white/[0.06] rounded" />
            <div className="h-3 w-20 bg-white/[0.06] rounded" />
            <div className="h-5 w-16 bg-white/[0.06] rounded ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
