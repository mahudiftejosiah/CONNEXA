"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, Search, ArrowLeft, Users, Zap, Moon, Paperclip, FileText, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageSkeleton } from "@/components/ui/Skeleton";
import { VerifiedTick } from "@/components/ui/VerifiedTick";
import { createClient } from "@/lib/supabase/client";
import type { ConversationWithDetails, Profile, Message, MessageAttachmentKind } from "@/lib/supabase/types";
import {
  formatMessageTime, formatRelativeTime,
  isValidImageType, isValidVideoType,
  MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, MAX_CHAT_FILE_SIZE,
} from "@/lib/utils";
import toast from "react-hot-toast";

type FriendLite = Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "is_verified"> & { last_seen?: string | null };

const ONLINE_WINDOW_MS = 5 * 60_000;
function isOnline(lastSeen?: string | null) {
  return !!lastSeen && Date.now() - new Date(lastSeen).getTime() < ONLINE_WINDOW_MS;
}

function kindOfFile(file: File): MessageAttachmentKind {
  if (isValidImageType(file.type)) return "image";
  if (isValidVideoType(file.type)) return "video";
  return "file";
}

function sizeLimit(kind: MessageAttachmentKind) {
  return kind === "image" ? MAX_IMAGE_SIZE : kind === "video" ? MAX_VIDEO_SIZE : MAX_CHAT_FILE_SIZE;
}

function fileSizeLabel(bytes?: number | null) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentPreview(kind?: MessageAttachmentKind | null) {
  if (kind === "image") return "Sent a photo";
  if (kind === "video") return "Sent a video";
  if (kind === "file") return "Sent a file";
  return "No messages yet";
}

interface MessagesClientProps {
  conversations: ConversationWithDetails[];
  profile: Profile;
  currentUserId: string;
  friends: FriendLite[];
  openPeerId: string | null;
}

export function MessagesClient({ conversations: initConvs, profile, currentUserId, friends, openPeerId }: MessagesClientProps) {
  const [conversations, setConversations] = useState(initConvs);
  const [active, setActive] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"all" | "active" | "offline">("all");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Attachments live in a private bucket, so every path needs a signed URL.
  async function signAttachments(rows: Message[]) {
    const paths = Array.from(new Set(rows.map((r) => r.attachment_url).filter((p): p is string => Boolean(p))));
    const todo = paths.filter((p) => !p.startsWith("http") && !urlsRef.current[p]);
    if (todo.length === 0) return;
    const { data } = await supabase.storage.from("chat-files").createSignedUrls(todo, 6 * 60 * 60);
    let changed = false;
    (data || []).forEach((row) => {
      if (row.path && row.signedUrl) { urlsRef.current[row.path] = row.signedUrl; changed = true; }
    });
    if (changed) setUrls({ ...urlsRef.current });
  }

  // Real-time subscription
  useEffect(() => {
    if (!active) return;
    const channel = supabase
      .channel(`messages:${active.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${active.id}`,
      }, (payload) => {
        const row = payload.new as Message;
        setMessages((p) => p.some((m) => m.id === row.id) ? p : [...p, row]);
        void signAttachments([row]);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active?.id]);

  async function openConversation(conv: ConversationWithDetails) {
    setActive(conv);
    setLoadingMsgs(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(50);
    setMessages(data || []);
    void signAttachments(data || []);
    setLoadingMsgs(false);

    // Mark as read
    await supabase.from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conv.id)
      .neq("sender_id", currentUserId);
    window.dispatchEvent(new Event("connexa-unread-refresh"));

    setConversations((p) => p.map((c) => c.id === conv.id ? { ...c, unread_count: 0 } : c));
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  function pickFile(next: File | null) {
    if (!next) { setFile(null); return; }
    const kind = kindOfFile(next);
    const limit = sizeLimit(kind);
    if (next.size > limit) {
      toast.error(`Too large — ${kind === "image" ? "photos" : kind === "video" ? "videos" : "files"} can be up to ${Math.round(limit / 1024 / 1024)}MB.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(next);
  }

  async function sendMessage() {
    if (!active || sending) return;
    const content = input.trim();
    if (!content && !file) return;
    setSending(true);

    let attachment: { url: string; kind: MessageAttachmentKind; name: string; size: number } | null = null;
    if (file) {
      const kind = kindOfFile(file);
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "bin";
      const path = `${currentUserId}/${active.id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) {
        setSending(false);
        toast.error("Upload failed. Has migration 015 been applied?");
        return;
      }
      attachment = { url: path, kind, name: file.name.slice(0, 120), size: file.size };
    }

    setInput("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const { data, error } = await supabase.from("messages").insert({
      conversation_id: active.id,
      sender_id: currentUserId,
      content,
      attachment_url: attachment?.url ?? null,
      attachment_kind: attachment?.kind ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
    }).select().single();
    setSending(false);
    if (error) {
      toast.error("Failed to send message.");
      setInput(content);
      if (attachment) void supabase.storage.from("chat-files").remove([attachment.url]);
      return;
    }
    if (attachment) void signAttachments([data]);
    // Render it immediately; the realtime echo can also arrive, so dedupe by id.
    setMessages((p) => p.some((m) => m.id === data.id) ? p : [...p, data]);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function getOtherParticipant(conv: ConversationWithDetails) {
    return conv.participants.find((p) => p.user_id !== currentUserId)?.profile;
  }

  // Friends with no thread yet: a searchParams-only router.push does not re-run
  // the server page, so the thread is created here and opened straight away.
  async function startChatWith(friend: FriendLite) {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participantId: friend.id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.conversationId) {
      toast.error("Could not open that chat.");
      return;
    }
    const conv = {
      id: json.conversationId,
      participants: [
        { conversation_id: json.conversationId, user_id: currentUserId, profile },
        { conversation_id: json.conversationId, user_id: friend.id, profile: friend },
      ],
      last_message: null,
      unread_count: 0,
    } as unknown as ConversationWithDetails;
    setConversations((p) => [conv, ...p]);
    await openConversation(conv);
  }

  // Threads first, then friends we have never messaged (clicking one opens / creates the thread).
  const chattedIds = new Set(
    conversations.map((c) => getOtherParticipant(c)?.id).filter((id): id is string => Boolean(id))
  );
  type Row =
    | { kind: "thread"; key: string; conv: ConversationWithDetails; person: Profile }
    | { kind: "friend"; key: string; friend: FriendLite };

  const threadRows: Row[] = conversations
    .map((conv) => {
      const person = getOtherParticipant(conv);
      return person ? ({ kind: "thread", key: conv.id, conv, person } as Row) : null;
    })
    .filter((r): r is Row => r !== null);

  const friendRows: Row[] = friends
    .filter((f) => !chattedIds.has(f.id) && f.id !== currentUserId)
    .sort((a, b) => Number(isOnline(b.last_seen)) - Number(isOnline(a.last_seen)) || a.display_name.localeCompare(b.display_name))
    .map((f) => ({ kind: "friend", key: f.id, friend: f } as Row));

  const allRows: Row[] = [...threadRows, ...friendRows];
  const matchesSearch = (r: Row) => {
    if (!search.trim()) return true;
    const p = r.kind === "thread" ? r.person : r.friend;
    return `${p.display_name} @${p.username}`.toLowerCase().includes(search.trim().toLowerCase());
  };
  const counts = {
    all: allRows.filter(matchesSearch).length,
    active: allRows.filter((r) => matchesSearch(r) && isOnline(r.kind === "thread" ? r.person.last_seen : r.friend.last_seen)).length,
    offline: 0,
  };
  counts.offline = counts.all - counts.active;

  const rows = allRows.filter((r) => {
    if (!matchesSearch(r)) return false;
    const online = isOnline(r.kind === "thread" ? r.person.last_seen : r.friend.last_seen);
    if (tab === "active" && !online) return false;
    if (tab === "offline" && online) return false;
    return true;
  });

  // /messages?with=<id> opens that thread straight away.
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!openPeerId || active || autoOpened.current === openPeerId) return;
    const conv = conversations.find((c) => getOtherParticipant(c)?.id === openPeerId);
    if (conv) { autoOpened.current = openPeerId; void openConversation(conv); }
  }, [openPeerId, conversations, active]);

  return (
    <div className="flex h-[calc(100dvh-8rem)] md:h-[calc(100dvh-5rem)] -mx-4 -mt-6 -mb-20 md:-mb-6">
      {/* Conversation list */}
      <div className={`w-full md:w-80 border-r border-[var(--border)] flex flex-col ${active ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-lg text-[var(--text-primary)]">Messages</h2>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input type="search" placeholder="Search conversations…" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9 text-sm" />
          </div>
          <div className="flex gap-1 mt-3">
            {([
              { key: "all", label: "All", icon: <Users className="w-3.5 h-3.5" /> },
              { key: "active", label: "Active", icon: <Zap className="w-3.5 h-3.5" /> },
              { key: "offline", label: "Offline", icon: <Moon className="w-3.5 h-3.5" /> },
            ] as const).map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${tab === t.key ? "bg-brand-green-800 text-white border-brand-green-800" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                style={tab === t.key ? undefined : { backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}>
                {t.icon} {t.label}
                <span className="opacity-70">{counts[t.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <EmptyState icon={<MessageCircle className="w-8 h-8" />} title="No messages"
              description={tab === "active" ? "No one is online right now." : tab === "offline" ? "No offline friends yet." : "Start a conversation from someone's profile."} />
          ) : (
            rows.map((row) => {
              if (row.kind === "friend") {
                const f = row.friend;
                const online = isOnline(f.last_seen);
                return (
                  <button key={row.key} onClick={() => void startChatWith(f)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-left">
                    <Avatar src={f.avatar_url} name={f.display_name} size={48} online={online} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-[var(--text-primary)] flex items-center gap-1.5">
                        {f.display_name}{f.is_verified && <VerifiedTick size={14} />}
                      </p>
                      <p className="text-xs truncate" style={{ color: online ? "#22c55e" : "var(--text-secondary)" }}>
                        {online ? "Online now" : f.last_seen ? `Active ${formatRelativeTime(f.last_seen)}` : "Not active yet"}
                      </p>
                    </div>
                    <MessageCircle className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
                  </button>
                );
              }

              const conv = row.conv;
              const other = row.person;
              const online = isOnline(other.last_seen);
              return (
                <button
                  key={row.key}
                  onClick={() => openConversation(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-left ${active?.id === conv.id ? "bg-brand-green-800/5 dark:bg-brand-gold-400/5" : ""}`}
                >
                  <Avatar src={other.avatar_url} name={other.display_name} size={48} online={online} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className="font-semibold text-sm truncate text-[var(--text-primary)] flex items-center gap-1.5">
                        {other.display_name}
                        {(other as Profile).is_verified && <VerifiedTick size={14} />}
                      </p>
                      {conv.last_message && (
                        <span className="text-xs text-[var(--text-secondary)] flex-shrink-0 ml-2">
                          {formatRelativeTime(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {conv.last_message
                        ? (conv.last_message.content || attachmentPreview(conv.last_message.attachment_kind))
                        : "No messages yet"}
                    </p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="badge flex-shrink-0">{conv.unread_count}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat pane */}
      <div className={`flex-1 flex flex-col ${!active ? "hidden md:flex" : "flex"}`}>
        {!active ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState icon={<MessageCircle className="w-8 h-8" />} title="Select a conversation" description="Choose a conversation from the list to start chatting." />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
              <button onClick={() => setActive(null)} className="md:hidden p-1 rounded-lg hover:bg-[var(--border)]">
                <ArrowLeft className="w-5 h-5" />
              </button>
              {(() => {
                const other = getOtherParticipant(active);
                return other ? (
                  <>
                    <Avatar src={other.avatar_url} name={other.display_name} size={40} online={isOnline(other.last_seen)} />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{other.display_name}</p>
                      <p className="text-xs" style={{ color: isOnline(other.last_seen) ? "#22c55e" : "var(--text-secondary)" }}>
                        {isOnline(other.last_seen) ? "Online now" : other.last_seen ? `Active ${formatRelativeTime(other.last_seen)}` : `@${other.username}`}
                      </p>
                    </div>
                  </>
                ) : null;
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <>
                  <MessageSkeleton /> <MessageSkeleton /> <MessageSkeleton />
                </>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === currentUserId;
                  const media = msg.attachment_url ? urls[msg.attachment_url] : undefined;

                  let attachment: React.ReactNode = null;
                  if (msg.attachment_kind === "image") {
                    attachment = media ? (
                      <a href={media} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={media} alt={msg.attachment_name || "Photo"} className="max-h-72 w-full object-cover" loading="lazy" />
                      </a>
                    ) : <p className="px-4 pt-2.5 text-xs opacity-60">Loading photo…</p>;
                  } else if (msg.attachment_kind === "video") {
                    attachment = media ? (
                      <video src={media} controls playsInline preload="metadata" className="max-h-72 w-full bg-black" />
                    ) : <p className="px-4 pt-2.5 text-xs opacity-60">Loading video…</p>;
                  } else if (msg.attachment_kind === "file") {
                    attachment = media ? (
                      <a
                        href={media}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="flex items-center gap-2.5 px-4 pt-2.5 min-w-0"
                      >
                        <FileText className="w-8 h-8 flex-shrink-0 opacity-70" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{msg.attachment_name || "File"}</span>
                          <span className={`block text-[11px] ${isMe ? "text-white/60" : "text-[var(--text-secondary)]"}`}>
                            {fileSizeLabel(msg.attachment_size)}
                          </span>
                        </span>
                      </a>
                    ) : <p className="px-4 pt-2.5 text-xs opacity-60">Loading file…</p>;
                  }

                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] md:max-w-[75%] rounded-2xl text-sm overflow-hidden ${
                        isMe
                          ? "bg-brand-green-800 text-white rounded-br-sm"
                          : "bg-[var(--border)] text-[var(--text-primary)] rounded-bl-sm"
                      }`}>
                        {attachment}
                        {msg.content && <p className="leading-relaxed px-4 pt-2.5">{msg.content}</p>}
                        <p className={`text-[10px] px-4 pt-1 pb-2 ${isMe ? "text-white/60" : "text-[var(--text-secondary)]"}`}>
                          {formatMessageTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)]">
              {file && (
                <div className="px-4 pt-3">
                  <div className="inline-flex items-center gap-2 max-w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <FileText className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)]" />
                    <span className="text-xs text-[var(--text-primary)] truncate">{file.name}</span>
                    <span className="text-[11px] text-[var(--text-secondary)] flex-shrink-0">{fileSizeLabel(file.size)}</span>
                    <button
                      onClick={() => pickFile(null)}
                      className="p-0.5 rounded hover:bg-[var(--border)] flex-shrink-0"
                      aria-label="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </button>
                  </div>
                </div>
              )}
              <div className="px-4 py-3 flex gap-2 items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.zip"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  className="p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 flex-shrink-0"
                  aria-label="Attach a photo, video or document"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  placeholder="Type a message…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="input flex-1"
                  maxLength={5000}
                />
                <button
                  onClick={sendMessage}
                  disabled={(!input.trim() && !file) || sending}
                  className="btn-primary px-4 py-2.5 rounded-xl disabled:opacity-40 flex-shrink-0"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
