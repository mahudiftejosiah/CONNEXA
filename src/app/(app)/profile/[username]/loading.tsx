import { ProfileSkeleton, PostSkeleton } from "@/components/ui/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <ProfileSkeleton />
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}
