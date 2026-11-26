import { NotificationSkeleton } from "@/components/ui/Skeleton";

export default function NotificationsLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
      <div className="h-7 w-36 rounded animate-pulse" style={{ background: "var(--border)" }} />
      <div className="card overflow-hidden divide-y" style={{ borderColor: "var(--border)" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <NotificationSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
