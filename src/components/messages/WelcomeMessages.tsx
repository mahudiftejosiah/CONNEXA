"use client";

import Link from "next/link";
import { Users } from "lucide-react";

// Shown only while the account has no conversation at all. The moment a thread
// exists the inbox takes over, so nothing here is ever a stand-in for real chat.
export function WelcomeMessages({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "px-4 py-5" : "flex-1 flex items-center justify-center p-6"}>
      <div
        className={"w-full text-center space-y-4 " + (compact ? "" : "max-w-md card p-8")}
        style={compact ? undefined : { background: "linear-gradient(165deg, var(--bg-card), var(--bg))" }}
      >
        <div
          className={"mx-auto rounded-full flex items-center justify-center " + (compact ? "w-14 h-14 text-2xl" : "w-20 h-20 text-4xl")}
          style={{ background: "rgb(var(--a-800) / 0.12)" }}
        >
          👋
        </div>
        <h2 className={"font-extrabold text-[var(--text-primary)] " + (compact ? "text-lg" : "text-2xl")}>
          Welcome to your messages! 👋
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">Your conversations start here.</p>
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Say Hi 👋 or send a Wave 👋 to your friends and start connecting with the people who matter to you.
        </p>
        <p className="text-sm font-semibold" style={{ color: "rgb(var(--a-600))" }}>Happy chatting! 💬</p>
        <Link href="/friends" className="btn-primary inline-flex items-center gap-2 text-sm">
          <Users className="w-4 h-4" /> Go to my friends
        </Link>
      </div>
    </div>
  );
}