export default function FriendsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <div className="h-7 w-24 rounded animate-pulse" style={{ background: "var(--border)" }} />
      <div className="card h-12 animate-pulse" style={{ background: "var(--border)" }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full animate-pulse flex-shrink-0" style={{ background: "var(--border)" }} />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded animate-pulse" style={{ background: "var(--border)" }} />
              <div className="h-3 w-20 rounded animate-pulse" style={{ background: "var(--border)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
