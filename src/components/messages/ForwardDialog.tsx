"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";

export interface ForwardTarget {
  // The whole person travels with the target, because forwarding to someone
  // you have never messaged means creating that thread first.
  person: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  conversationId: string | null;
}

interface ForwardDialogProps {
  open: boolean;
  onClose: () => void;
  targets: ForwardTarget[];
  preview: string;
  onPick: (target: ForwardTarget) => void;
}

// Forwarding sends a copy of the message, not a link to the original, so the
// recipient does not need access to the conversation it came from.
export function ForwardDialog({ open, onClose, targets, preview, onPick }: ForwardDialogProps) {
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const rows = targets.filter((t) => !needle || t.person.display_name.toLowerCase().includes(needle) || t.person.username.toLowerCase().includes(needle));

  return (
    <Modal open={open} onClose={onClose} title="Send to" size="md">
      <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">{preview}</p>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
        <input
          type="search"
          placeholder="Search people…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 text-sm"
          aria-label="Search people to send to"
        />
      </div>

      <div className="max-h-72 overflow-y-auto space-y-1">
        {rows.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-secondary)" }}>
            No one to send to yet. Add a friend first.
          </p>
        ) : rows.map((t) => (
          <button
            key={t.person.id}
            onClick={() => onPick(t)}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors hover:bg-[var(--border)]"
          >
            <Avatar src={t.person.avatar_url} name={t.person.display_name} size={40} userId={t.person.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold truncate text-[var(--text-primary)]">{t.person.display_name}</span>
              <span className="block text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                {t.conversationId ? "Your conversation" : `@${t.person.username}`}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
