"use client";

import { useEffect, useRef, useState } from "react";
import { CornerUpLeft, Pencil, Copy, Share, Pin, PinOff, Trash2, MoreHorizontal } from "lucide-react";

export type MessageAction = "reply" | "edit" | "copy" | "forward" | "pin" | "unsend";

const LABELS: Record<MessageAction, string> = {
  reply: "Reply",
  edit: "Edit",
  copy: "Copy text",
  forward: "Forward",
  pin: "Pin message",
  unsend: "Unsend",
};

const ICONS: Record<MessageAction, React.ReactNode> = {
  reply: <CornerUpLeft className="w-4 h-4" />,
  edit: <Pencil className="w-4 h-4" />,
  copy: <Copy className="w-4 h-4" />,
  forward: <Share className="w-4 h-4" />,
  pin: <Pin className="w-4 h-4" />,
  unsend: <Trash2 className="w-4 h-4" />,
};

interface MessageMenuProps {
  actions: MessageAction[];
  align: "left" | "right";
  // A message that is already pinned swaps "Pin message" for "Unpin".
  pinned: boolean;
  onAction: (action: MessageAction) => void;
  label: string;
}

// Every action a bubble offers, behind one button. The list is decided by the
// caller because most of these only make sense for your own message.
export function MessageMenu({ actions, align, pinned, onAction, label }: MessageMenuProps) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  function toggle() {
    // The last bubble in a long thread sits against the bottom of the scroll
    // area, so its menu has to grow upwards to stay on screen.
    if (!up) {
      const rect = boxRef.current?.getBoundingClientRect();
      if (rect && window.innerHeight - rect.bottom < 260) setUp(true);
    }
    setOpen((o) => !o);
  }

  return (
    <div ref={boxRef} className="relative flex-shrink-0">
      <button
        onClick={toggle}
        aria-label={`Actions for: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--border)] opacity-70 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 w-44 py-1 rounded-xl border shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          } ${up ? "bottom-full mb-1" : "top-full mt-1"}`}
          style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          {actions.map((a) => {
            const name = a === "pin" && pinned ? "Unpin message" : LABELS[a];
            return (
              <button
                key={a}
                role="menuitem"
                onClick={() => { setOpen(false); onAction(a); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--border)] ${
                  a === "unsend" ? "text-red-500" : "text-[var(--text-primary)]"
                }`}
              >
                {a === "pin" && pinned ? <PinOff className="w-4 h-4" /> : ICONS[a]}
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
