"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { STICKERS, STICKER_CATEGORIES, type Sticker, type StickerCategory } from "@/lib/stickers";

// Choosing a sticker sends it and closes the picker; a tap anywhere outside
// closes it without sending. Both are the behaviour people expect from a chat.
export function StickerPicker({ onPick, onClose }: {
  onPick: (sticker: Sticker) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<StickerCategory>("greetings");
  const [hovered, setHovered] = useState<Sticker | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (boxRef.current?.contains(target)) return;
      if (target?.closest?.("[data-sticker-toggle]")) return;
      onClose();
    }
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const shown = STICKERS.filter((s) => s.category === category);
  const preview = hovered ?? shown[0];

  return (
    <div
      ref={boxRef}
      className="absolute bottom-full left-0 mb-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border shadow-xl overflow-hidden z-40"
      style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border)" }}
      role="dialog"
      aria-label="Sticker picker"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm font-bold flex-1" style={{ color: "var(--text-primary)" }}>Stickers</p>
        <button type="button" onClick={onClose} aria-label="Close the sticker picker"
          className="p-1 rounded-lg hover:bg-[var(--border)] text-[var(--text-secondary)]">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-1 px-2 py-2">
        {STICKER_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => { setCategory(c.key); setHovered(null); }}
            className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={category === c.key
              ? { backgroundColor: "rgb(var(--a-800))", color: "#fff" }
              : { backgroundColor: "var(--bg)", color: "var(--text-secondary)" }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1 px-2 pb-2">
        {shown.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            onMouseEnter={() => setHovered(s)}
            onFocus={() => setHovered(s)}
            aria-label={`Send the ${s.label} sticker`}
            className="aspect-square rounded-xl p-1 transition-transform hover:scale-110 active:scale-95 hover:bg-[var(--border)]"
          >
            <img src={s.url} alt="" className="w-full h-full" draggable={false} />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)" }}>
        {preview && <img src={preview.url} alt="" className="w-9 h-9" draggable={false} />}
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {preview ? <><span className="font-semibold" style={{ color: "var(--text-primary)" }}>{preview.label}</span> · tap to send</> : "Tap a sticker to send it"}
        </p>
      </div>
    </div>
  );
}