"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Shield, Bell, User, Trash2, LogOut, Eye, Palette,
  FileText, Users, BookOpen, Info, ChevronRight, Heart,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/Modal";
import { toggleBlock } from "@/lib/actions/friends";
import { updatePreferences, requestAccountDeletion } from "@/lib/actions/profile";
import type { Profile, UserPreferences, UserBlock, SiteContent } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type BlockWithProfile = UserBlock & { blocked: Profile };

interface SettingsClientProps {
  profile: Profile;
  preferences: UserPreferences | null;
  blockedUsers: BlockWithProfile[];
  email: string;
  siteContent: Record<string, SiteContent>;
}

type Section = "account" | "notifications" | "privacy" | "appearance" | "blocked" | "terms" | "rules" | "privacy_policy" | "about" | "credits" | "danger";

export function SettingsClient({ profile, preferences: initPrefs, blockedUsers: initBlocked, email, siteContent }: SettingsClientProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [section, setSection] = useState<Section>("account");
  const [blocked, setBlocked] = useState(initBlocked);
  const defaultPrefs = {
    notify_friend_requests: true,
    notify_reactions: true,
    notify_comments: true,
    notify_messages: true,
    notify_group_activity: true,
    default_post_visibility: "public" as "public" | "friends" | "only_me",
    theme: "system" as "light" | "dark" | "system",
  };
  const [prefs, setPrefs] = useState({
    ...defaultPrefs,
    ...(initPrefs
      ? {
          notify_friend_requests: initPrefs.notify_friend_requests,
          notify_reactions: initPrefs.notify_reactions,
          notify_comments: initPrefs.notify_comments,
          notify_messages: initPrefs.notify_messages,
          notify_group_activity: initPrefs.notify_group_activity,
          default_post_visibility: initPrefs.default_post_visibility as "public" | "friends" | "only_me",
          theme: initPrefs.theme as "light" | "dark" | "system",
        }
      : {}),
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const mainNav: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: "account",       label: "Account",         icon: <User className="w-4 h-4" /> },
    { key: "notifications", label: "Notifications",   icon: <Bell className="w-4 h-4" /> },
    { key: "privacy",       label: "Privacy",         icon: <Eye className="w-4 h-4" /> },
    { key: "appearance",    label: "Appearance",      icon: <Palette className="w-4 h-4" /> },
    { key: "blocked",       label: "Blocked users",   icon: <Shield className="w-4 h-4" /> },
    { key: "danger",        label: "Danger zone",     icon: <Trash2 className="w-4 h-4 text-red-500" /> },
  ];
  const infoNav: { key: Section; label: string; icon: React.ReactNode; contentKey: string }[] = [
    { key: "terms",          label: "Terms of Service", icon: <FileText className="w-4 h-4" />,    contentKey: "terms" },
    { key: "rules",          label: "Community Rules",  icon: <Users className="w-4 h-4" />,        contentKey: "rules" },
    { key: "privacy_policy", label: "Privacy Policy",   icon: <BookOpen className="w-4 h-4" />,     contentKey: "privacy" },
    { key: "about",          label: "About CONNEXA",    icon: <Info className="w-4 h-4" />,         contentKey: "about" },
    { key: "credits",        label: "Credits",          icon: <Heart className="w-4 h-4" />,        contentKey: "credits" },
  ];

  async function handleSavePrefs(extra?: Record<string, string>) {
    setSavingPrefs(true);
    const fd = new FormData();
    Object.entries(prefs).forEach(([k, v]) => fd.set(k, String(v)));
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    const res = await updatePreferences(fd);
    setSavingPrefs(false);
    if (res.error) toast.error(res.error);
    else {
      toast.success("Preferences saved!");
      router.refresh();
    }
  }

  async function handleUnblock(userId: string) {
    const res = await toggleBlock(userId);
    if (res.error) { toast.error(res.error); return; }
    setBlocked((p) => p.filter((b) => b.blocked_id !== userId));
    toast.success("User unblocked.");
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    const res = await requestAccountDeletion();
    if (res.error) { toast.error(res.error); setDeletingAccount(false); return; }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  function renderContent(contentKey: string, fallbackTitle: string) {
    const c = siteContent[contentKey];
    return (
      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg text-[var(--text-primary)]">{c?.title || fallbackTitle}</h2>
        {c ? (
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{c.body}</div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">Content coming soon.</p>
        )}
        {c && (
          <p className="text-xs text-[var(--text-secondary)]">Last updated {new Date(c.updated_at).toLocaleDateString()}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Settings</h1>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Sidebar nav */}
        <nav className="md:w-60 flex-shrink-0">
          <div className="card p-2 space-y-0.5">
            {mainNav.map((item) => (
              <button key={item.key} onClick={() => setSection(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${section === item.key ? "bg-[rgb(var(--a-800)/0.1)] text-[rgb(var(--a-800))] dark:text-[rgb(var(--b-400))]" : "text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>
                {item.icon} {item.label}
              </button>
            ))}
          </div>
          <div className="card p-2 mt-3 space-y-0.5">
            <p className="px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Info & legal</p>
            {infoNav.map((item) => (
              <button key={item.key} onClick={() => setSection(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${section === item.key ? "bg-[rgb(var(--a-800)/0.1)] text-[rgb(var(--a-800))] dark:text-[rgb(var(--b-400))]" : "text-[var(--text-secondary)] hover:bg-[var(--border)]"}`}>
                {item.icon} <span className="flex-1 text-left">{item.label}</span>
                <ChevronRight className="w-3.5 h-3.5 opacity-50" />
              </button>
            ))}
          </div>
          <div className="card p-2 mt-3">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <LogOut className="w-4 h-4" /> Log out
            </button>
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1">
          {section === "account" && (
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-lg text-[var(--text-primary)]">Account</h2>
              <div className="flex items-center gap-4 p-4 bg-[var(--bg)] rounded-xl">
                <Avatar src={profile.avatar_url} name={profile.display_name} size={56} userId={profile.id} />
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">{profile.display_name}</p>
                  <p className="text-sm text-[var(--text-secondary)]">@{profile.username}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{email}</p>
                </div>
              </div>
              <Link href="/settings/profile" className="btn-primary inline-flex items-center gap-2">
                <User className="w-4 h-4" /> Edit profile
              </Link>
            </div>
          )}

          {section === "notifications" && (
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-lg text-[var(--text-primary)]">Notifications</h2>
              {[
                { key: "notify_friend_requests" as const, label: "Friend requests" },
                { key: "notify_reactions" as const,        label: "Reactions to my posts" },
                { key: "notify_comments" as const,         label: "Comments on my posts" },
                { key: "notify_messages" as const,         label: "New messages" },
                { key: "notify_group_activity" as const,   label: "Group activity" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-4 py-1">
                  <span className="text-sm text-[var(--text-primary)]">{label}</span>
                  <button type="button" aria-pressed={prefs[key]}
                    className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${prefs[key] ? "bg-[rgb(var(--a-800))]" : "bg-[var(--border)]"}`}
                    onClick={() => setPrefs((p) => ({ ...p, [key]: !p[key] }))}>
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs[key] ? "translate-x-4" : ""}`} />
                  </button>
                </div>
              ))}
              <Button onClick={() => handleSavePrefs()} loading={savingPrefs}>Save</Button>
            </div>
          )}

          {section === "privacy" && (
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-lg text-[var(--text-primary)]">Privacy</h2>
              <div>
                <label className="label">Default post visibility</label>
                <select className="input" value={prefs.default_post_visibility}
                  onChange={(e) => setPrefs((p) => ({ ...p, default_post_visibility: e.target.value as "public" | "friends" | "only_me" }))}>
                  <option value="public">Public — anyone can see my posts</option>
                  <option value="friends">Friends only</option>
                  <option value="only_me">Only me</option>
                </select>
              </div>
              <div>
                <label className="label">Profile visibility</label>
                <p className="text-sm text-[var(--text-secondary)] mb-2">Change in <Link href="/settings/profile" className="text-[rgb(var(--a-800))] dark:text-[rgb(var(--b-400))] hover:underline">Edit Profile</Link>.</p>
              </div>
              <Button onClick={() => handleSavePrefs()} loading={savingPrefs}>Save</Button>
            </div>
          )}

          {section === "appearance" && (
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-lg text-[var(--text-primary)]">Appearance</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                CONNEXA keeps one colour scheme for everyone, set under Admin → Appearance. Here you only choose
                whether the site reads light or dark to you.
              </p>
              <div>
                <label className="label">Mode</label>
                <div className="flex gap-2">
                  {(["light", "dark", "system"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => { setPrefs((p) => ({ ...p, theme: m })); setTheme(m); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${prefs.theme === m ? "bg-[rgb(var(--a-800))] text-white" : "bg-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                      {m}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-2">Use the sun/moon toggle in the header to switch instantly.</p>
              </div>
              <Button onClick={() => handleSavePrefs()} loading={savingPrefs}>Save</Button>
            </div>
          )}

          {section === "blocked" && (
            <div className="card p-6 space-y-4">
              <h2 className="font-bold text-lg text-[var(--text-primary)]">Blocked Users</h2>
              {blocked.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">You haven&apos;t blocked anyone.</p>
              ) : (
                <div className="space-y-3">
                  {blocked.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 p-3 bg-[var(--bg)] rounded-xl">
                      <Avatar src={b.blocked.avatar_url} name={b.blocked.display_name} size={40} userId={b.blocked.id} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{b.blocked.display_name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">@{b.blocked.username}</p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleUnblock(b.blocked_id)}>Unblock</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "terms"          && renderContent("terms", "Terms of Service")}
          {section === "rules"          && renderContent("rules", "Community Rules")}
          {section === "privacy_policy" && renderContent("privacy", "Privacy Policy")}
          {section === "about"          && renderContent("about", "About CONNEXA")}
          {section === "credits"        && renderContent("credits", "Credits")}

          {section === "danger" && (
            <div className="card p-6 space-y-4 border border-red-200 dark:border-red-800">
              <h2 className="font-bold text-lg text-red-600">Danger Zone</h2>
              <p className="text-sm text-[var(--text-secondary)]">These actions are irreversible. Please proceed with caution.</p>
              <div className="p-4 border border-red-200 dark:border-red-800 rounded-xl">
                <h3 className="font-semibold text-red-600 mb-1">Delete Account</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Request deletion of your account and all associated data. This process may take up to 30 days.
                </p>
                <Button variant="danger" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmDelete(true)}>
                  Request account deletion
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDeleteAccount}
        title="Delete your account"
        message="This will request deletion of your account and all data. You will be signed out immediately. This action cannot be undone."
        confirmLabel="Yes, delete my account"
        danger
        loading={deletingAccount}
      />
    </div>
  );
}
