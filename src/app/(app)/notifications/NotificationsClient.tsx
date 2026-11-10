"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Heart, UserPlus, MessageCircle, Users, UserCheck, Swords, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { NotificationWithActor } from "@/lib/supabase/types";
import toast from "react-hot-toast";

interface NotificationsClientProps {
  notifications: NotificationWithActor[];
  currentUserId: string;
}

const icons: Record<string, React.ReactNode> = {
  friend_request:  <UserPlus className="w-4 h-4 text-brand-green-800 dark:text-brand-gold-400" />,
  friend_accepted: <UserCheck className="w-4 h-4 text-green-500" />,
  new_follower:    <Users className="w-4 h-4 text-blue-500" />,
  post_reaction:   <Heart className="w-4 h-4 text-red-500" />,
  post_comment:    <MessageCircle className="w-4 h-4 text-brand-green-800 dark:text-brand-gold-400" />,
  comment_reply:   <MessageCircle className="w-4 h-4 text-purple-500" />,
  new_message:     <MessageCircle className="w-4 h-4 text-indigo-500" />,
  group_invite:    <Users className="w-4 h-4 text-orange-500" />,
  game_request:    <Swords className="w-4 h-4 text-brand-green-800 dark:text-brand-gold-400" />,
};

function getNotificationLink(n: NotificationWithActor): string {
  switch (n.type) {
    case "friend_request":
    case "friend_accepted": return `/profile/${n.actor?.username}`;
    case "new_follower":    return `/profile/${n.actor?.username}`;
    case "post_reaction":
    case "post_comment":    return n.entity_id ? `/feed#${n.entity_id}` : "/feed";
    case "new_message":     return "/messages";
    case "group_invite":    return n.entity_id ? `/groups/${n.entity_id}` : "/groups";
    case "game_request":    return n.entity_id ? `/games/live/${n.entity_id}` : "/games";
    default:                return "/feed";
  }
}

export function NotificationsClient({ notifications, currentUserId }: NotificationsClientProps) {
  const [items, setItems] = useState(notifications);
  const [askClear, setAskClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  // The row is gone for good, so the header badge has to be told immediately.
  function refreshBadge() {
    window.dispatchEvent(new Event("connexa-unread-refresh"));
  }

  async function removeOne(id: string) {
    const { error } = await createClient().from("notifications").delete().eq("id", id);
    if (error) { toast.error("Could not delete that one."); return; }
    setItems((p) => p.filter((n) => n.id !== id));
    refreshBadge();
  }

  async function clearAll() {
    setClearing(true);
    const { error } = await createClient()
      .from("notifications")
      .delete()
      .eq("user_id", currentUserId);
    setClearing(false);
    setAskClear(false);
    if (error) { toast.error("Could not clear your notifications."); return; }
    setItems([]);
    refreshBadge();
    toast.success("Notifications cleared.");
  }

  // Group by date
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const groups: { label: string; items: NotificationWithActor[] }[] = [];
  const todayItems = items.filter((n) => new Date(n.created_at).toDateString() === today);
  const yesterdayItems = items.filter((n) => new Date(n.created_at).toDateString() === yesterday);
  const olderItems = items.filter((n) => {
    const d = new Date(n.created_at).toDateString();
    return d !== today && d !== yesterday;
  });

  if (todayItems.length) groups.push({ label: "Today", items: todayItems });
  if (yesterdayItems.length) groups.push({ label: "Yesterday", items: yesterdayItems });
  if (olderItems.length) groups.push({ label: "Earlier", items: olderItems });

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Notifications</h1>
        <EmptyState icon={<Bell className="w-8 h-8" />} title="No notifications" description="You're all caught up! Notifications will appear here." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Notifications</h1>
        <button
          type="button"
          onClick={() => setAskClear(true)}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors"
          style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear all
        </button>
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2 px-1">{group.label}</h2>
          <div className="card overflow-hidden divide-y divide-[var(--border)]">
            {group.items.map((n) => (
              <div key={n.id} className="flex items-start">
                <Link
                  href={getNotificationLink(n)}
                  className={cn(
                    "flex-1 min-w-0 flex items-start gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors",
                    !n.is_read && "bg-brand-green-800/5 dark:bg-brand-gold-400/5"
                  )}
                >
                  <div className="relative flex-shrink-0">
                    {n.actor ? (
                      <Avatar src={n.actor.avatar_url} name={n.actor.display_name} size={40} userId={n.actor.id} />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-brand-green-800/10 flex items-center justify-center">
                        <Bell className="w-5 h-5 text-brand-green-800 dark:text-brand-gold-400" />
                      </div>
                    )}
                    {icons[n.type] && (
                      <span className="absolute -bottom-0.5 -right-0.5 bg-[var(--bg-card)] rounded-full p-0.5">
                        {icons[n.type]}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] leading-snug">{n.message}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{formatRelativeTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-brand-green-800 dark:bg-brand-gold-400 flex-shrink-0 mt-2" />
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => void removeOne(n.id)}
                  aria-label="Delete this notification"
                  className="p-3 self-center text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={askClear}
        onClose={() => setAskClear(false)}
        onConfirm={() => void clearAll()}
        title="Clear all notifications"
        message="Every notification in this list is deleted for you. Anything new that happens afterwards still arrives as usual."
        confirmLabel="Clear all"
        danger
        loading={clearing}
      />
    </div>
  );
}
