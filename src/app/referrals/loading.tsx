export default function ReferralsLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-10 animate-pulse">
      <div className="h-10 w-72 bg-white/[0.06] rounded mb-3 mx-auto" />
      <div className="h-4 w-96 bg-white/[0.04] rounded mb-10 mx-auto" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="h-8 w-8 rounded-lg bg-white/[0.06] mb-3" />
            <div className="h-4 w-24 bg-white/[0.06] rounded mb-2" />
            <div className="h-3 w-full bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 mb-6">
        <div className="h-5 w-40 bg-white/[0.06] rounded mb-4" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-3 w-full bg-white/[0.04] rounded mb-2" />
        ))}
      </div>
    </div>
  );
}
