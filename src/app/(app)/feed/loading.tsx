import { PostSkeleton } from "@/components/ui/Skeleton";

export default function FeedLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      {/* Stories tray skeleton */}
      <div className="card p-4 flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="w-14 h-14 rounded-full animate-pulse" style={{ background: "var(--border)" }} />
            <div className="w-10 h-2 rounded animate-pulse" style={{ background: "var(--border)" }} />
          </div>
        ))}
      </div>
      {/* Create post skeleton */}
      <div className="card p-4">
        <div className="flex gap-3 items-center">
          <div className="w-11 h-11 rounded-full animate-pulse" style={{ background: "var(--border)" }} />
          <div className="flex-1 h-10 rounded-xl animate-pulse" style={{ background: "var(--border)" }} />
        </div>
      </div>
      <PostSkeleton />
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}
