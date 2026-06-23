export default function TodayLoading() {
  return (
    <div className="min-h-screen bg-hub-black">
      <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-6">
        <div className="h-9 w-56 bg-white/[0.06] rounded-lg animate-pulse mb-2" />
        <div className="h-4 w-80 bg-white/[0.06] rounded animate-pulse mb-8" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-hub-darker border border-hub-subtle rounded-xl animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-hub-darker border border-hub-subtle rounded-xl p-4 mb-4 animate-pulse">
            <div className="h-5 w-32 bg-white/[0.06] rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-white/[0.06] rounded" />
              <div className="h-4 w-4/5 bg-white/[0.06] rounded" />
              <div className="h-4 w-3/5 bg-white/[0.06] rounded" />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
