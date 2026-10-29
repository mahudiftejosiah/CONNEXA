"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, Users, FileText, AlertTriangle, CheckCircle, XCircle, Ban, UserCog } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ContentReport, ModerationAction } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { formatRelativeTime } from "@/lib/utils";

interface AdminClientProps {
  users: Profile[];
  pendingReports: (ContentReport & { reporter: Profile })[];
  recentActions: (ModerationAction & { admin: Profile })[];
  stats: { totalUsers: number; totalPosts: number; pendingReports: number };
  currentAdminId: string;
}

type Tab = "overview" | "users" | "reports" | "actions";

export function AdminClient({ users, pendingReports: initReports, recentActions, stats, currentAdminId }: AdminClientProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [reports, setReports] = useState(initReports);
  const [actioningId, setActioningId] = useState<string | null>(null);

  async function handleReport(reportId: string, status: "resolved" | "dismissed") {
    setActioningId(reportId);
    const supabase = createClient();
    await supabase.from("content_reports").update({ status, reviewed_by: currentAdminId }).eq("id", reportId);
    setReports((p) => p.filter((r) => r.id !== reportId));
    setActioningId(null);
    toast.success(`Report ${status}.`);
  }

  async function handleBanUser(userId: string, username: string) {
    const supabase = createClient();
    await supabase.from("moderation_actions").insert({
      admin_id: currentAdminId,
      target_user_id: userId,
      action: "ban_user",
      reason: "Admin action",
    });
    toast.success(`User @${username} flagged. Implement auth ban via Supabase dashboard.`);
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: <Shield className="w-4 h-4" /> },
    { key: "users",    label: "Users",    icon: <Users className="w-4 h-4" />, badge: stats.totalUsers },
    { key: "reports",  label: "Reports",  icon: <AlertTriangle className="w-4 h-4" />, badge: stats.pendingReports },
    { key: "actions",  label: "Audit Log",icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-brand-green-800 flex items-center justify-center">
          <Shield className="w-4 h-4 text-brand-gold-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Admin Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="card flex overflow-hidden">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${tab === t.key ? "text-brand-green-800 dark:text-brand-gold-400 border-b-2 border-brand-green-800 dark:border-brand-gold-400" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
            {t.icon} {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className="badge text-[10px] min-w-[1.1rem] h-[1.1rem]">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: "Total Users", value: stats.totalUsers, icon: <Users className="w-6 h-6" />, color: "text-blue-500" },
              { label: "Total Posts", value: stats.totalPosts, icon: <FileText className="w-6 h-6" />, color: "text-green-500" },
              { label: "Pending Reports", value: stats.pendingReports, icon: <AlertTriangle className="w-6 h-6" />, color: "text-red-500" },
            ].map((stat) => (
              <div key={stat.label} className="card p-5">
                <div className={`${stat.color} mb-2`}>{stat.icon}</div>
                <p className="text-3xl font-extrabold text-[var(--text-primary)]">{stat.value}</p>
                <p className="text-sm text-[var(--text-secondary)]">{stat.label}</p>
              </div>
            ))}
          </div>
          <div className="card p-5">
            <h3 className="font-semibold mb-3">Recent moderation actions</h3>
            {recentActions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No recent actions.</p>
            ) : (
              <div className="space-y-2">
                {recentActions.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <Avatar src={a.admin.avatar_url} name={a.admin.display_name} size={28} />
                    <span className="font-medium">{a.admin.display_name}</span>
                    <span className="text-[var(--text-secondary)]">·</span>
                    <span className="font-mono text-xs bg-[var(--border)] px-2 py-0.5 rounded">{a.action}</span>
                    <span className="text-[var(--text-secondary)] text-xs ml-auto">{formatRelativeTime(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-[var(--border)]">
            <p className="text-sm text-[var(--text-secondary)]">Showing most recent {users.length} users</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar src={u.avatar_url} name={u.display_name} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{u.display_name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">@{u.username} · {formatRelativeTime(u.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {u.is_admin && <span className="text-xs bg-brand-gold-400/20 text-brand-green-800 dark:text-brand-gold-400 px-2 py-0.5 rounded font-medium">Admin</span>}
                  <Link href={`/admin/users/${u.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold text-brand-green-800 dark:text-brand-gold-400 hover:bg-[var(--border)] transition-colors">
                    <UserCog className="w-3.5 h-3.5" /> Manage
                  </Link>
                  {u.id !== currentAdminId && (
                    <Button size="sm" variant="ghost" icon={<Ban className="w-3.5 h-3.5 text-red-500" />}
                      onClick={() => handleBanUser(u.id, u.username)}>
                      Ban
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div className="card p-8 text-center">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="font-semibold text-[var(--text-primary)]">All clear!</p>
              <p className="text-sm text-[var(--text-secondary)]">No pending reports.</p>
            </div>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono bg-[var(--border)] px-2 py-0.5 rounded">{r.entity_type}</span>
                      <span className="text-xs text-[var(--text-secondary)]">{formatRelativeTime(r.created_at)}</span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Reason: {r.reason}</p>
                    {r.details && <p className="text-sm text-[var(--text-secondary)] mt-1">{r.details}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Avatar src={r.reporter.avatar_url} name={r.reporter.display_name} size={20} />
                      <span className="text-xs text-[var(--text-secondary)]">Reported by @{r.reporter.username}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" loading={actioningId === r.id} onClick={() => handleReport(r.id, "resolved")}
                      icon={<CheckCircle className="w-3.5 h-3.5" />}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" loading={actioningId === r.id} onClick={() => handleReport(r.id, "dismissed")}
                      icon={<XCircle className="w-3.5 h-3.5" />}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "actions" && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {recentActions.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] p-6 text-center">No actions recorded.</p>
            ) : (
              recentActions.map((a) => (
                <div key={a.id} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <Avatar src={a.admin.avatar_url} name={a.admin.display_name} size={32} />
                  <div className="flex-1">
                    <p><span className="font-semibold">{a.admin.display_name}</span> performed <span className="font-mono text-xs">{a.action}</span></p>
                    {a.reason && <p className="text-xs text-[var(--text-secondary)]">{a.reason}</p>}
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">{formatRelativeTime(a.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
