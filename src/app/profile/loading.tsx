export default function ProfileLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-8 w-48 bg-white/[0.06] rounded mb-6" />
      <div className="grid grid-cols-1 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="h-4 w-32 bg-white/[0.06] rounded mb-3" />
            <div className="h-10 w-full bg-white/[0.04] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
