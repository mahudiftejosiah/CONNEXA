"use client";

import { useState } from "react";
import { EyeOff, History, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { db, useNames, useRows, Panel, Notice, Stat, usePager, Pager, audit } from "./useRows";
import toast from "react-hot-toast";

type MemoryPost = {
  id: string;
  author_id: string;
  content: string | null;
  created_at: string;
  visibility: "public" | "friends" | "only_me";
  media: { id: string }[];
};

// The same four calendar windows the member-facing Memories page checks, so
// what an administrator reviews here is exactly what a member would be shown.
const WINDOWS = [
  { label: "This day last week", months: 0, days: 7 },
  { label: "One month ago", months: 1, days: 0 },
  { label: "Three months ago", months: 3, days: 0 },
  { label: "A year ago", months: 12, days: 0 },
];

function dayWindow(months: number, days: number) {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  if (months) from.setMonth(from.getMonth() - months);
  if (days) from.setDate(from.getDate() - days);
  const end = new Date(from);
  end.setDate(end.getDate() + 1);
  return { from: from.toISOString(), to: end.toISOString() };
}

const BOUNDS = WINDOWS.map((w) => ({ label: w.label, ...dayWindow(w.months, w.days) }));
const OR = BOUNDS.map((b) => `and(created_at.gte.${b.from},created_at.lt.${b.to})`).join(",");

function windowOf(iso: string): string {
  const found = BOUNDS.find((b) => iso >= b.from && iso < b.to);
  return found ? found.label : "Another day";
}

// Memories are computed from the posts themselves, never copied into a second
// table. So the administrative lever is the post: hiding it here takes it out of
// every feed and out of the memory it would have become, without deleting it.
export function ProMemories({ adminId }: { adminId: string }) {
  const names = useNames();
  const posts = useRows<MemoryPost>("posts", {
    select: "id, author_id, content, created_at, visibility, media:post_media(id)",
    or: OR,
    order: "created_at",
    limit: 300,
  });
  const [search, setSearch] = useState("");
  const [windowFilter, setWindowFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const term = search.trim().toLowerCase();
  const shown = posts.rows.filter((p) =>
    (!windowFilter || windowOf(p.created_at) === windowFilter) &&
    (!term || (p.content ?? "").toLowerCase().includes(term) || (names[p.author_id] ?? "").toLowerCase().includes(term)));
  const paged = usePager(shown, 15);
  const withPhotos = posts.rows.filter((p) => (p.media ?? []).length > 0).length;

  async function hide(p: MemoryPost) {
    setBusy(p.id);
    const { data, error } = await db().from("posts").update({ visibility: "only_me" }).eq("id", p.id).select("id");
    setBusy(null);
    if (error) { toast.error("Could not hide it: " + error.message); return; }
    if (!data?.length) { toast.error("Nothing changed — that post could not be written."); return; }
    posts.set((prev) => prev.map((x) => (x.id === p.id ? { ...x, visibility: "only_me" } : x)));
    void audit(adminId, {
      targetUserId: p.author_id, entityId: p.id, entityType: "post",
      action: "hide_memory_post", reason: `Surfaced in “${windowOf(p.created_at)}”`,
    });
    toast.success("Only its author can see it now.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Posts in a memory window" value={posts.rows.length} />
        <Stat label="Of those, with photos" value={withPhotos} />
        <Stat label="Already private" value={posts.rows.filter((p) => p.visibility === "only_me").length} />
        <Stat label="Windows checked" value={WINDOWS.length} />
      </div>

      <Panel title="Memories oversight"
        hint="Memories are not stored anywhere: the page reads the author's own posts and photos back to the calendar day they were written. These are the posts sitting in those windows right now. Hiding one leaves it readable by its author only, and it stops appearing in feeds and in anyone else's view.">
        <Notice text={posts.error} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input className="input pl-9" placeholder="Search the post text or its author…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </span>
          <select className="input text-sm w-auto" value={windowFilter} onChange={(e) => setWindowFilter(e.target.value)}>
            <option value="">Every window</option>
            {WINDOWS.map((w) => <option key={w.label} value={w.label}>{w.label}</option>)}
          </select>
          <Button size="sm" variant="ghost" onClick={() => void posts.reload()}>Check again</Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-2">
          {BOUNDS.map((b) => (
            <div key={b.label} className="flex items-center gap-2 p-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-main)" }}>
              <History className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--brand-gold-text)" }} />
              <span className="font-semibold">{b.label}</span>
              <span className="ml-auto text-[var(--text-secondary)]">
                {posts.rows.filter((p) => windowOf(p.created_at) === b.label).length} post(s)
              </span>
            </div>
          ))}
        </div>

        {posts.loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : posts.rows.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No post falls in a memory window today. The windows move with the calendar, so this list changes by itself.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Nothing matches that search.</p>
        ) : (
          <div className="space-y-1.5">
            {paged.shown.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg" style={{ backgroundColor: "var(--bg-main)" }}>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm line-clamp-2">{p.content?.trim() || "(a photo post with no words)"}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    @{names[p.author_id] ?? "someone"} · {windowOf(p.created_at)} · {formatRelativeTime(p.created_at)}
                    {(p.media ?? []).length > 0 ? ` · ${p.media.length} photo(s)` : ""}
                    {p.visibility !== "public" ? ` · ${p.visibility}` : ""}
                  </p>
                </div>
                {p.visibility !== "only_me" && (
                  <Button size="sm" variant="ghost" loading={busy === p.id} icon={<EyeOff className="w-3.5 h-3.5" />} onClick={() => void hide(p)}>
                    Hide from feeds
                  </Button>
                )}
              </div>
            ))}
            <Pager page={paged.page} pages={paged.pages} total={paged.total} goTo={paged.goTo} singular="post" />
          </div>
        )}
      </Panel>
    </div>
  );
}