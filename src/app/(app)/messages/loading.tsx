import { MessageSkeleton } from "@/components/ui/Skeleton";

export default function MessagesLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 pt-6">
      <div className="card overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="h-6 w-28 rounded animate-pulse" style={{ background: "var(--border)" }} />
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <MessageSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
