export default function WheelLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center animate-pulse">
      <div className="h-64 w-64 rounded-full bg-white/[0.04] border border-white/[0.06] mb-6" />
      <div className="h-6 w-32 bg-white/[0.06] rounded mb-3" />
      <div className="h-4 w-48 bg-white/[0.04] rounded" />
    </div>
  );
}
