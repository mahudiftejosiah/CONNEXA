"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sendLiveMessage } from "@/lib/actions/pro";
import { formatMessageTime } from "@/lib/utils";
import type { LiveMessage } from "@/lib/supabase/types";

const POLL_MS = 3000;
const MAX_ROWS = 60;

// The same vocabulary the feed uses on posts, so a reaction means one thing
// across the app. Only the short name is stored; the emoji is drawn here.
const REACTIONS = [
  { type: "like", emoji: "👍", label: "Like" },
  { type: "love", emoji: "❤️", label: "Love" },
  { type: "haha", emoji: "😆", label: "Haha" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
  { type: "angry", emoji: "😡", label: "Angry" },
];

function reactionEmoji(body: string) {
  const found = REACTIONS.find((r) => r.type === body);
  return found ? found.emoji : "👍";
}

// Realtime and the poll both deliver the same rows, sometimes twice: merging by
// id keeps one copy, and the cap keeps a long broadcast from growing the DOM.
function merge(prev: LiveMessage[], incoming: LiveMessage[]): LiveMessage[] {
  const byId: Record<string, LiveMessage> = {};
  for (const row of prev) byId[row.id] = row;
  for (const row of incoming) byId[row.id] = row;
  const all = Object.keys(byId).map((id) => byId[id]);
  all.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return all.slice(-MAX_ROWS);
}

/**
 * The room's conversation, shared by the broadcaster and every viewer. It sits
 * on the black stage in both places, so it is dressed for dark backgrounds.
 */
export function LiveChat({ sessionId, active, currentUserId, className = "" }: {
  sessionId: string;
  active: boolean;
  currentUserId: string | null;
  className?: string;
}) {
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const scrollRef = useRef<HTMLDivElement>(null);
  const askedRef = useRef<Record<string, boolean>>({});
  const namesRef = useRef<Record<string, string>>({});

  const [rows, setRows] = useState<LiveMessage[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [missing, setMissing] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadNames = useCallback(async (ids: string[]) => {
    const want = Array.from(new Set(ids)).filter((id) => !!id && !askedRef.current[id]);
    if (!want.length) return;
    for (const id of want) askedRef.current[id] = true;
    const { data } = await supabase.from("profiles").select("id, username, display_name").in("id", want);
    if (!data) return;
    const next = { ...namesRef.current };
    for (const person of data) next[person.id] = person.display_name || person.username;
    namesRef.current = next;
    setNames(next);
  }, [supabase]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("live_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) {
      setMissing(error.code === "42P01" || error.message.includes("live_messages")
        ? "Viewer chat needs migration 033."
        : `The chat could not be read: ${error.message}`);
      return;
    }
    setMissing(null);
    const found = data ?? [];
    setRows((prev) => merge(prev, found));
    void loadNames(found.map((m) => m.user_id));
  }, [supabase, sessionId, loadNames]);

  useEffect(() => {
    setRows([]);
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`live-chat:${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "live_messages", filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const row = payload.new as LiveMessage;
        if (!row?.id) return;
        setRows((prev) => merge(prev, [row]));
        void loadNames([row.user_id]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, sessionId, loadNames]);

  // Realtime is not guaranteed on every connection, so the poll stays on while
  // the room can still take a message.
  useEffect(() => {
    if (!active) return;
    const poll = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(poll);
  }, [active, load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const canSend = active && !!currentUserId && !missing;

  async function send(body: string, kind: "message" | "reaction") {
    const trimmed = body.trim();
    if (!trimmed || sending || !canSend) return;
    setSending(true);
    setSendError(null);
    const res = await sendLiveMessage(sessionId, trimmed, kind);
    setSending(false);
    if ("error" in res) { setSendError(res.error); return; }
    if (kind === "message") setText("");
    void load();
  }

  return (
    <div className={`flex flex-col min-h-0 bg-black/40 ${className}`}>
      <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-white/50 flex-shrink-0">
        Live chat
      </p>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
        {missing ? (
          <p className="text-xs text-white/75 pl-2 border-l-2" style={{ borderColor: "var(--brand-gold)" }}>{missing}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-white/45">Nobody has said anything yet. Say hello.</p>
        ) : (
          rows.map((m) => (
            <p key={m.id} className="text-[13px] leading-snug break-words">
              <span className="font-semibold text-white/90">{names[m.user_id] ?? "Someone"}</span>{" "}
              {m.kind === "reaction" ? (
                <span className="text-white/70">
                  reacted <span className="text-base align-middle">{reactionEmoji(m.body)}</span>
                </span>
              ) : (
                <span className="text-white/80">{m.body}</span>
              )}
              <span className="ml-1.5 text-[10px] text-white/35 whitespace-nowrap">{formatMessageTime(m.created_at)}</span>
            </p>
          ))
        )}
      </div>

      <div className="px-3 pb-3 pt-2 space-y-2 border-t border-white/10 flex-shrink-0">
        {sendError && (
          <p role="alert" className="text-[11px] text-white/85 pl-2 border-l-2" style={{ borderColor: "var(--brand-gold)" }}>
            {sendError}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              title={r.label}
              aria-label={`React with ${r.label}`}
              disabled={!canSend || sending}
              onClick={() => void send(r.type, "reaction")}
              className="w-8 h-8 flex items-center justify-center rounded-full text-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors"
            >
              {r.emoji}
            </button>
          ))}
        </div>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); void send(text, "message"); }}>
          <input
            value={text}
            onChange={(e) => { setText(e.target.value); if (sendError) setSendError(null); }}
            maxLength={300}
            disabled={!canSend}
            aria-label="Message the broadcast"
            placeholder={canSend ? "Say something…" : active ? "Sign in to join the chat" : "This broadcast has ended"}
            className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm bg-white/10 text-white placeholder-white/40 border border-white/15 focus:outline-none focus:border-white/40 disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend || sending || !text.trim()}
            className="p-2 rounded-xl bg-white/15 text-white hover:bg-white/25 disabled:opacity-40 flex-shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}