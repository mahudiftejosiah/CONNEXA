import { PostSkeleton } from "@/components/ui/Skeleton";

export default function SavedLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <div className="h-7 w-32 rounded animate-pulse" style={{ background: "var(--border)" }} />
      <PostSkeleton />
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}
