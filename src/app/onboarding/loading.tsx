export default function OnboardingLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 animate-pulse">
      <div className="h-8 w-32 bg-white/[0.06] rounded mb-8" />
      <div className="h-6 w-64 bg-white/[0.06] rounded mb-3" />
      <div className="h-4 w-48 bg-white/[0.04] rounded mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-[600px]">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 h-24" />
        ))}
      </div>
    </div>
  );
}
