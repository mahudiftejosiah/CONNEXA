"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, Users, FileText, AlertTriangle, CheckCircle, XCircle, Ban, UserCog, Palette, Gamepad2, Plus, Trash2, ExternalLink } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ContentReport, ModerationAction, SiteContent, ExternalGame } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { formatRelativeTime } from "@/lib/utils";

interface AdminClientProps {
  users: Profile[];
  pendingReports: (ContentReport & { reporter: Profile })[];
  recentActions: (ModerationAction & { admin: Profile })[];
  stats: { totalUsers: number; totalPosts: number; pendingReports: number };
  currentAdminId: string;
  siteContent: SiteContent[];
  externalGames: ExternalGame[];
  globalTheme: string;
}

type Tab = "overview" | "users" | "reports" | "actions" | "content" | "appearance" | "games";

const THEME_CHOICES = [
  { key: "connexa", label: "Connexa (green/gold)", a: "#12372A", b: "#D6B875" },
  { key: "crimson", label: "Crimson (red)", a: "#B1161C", b: "#F97066" },
  { key: "ocean", label: "Ocean (blue)", a: "#03557A", b: "#67C3EC" },
  { key: "violet", label: "Violet (purple)", a: "#290776", b: "#B7A5F7" },
  { key: "amber", label: "Amber (orange)", a: "#7A4103", b: "#F5C242" },
];

const CONTENT_KEYS: { key: string; label: string }[] = [
  { key: "terms",   label: "Terms of Service" },
  { key: "rules",   label: "Community Rules" },
  { key: "privacy", label: "Privacy Policy" },
  { key: "about",   label: "About CONNEXA" },
];

export function AdminClient({ users, pendingReports: initReports, recentActions, stats, currentAdminId, siteContent: initContent, externalGames: initGames, globalTheme: initTheme }: AdminClientProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [reports, setReports] = useState(initReports);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const [contentRows, setContentRows] = useState(initContent);
  const [editingKey, setEditingKey] = useState<string>("terms");
  const [games, setGames] = useState(initGames);
  const [globalTheme, setGlobalTheme] = useState(initTheme);
  const [savingContent, setSavingContent] = useState(false);
  const [savingGame, setSavingGame] = useState(false);
  const [newGame, setNewGame] = useState({ title: "", description: "", play_url: "", cover_url: "" });

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

  async function saveSiteContent() {
    const row = contentRows.find((c) => c.key === editingKey);
    if (!row) return;
    setSavingContent(true);
    const supabase = createClient();
    const { error } = await supabase.from("site_content").upsert(
      { key: row.key, title: row.title, body: row.body },
      { onConflict: "key" }
    );
    setSavingContent(false);
    if (error) toast.error("Save failed: " + error.message);
    else toast.success("Page content updated.");
  }

  async function saveGlobalTheme(theme: string) {
    setGlobalTheme(theme);
    const supabase = createClient();
    const { error } = await supabase.from("site_settings").upsert({ key: "global_theme", value: theme }, { onConflict: "key" });
    if (error) toast.error("Could not save theme.");
    else toast.success("Site theme updated — live for visitors using site default.");
  }

  async function addExternalGame() {
    if (!newGame.title.trim() || !/^https?:\/\//.test(newGame.play_url.trim())) {
      toast.error("Title and a valid http(s) play link are required.");
      return;
    }
    setSavingGame(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("external_games").insert({
      title: newGame.title.trim(),
      description: newGame.description.trim() || null,
      play_url: newGame.play_url.trim(),
      cover_url: newGame.cover_url.trim() || null,
      created_by: currentAdminId,
    }).select().single();
    setSavingGame(false);
    if (error || !data) { toast.error("Could not add game: " + (error?.message || "")); return; }
    setGames((p) => [data, ...p]);
    setNewGame({ title: "", description: "", play_url: "", cover_url: "" });
    toast.success("Game added to the Games tab.");
  }

  async function removeExternalGame(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("external_games").delete().eq("id", id);
    if (error) { toast.error("Delete failed."); return; }
    setGames((p) => p.filter((g) => g.id !== id));
    toast.success("Game removed.");
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "overview",   label: "Overview",  icon: <Shield className="w-4 h-4" /> },
    { key: "users",      label: "Users",     icon: <Users className="w-4 h-4" />, badge: stats.totalUsers },
    { key: "reports",    label: "Reports",   icon: <AlertTriangle className="w-4 h-4" />, badge: stats.pendingReports },
    { key: "actions",    label: "Audit Log", icon: <FileText className="w-4 h-4" /> },
    { key: "content",    label: "Content",   icon: <FileText className="w-4 h-4" /> },
    { key: "appearance", label: "Theme",     icon: <Palette className="w-4 h-4" /> },
    { key: "games",      label: "Games",     icon: <Gamepad2 className="w-4 h-4" /> },
  ];

  const editingRow = contentRows.find((c) => c.key === editingKey);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-brand-green-800 flex items-center justify-center">
          <Shield className="w-4 h-4 text-brand-gold-400" />
        </div>
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Admin Dashboard</h1>
      </div>

      {/* Tabs */}
      <div className="card flex overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 min-w-[5.5rem] py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${tab === t.key ? "text-brand-green-800 dark:text-brand-gold-400 border-b-2 border-brand-green-800 dark:border-brand-gold-400" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
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

      {tab === "content" && (
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Page content</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-3">These texts appear in Settings → Info & legal and on the public pages. Edits save instantly for everyone.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CONTENT_KEYS.map((c) => (
                <button key={c.key} onClick={() => setEditingKey(c.key)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${editingKey === c.key ? "bg-brand-green-800 text-white" : "bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {editingRow ? (
            <div className="space-y-3">
              <div>
                <label className="label">Title</label>
                <input className="input" value={editingRow.title}
                  onChange={(e) => setContentRows((p) => p.map((c) => c.key === editingKey ? { ...c, title: e.target.value } : c))} />
              </div>
              <div>
                <label className="label">Body</label>
                <textarea className="input min-h-[300px] font-mono text-xs leading-relaxed" value={editingRow.body}
                  onChange={(e) => setContentRows((p) => p.map((c) => c.key === editingKey ? { ...c, body: e.target.value } : c))} />
              </div>
              <Button onClick={saveSiteContent} loading={savingContent} icon={<CheckCircle className="w-4 h-4" />}>Save changes</Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">This page was not seeded yet. Run migration 009 in Supabase to create the default texts.</p>
          )}
        </div>
      )}

      {tab === "appearance" && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold">Site theme</h3>
          <p className="text-sm text-[var(--text-secondary)]">The default theme every visitor sees. Users who pick their own theme in Settings → Appearance keep theirs.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {THEME_CHOICES.map((t) => (
              <button key={t.key} onClick={() => saveGlobalTheme(t.key)}
                className={`card p-3 text-left transition-all ${globalTheme === t.key ? "ring-2 ring-brand-green-600" : "hover:ring-1 hover:ring-[var(--border)]"}`}>
                <span className="flex items-center gap-1.5 mb-2">
                  <span className="w-6 h-6 rounded-lg" style={{ backgroundColor: t.a }} />
                  <span className="w-6 h-6 rounded-lg" style={{ backgroundColor: t.b }} />
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">{t.label}</span>
                {globalTheme === t.key && <span className="block text-xs text-green-600 mt-1">Active</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "games" && (
        <div className="space-y-4">
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold">Add an external game</h3>
            <p className="text-sm text-[var(--text-secondary)]">Paste any playable web game link — it appears as a card on the Games tab.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input className="input" placeholder="Game title *" value={newGame.title}
                onChange={(e) => setNewGame((p) => ({ ...p, title: e.target.value }))} />
              <input className="input" placeholder="Play link (https://…) *" value={newGame.play_url}
                onChange={(e) => setNewGame((p) => ({ ...p, play_url: e.target.value }))} />
            </div>
            <input className="input" placeholder="Cover / thumbnail image link (optional)" value={newGame.cover_url}
              onChange={(e) => setNewGame((p) => ({ ...p, cover_url: e.target.value }))} />
            <input className="input" placeholder="Short description (optional)" value={newGame.description}
              onChange={(e) => setNewGame((p) => ({ ...p, description: e.target.value }))} />
            <Button onClick={addExternalGame} loading={savingGame} icon={<Plus className="w-4 h-4" />}>Add game</Button>
          </div>
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-[var(--border)]">
              <p className="text-sm font-semibold">Linked games ({games.length})</p>
            </div>
            {games.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)] p-6 text-center">No external games yet.</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {games.map((g) => (
                  <div key={g.id} className="flex items-center gap-3 px-4 py-3">
                    {g.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.cover_url} alt={g.title} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[var(--border)] flex items-center justify-center flex-shrink-0">
                        <Gamepad2 className="w-5 h-5 text-[var(--text-secondary)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{g.title}</p>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{g.play_url}</p>
                    </div>
                    <a href={g.play_url} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-xl text-brand-green-800 dark:text-brand-gold-400 hover:bg-[var(--border)]" aria-label={`Open ${g.title}`}>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={() => removeExternalGame(g.id)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
