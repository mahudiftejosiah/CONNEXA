"use client";

import { useState } from "react";
import { Award, CheckCircle, Eye, Plus, Save, Search, ShieldCheck, Store, Tags, Trash2, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { uploadProMedia } from "@/lib/actions/pro";
import { db, useNames, useRows, Field, Panel, Notice, Stat, Switch, usePager, Pager, audit } from "./useRows";
import toast from "react-hot-toast";

type Badge = {
  id: string; name: string; description: string; icon_path: string | null;
  condition_key: string; threshold: number; active: boolean; created_at: string;
};
type UserBadge = { id: string; user_id: string; badge_id: string; awarded_at: string };

type Listing = {
  id: string; owner_id: string; kind: "product" | "service"; title: string; description: string | null;
  price: number | null; currency: string; category: string | null; image_paths: string[];
  status: "pending" | "approved" | "rejected" | "removed"; contact: string | null; created_at: string;
};

// These eight keys are exactly what the database accepts, and each one is
// counted from real activity by user_activity_counts() (migration 031).
const CONDITIONS: { key: string; label: string }[] = [
  { key: "posts", label: "Posts published" },
  { key: "comments", label: "Comments written" },
  { key: "reactions_received", label: "Reactions received" },
  { key: "friends", label: "Friends" },
  { key: "followers", label: "Followers" },
  { key: "stories", label: "Stories posted" },
  { key: "events", label: "Events hosted" },
  { key: "quizzes_taken", label: "Quiz battles played" },
];

function iconUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  return db().storage.from("pro-media").getPublicUrl(path).data.publicUrl;
}

function matches(haystack: string, term: string) {
  const t = term.trim().toLowerCase();
  return !t || haystack.toLowerCase().includes(t);
}

export function ProBadges({ adminId }: { adminId: string }) {
  const names = useNames();
  const badges = useRows<Badge>("badges", { order: "created_at" });
  const awarded = useRows<UserBadge>("user_badges", { order: "awarded_at" });
  const [form, setForm] = useState({ name: "", description: "", condition_key: "posts", threshold: "10" });
  const [icon, setIcon] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [assign, setAssign] = useState<{ badgeId: string; username: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Badge | null>(null);
  const [draftIcon, setDraftIcon] = useState<string>("");

  const holders = (badgeId: string) => awarded.rows.filter((a) => a.badge_id === badgeId);
  const shown = badges.rows.filter((b) => matches(b.name + " " + b.description + " " + b.condition_key, search));
  const paged = usePager(shown, 10);

  async function pickIcon(file: File | null, onDone: (path: string) => void) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("folder", "badges");
    const result = await uploadProMedia(fd);
    setUploading(false);
    if ("error" in result) { toast.error(result.error); return; }
    onDone(result.path);
    toast.success("Badge icon uploaded.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Badges defined" value={badges.rows.length} />
        <Stat label="Active" value={badges.rows.filter((b) => b.active).length} />
        <Stat label="Times awarded" value={awarded.rows.length} />
        <Stat label="Members holding one" value={new Set(awarded.rows.map((a) => a.user_id)).size} />
      </div>

      <Panel title="Create an achievement badge"
        hint="A badge is a rule, not a picture: the condition is counted from real activity, and PRO members earn it the moment the number passes the threshold.">
        <Notice text={badges.error} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name *"><input className="input" placeholder="First Hundred Likes" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Threshold *"><input className="input" inputMode="numeric" value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label="Condition">
            <select className="input" value={form.condition_key} onChange={(e) => setForm({ ...form, condition_key: e.target.value })}>
              {CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
            <Award className="w-4 h-4" />
            <span>{uploading ? "Uploading…" : icon ? "Icon uploaded" : "Badge icon from your device"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void pickIcon(e.target.files?.[0] ?? null, setIcon); e.target.value = ""; }} />
          </label>
          {icon && iconUrl(icon) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl(icon)!} alt="" className="w-9 h-9 rounded-full object-cover" />
          )}
          <Button icon={<Plus className="w-4 h-4" />} onClick={async () => {
            const threshold = Number(form.threshold);
            if (form.name.trim().length < 2) { toast.error("Name the badge."); return; }
            if (!(threshold >= 1)) { toast.error("The threshold must be at least 1."); return; }
            const { data, error } = await db().from("badges").insert({
              name: form.name.trim(),
              description: form.description.trim(),
              condition_key: form.condition_key,
              threshold,
              icon_path: icon || null,
            }).select().single();
            if (error || !data) {
              toast.error(error?.code === "23505" ? "A badge with that name already exists." : "Could not create: " + (error?.message ?? "paste migration 031"));
              return;
            }
            badges.set((p) => [data as Badge, ...p]);
            void audit(adminId, { entityId: (data as Badge).id, entityType: "badge", action: "create_badge", reason: `${form.condition_key} ≥ ${threshold}` });
            setForm({ name: "", description: "", condition_key: "posts", threshold: "10" });
            setIcon("");
            toast.success("Badge created. It awards itself from now on.");
          }}>Create badge</Button>
        </div>
      </Panel>

      <Panel title="Badges and distribution" hint="Distribution comes from the award records themselves. Switching a badge off hides it from every profile without deleting who earned it.">
        <span className="relative block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input className="input pl-9" placeholder="Search badges…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </span>
        {badges.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No badges yet — or paste migration 031 for the eight starters.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No badge matches that search.</p>
        ) : (
          <div className="space-y-2">
            {paged.shown.map((b) => {
              const list = holders(b.id);
              return (
                <div key={b.id} className="p-3 rounded-xl space-y-2" style={{ backgroundColor: "var(--bg-main)" }}>
                  <div className="flex flex-wrap items-center gap-3">
                    {b.icon_path && iconUrl(b.icon_path) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={iconUrl(b.icon_path)!} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--border)" }}>
                        <ShieldCheck className="w-4 h-4 text-[var(--text-secondary)]" />
                      </span>
                    )}
                    <div className="flex-1 min-w-[10rem]">
                      <p className="font-semibold text-sm">{b.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {CONDITIONS.find((c) => c.key === b.condition_key)?.label ?? b.condition_key} ≥ {b.threshold} · {list.length} holder(s)
                      </p>
                      {b.description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{b.description}</p>}
                    </div>
                    <Switch on={b.active} label={b.name} onChange={async (v) => {
                      setBusy(b.id);
                      const { data, error } = await db().from("badges").update({ active: v }).eq("id", b.id).select("id");
                      setBusy(null);
                      if (error) { toast.error("Could not change that."); return; }
                      if (!data?.length) { toast.error("Nothing changed."); return; }
                      badges.set((p) => p.map((x) => (x.id === b.id ? { ...x, active: v } : x)));
                      void audit(adminId, { entityId: b.id, entityType: "badge", action: v ? "activate_badge" : "deactivate_badge" });
                    }} />
                    <Button size="sm" variant="ghost" onClick={() => { setDraft({ ...b }); setDraftIcon(""); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAssign({ badgeId: b.id, username: "" })}>Assign…</Button>
                    <Button size="sm" variant="ghost" loading={busy === b.id} icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                      onClick={async () => {
                        if (!confirm(`Delete “${b.name}”? ${holders(b.id).length} member(s) will lose it from their profile.`)) return;
                        if (await badges.drop("id", b.id)) {
                          awarded.set((p) => p.filter((a) => a.badge_id !== b.id));
                          void audit(adminId, { entityId: b.id, entityType: "badge", action: "delete_badge", reason: `${list.length} awards removed with it` });
                          toast.success("Badge deleted.");
                        }
                      }}>
                      Delete
                    </Button>
                  </div>
                  {list.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {list.slice(0, 20).map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 text-xs pl-1 pr-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-card)" }}>
                          <Avatar src={null} name={names[a.user_id] ?? "?"} size={16} />
                          @{names[a.user_id] ?? "member"}
                          <button type="button" aria-label={`Revoke ${b.name}`} className="hover:opacity-70"
                            onClick={async () => {
                              const { data, error } = await db().from("user_badges").delete().eq("id", a.id).select("id");
                              if (error) { toast.error("Only an admin can revoke a badge."); return; }
                              if (!data?.length) { toast.error("That award record is already gone."); return; }
                              awarded.set((p) => p.filter((x) => x.id !== a.id));
                              void audit(adminId, { targetUserId: a.user_id, entityId: b.id, entityType: "badge", action: "revoke_badge", reason: b.name });
                              toast.success(`${b.name} revoked from @${names[a.user_id] ?? "member"}.`);
                            }}>
                            <XCircle className="w-3 h-3 text-[var(--text-secondary)]" />
                          </button>
                        </span>
                      ))}
                      {list.length > 20 && <span className="text-xs text-[var(--text-secondary)]">+{list.length - 20} more</span>}
                    </div>
                  )}
                  {assign?.badgeId === b.id && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input className="input text-sm flex-1 min-w-[10rem]" placeholder="username to award" value={assign.username}
                        onChange={(e) => setAssign({ badgeId: b.id, username: e.target.value })} />
                      <Button size="sm" onClick={async () => {
                        const name = assign.username.trim().replace(/^@/, "");
                        if (!name) return;
                        const { data: people } = await db().from("profiles").select("id, username").ilike("username", name).limit(1);
                        const person = (people ?? [])[0] as { id: string; username: string } | undefined;
                        if (!person) { toast.error("No account with that username."); return; }
                        const { data, error } = await db().from("user_badges").insert({ user_id: person.id, badge_id: b.id }).select().single();
                        if (error || !data) { toast.error(error?.code === "23505" ? `@${person.username} already holds it.` : "Could not award it."); return; }
                        awarded.set((p) => [data as UserBadge, ...p]);
                        void audit(adminId, { targetUserId: person.id, entityId: b.id, entityType: "badge", action: "award_badge", reason: `${b.name} awarded by hand` });
                        setAssign(null);
                        toast.success(`${b.name} awarded to @${person.username}.`);
                      }}>Award</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAssign(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              );
            })}
            <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="badge" />
          </div>
        )}
      </Panel>

      {draft && (
        <Panel title={`Edit “${draft.name}”`} hint="Changing the rule does not take badges away from people who already earned them; it only changes who earns it next.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name *"><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="Threshold *"><input className="input" inputMode="numeric" value={String(draft.threshold)}
              onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value.replace(/\D/g, "") || 0) })} /></Field>
            <Field label="Condition">
              <select className="input" value={draft.condition_key} onChange={(e) => setDraft({ ...draft, condition_key: e.target.value })}>
                {CONDITIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Description"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm cursor-pointer"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--bg-card)" }}>
              <Award className="w-4 h-4" />
              <span>{uploading ? "Uploading…" : draftIcon ? "New icon uploaded" : "Replace icon"}</span>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => { void pickIcon(e.target.files?.[0] ?? null, (path) => { setDraftIcon(path); setDraft((d) => (d ? { ...d, icon_path: path } : d)); }); e.target.value = ""; }} />
            </label>
            {draft.icon_path && iconUrl(draft.icon_path) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={iconUrl(draft.icon_path)!} alt="" className="w-9 h-9 rounded-full object-cover" />
            )}
          </div>
          <div className="flex gap-2">
            <Button loading={busy === draft.id} icon={<Save className="w-4 h-4" />} onClick={async () => {
              if (draft.name.trim().length < 2) { toast.error("Name the badge."); return; }
              if (!(draft.threshold >= 1)) { toast.error("The threshold must be at least 1."); return; }
              setBusy(draft.id);
              const { data, error } = await db().from("badges").update({
                name: draft.name.trim(), description: draft.description,
                condition_key: draft.condition_key, threshold: draft.threshold, icon_path: draft.icon_path,
              }).eq("id", draft.id).select().single();
              setBusy(null);
              if (error || !data) {
                toast.error(error?.code === "23505" ? "Another badge already uses that name." : "Nothing was saved: " + (error?.message ?? "no row came back"));
                return;
              }
              badges.set((p) => p.map((x) => (x.id === draft.id ? (data as Badge) : x)));
              void audit(adminId, { entityId: draft.id, entityType: "badge", action: "edit_badge" });
              setDraft(null);
              setDraftIcon("");
              toast.success("Badge updated.");
            }}>Save badge</Button>
            <Button variant="ghost" onClick={() => { setDraft(null); setDraftIcon(""); }}>Cancel</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function ProMarketplace({ adminId }: { adminId: string }) {
  const names = useNames();
  const listings = useRows<Listing>("listings", { order: "created_at" });
  const [filter, setFilter] = useState<Listing["status"] | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [categoryEdit, setCategoryEdit] = useState<{ id: string; value: string } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [photos, setPhotos] = useState<string | null>(null);
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null);

  const categories = Array.from(new Set(listings.rows.map((l) => l.category).filter((c): c is string => !!c))).sort();
  const shown = listings.rows.filter((l) =>
    (filter === "all" || l.status === filter) &&
    (!categoryFilter || l.category === categoryFilter) &&
    matches(l.title + " " + (l.description ?? "") + " " + (l.category ?? "") + " " + (names[l.owner_id] ?? ""), search));
  const paged = usePager(shown, 10);

  async function decide(l: Listing, status: "approved" | "rejected" | "removed", category?: string | null) {
    setBusy(l.id);
    const { data, error } = await db().from("listings").update({
      status, reviewed_by: adminId, reviewed_at: new Date().toISOString(),
      ...(category === undefined ? {} : { category }),
    }).eq("id", l.id).select("id");
    setBusy(null);
    if (error) { toast.error("Could not decide: " + error.message); return; }
    if (!data?.length) { toast.error("Nothing changed — that listing could not be written."); return; }
    listings.set((p) => p.map((x) => (x.id === l.id ? { ...x, status, ...(category === undefined ? {} : { category }) } : x)));
    void audit(adminId, { targetUserId: l.owner_id, entityId: l.id, entityType: "listing", action: `listing_${status}`, reason: l.title });
    toast.success(status === "approved" ? "Listed in the Marketplace." : status === "rejected" ? "Rejected — the seller sees why it is not live." : "Taken down.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Listings" value={listings.rows.length} />
        <Stat label="Waiting for review" value={listings.rows.filter((l) => l.status === "pending").length} />
        <Stat label="Approved" value={listings.rows.filter((l) => l.status === "approved").length} />
        <Stat label="Categories" value={categories.length} />
      </div>

      <Panel title="Marketplace review"
        hint="Nothing reaches the Marketplace board until it is approved here. Open the photos to see exactly what the seller uploaded before you decide. A buyer’s report on a listing lands in the same Reports queue as everything else.">
        <Notice text={listings.error} />
        <div className="flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "removed", "all"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium capitalize transition-colors ${filter === s ? "bg-brand-green-800 text-white" : "bg-[var(--border)] text-[var(--text-secondary)]"}`}>
              {s} ({s === "all" ? listings.rows.length : listings.rows.filter((l) => l.status === s).length})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="Search title, seller or description…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
          <select className="input text-sm w-auto" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {listings.rows.length === 0 ? "No listings yet." : "Nothing matches that filter."}
          </p>
        ) : (
          <div className="space-y-2">
            {paged.shown.map((l) => {
              const images = (l.image_paths ?? []).map((p) => iconUrl(p)).filter((u): u is string => !!u);
              return (
                <div key={l.id} className="flex flex-wrap items-start gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-main)" }}>
                  {images.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--border)" }}>
                      <Store className="w-4 h-4 text-[var(--text-secondary)]" />
                    </span>
                  )}
                  <div className="flex-1 min-w-[12rem]">
                    <p className="font-semibold text-sm">{l.title}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      @{names[l.owner_id] ?? "seller"} · {l.kind}
                      {l.category ? ` · ${l.category}` : ""}
                      {l.price != null ? ` · ${l.currency} ${Number(l.price).toLocaleString()}` : ""}
                      {" · "}{formatRelativeTime(l.created_at)}
                    </p>
                    {l.description && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{l.description}</p>}
                    {l.contact && <p className="text-xs mt-1 font-mono">{l.contact}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {images.length > 0 && (
                      <Button size="sm" variant="ghost" icon={<Eye className="w-3.5 h-3.5" />} onClick={() => setPhotos(photos === l.id ? null : l.id)}>
                        {photos === l.id ? "Hide photos" : `Photos (${images.length})`}
                      </Button>
                    )}
                    {l.status !== "approved" && (
                      <Button size="sm" loading={busy === l.id} icon={<CheckCircle className="w-3.5 h-3.5" />}
                        onClick={() => void decide(l, "approved", categoryEdit?.id === l.id ? (categoryEdit.value.trim() || null) : undefined)}>
                        Approve
                      </Button>
                    )}
                    {l.status === "pending" && (
                      <Button size="sm" variant="ghost" loading={busy === l.id} icon={<XCircle className="w-3.5 h-3.5" />} onClick={() => void decide(l, "rejected")}>Reject</Button>
                    )}
                    {l.status !== "removed" && l.status !== "rejected" && (
                      <Button size="sm" variant="ghost" loading={busy === l.id} onClick={() => void decide(l, "removed")}>Take down</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setCategoryEdit({ id: l.id, value: l.category || "" })}>Category…</Button>
                  </div>
                  {photos === l.id && images.length > 0 && (
                    <div className="w-full flex flex-wrap gap-2">
                      {images.map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt={`${l.title} photo ${i + 1}`} className="w-32 h-32 rounded-lg object-cover" style={{ backgroundColor: "var(--bg-card)" }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {categoryEdit?.id === l.id && (
                    <div className="flex w-full items-center gap-2">
                      <input className="input text-sm flex-1" placeholder="category label" value={categoryEdit.value}
                        onChange={(e) => setCategoryEdit({ id: l.id, value: e.target.value })} />
                      <Button size="sm" onClick={async () => {
                        const value = categoryEdit.value.trim() || null;
                        const { data, error } = await db().from("listings").update({ category: value }).eq("id", l.id).select("id");
                        if (error) { toast.error("Could not save the category."); return; }
                        if (!data?.length) { toast.error("Nothing changed."); return; }
                        listings.set((p) => p.map((x) => (x.id === l.id ? { ...x, category: value } : x)));
                        void audit(adminId, { entityId: l.id, entityType: "listing", action: "set_listing_category", reason: value ?? "cleared" });
                        setCategoryEdit(null);
                        toast.success(value ? `Filed under ${value}.` : "Category cleared.");
                      }}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setCategoryEdit(null)}>Cancel</Button>
                    </div>
                  )}
                </div>
              );
            })}
            <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="listing" />
          </div>
        )}
      </Panel>

      <Panel title="Marketplace categories"
        hint="Categories are the labels sellers typed, counted from the listings themselves. Renaming one here relabels every listing filed under it in a single write.">
        {categories.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No listing carries a category yet.</p>
        ) : (
          <div className="space-y-1.5">
            {categories.map((c) => {
              const count = listings.rows.filter((l) => l.category === c).length;
              return (
                <div key={c} className="flex flex-wrap items-center gap-2 p-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-main)" }}>
                  <Tags className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
                  <span className="font-semibold">{c}</span>
                  <span className="text-xs text-[var(--text-secondary)]">{count} listing(s)</span>
                  <span className="flex-1" />
                  {rename?.from === c ? (
                    <>
                      <input className="input text-sm flex-1 min-w-[8rem]" value={rename.to} autoFocus
                        onChange={(e) => setRename({ from: c, to: e.target.value })} />
                      <Button size="sm" loading={busy === `cat-${c}`} onClick={async () => {
                        const to = rename.to.trim();
                        if (to.length < 2) { toast.error("Write the new category label."); return; }
                        if (to === c) { setRename(null); return; }
                        setBusy(`cat-${c}`);
                        const { data, error } = await db().from("listings").update({ category: to }).eq("category", c).select("id");
                        setBusy(null);
                        if (error) { toast.error("Could not rename: " + error.message); return; }
                        const moved = data?.length ?? 0;
                        if (moved === 0) { toast.error("No listing was relabelled."); return; }
                        listings.set((p) => p.map((x) => (x.category === c ? { ...x, category: to } : x)));
                        void audit(adminId, { entityType: "listing_category", action: "rename_category", reason: `${c} → ${to} (${moved} listings)` });
                        setRename(null);
                        toast.success(`${moved} listing(s) now filed under ${to}.`);
                      }}>Apply to {count}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRename(null)}>Cancel</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setRename({ from: c, to: c })}>Rename…</Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}