"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageCircle, Search, ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MessageSkeleton } from "@/components/ui/Skeleton";
import { createClient } from "@/lib/supabase/client";
import type { ConversationWithDetails, Profile, Message } from "@/lib/supabase/types";
import { formatMessageTime, formatRelativeTime } from "@/lib/utils";
import toast from "react-hot-toast";

interface MessagesClientProps {
  conversations: ConversationWithDetails[];
  profile: Profile;
  currentUserId: string;
}

export function MessagesClient({ conversations: initConvs, profile: _profile, currentUserId }: MessagesClientProps) {
  const [conversations, setConversations] = useState(initConvs);
  const [active, setActive] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

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
        setMessages((p) => [...p, payload.new as Message]);
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

  async function sendMessage() {
    if (!input.trim() || !active || sending) return;
    setSending(true);
    const content = input.trim();
    setInput("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: active.id,
      sender_id: currentUserId,
      content,
    });
    setSending(false);
    if (error) { toast.error("Failed to send message."); setInput(content); }
  }

  function getOtherParticipant(conv: ConversationWithDetails) {
    return conv.participants.find((p) => p.user_id !== currentUserId)?.profile;
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] -mx-4 -mt-6">
      {/* Conversation list */}
      <div className={`w-full md:w-80 border-r border-[var(--border)] flex flex-col ${active ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="font-bold text-lg text-[var(--text-primary)]">Messages</h2>
          <div className="mt-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input type="search" placeholder="Search conversations…" className="input pl-9 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <EmptyState icon={<MessageCircle className="w-8 h-8" />} title="No messages" description="Start a conversation from someone's profile." />
          ) : (
            conversations.map((conv) => {
              const other = getOtherParticipant(conv);
              if (!other) return null;
              return (
                <button
                  key={conv.id}
                  onClick={() => openConversation(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--border)] transition-colors text-left ${active?.id === conv.id ? "bg-brand-green-800/5 dark:bg-brand-gold-400/5" : ""}`}
                >
                  <Avatar src={other.avatar_url} name={other.display_name} size={48} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className="font-semibold text-sm truncate text-[var(--text-primary)]">{other.display_name}</p>
                      {conv.last_message && (
                        <span className="text-xs text-[var(--text-secondary)] flex-shrink-0 ml-2">
                          {formatRelativeTime(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {conv.last_message ? conv.last_message.content : "No messages yet"}
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
                    <Avatar src={other.avatar_url} name={other.display_name} size={40} />
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">{other.display_name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">@{other.username}</p>
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
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                        isMe
                          ? "bg-brand-green-800 text-white rounded-br-sm"
                          : "bg-[var(--border)] text-[var(--text-primary)] rounded-bl-sm"
                      }`}>
                        <p className="leading-relaxed">{msg.content}</p>
                        <p className={`text-[10px] mt-1 ${isMe ? "text-white/60" : "text-[var(--text-secondary)]"}`}>
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
            <div className="px-4 py-3 border-t border-[var(--border)] flex gap-2">
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
                disabled={!input.trim() || sending}
                className="btn-primary px-4 py-2.5 rounded-xl disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
