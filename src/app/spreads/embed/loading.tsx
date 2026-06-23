export default function SpreadsEmbedLoading() {
  return (
    <div className="flex items-center justify-center min-h-[300px] animate-pulse">
      <div className="w-full max-w-xl px-4">
        <div className="h-6 w-48 bg-white/[0.06] rounded mb-4 mx-auto" />
        <div className="h-48 bg-white/[0.04] rounded-xl" />
      </div>
    </div>
  );
}
