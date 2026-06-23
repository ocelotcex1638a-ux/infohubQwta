export default function DeveloperDocsLoading() {
  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 animate-pulse">
      <div className="h-7 w-40 bg-white/[0.06] rounded mb-6" />
      <div className="flex gap-6">
        <div className="w-48 shrink-0 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 bg-white/[0.04] rounded" />
          ))}
        </div>
        <div className="flex-1 space-y-3">
          <div className="h-6 w-56 bg-white/[0.06] rounded" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-3 w-full bg-white/[0.04] rounded" />
          ))}
          <div className="h-24 bg-white/[0.04] rounded mt-4" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-3 w-5/6 bg-white/[0.04] rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
