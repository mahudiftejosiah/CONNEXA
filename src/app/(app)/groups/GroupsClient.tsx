"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Users, Lock, Globe, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";
import type { Group, GroupMembership, Profile } from "@/lib/supabase/types";
import toast from "react-hot-toast";
import { pluralize } from "@/lib/utils";
import { useRouter } from "next/navigation";

type MembershipWithGroup = GroupMembership & { group: Group & { owner: Profile } };

interface GroupsClientProps {
  myMemberships: MembershipWithGroup[];
  publicGroups: (Group & { owner: Profile })[];
  currentUserId: string;
}

export function GroupsClient({ myMemberships: initMine, publicGroups: initPublic, currentUserId }: GroupsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"my" | "discover">("my");
  const [mine, setMine] = useState(initMine);
  const [publicGroups, setPublicGroups] = useState(initPublic);
  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", visibility: "public" as "public" | "private" });
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data: group, error } = await supabase.from("groups").insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      visibility: form.visibility,
      owner_id: currentUserId,
    }).select("*, owner:profiles(*)").single();

    if (error || !group) { toast.error("Failed to create group."); setSaving(false); return; }

    // Add owner as member
    await supabase.from("group_memberships").insert({ group_id: group.id, user_id: currentUserId, role: "owner" });

    setSaving(false);
    setCreating(false);
    setForm({ name: "", description: "", visibility: "public" });
    toast.success("Group created!");
    router.push(`/groups/${group.id}`);
  }

  async function handleJoin(groupId: string) {
    setJoiningId(groupId);
    const supabase = createClient();
    const { error } = await supabase.from("group_memberships").insert({ group_id: groupId, user_id: currentUserId, role: "member" });
    setJoiningId(null);
    if (error) { toast.error("Could not join group."); return; }
    const group = publicGroups.find((g) => g.id === groupId);
    if (group) {
      setPublicGroups((p) => p.filter((g) => g.id !== groupId));
      toast.success(`Joined ${group.name}!`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Groups</h1>
        <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>Create</Button>
      </div>

      {/* Tabs */}
      <div className="card flex overflow-hidden">
        {([["my", "My Groups", mine.length], ["discover", "Discover", publicGroups.length]] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${tab === key ? "text-brand-green-800 dark:text-brand-gold-400 border-b-2 border-brand-green-800 dark:border-brand-gold-400" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >
            {label}
            {count > 0 && <span className="text-xs bg-[var(--border)] px-1.5 py-0.5 rounded-full">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "my" && (
        mine.length === 0 ? (
          <EmptyState icon={<Users className="w-8 h-8" />} title="No groups yet" description="Create a group or join existing communities." action={<Button onClick={() => setTab("discover")}>Discover groups</Button>} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mine.map((m) => <GroupCard key={m.group_id} group={m.group} role={m.role} />)}
          </div>
        )
      )}

      {tab === "discover" && (
        publicGroups.length === 0 ? (
          <EmptyState icon={<Globe className="w-8 h-8" />} title="No public groups" description="Be the first to create a community!" action={<Button onClick={() => setCreating(true)}>Create a group</Button>} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {publicGroups.map((g) => (
              <div key={g.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-green-800/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {g.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.image_url} alt={g.name} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-6 h-6 text-brand-green-800 dark:text-brand-gold-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{g.name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{pluralize(g.member_count, "member")}</p>
                    {g.description && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{g.description}</p>}
                  </div>
                </div>
                <Button size="sm" className="w-full mt-3" loading={joiningId === g.id} onClick={() => handleJoin(g.id)}>
                  Join group
                </Button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Create group</h2>
              <button onClick={() => setCreating(false)} className="p-1 rounded-lg hover:bg-[var(--border)]"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <Input label="Group name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={100} required />
              <Textarea label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} maxLength={2000} />
              <div>
                <label className="label">Visibility</label>
                <select value={form.visibility} onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as any }))} className="input">
                  <option value="public">Public — anyone can join</option>
                  <option value="private">Private — invite only</option>
                </select>
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={saving} className="flex-1">Create</Button>
                <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, role }: { group: Group & { owner: Profile }; role: string }) {
  return (
    <Link href={`/groups/${group.id}`} className="card p-4 flex items-start gap-3 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 rounded-xl bg-brand-green-800/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {group.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.image_url} alt={group.name} width={48} height={48} className="object-cover w-full h-full" />
        ) : (
          <Users className="w-6 h-6 text-brand-green-800 dark:text-brand-gold-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[var(--text-primary)] truncate">{group.name}</p>
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-0.5">
          {group.visibility === "private" ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
          <span>{group.visibility}</span>
          <span>·</span>
          <span>{pluralize(group.member_count, "member")}</span>
        </div>
        <span className="text-xs text-brand-green-800 dark:text-brand-gold-400 font-medium capitalize">{role}</span>
      </div>
    </Link>
  );
}
