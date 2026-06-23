export default function SignalsLoading() {
  return (
    <div className="min-h-screen bg-hub-black">
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-36 bg-white/[0.06] rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-white/[0.06] rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-32 bg-hub-darker border border-hub-subtle rounded-xl animate-pulse" />
          ))}
        </div>
      </main>
    </div>
  );
}
