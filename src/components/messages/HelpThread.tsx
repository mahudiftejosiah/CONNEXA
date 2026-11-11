"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, RotateCcw, Send } from "lucide-react";
import { answerFor, HELP_SUGGESTIONS, helpGreeting } from "@/lib/help-bot";
import { formatRelativeTime } from "@/lib/utils";

interface Line {
  id: string;
  from: "me" | "bot";
  text: string;
  at: number;
}

// The helper keeps its own thread on the device: answers are generated here, so
// there is nothing to wait for and no conversation to keep in the database.
function keyFor(userId: string) {
  return `connexa-help-${userId}`;
}

function read(userId: string, name: string): Line[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Line[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // A broken or full entry just means we start again.
  }
  return [{ id: "greet", from: "bot", text: helpGreeting(name), at: Date.now() }];
}

export function HelpThread({ userId, displayName, onBack }: {
  userId: string;
  displayName: string;
  onBack: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLines(read(userId, displayName));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [userId, displayName]);

  useEffect(() => {
    try {
      localStorage.setItem(keyFor(userId), JSON.stringify(lines.slice(-60)));
    } catch {
      // Storage full or blocked: the thread still works for this visit.
    }
  }, [lines, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines, typing]);

  function ask(text: string) {
    const clean = text.trim();
    if (!clean) return;
    const mine: Line = { id: `m${Date.now()}`, from: "me", text: clean, at: Date.now() };
    setLines((prev) => [...prev, mine]);
    setDraft("");
    // Answered on the spot; the short pause is only so the reply does not
    // appear before the message you just sent has drawn.
    setTyping(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLines((prev) => [...prev, { id: `b${Date.now()}`, from: "bot", text: answerFor(clean), at: Date.now() }]);
      setTyping(false);
    }, 260);
  }

  function reset() {
    setLines([{ id: "greet", from: "bot", text: helpGreeting(displayName), at: Date.now() }]);
  }

  const asked = lines.some((l) => l.from === "me");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
        <button onClick={onBack} className="md:hidden p-1 rounded-lg hover:bg-[var(--border)]" aria-label="Back to conversations">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: "rgb(var(--a-800))" }}>
          <Bot className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[var(--text-primary)]">CONNEXA Helper</p>
          <p className="text-xs" style={{ color: "rgb(var(--a-600))" }}>Always online · answers instantly</p>
        </div>
        {asked && (
          <button onClick={reset} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <RotateCcw className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {lines.map((l) => (
          <div key={l.id} className={`flex ${l.from === "me" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 ${l.from === "me" ? "bg-brand-green-800 text-white" : "text-[var(--text-primary)]"}`}
              style={l.from === "me" ? undefined : { backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <p className="text-sm whitespace-pre-line leading-relaxed">{l.text}</p>
              <p className={`text-[10px] mt-1 ${l.from === "me" ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
                {formatRelativeTime(new Date(l.at).toISOString())}
              </p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 text-xs" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              typing…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!asked && (
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {HELP_SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors hover:bg-[var(--border)]"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(draft); }}
        className="p-3 border-t border-[var(--border)] flex gap-2"
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about anything on CONNEXA…"
          className="input flex-1" maxLength={500} />
        <button type="submit" disabled={!draft.trim()} aria-label="Send your question"
          className="px-4 rounded-xl text-white disabled:opacity-40 flex items-center justify-center"
          style={{ backgroundColor: "rgb(var(--a-800))" }}>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
