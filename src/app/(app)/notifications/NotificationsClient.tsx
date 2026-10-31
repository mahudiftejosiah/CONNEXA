"use client";

import Link from "next/link";
import { Bell, Heart, UserPlus, MessageCircle, Users, UserCheck, Swords } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { NotificationWithActor } from "@/lib/supabase/types";

interface NotificationsClientProps {
  notifications: NotificationWithActor[];
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

export function NotificationsClient({ notifications }: NotificationsClientProps) {
  if (notifications.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Notifications</h1>
        <EmptyState icon={<Bell className="w-8 h-8" />} title="No notifications" description="You're all caught up! Notifications will appear here." />
      </div>
    );
  }

  // Group by date
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  const groups: { label: string; items: NotificationWithActor[] }[] = [];
  const todayItems = notifications.filter((n) => new Date(n.created_at).toDateString() === today);
  const yesterdayItems = notifications.filter((n) => new Date(n.created_at).toDateString() === yesterday);
  const olderItems = notifications.filter((n) => {
    const d = new Date(n.created_at).toDateString();
    return d !== today && d !== yesterday;
  });

  if (todayItems.length) groups.push({ label: "Today", items: todayItems });
  if (yesterdayItems.length) groups.push({ label: "Yesterday", items: yesterdayItems });
  if (olderItems.length) groups.push({ label: "Earlier", items: olderItems });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Notifications</h1>

      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-2 px-1">{group.label}</h2>
          <div className="card overflow-hidden divide-y divide-[var(--border)]">
            {group.items.map((n) => (
              <Link
                key={n.id}
                href={getNotificationLink(n)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors",
                  !n.is_read && "bg-brand-green-800/5 dark:bg-brand-gold-400/5"
                )}
              >
                <div className="relative flex-shrink-0">
                  {n.actor ? (
                    <Avatar src={n.actor.avatar_url} name={n.actor.display_name} size={40} />
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
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
