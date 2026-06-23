export default function PolymarketLoading() {
  return (
    <div className="min-h-screen bg-hub-black">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-52 bg-white/[0.06] rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="h-9 w-28 bg-white/[0.06] rounded-lg animate-pulse" />
            <div className="h-9 w-24 bg-white/[0.06] rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="bg-hub-darker border border-hub-subtle rounded-xl overflow-hidden">
          <div className="h-12 bg-white/[0.06] border-b border-hub-subtle" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-16 border-b border-hub-subtle flex items-center px-4 gap-4">
              <div className="h-4 w-64 bg-white/[0.06] rounded animate-pulse" />
              <div className="flex-1" />
              <div className="h-4 w-16 bg-white/[0.06] rounded animate-pulse" />
              <div className="h-4 w-16 bg-white/[0.06] rounded animate-pulse" />
              <div className="h-6 w-20 bg-green-500/10 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
