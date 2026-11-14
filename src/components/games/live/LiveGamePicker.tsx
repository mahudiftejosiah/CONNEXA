"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Swords, Dices, Grid2x2, X, Zap, Search } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { challengeFriend, type LiveGameKind } from "@/lib/actions/games";
import toast from "react-hot-toast";

type FriendLite = {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  last_seen?: string | null;
};

const ONLINE_MS = 5 * 60_000;
const isOnline = (t?: string | null) => !!t && Date.now() - new Date(t).getTime() < ONLINE_MS;

const LIVE_GAMES: { kind: LiveGameKind; name: string; desc: string; icon: React.ReactNode; color: string }[] = [
  { kind: "whot", name: "Whot", desc: "The classic shedding card game. Match colour or number.", icon: <Dices className="w-7 h-7" />, color: "#8b5cf6" },
  { kind: "chess", name: "Chess", desc: "Full rules: castling, en passant, checkmate.", icon: <Swords className="w-7 h-7" />, color: "#0ea5e9" },
  { kind: "ludo", name: "Ludo", desc: "Race four tokens home and capture your friend.", icon: <Grid2x2 className="w-7 h-7" />, color: "#f59e0b" },
];

export function LiveGamePicker({ currentUserId, friends }: { currentUserId: string; friends: FriendLite[] }) {
  const [picking, setPicking] = useState<LiveGameKind | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();

  const sorted = [...friends]
    .filter((f) => f.id !== currentUserId)
    .sort((a, b) => Number(isOnline(b.last_seen)) - Number(isOnline(a.last_seen)) || a.display_name.localeCompare(b.display_name));

  // Only people already in the friends list reach this point, so the box is a
  // filter over that list rather than a site-wide search.
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const shown = needle
    ? sorted.filter((f) => f.display_name.toLowerCase().includes(needle) || f.username.toLowerCase().includes(needle))
    : sorted;

  function close() {
    setPicking(null);
    setQuery("");
  }

  async function send(kind: LiveGameKind, friendId: string) {
    setBusy(friendId);
    const res = await challengeFriend(kind, friendId);
    setBusy(null);
    if (res.error) { toast.error(res.error); return; }
    close();
    toast.success("Challenge sent — waiting for them to accept.");
    if (res.id) router.push(`/games/live/${res.id}`);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {LIVE_GAMES.map((g) => (
          <button key={g.kind} onClick={() => setPicking(g.kind)}
            className="rounded-2xl border p-4 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: g.color }}>
                {g.icon}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgb(var(--a-800) / 0.12)", color: "rgb(var(--a-800))" }}>
                Live
              </span>
            </div>
            <p className="font-bold text-sm mt-3" style={{ color: "var(--text-primary)" }}>{g.name}</p>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{g.desc}</p>
            <p className="text-xs font-semibold mt-2" style={{ color: "rgb(var(--a-800))" }}>Challenge a friend →</p>
          </button>
        ))}
      </div>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4" onClick={close}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border p-4 max-h-[75vh] overflow-y-auto"
            style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-[var(--text-primary)]">Challenge to {(LIVE_GAMES.find((g) => g.kind === picking) || {}).name}</p>
              <button onClick={close} aria-label="Close" className="p-1.5 rounded-xl hover:bg-[var(--border)]">
                <X className="w-4 h-4 text-[var(--text-secondary)]" />
              </button>
            </div>
            <p className="text-xs mb-3 text-[var(--text-secondary)]">They get a notification; accepting opens the board for both of you.</p>

            {sorted.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-[var(--text-secondary)]">You have no friends yet — add someone from Discover first.</p>
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                  <input
                    type="search"
                    placeholder="Search your friends by name or @username…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="input pl-9 text-sm"
                    aria-label="Search friends to challenge"
                  />
                </div>

                {shown.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">No friend matches “{query.trim()}”.</p>
                    <p className="text-xs mt-1 text-[var(--text-secondary)]">Try part of their name or @username.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {shown.map((f) => {
                      const online = isOnline(f.last_seen);
                      return (
                        <button key={f.id} onClick={() => send(picking, f.id)} disabled={busy === f.id}
                          className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-[var(--border)] transition-colors text-left disabled:opacity-50">
                          <Avatar src={f.avatar_url} name={f.display_name} size={40} online={online} userId={f.id} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate text-[var(--text-primary)]">{f.display_name}</p>
                            <p className="text-xs truncate" style={{ color: online ? "rgb(var(--a-600))" : "var(--text-secondary)" }}>
                              {online ? "Online now" : f.last_seen ? `Active ${new Date(f.last_seen).toLocaleDateString()}` : "Offline"}
                              <span className="text-[var(--text-secondary)]"> · @{f.username}</span>
                            </p>
                          </div>
                          {online && <Zap className="w-4 h-4 flex-shrink-0" style={{ color: "rgb(var(--a-800))" }} />}
                          <Button size="sm" loading={busy === f.id}>Invite</Button>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
