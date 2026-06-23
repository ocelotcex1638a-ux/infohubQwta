export default function WebhooksLoading() {
  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-7 w-48 bg-white/[0.06] rounded mb-2" />
      <div className="h-4 w-64 bg-white/[0.04] rounded mb-8" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 mb-4">
          <div className="h-5 w-36 bg-white/[0.06] rounded mb-3" />
          <div className="h-3 w-full bg-white/[0.04] rounded mb-2" />
          <div className="h-3 w-4/5 bg-white/[0.04] rounded mb-4" />
          <div className="h-16 bg-white/[0.06] rounded" />
        </div>
      ))}
    </div>
  );
}
