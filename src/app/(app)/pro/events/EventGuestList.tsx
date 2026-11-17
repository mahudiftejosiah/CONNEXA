"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { inviteToEvent, listEventInvitees, withdrawEventInvite } from "@/lib/actions/pro";
import { ProDataNote } from "@/components/pro/ProDataNote";
import { Skeleton } from "@/components/ui/Skeleton";

type Friend = { id: string; name: string; username: string };
type Invitee = { id: string; userId: string; name: string; username: string; status: string };

const MAX_PICKED = 50;

export function EventGuestList({ eventId, currentUserId }: { eventId: string; currentUserId: string }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // A friendship row may point either way, so both columns are matched.
    const { data: links, error: linkError } = await supabase.from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    if (linkError) {
      setError("Your friends list could not be read.");
      setFriends([]);
      setLoading(false);
      return;
    }

    const ids = Array.from(new Set((links ?? []).map((r) => (r.user_id === currentUserId ? r.friend_id : r.user_id))));
    const people = ids.length
      ? (await supabase.from("profiles").select("id, username, display_name").in("id", ids).order("display_name")).data ?? []
      : [];
    setFriends(people.map((p) => ({ id: p.id, name: p.display_name || p.username, username: p.username })));

    const res = await listEventInvitees(eventId);
    if ("error" in res) { setError(res.error); setInvitees([]); }
    else { setError(null); setInvitees(res.invitees); }
    setLoading(false);
  }, [eventId, currentUserId]);

  useEffect(() => { void load(); }, [load]);

  const invited = new Set(invitees.map((i) => i.userId));
  const term = search.trim().toLowerCase();
  const shown = friends.filter((f) => !term || f.name.toLowerCase().includes(term) || f.username.toLowerCase().includes(term));

  function toggle(id: string) {
    setPicked((list) => {
      if (list.includes(id)) return list.filter((x) => x !== id);
      return list.length >= MAX_PICKED ? list : list.concat(id);
    });
  }

  async function send() {
    if (!picked.length) return;
    setSending(true);
    const res = await inviteToEvent(eventId, picked);
    setSending(false);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(res.message);
    setPicked([]);
    setSearch("");
    await load();
  }

  async function withdraw(inviteId: string) {
    setBusy(inviteId);
    const res = await withdrawEventInvite(inviteId);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    setInvitees((list) => list.filter((i) => i.id !== inviteId));
  }

  if (loading) {
    return (
      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--border)" }}>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }

  if (error) return <ProDataNote tone="warn">{error}</ProDataNote>;

  return (
    <div className="rounded-xl border p-3 space-y-3 min-w-0" style={{ borderColor: "var(--border)" }}>
      <div className="space-y-2">
        <p className="text-sm font-bold inline-flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
          <UserPlus className="w-4 h-4" style={{ color: "var(--brand-gold)" }} /> Invite people
        </p>

        {friends.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            You have no friends on CONNEXA yet. Add some from the Friends page and they can be invited here.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-secondary)" }} />
              <input className="input pl-9" placeholder="Search your friends" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <ul className="max-h-56 overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
              {shown.length === 0 && (
                <li className="text-sm px-1 py-2" style={{ color: "var(--text-secondary)" }}>Nobody matches that search.</li>
              )}
              {shown.map((f) => {
                const held = invited.has(f.id);
                const on = picked.includes(f.id);
                return (
                  <li key={f.id}>
                    <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer min-w-0"
                      style={{ background: on ? "rgb(var(--a-800) / 0.08)" : "transparent" }}>
                      <input type="checkbox" className="flex-shrink-0" checked={on} disabled={held}
                        onChange={() => toggle(f.id)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{f.name}</span>
                        <span className="block text-xs truncate" style={{ color: "var(--text-secondary)" }}>@{f.username}</span>
                      </span>
                      {held && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                          Invited
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary text-sm" disabled={sending || picked.length === 0} onClick={() => void send()}>
                {sending ? "Sending…" : `Invite ${picked.length || ""}`.trim()}
              </button>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Up to {MAX_PICKED} people at a time.</span>
            </div>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>Guest list</p>
        {invitees.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Nobody has been invited yet.</p>
        ) : (
          <ul className="space-y-1">
            {invitees.map((i) => (
              <li key={i.id} className="flex items-center gap-2 min-w-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{i.name}</span>
                  {i.username && <span className="block text-xs truncate" style={{ color: "var(--text-secondary)" }}>@{i.username}</span>}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full capitalize flex-shrink-0"
                  style={i.status === "joined"
                    ? { background: "var(--brand-gold)", color: "var(--brand-green)" }
                    : { background: "var(--border)", color: "var(--text-secondary)" }}>
                  {i.status}
                </span>
                <button type="button" disabled={busy === i.id} onClick={() => void withdraw(i.id)}
                  className="p-1.5 rounded-lg border flex-shrink-0 disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "#ef4444" }} aria-label={`Withdraw invitation for ${i.name}`}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}