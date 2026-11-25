"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send, MessageCircle, Search, ArrowLeft, Users, Zap, Moon, Paperclip, FileText, X, Eye, CheckCheck, Check, Trash2, Image as ImageIcon, Bot, Pin, PinOff, CornerUpLeft, Share, Pencil, Mic, Square, Sticker as StickerIcon } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageSkeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/Modal";
import { AccountBadge } from "@/components/ui/ProBadge";
import { ActiveUsersButton } from "@/components/layout/ActiveUsersButton";
import { HelpThread } from "@/components/messages/HelpThread";
import { WelcomeMessages } from "@/components/messages/WelcomeMessages";
import { VoiceNote } from "@/components/messages/VoiceNote";
import { StickerPicker } from "@/components/messages/StickerPicker";
import { useVoiceRecorder, MAX_VOICE_SECONDS, type VoiceDraft } from "@/lib/useVoiceRecorder";
import { isStickerPath, isVoiceNote, type Sticker } from "@/lib/stickers";
import { MessageMenu, type MessageAction } from "@/components/messages/MessageMenu";
import { ForwardDialog, type ForwardTarget } from "@/components/messages/ForwardDialog";
import { createClient } from "@/lib/supabase/client";
import type { ConversationWithDetails, Profile, Message, MessageAttachmentKind, MessageReaction } from "@/lib/supabase/types";
import {
  formatMessageTime, formatRelativeTime,
  isValidImageType, isValidVideoType,
  MAX_IMAGE_SIZE, MAX_VIDEO_SIZE, MAX_CHAT_FILE_SIZE,
} from "@/lib/utils";
import toast from "react-hot-toast";

type FriendLite = Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "is_verified" | "pro_expires_at"> & { last_seen?: string | null };

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

type PreviewSource = {
  attachment_kind?: MessageAttachmentKind | null;
  view_once?: boolean | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
  deleted_at?: string | null;
} | null | undefined;

function attachmentPreview(msg: PreviewSource) {
  if (msg?.deleted_at) return "This message was deleted";
  if (isStickerPath(msg?.attachment_url)) return "Sent a sticker";
  if (isVoiceNote(msg?.attachment_name)) return "Sent a voice note";

  const kind = msg?.attachment_kind;

  if (msg?.view_once && (kind === "image" || kind === "video")) {
    return kind === "image" ? "View-once photo" : "View-once video";
  }

  if (kind === "image") return "Sent a photo";
  if (kind === "video") return "Sent a video";
  if (kind === "file") return "Sent a file";

  return "No messages yet";
}

function recencyKey(conv: ConversationWithDetails) {
  return new Date(conv.last_message_at || conv.last_message?.created_at || conv.created_at).getTime();
}

interface MessagesClientProps {
  conversations: ConversationWithDetails[];
  profile: Profile;
  currentUserId: string;
  friends: FriendLite[];
  openPeerId: string | null;
  initialTab?: "all" | "active" | "offline";
}

const VIEW_ONCE_URL_SECONDS = 60;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

type ViewOnceView = {
  url: string;
  kind: MessageAttachmentKind;
  name: string | null;
};

function isViewOnceMedia(kind: MessageAttachmentKind) {
  return kind === "image" || kind === "video";
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(box);
      return ok;
    } catch {
      return false;
    }
  }
}

function highlightText(text: string, query: string): React.ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;

  const lower = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;

  for (let idx = lower.indexOf(q); idx >= 0; idx = lower.indexOf(q, from)) {
    if (idx > from) parts.push(text.slice(from, idx));

    parts.push(
      <mark key={`${idx}`} className="bg-yellow-300/70 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
    );

    from = idx + q.length;
  }

  parts.push(text.slice(from));
  return parts;
}

export function MessagesClient({
  conversations: initConvs,
  profile,
  currentUserId,
  friends,
  openPeerId,
  initialTab = "all",
}: MessagesClientProps) {
  const router = useRouter();

  const [conversations, setConversations] = useState(initConvs);
  const [active, setActive] = useState<ConversationWithDetails | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"all" | "active" | "offline">(initialTab);
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);
  const [viewer, setViewer] = useState<ViewOnceView | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<ConversationWithDetails | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [pendingUnsend, setPendingUnsend] = useState<Message | null>(null);
  const [unsending, setUnsending] = useState(false);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [chatSearch, setChatSearch] = useState(false);
  const [chatQuery, setChatQuery] = useState("");

  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<number>(0);
  const lastTypingSentRef = useRef<number>(0);
  const convsRef = useRef<ConversationWithDetails[]>(initConvs);
  const urlsRef = useRef<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  activeIdRef.current = active?.id ?? null;

  useEffect(() => {
    convsRef.current = conversations;
  }, [conversations]);

  // Keep the client inbox synchronized with refreshed server data.
  useEffect(() => {
    setConversations(initConvs);
    convsRef.current = initConvs;
  }, [initConvs]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  function isPeerViewOnce(msg: Message) {
    return msg.view_once === true && msg.sender_id !== currentUserId;
  }

  function markOpened(msgId: string) {
    setMessages((p) =>
      p.map((m) =>
        m.id === msgId
          ? { ...m, viewed_at: m.viewed_at || new Date().toISOString() }
          : m
      )
    );
  }

  async function signAttachments(rows: Message[]) {
    const paths = Array.from(
      new Set(
        rows
          .filter((r) => r.attachment_url && !isPeerViewOnce(r))
          .map((r) => r.attachment_url!)
      )
    );

    let publicChanged = false;

    for (const p of paths) {
      if (p.startsWith("/") && !urlsRef.current[p]) {
        urlsRef.current[p] = p;
        publicChanged = true;
      }
    }

    const todo = paths.filter(
      (p) => !p.startsWith("http") && !p.startsWith("/") && !urlsRef.current[p]
    );

    if (todo.length === 0) {
      if (publicChanged) setUrls({ ...urlsRef.current });
      return;
    }

    const { data } = await supabase.storage
      .from("chat-files")
      .createSignedUrls(todo, 6 * 60 * 60);

    let changed = false;

    (data || []).forEach((row) => {
      if (row.path && row.signedUrl) {
        urlsRef.current[row.path] = row.signedUrl;
        changed = true;
      }
    });

    if (changed) setUrls({ ...urlsRef.current });
  }

  async function openViewOnce(msg: Message) {
    if (!msg.attachment_url || openingId) return;

    setOpeningId(msg.id);

    const { error } = await supabase.rpc("open_view_once", {
      p_message_id: msg.id,
    });

    setOpeningId(null);

    if (error) {
      const alreadyOpen = /already been opened/i.test(error.message || "");

      if (alreadyOpen) markOpened(msg.id);

      toast.error(
        alreadyOpen
          ? "That message has already been opened."
          : "Could not open it. Has migration 017 been applied?"
      );

      return;
    }

    const { data, error: signError } = await supabase.storage
      .from("chat-files")
      .createSignedUrl(msg.attachment_url, VIEW_ONCE_URL_SECONDS);

    if (signError || !data?.signedUrl) {
      markOpened(msg.id);
      toast.error("Could not load that file. Has migration 017 been applied?");
      return;
    }

    markOpened(msg.id);

    setViewer({
      url: data.signedUrl,
      kind: msg.attachment_kind || "file",
      name: msg.attachment_name,
    });
  }

  // Refresh the inbox if a message belongs to a conversation we haven't loaded.
  function bumpConversation(convId: string, msg: Message) {
    const existing = convsRef.current.find((c) => c.id === convId);

    if (!existing) {
      router.refresh();
      return;
    }

    setConversations((previous) => {
      const current = previous.find((c) => c.id === convId);

      if (!current) {
        router.refresh();
        return previous;
      }

      const updated = {
        ...current,
        last_message: msg,
        last_message_at: msg.created_at,
      };

      return [
        updated,
        ...previous.filter((c) => c.id !== convId),
      ];
    });
  }

  // Inbox-wide realtime subscription.
  useEffect(() => {
    const channel = supabase
      .channel(`inbox:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const row = payload.new as Message;

          bumpConversation(row.conversation_id, row);

          if (row.conversation_id === activeIdRef.current) {
            setMessages((p) =>
              p.some((m) => m.id === row.id) ? p : [...p, row]
            );

            void signAttachments([row]);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          } else if (row.sender_id !== currentUserId) {
            const conv = convsRef.current.find(
              (c) => c.id === row.conversation_id
            );

            const who = conv?.participants.find(
              (p) => p.user_id === row.sender_id
            )?.profile?.display_name;

            if (conv && who) {
              const preview = row.content || attachmentPreview(row);

              toast.custom(
                (t) => (
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      void openConversation(conv);
                    }}
                    className="w-full max-w-xs flex items-start gap-2.5 px-3 py-2.5 rounded-xl border shadow-lg text-left"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <MessageCircle
                      className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: "rgb(var(--a-600))" }}
                    />
                    <span className="min-w-0">
                      <span
                        className="block text-sm font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {who}
                      </span>
                      <span
                        className="block text-xs truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {preview}
                      </span>
                    </span>
                  </button>
                ),
                { duration: 6000 }
              );
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const row = payload.new as Message;

          if (row.conversation_id !== activeIdRef.current) return;

          setMessages((p) =>
            p.map((m) => (m.id === row.id ? row : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Per-thread realtime channel.
  useEffect(() => {
    if (!active) return;

    const convId = active.id;

    const channel = supabase
      .channel(`rt:chat:${convId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = (payload as { user?: string }).user;

        if (!who || who === currentUserId) return;

        setPeerTyping(true);
        window.clearTimeout(typingTimerRef.current);

        typingTimerRef.current = window.setTimeout(
          () => setPeerTyping(false),
          3000
        );
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;

          setReactions((p) => ({
            ...p,
            [row.message_id]: [
              ...(p[row.message_id] || []).filter(
                (r) => r.user_id !== row.user_id
              ),
              row,
            ],
          }));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const old = payload.old as MessageReaction;

          if (!old?.id) return;

          setReactions((p) => {
            const next: Record<string, MessageReaction[]> = {};

            for (const mid of Object.keys(p)) {
              next[mid] = p[mid].filter((r) => r.id !== old.id);
            }

            return next;
          });
        }
      )
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
      window.clearTimeout(typingTimerRef.current);
      setPeerTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, currentUserId]);

  function emitTyping() {
    const ch = typingChannelRef.current;
    if (!ch) return;

    const now = Date.now();

    if (now - lastTypingSentRef.current < 1500) return;

    lastTypingSentRef.current = now;

    void ch.send({
      type: "broadcast",
      event: "typing",
      payload: { user: currentUserId },
    });
  }

  async function openConversation(conv: ConversationWithDetails) {
    setActive(conv);
    setHelpOpen(false);
    setViewer(null);
    setReplyTo(null);
    setEditing(null);
    setForwarding(null);
    setReactingId(null);
    setPeerTyping(false);
    setChatSearch(false);
    setChatQuery("");
    setLoadingMsgs(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(50);

    setMessages(data || []);
    void signAttachments(data || []);

    const msgIds = (data || []).map((m) => m.id);

    if (msgIds.length > 0) {
      const { data: rx } = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", msgIds);

      const grouped: Record<string, MessageReaction[]> = {};

      (rx || []).forEach((r) => {
        grouped[r.message_id] = [
          ...(grouped[r.message_id] || []),
          r,
        ];
      });

      setReactions(grouped);
    } else {
      setReactions({});
    }

    setLoadingMsgs(false);

    await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("conversation_id", conv.id)
      .neq("sender_id", currentUserId);

    window.dispatchEvent(new Event("connexa-unread-refresh"));

    setConversations((p) =>
      p.map((c) =>
        c.id === conv.id ? { ...c, unread_count: 0 } : c
      )
    );

    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }

  async function deleteConversation(conv: ConversationWithDetails) {
    setDeleting(true);

    const { error } = await supabase
      .from("conversation_participants")
      .update({ deleted_at: new Date().toISOString() })
      .eq("conversation_id", conv.id)
      .eq("user_id", currentUserId);

    setDeleting(false);
    setPendingDelete(null);

    if (error) {
      toast.error("Could not delete that chat.");
      return;
    }

    setConversations((p) => p.filter((c) => c.id !== conv.id));

    if (active?.id === conv.id) {
      setActive(null);
      setMessages([]);
    }

    window.dispatchEvent(new Event("connexa-unread-refresh"));
    toast.success("Chat deleted.");
  }

  function dropVoiceDraft() {
    setVoiceDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function pickFile(next: File | null) {
    dropVoiceDraft();

    if (!next) {
      setFile(null);
      setViewOnce(false);
      return;
    }

    const kind = kindOfFile(next);
    const limit = sizeLimit(kind);

    if (next.size > limit) {
      toast.error(
        `Too large — ${kind === "image" ? "photos" : kind === "video" ? "videos" : "files"} can be up to ${Math.round(limit / 1024 / 1024)}MB.`
      );

      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setFile(next);

    if (!isViewOnceMedia(kind)) setViewOnce(false);
  }

  const voice = useVoiceRecorder(
    (draft) => {
      setVoiceDraft((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return draft;
      });

      setFile(draft.file);
      setViewOnce(false);

      if (photoInputRef.current) photoInputRef.current.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    (message) => toast.error(message)
  );

  async function sendSticker(sticker: Sticker) {
    setStickerOpen(false);

    if (!active || sending) return;

    setSending(true);

    const quoted = replyTo?.id ?? null;

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: active.id,
        sender_id: currentUserId,
        content: "",
        attachment_url: sticker.url,
        attachment_kind: "image",
        attachment_name: `sticker:${sticker.label}`.slice(0, 120),
        attachment_size: null,
        ...(quoted ? { reply_to: quoted } : {}),
      })
      .select()
      .single();

    setSending(false);

    if (error) {
      toast.error("That sticker did not send.");
      return;
    }

    setReplyTo(null);
    void signAttachments([data]);

    setMessages((p) =>
      p.some((m) => m.id === data.id) ? p : [...p, data]
    );

    bumpConversation(active.id, data);

    setTimeout(
      () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
      60
    );
  }

  async function sendMessage() {
    if (!active || sending) return;

    const content = input.trim();

    if (!content && !file) return;

    if (voice.recording || voice.requesting) {
      toast.error("Stop the recording first.");
      return;
    }

    setSending(true);

    let attachment: {
      url: string;
      kind: MessageAttachmentKind;
      name: string;
      size: number;
    } | null = null;

    if (file) {
      const kind = kindOfFile(file);

      const ext = file.name.includes(".")
        ? file.name
            .split(".")
            .pop()!
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .slice(0, 8)
        : "bin";

      const path = `${currentUserId}/${active.id}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        setSending(false);
        toast.error("Upload failed. Has migration 015 been applied?");
        return;
      }

      attachment = {
        url: path,
        kind,
        name: file.name.slice(0, 120),
        size: file.size,
      };
    }

    const asViewOnce =
      viewOnce && !!attachment && isViewOnceMedia(attachment.kind);

    const quoted = replyTo?.id ?? null;
    const heldFile = file;
    const heldVoice = voiceDraft;

    setInput("");
    setFile(null);
    setVoiceDraft(null);
    setViewOnce(false);
    setReplyTo(null);

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (photoInputRef.current) photoInputRef.current.value = "";

    const payload = {
      conversation_id: active.id,
      sender_id: currentUserId,
      content,
      attachment_url: attachment?.url ?? null,
      attachment_kind: attachment?.kind ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      ...(asViewOnce ? { view_once: true } : {}),
      ...(quoted ? { reply_to: quoted } : {}),
    };

    const { data, error } = await supabase
      .from("messages")
      .insert(payload)
      .select()
      .single();

    setSending(false);

    if (error) {
      const needsMigration = asViewOnce || !!quoted;

      toast.error(
        needsMigration
          ? `Failed to send${quoted ? " the reply" : ""}. Has migration ${asViewOnce ? "017" : "023"} been applied?`
          : "Failed to send message."
      );

      setInput(content);
      setFile(heldFile);
      setVoiceDraft(heldVoice);
      setReplyTo(
        quoted ? messages.find((m) => m.id === quoted) ?? null : null
      );

      if (attachment) {
        void supabase.storage.from("chat-files").remove([attachment.url]);
      }

      return;
    }

    if (heldVoice) URL.revokeObjectURL(heldVoice.url);
    if (attachment) void signAttachments([data]);

    setMessages((p) =>
      p.some((m) => m.id === data.id) ? p : [...p, data]
    );

    bumpConversation(active.id, data);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function getOtherParticipant(conv: ConversationWithDetails) {
    return conv.participants.find(
      (p) => p.user_id !== currentUserId
    )?.profile;
  }

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
        {
          conversation_id: json.conversationId,
          user_id: currentUserId,
          profile,
        },
        {
          conversation_id: json.conversationId,
          user_id: friend.id,
          profile: friend,
        },
      ],
      last_message: null,
      unread_count: 0,
    } as unknown as ConversationWithDetails;

    setConversations((p) => [
      conv,
      ...p.filter((c) => c.id !== conv.id),
    ]);

    await openConversation(conv);
  }

  function replaceMessage(next: Message) {
    setMessages((p) =>
      p.map((m) => (m.id === next.id ? next : m))
    );

    setConversations((p) =>
      p.map((c) =>
        c.last_message?.id === next.id
          ? { ...c, last_message: next }
          : c
      )
    );
  }

  function beginEdit(msg: Message) {
    setEditing(msg);
    setEditText(msg.content);
    setReplyTo(null);
  }

  function cancelEdit() {
    setEditing(null);
    setEditText("");
  }

  async function saveEdit() {
    if (!editing) return;

    const content = editText.trim();

    if (!content) {
      toast.error("A message needs some text.");
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .update({
        content,
        edited_at: new Date().toISOString(),
      })
      .eq("id", editing.id)
      .eq("sender_id", currentUserId)
      .select()
      .single();

    if (error || !data) {
      toast.error("Could not edit that. Has migration 023 been applied?");
      return;
    }

    replaceMessage(data);
    cancelEdit();
  }

  async function copyText(msg: Message) {
    const text = msg.content || msg.attachment_name || "";

    if (await writeClipboard(text)) {
      toast.success("Copied.");
    } else {
      toast.error("Your browser would not allow the copy.");
    }
  }

  async function togglePin(msg: Message) {
    const pinning = !msg.pinned_at;

    const { data, error } = await supabase
      .from("messages")
      .update({
        pinned_at: pinning ? new Date().toISOString() : null,
        pinned_by: pinning ? currentUserId : null,
      })
      .eq("id", msg.id)
      .select()
      .single();

    if (error || !data) {
      toast.error(
        pinning
          ? "Could not pin that. Has migration 023 been applied?"
          : "Could not unpin that."
      );
      return;
    }

    replaceMessage(data);

    toast.success(
      pinning ? "Pinned to the top of this chat." : "Unpinned."
    );
  }

  function jumpTo(messageId: string) {
    document
      .getElementById(`msg-${messageId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function unsendMessage(msg: Message) {
    setUnsending(true);

    const { error } = await supabase.rpc(
      "delete_message_for_everyone",
      { p_message_id: msg.id }
    );

    setUnsending(false);
    setPendingUnsend(null);

    if (error) {
      toast.error("Could not unsend. Has migration 023 been applied?");
      return;
    }

    replaceMessage({
      ...msg,
      content: "",
      attachment_url: null,
      attachment_kind: null,
      attachment_name: null,
      attachment_size: null,
      pinned_at: null,
      deleted_at: new Date().toISOString(),
    });

    toast.success("Message unsent.");
  }

  async function toggleReaction(msg: Message, emoji: string) {
    if (!active) return;

    setReactingId(null);

    const mine = (reactions[msg.id] || []).find(
      (r) => r.user_id === currentUserId
    );

    if (mine && mine.emoji === emoji) {
      setReactions((p) => ({
        ...p,
        [msg.id]: (p[msg.id] || []).filter(
          (r) => r.user_id !== currentUserId
        ),
      }));

      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", mine.id);

      if (error) toast.error("Could not remove the reaction.");
      return;
    }

    if (mine) {
      setReactions((p) => ({
        ...p,
        [msg.id]: (p[msg.id] || []).map((r) =>
          r.user_id === currentUserId ? { ...r, emoji } : r
        ),
      }));

      const { error } = await supabase
        .from("message_reactions")
        .update({ emoji })
        .eq("id", mine.id);

      if (error) toast.error("Could not change the reaction.");
      return;
    }

    const optimistic: MessageReaction = {
      id: `tmp-${Date.now()}`,
      conversation_id: active.id,
      message_id: msg.id,
      user_id: currentUserId,
      emoji,
      created_at: new Date().toISOString(),
    };

    setReactions((p) => ({
      ...p,
      [msg.id]: [...(p[msg.id] || []), optimistic],
    }));

    const { data, error } = await supabase
      .from("message_reactions")
      .upsert(
        {
          conversation_id: active.id,
          message_id: msg.id,
          user_id: currentUserId,
          emoji,
        },
        { onConflict: "message_id,user_id" }
      )
      .select()
      .single();

    if (error || !data) {
      toast.error("Could not react. Has migration 037 been applied?");

      setReactions((p) => ({
        ...p,
        [msg.id]: (p[msg.id] || []).filter(
          (r) => r.id !== optimistic.id
        ),
      }));

      return;
    }

    setReactions((p) => ({
      ...p,
      [msg.id]: (p[msg.id] || []).map((r) =>
        r.id === optimistic.id ? data : r
      ),
    }));
  }

  const chattedIds = new Set(
    conversations
      .map((c) => getOtherParticipant(c)?.id)
      .filter((id): id is string => Boolean(id))
  );

  const forwardTargets: ForwardTarget[] = [
    ...conversations
      .map((c) => ({
        person: getOtherParticipant(c),
        conversationId: c.id,
      }))
      .filter(
        (t): t is { person: Profile; conversationId: string } =>
          !!t.person && t.person.id !== currentUserId
      ),

    ...friends
      .filter(
        (f) => !chattedIds.has(f.id) && f.id !== currentUserId
      )
      .map((f) => ({
        person: f,
        conversationId: null,
      })),
  ];

  async function forwardTo(msg: Message, target: ForwardTarget) {
    setForwarding(null);

    let conversationId = target.conversationId;

    if (!conversationId) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: target.person.id }),
      });

      const json = await res.json().catch(() => ({}));

      conversationId = json.conversationId || null;

      if (!conversationId) {
        toast.error("Could not open that chat.");
        return;
      }

      const created = {
        id: conversationId,
        participants: [
          {
            conversation_id: conversationId,
            user_id: currentUserId,
            profile,
          },
          {
            conversation_id: conversationId,
            user_id: target.person.id,
            profile: target.person,
          },
        ],
        last_message: null,
        unread_count: 0,
      } as unknown as ConversationWithDetails;

      setConversations((p) => [
        created,
        ...p.filter((c) => c.id !== created.id),
      ]);
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: msg.content,
        attachment_url: msg.attachment_url,
        attachment_kind: msg.attachment_kind,
        attachment_name: msg.attachment_name,
        attachment_size: msg.attachment_size,
        forwarded_from: msg.id,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error("Could not forward that. Has migration 023 been applied?");
      return;
    }

    if (conversationId === activeIdRef.current) {
      void signAttachments([data]);

      setMessages((p) =>
        p.some((m) => m.id === data.id) ? p : [...p, data]
      );

      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      bumpConversation(conversationId, data);
    }

    toast.success(`Sent to ${target.person.display_name}.`);
  }

  type Row =
    | {
        kind: "thread";
        key: string;
        conv: ConversationWithDetails;
        person: Profile;
      }
    | {
        kind: "friend";
        key: string;
        friend: FriendLite;
      };

  const threadRows: Row[] = [...conversations]
    .sort((a, b) => recencyKey(b) - recencyKey(a))
    .map((conv) => {
      const person = getOtherParticipant(conv);

      return person
        ? ({ kind: "thread", key: conv.id, conv, person } as Row)
        : null;
    })
    .filter((r): r is Row => r !== null);

  const friendRows: Row[] = friends
    .filter(
      (f) => !chattedIds.has(f.id) && f.id !== currentUserId
    )
    .sort(
      (a, b) =>
        Number(isOnline(b.last_seen)) -
          Number(isOnline(a.last_seen)) ||
        a.display_name.localeCompare(b.display_name)
    )
    .map((f) => ({
      kind: "friend",
      key: f.id,
      friend: f,
    }));

  const allRows: Row[] = [...threadRows, ...friendRows];

  const matchesSearch = (r: Row) => {
    if (!search.trim()) return true;

    const p = r.kind === "thread" ? r.person : r.friend;

    return `${p.display_name} @${p.username}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  };

  const counts = {
    all: allRows.filter(matchesSearch).length,
    active: allRows.filter(
      (r) =>
        matchesSearch(r) &&
        isOnline(
          r.kind === "thread" ? r.person.last_seen : r.friend.last_seen
        )
    ).length,
    offline: 0,
  };

  counts.offline = counts.all - counts.active;

  const rows = allRows.filter((r) => {
    if (!matchesSearch(r)) return false;

    const online = isOnline(
      r.kind === "thread" ? r.person.last_seen : r.friend.last_seen
    );

    if (tab === "active" && !online) return false;
    if (tab === "offline" && online) return false;

    return true;
  });

  const autoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (!openPeerId || active || autoOpened.current === openPeerId) return;

    const conv = conversations.find(
      (c) => getOtherParticipant(c)?.id === openPeerId
    );

    if (conv) {
      autoOpened.current = openPeerId;
      void openConversation(conv);
    }
  }, [openPeerId, conversations, active]);

  const byId = new Map(messages.map((m) => [m.id, m]));

  const chatQueryTrim = chatQuery.trim().toLowerCase();

  const matchesChatQuery = (m: Message) =>
    !chatQueryTrim ||
    (m.content || "").toLowerCase().includes(chatQueryTrim) ||
    (m.attachment_name || "").toLowerCase().includes(chatQueryTrim);

  const visibleMessages = messages.filter(matchesChatQuery);

  const nameOf = (senderId: string) =>
    active?.participants.find((p) => p.user_id === senderId)?.profile?.display_name ??
    "Earlier message";

  const pinnedMessages = messages.filter(
    (m) => m.pinned_at && !m.deleted_at
  );

  const mostRecentPin = pinnedMessages
    .slice()
    .sort(
      (a, b) =>
        new Date(b.pinned_at || 0).getTime() -
        new Date(a.pinned_at || 0).getTime()
    )[0];

  const composerQuote = editing ?? replyTo;

  const composerLabel = editing
    ? "Editing your message"
    : replyTo
      ? `Replying to ${nameOf(replyTo.sender_id)}`
      : "";

  return (
    <div className="flex h-[calc(100dvh-8rem)] md:h-[calc(100dvh-5rem)] -mx-4 -mt-6 -mb-20 md:-mb-6">
      {/* Conversation list */}
      <div
        className={`w-full md:w-80 border-r border-[var(--border)] flex flex-col ${
          active || helpOpen ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-[var(--text-primary)]">
              Messages
            </h2>
            <span className="ml-auto">
              <ActiveUsersButton />
            </span>
          </div>

          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              type="search"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 text-sm"
            />
          </div>

          <div className="flex gap-1 mt-3">
            {([
              {
                key: "all",
                label: "All",
                icon: <Users className="w-3.5 h-3.5" />,
              },
              {
                key: "active",
                label: "Active",
                icon: <Zap className="w-3.5 h-3.5" />,
              },
              {
                key: "offline",
                label: "Offline",
                icon: <Moon className="w-3.5 h-3.5" />,
              },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  tab === t.key
                    ? "bg-brand-green-800 text-white border-brand-green-800"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                style={
                  tab === t.key
                    ? undefined
                    : {
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border)",
                      }
                }
              >
                {t.icon} {t.label}
                <span className="opacity-70">{counts[t.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => {
              setActive(null);
              setHelpOpen(true);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-left border-b ${
              helpOpen ? "bg-brand-green-800/5 dark:bg-brand-gold-400/5" : ""
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            <span
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white"
              style={{ backgroundColor: "rgb(var(--a-800))" }}
            >
              <Bot className="w-6 h-6" />
            </span>

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate text-[var(--text-primary)]">
                CONNEXA Helper
              </p>
              <p
                className="text-xs truncate"
                style={{ color: "rgb(var(--a-600))" }}
              >
                Ask how anything works · instant answers
              </p>
            </div>
          </button>

          {conversations.length === 0 && (
            <div
              className="md:hidden border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <WelcomeMessages compact />
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="w-8 h-8" />}
              title="No messages"
              description={
                tab === "active"
                  ? "No one is online right now."
                  : tab === "offline"
                    ? "No offline friends yet."
                    : "Start a conversation from someone's profile."
              }
            />
          ) : (
            rows.map((row) => {
              if (row.kind === "friend") {
                const f = row.friend;
                const online = isOnline(f.last_seen);

                return (
                  <button
                    key={row.key}
                    onClick={() => void startChatWith(f)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-left"
                  >
                    <Avatar
                      src={f.avatar_url}
                      name={f.display_name}
                      size={48}
                      online={online}
                      userId={f.id}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate text-[var(--text-primary)] flex items-center gap-1.5">
                        {f.display_name}
                        <AccountBadge account={f} />
                      </p>

                      <p
                        className="text-xs truncate"
                        style={{
                          color: online
                            ? "rgb(var(--a-600))"
                            : "var(--text-secondary)",
                        }}
                      >
                        {online
                          ? "Online now"
                          : f.last_seen
                            ? `Active ${formatRelativeTime(f.last_seen)}`
                            : "Not active yet"}
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
                <div key={row.key} className="flex items-stretch">
                  <button
                    onClick={() => void openConversation(conv)}
                    className={`flex-1 min-w-0 flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-left ${
                      active?.id === conv.id
                        ? "bg-brand-green-800/5 dark:bg-brand-gold-400/5"
                        : ""
                    }`}
                  >
                    <Avatar
                      src={other.avatar_url}
                      name={other.display_name}
                      size={48}
                      online={online}
                      userId={other.id}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <p className="font-semibold text-sm truncate text-[var(--text-primary)] flex items-center gap-1.5">
                          {other.display_name}
                          <AccountBadge account={other as Profile} />
                        </p>

                        {conv.last_message && (
                          <span className="text-xs text-[var(--text-secondary)] flex-shrink-0 ml-2">
                            {formatRelativeTime(conv.last_message.created_at)}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] truncate">
                        {conv.last_message
                          ? conv.last_message.content ||
                            attachmentPreview(conv.last_message)
                          : "No messages yet"}
                      </p>
                    </div>

                    {conv.unread_count > 0 && (
                      <span className="badge flex-shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingDelete(conv)}
                    aria-label={`Delete the chat with ${other.display_name}`}
                    className="px-3 flex items-center justify-center text-[var(--text-secondary)] hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat pane */}
      <div
        className={`flex-1 flex flex-col ${
          !active && !helpOpen ? "hidden md:flex" : "flex"
        }`}
      >
        {helpOpen ? (
          <HelpThread
            userId={currentUserId}
            displayName={profile.display_name}
            onBack={() => setHelpOpen(false)}
          />
        ) : !active ? (
          conversations.length === 0 ? (
            <WelcomeMessages />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<MessageCircle className="w-8 h-8" />}
                title="Select a conversation"
                description="Choose a conversation from the list to start chatting."
              />
            </div>
          )
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
              <button
                onClick={() => {
                  setActive(null);
                  setViewer(null);
                }}
                className="md:hidden p-1 rounded-lg hover:bg-[var(--border)]"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {(() => {
                const other = getOtherParticipant(active);

                return other ? (
                  <>
                    <Avatar
                      src={other.avatar_url}
                      name={other.display_name}
                      size={40}
                      online={isOnline(other.last_seen)}
                      userId={other.id}
                    />

                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)] truncate">
                        {other.display_name}
                        <AccountBadge account={other} />
                      </p>

                      <p
                        className="text-xs"
                        style={{
                          color: peerTyping
                            ? "rgb(var(--a-600))"
                            : isOnline(other.last_seen)
                              ? "rgb(var(--a-600))"
                              : "var(--text-secondary)",
                        }}
                      >
                        {peerTyping
                          ? "typing…"
                          : isOnline(other.last_seen)
                            ? "Online now"
                            : other.last_seen
                              ? `Active ${formatRelativeTime(other.last_seen)}`
                              : `@${other.username}`}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setChatSearch((v) => !v);
                        setChatQuery("");
                      }}
                      aria-label="Search in this chat"
                      aria-pressed={chatSearch}
                      className={`ml-auto p-2 rounded-lg transition-colors flex-shrink-0 ${
                        chatSearch
                          ? "bg-brand-green-800 text-white"
                          : "text-[var(--text-secondary)] hover:bg-[var(--border)]"
                      }`}
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </>
                ) : null;
              })()}
            </div>

            {chatSearch && (
              <div
                className="px-4 py-2 border-b border-[var(--border)]"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />

                  <input
                    autoFocus
                    type="search"
                    value={chatQuery}
                    onChange={(e) => setChatQuery(e.target.value)}
                    placeholder="Search in this chat…"
                    className="input pl-9 text-sm"
                  />
                </div>

                {chatQuery.trim() && (
                  <p
                    className="mt-1.5 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {visibleMessages.length}{" "}
                    {visibleMessages.length === 1 ? "result" : "results"} in
                    the loaded messages
                  </p>
                )}
              </div>
            )}

            {mostRecentPin && (
              <div
                className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                <Pin
                  className="w-3.5 h-3.5 flex-shrink-0"
                  style={{ color: "rgb(var(--a-600))" }}
                />

                <button
                  onClick={() => jumpTo(mostRecentPin.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span
                      className="font-semibold"
                      style={{ color: "rgb(var(--a-600))" }}
                    >
                      {nameOf(mostRecentPin.sender_id)}:
                    </span>{" "}
                    {mostRecentPin.content ||
                      attachmentPreview(mostRecentPin)}
                  </p>
                </button>

                {pinnedMessages.length > 1 && (
                  <span
                    className="text-[11px] flex-shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {pinnedMessages.length} pinned
                  </span>
                )}

                <button
                  onClick={() => void togglePin(mostRecentPin)}
                  className="p-1 rounded-lg flex-shrink-0 text-[var(--text-secondary)] hover:bg-[var(--border)]"
                  aria-label="Unpin this message"
                >
                  <PinOff className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <>
                  <MessageSkeleton />
                  <MessageSkeleton />
                  <MessageSkeleton />
                </>
              ) : (
                visibleMessages.map((msg) => {
                  const isMe = msg.sender_id === currentUserId;
                  const peerViewOnce = isPeerViewOnce(msg);
                  const opened = peerViewOnce && !!msg.viewed_at;

                  const media =
                    msg.attachment_url && !peerViewOnce
                      ? urls[msg.attachment_url]
                      : undefined;

                  let attachment: React.ReactNode = null;

                  if (peerViewOnce) {
                    attachment = opened ? (
                      <p className="flex items-center gap-2 px-4 pt-3 text-xs opacity-70">
                        <CheckCheck className="w-4 h-4 flex-shrink-0" />
                        Opened · view once
                      </p>
                    ) : (
                      <button
                        onClick={() => void openViewOnce(msg)}
                        disabled={openingId === msg.id}
                        className="w-full flex items-center gap-2.5 px-4 pt-3 text-left hover:opacity-90 disabled:opacity-60"
                        aria-label={`Open the ${msg.attachment_kind === "video" ? "video" : "photo"} sent for one view`}
                      >
                        <span className="p-2 rounded-xl bg-black/15 flex-shrink-0">
                          <Eye className="w-4 h-4" />
                        </span>

                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {msg.attachment_kind === "video"
                              ? "View-once video"
                              : "View-once photo"}
                          </span>

                          <span className="block text-[11px] opacity-70">
                            {openingId === msg.id
                              ? "Opening…"
                              : "Tap to view · disappears after"}
                          </span>
                        </span>
                      </button>
                    );
                  } else if (isStickerPath(msg.attachment_url)) {
                    attachment = (
                      <div className="px-3 pt-3">
                        <img
                          src={msg.attachment_url!}
                          alt={
                            msg.attachment_name?.replace(/^sticker:/, "") ||
                            "Sticker"
                          }
                          className="w-28 h-28 sm:w-32 sm:h-32"
                          draggable={false}
                        />
                      </div>
                    );
                  } else if (isVoiceNote(msg.attachment_name)) {
                    attachment = media ? (
                      <VoiceNote src={media} mine={isMe} />
                    ) : (
                      <p className="px-4 pt-2.5 text-xs opacity-60">
                        Loading voice note…
                      </p>
                    );
                  } else if (msg.attachment_kind === "image") {
                    attachment = media ? (
                      <a
                        href={media}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <img
                          src={media}
                          alt={msg.attachment_name || "Photo"}
                          className="max-h-72 w-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <p className="px-4 pt-2.5 text-xs opacity-60">
                        Loading photo…
                      </p>
                    );
                  } else if (msg.attachment_kind === "video") {
                    attachment = media ? (
                      <video
                        src={media}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-72 w-full bg-black"
                      />
                    ) : (
                      <p className="px-4 pt-2.5 text-xs opacity-60">
                        Loading video…
                      </p>
                    );
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
                          <span className="block text-sm font-medium truncate">
                            {msg.attachment_name || "File"}
                          </span>

                          <span
                            className={`block text-[11px] ${
                              isMe
                                ? "text-white/60"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {fileSizeLabel(msg.attachment_size)}
                          </span>
                        </span>
                      </a>
                    ) : (
                      <p className="px-4 pt-2.5 text-xs opacity-60">
                        Loading file…
                      </p>
                    );
                  }

                  const deleted = !!msg.deleted_at;
                  const quoted = msg.reply_to ? byId.get(msg.reply_to) : null;

                  const actions: MessageAction[] = deleted
                    ? []
                    : ([
                        "react",
                        "reply",
                        isMe && msg.content ? "edit" : null,
                        msg.content ? "copy" : null,
                        msg.view_once ? null : "forward",
                        "pin",
                        isMe ? "unsend" : null,
                      ] as (MessageAction | null)[]).filter(
                        (a): a is MessageAction => !!a
                      );

                  const menu = actions.length > 0 && (
                    <MessageMenu
                      actions={actions}
                      pinned={!!msg.pinned_at}
                      label={msg.content || attachmentPreview(msg)}
                      onAction={(a) => {
                        if (a === "react") {
                          setReactingId(
                            reactingId === msg.id ? null : msg.id
                          );
                        }

                        if (a === "reply") {
                          setReplyTo(msg);
                          setEditing(null);
                          messageInputRef.current?.focus();
                        }

                        if (a === "edit") {
                          beginEdit(msg);
                          messageInputRef.current?.focus();
                        }

                        if (a === "copy") void copyText(msg);
                        if (a === "forward") setForwarding(msg);
                        if (a === "pin") void togglePin(msg);
                        if (a === "unsend") setPendingUnsend(msg);
                      }}
                    />
                  );

                  const chipGroups: {
                    emoji: string;
                    count: number;
                    mine: boolean;
                  }[] = [];

                  (reactions[msg.id] || []).forEach((r) => {
                    const g = chipGroups.find((c) => c.emoji === r.emoji);

                    if (g) {
                      g.count += 1;
                      g.mine = g.mine || r.user_id === currentUserId;
                    } else {
                      chipGroups.push({
                        emoji: r.emoji,
                        count: 1,
                        mine: r.user_id === currentUserId,
                      });
                    }
                  });

                  return (
                    <div
                      key={msg.id}
                      id={`msg-${msg.id}`}
                      className={`group flex items-start gap-1.5 ${
                        isMe ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!isMe && menu}

                      <div
                        className={`max-w-[80%] md:max-w-[75%] flex flex-col gap-1 ${
                          isMe ? "items-end" : "items-start"
                        }`}
                      >
                        {reactingId === msg.id && (
                          <div
                            className="flex items-center gap-0.5 px-2 py-1 rounded-full border shadow-lg z-20"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border)",
                            }}
                          >
                            {REACTION_EMOJIS.map((e) => (
                              <button
                                key={e}
                                onClick={() => void toggleReaction(msg, e)}
                                className="p-0.5 text-lg leading-none transition-transform hover:scale-125"
                                aria-label={`React with ${e}`}
                              >
                                {e}
                              </button>
                            ))}
                          </div>
                        )}

                        <div
                          className={`max-w-full rounded-2xl text-sm overflow-hidden ${
                            isStickerPath(msg.attachment_url) && !msg.content
                              ? "bg-transparent"
                              : isMe
                                ? "bg-brand-green-800 text-white rounded-br-sm"
                                : "bg-[var(--border)] text-[var(--text-primary)] rounded-bl-sm"
                          }`}
                        >
                          {deleted ? (
                            <p
                              className={`italic px-4 py-2.5 text-xs ${
                                isMe
                                  ? "text-white/70"
                                  : "text-[var(--text-secondary)]"
                              }`}
                            >
                              This message was deleted
                            </p>
                          ) : (
                            <>
                              {quoted && (
                                <div
                                  className={`mx-4 mt-2.5 rounded-lg px-2.5 py-1.5 text-[11px] border-l-2 ${
                                    isMe
                                      ? "bg-black/15 border-white/50"
                                      : "bg-[var(--bg-card)] border-[rgb(var(--a-700))]"
                                  }`}
                                >
                                  <p className="opacity-80 truncate">
                                    {nameOf(quoted.sender_id)}
                                  </p>
                                  <p className="truncate">
                                    {quoted.content || attachmentPreview(quoted)}
                                  </p>
                                </div>
                              )}

                              {msg.forwarded_from && (
                                <p
                                  className={`flex items-center gap-1.5 px-4 pt-2.5 text-[11px] ${
                                    isMe
                                      ? "text-white/70"
                                      : "text-[var(--text-secondary)]"
                                  }`}
                                >
                                  <Share className="w-3 h-3 flex-shrink-0" />
                                  Forwarded
                                </p>
                              )}

                              {attachment}

                              {msg.view_once && isMe && (
                                <p className="flex items-center gap-1.5 px-4 pt-1.5 text-[11px] text-white/70">
                                  <Eye className="w-3.5 h-3.5 flex-shrink-0" />
                                  View once
                                  {msg.viewed_at ? " · opened" : " · waiting"}
                                </p>
                              )}

                              {msg.story_id && (
                                <p
                                  className={`flex items-center gap-1.5 px-4 pt-2.5 text-[11px] ${
                                    isMe
                                      ? "text-white/70"
                                      : "text-[var(--text-secondary)]"
                                  }`}
                                >
                                  <ImageIcon className="w-3 h-3 flex-shrink-0" />
                                  Story reply
                                </p>
                              )}

                              {msg.content && (
                                <p className="leading-relaxed px-4 pt-2.5">
                                  {highlightText(msg.content, chatQuery)}
                                </p>
                              )}

                              <p
                                className={`flex items-center gap-1.5 text-[10px] px-4 pt-1 pb-2 ${
                                  isStickerPath(msg.attachment_url) && !msg.content
                                    ? "text-[var(--text-secondary)] px-3"
                                    : isMe
                                      ? "text-white/60"
                                      : "text-[var(--text-secondary)]"
                                }`}
                              >
                                {msg.pinned_at && (
                                  <Pin className="w-3 h-3 flex-shrink-0" />
                                )}

                                <span>{formatMessageTime(msg.created_at)}</span>

                                {msg.edited_at && <span>· edited</span>}

                                {isMe &&
                                  (msg.is_read ? (
                                    <CheckCheck
                                      className="w-3.5 h-3.5 text-sky-300 flex-shrink-0"
                                      aria-label="Read"
                                    />
                                  ) : (
                                    <Check
                                      className="w-3.5 h-3.5 opacity-80 flex-shrink-0"
                                      aria-label="Sent"
                                    />
                                  ))}
                              </p>
                            </>
                          )}
                        </div>

                        {chipGroups.length > 0 && (
                          <div
                            className={`flex flex-wrap gap-1 ${
                              isMe ? "justify-end" : ""
                            }`}
                          >
                            {chipGroups.map((c) => (
                              <button
                                key={c.emoji}
                                onClick={() => void toggleReaction(msg, c.emoji)}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-xs ${
                                  c.mine
                                    ? "border-[rgb(var(--a-600))]"
                                    : "border-[var(--border)]"
                                }`}
                                style={{ backgroundColor: "var(--bg-card)" }}
                                aria-label={`${c.emoji} from ${c.count} ${
                                  c.count === 1 ? "person" : "people"
                                }`}
                              >
                                <span>{c.emoji}</span>

                                {c.count > 1 && (
                                  <span
                                    className="font-semibold"
                                    style={{ color: "var(--text-secondary)" }}
                                  >
                                    {c.count}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {isMe && menu}
                    </div>
                  );
                })
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-[var(--border)]">
              {(editing || replyTo) && composerQuote && (
                <div className="px-4 pt-3">
                  <div className="flex items-center gap-2 max-w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    {editing ? (
                      <Pencil
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: "rgb(var(--a-600))" }}
                      />
                    ) : (
                      <CornerUpLeft
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: "rgb(var(--a-600))" }}
                      />
                    )}

                    <span
                      className="min-w-0 text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <span
                        className="font-semibold block"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {composerLabel}
                      </span>

                      <span className="block truncate">
                        {composerQuote.content ||
                          attachmentPreview(composerQuote)}
                      </span>
                    </span>

                    <button
                      onClick={() => {
                        cancelEdit();
                        setReplyTo(null);
                      }}
                      className="ml-auto p-1 rounded hover:bg-[var(--border)] flex-shrink-0"
                      aria-label={
                        editing ? "Cancel editing" : "Cancel reply"
                      }
                    >
                      <X className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                    </button>
                  </div>
                </div>
              )}

              {voice.requesting && (
                <div className="px-4 pt-3">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <Mic
                      className="w-4 h-4 flex-shrink-0 animate-pulse"
                      style={{ color: "rgb(var(--a-600))" }}
                    />

                    <span className="text-[11px] text-[var(--text-secondary)] flex-1 min-w-0">
                      Waiting for microphone permission… choose{" "}
                      <strong className="text-[var(--text-primary)]">
                        Allow
                      </strong>{" "}
                      in your browser.
                    </span>

                    <button
                      type="button"
                      onClick={() => voice.stop(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--border)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {voice.recording && (
                <div className="px-4 pt-3">
                  <div
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                    style={{
                      borderColor: "#ef4444",
                      backgroundColor: "var(--bg-card)",
                    }}
                  >
                    <span className="relative flex items-center justify-center w-8 h-8 flex-shrink-0">
                      <span
                        className="absolute inset-0 rounded-full bg-red-500/25"
                        style={{
                          transform: `scale(${1 + voice.level * 0.6})`,
                          transition: "transform 90ms linear",
                        }}
                      />

                      <Mic className="w-4 h-4 text-red-500 relative" />
                    </span>

                    <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                      {Math.floor(voice.seconds / 60)}:
                      {String(voice.seconds % 60).padStart(2, "0")}
                    </span>

                    <span className="text-[11px] text-[var(--text-secondary)] flex-1 min-w-0 truncate">
                      Recording… up to {Math.floor(MAX_VOICE_SECONDS / 60)}{" "}
                      minutes
                    </span>

                    <button
                      type="button"
                      onClick={() => voice.stop(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--border)]"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => voice.stop(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 inline-flex items-center gap-1.5"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {voiceDraft && !voice.recording && (
                <div className="px-4 pt-3">
                  <div className="inline-flex flex-col gap-1 max-w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <div className="flex items-center gap-2">
                      <Mic
                        className="w-3.5 h-3.5 flex-shrink-0"
                        style={{ color: "rgb(var(--a-600))" }}
                      />

                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        Voice note · {Math.floor(voiceDraft.seconds / 60)}:
                        {String(voiceDraft.seconds % 60).padStart(2, "0")}
                      </span>

                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {fileSizeLabel(voiceDraft.file.size)}
                      </span>

                      <button
                        onClick={() => pickFile(null)}
                        aria-label="Discard this voice note"
                        className="ml-auto p-0.5 rounded hover:bg-[var(--border)] flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                      </button>
                    </div>

                    <VoiceNote
                      src={voiceDraft.url}
                      mine={false}
                      durationHint={voiceDraft.seconds}
                    />

                    <p className="text-[11px] text-[var(--text-secondary)] px-1 pb-1">
                      Listen back, then press send.
                    </p>
                  </div>
                </div>
              )}

              {file && !voiceDraft && (
                <div className="px-4 pt-3">
                  <div className="inline-flex items-center gap-2 max-w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                    <FileText className="w-4 h-4 flex-shrink-0 text-[var(--text-secondary)]" />

                    <span className="text-xs text-[var(--text-primary)] truncate">
                      {file.name}
                    </span>

                    <span className="text-[11px] text-[var(--text-secondary)] flex-shrink-0">
                      {fileSizeLabel(file.size)}
                    </span>

                    {viewOnce && isViewOnceMedia(kindOfFile(file)) && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 text-[var(--brand-gold)]">
                        <Eye className="w-3 h-3" />
                        View once
                      </span>
                    )}

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

              <div className="px-3 sm:px-4 py-3 flex gap-1.5 sm:gap-2 items-end relative">
                {stickerOpen && (
                  <StickerPicker
                    onPick={(s) => void sendSticker(s)}
                    onClose={() => setStickerOpen(false)}
                  />
                )}

                <input
                  ref={photoInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="video/*,.pdf,.doc,.docx,.txt,.zip"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />

                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={sending || !!editing}
                  className="p-2 sm:p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 flex-shrink-0"
                  aria-label="Send a photo from your device"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || !!editing}
                  className="p-2 sm:p-2.5 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 flex-shrink-0"
                  aria-label="Attach a video or document"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setViewOnce((v) => !v)}
                  disabled={
                    !file ||
                    !isViewOnceMedia(kindOfFile(file)) ||
                    sending
                  }
                  aria-label="Send this photo or video for one view only"
                  aria-pressed={viewOnce}
                  className={`p-2 sm:p-2.5 rounded-xl border flex-shrink-0 transition-colors disabled:opacity-40 ${
                    file && isViewOnceMedia(kindOfFile(file))
                      ? ""
                      : "hidden sm:block"
                  } ${
                    viewOnce
                      ? "bg-brand-green-800 text-white border-brand-green-800"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Eye className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  data-sticker-toggle
                  onClick={() => setStickerOpen((v) => !v)}
                  disabled={sending || !!editing || voice.recording}
                  aria-label="Open the sticker picker"
                  aria-expanded={stickerOpen}
                  className={`p-2 sm:p-2.5 rounded-xl border flex-shrink-0 transition-colors disabled:opacity-40 ${
                    stickerOpen
                      ? "bg-brand-green-800 text-white border-brand-green-800"
                      : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <StickerIcon className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    voice.recording || voice.requesting
                      ? voice.stop(!voice.recording)
                      : void voice.start()
                  }
                  disabled={sending || !!editing}
                  aria-label={
                    voice.recording
                      ? "Stop and preview the voice note"
                      : voice.requesting
                        ? "Cancel the microphone request"
                        : "Record a voice note"
                  }
                  className={`p-2 sm:p-2.5 rounded-xl border flex-shrink-0 transition-colors disabled:opacity-40 ${
                    voice.recording
                      ? "bg-red-500 text-white border-red-500 animate-pulse"
                      : voice.requesting
                        ? "border-[rgb(var(--a-600))] text-[rgb(var(--a-600))] animate-pulse"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {voice.recording ? (
                    <Square className="w-4 h-4 fill-current" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>

                <input
                  ref={messageInputRef}
                  type="text"
                  placeholder={
                    editing ? "Edit your message…" : "Type a message…"
                  }
                  value={editing ? editText : input}
                  onChange={(e) => {
                    if (editing) {
                      setEditText(e.target.value);
                    } else {
                      setInput(e.target.value);
                      emitTyping();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || e.shiftKey) return;

                    e.preventDefault();

                    if (editing) {
                      void saveEdit();
                    } else {
                      void sendMessage();
                    }
                  }}
                  className="input flex-1 min-w-0"
                  maxLength={5000}
                />

                <button
                  onClick={() =>
                    editing ? saveEdit() : sendMessage()
                  }
                  disabled={
                    sending ||
                    (editing
                      ? !editText.trim()
                      : !input.trim() && !file)
                  }
                  className="btn-primary px-3 sm:px-4 py-2.5 rounded-xl disabled:opacity-40 flex-shrink-0"
                  aria-label={
                    editing ? "Save the edited message" : "Send message"
                  }
                >
                  {editing ? (
                    <CheckCheck className="w-4 h-4" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* View-once viewer */}
      {viewer && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="View-once message"
        >
          <div className="flex items-center gap-2 text-white/80 text-xs mb-3">
            <Eye className="w-4 h-4 flex-shrink-0" />

            <span>
              {viewer.kind === "video"
                ? "View-once video"
                : "View-once photo"}{" "}
              · closes when you leave
            </span>

            <button
              onClick={() => setViewer(null)}
              className="ml-2 p-1.5 rounded-full bg-white/15 hover:bg-white/25"
              aria-label="Close view-once message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {viewer.kind === "video" ? (
            <video
              src={viewer.url}
              controls
              playsInline
              autoPlay
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
              className="max-h-[70vh] w-full max-w-3xl bg-black"
            />
          ) : (
            <img
              src={viewer.url}
              alt={viewer.name || "Photo"}
              onContextMenu={(e) => e.preventDefault()}
              className="max-h-[70vh] w-auto max-w-full object-contain"
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void deleteConversation(pendingDelete);
        }}
        title="Delete chat"
        message="This removes the conversation from your inbox. The other person keeps their copy, and a new message from them brings the thread back."
        confirmLabel="Delete chat"
        danger
        loading={deleting}
      />

      <ConfirmDialog
        open={!!pendingUnsend}
        onClose={() => setPendingUnsend(null)}
        onConfirm={() => {
          if (pendingUnsend) void unsendMessage(pendingUnsend);
        }}
        title="Unsend message"
        message="This removes the message for both of you. They will see that it was deleted."
        confirmLabel="Unsend"
        danger
        loading={unsending}
      />

      {forwarding && (
        <ForwardDialog
          open
          onClose={() => setForwarding(null)}
          targets={forwardTargets}
          preview={`Forwarding: ${
            forwarding.content || attachmentPreview(forwarding)
          }`}
          onPick={(target) => void forwardTo(forwarding, target)}
        />
      )}
    </div>
  );
}