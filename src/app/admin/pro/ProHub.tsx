"use client";

import { useState } from "react";
import { Award, CalendarDays, Crown, HardDrive, History, MessagesSquare, Music, ShieldAlert, Store, Trophy, Video } from "lucide-react";
import { ProMembers } from "./ProMembers";
import { ProMusic } from "./ProMusic";
import { ProQuizzes } from "./ProQuizzes";
import { ProCommunity } from "./ProCommunity";
import { ProReports } from "./ProReports";
import { ProEvents, ProLive } from "./ProEventsLive";
import { ProBadges, ProMarketplace } from "./ProCreator";
import { ProUploads } from "./ProUploads";
import { ProMemories } from "./ProMemories";

type Section = "members" | "community" | "reports" | "quizzes" | "music" | "live" | "events" | "badges" | "market" | "memories" | "uploads";

const SECTIONS: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "members",   label: "Membership",     icon: <Crown className="w-4 h-4" /> },
  { key: "community", label: "Community",      icon: <MessagesSquare className="w-4 h-4" /> },
  { key: "reports",   label: "Reports",        icon: <ShieldAlert className="w-4 h-4" /> },
  { key: "quizzes",   label: "Quiz battles",   icon: <Trophy className="w-4 h-4" /> },
  { key: "music",     label: "Music Corner",   icon: <Music className="w-4 h-4" /> },
  { key: "live",      label: "Live streaming", icon: <Video className="w-4 h-4" /> },
  { key: "events",    label: "Events hub",     icon: <CalendarDays className="w-4 h-4" /> },
  { key: "badges",    label: "Badges",         icon: <Award className="w-4 h-4" /> },
  { key: "market",    label: "Marketplace",    icon: <Store className="w-4 h-4" /> },
  { key: "memories",  label: "Memories",       icon: <History className="w-4 h-4" /> },
  { key: "uploads",   label: "Uploads",        icon: <HardDrive className="w-4 h-4" /> },
];

// The whole PRO programme in one place: who belongs, what each premium feature
// holds, and the switches that turn any of it off for everyone at once.
export function ProHub({ adminId }: { adminId: string }) {
  const [section, setSection] = useState<Section>("members");

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h3 className="font-semibold flex items-center gap-2 text-[var(--text-primary)]">
          <Crown className="w-4 h-4" style={{ color: "var(--brand-gold)" }} /> CONNEXA PRO management
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Everything here is written straight to the database, so a change shows for members the next time they open the page.
          No sample content, no placeholder numbers: an empty section means it is genuinely empty.
        </p>
      </div>

      <div className="card rail flex overflow-x-auto">
        {SECTIONS.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex-shrink-0 px-3 py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors ${
              section === s.key
                ? "text-brand-green-800 dark:text-brand-gold-400 border-b-2 border-brand-green-800 dark:border-brand-gold-400"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {section === "members" && <ProMembers adminId={adminId} />}
      {section === "community" && <ProCommunity adminId={adminId} />}
      {section === "reports" && <ProReports adminId={adminId} />}
      {section === "quizzes" && <ProQuizzes adminId={adminId} />}
      {section === "music" && <ProMusic adminId={adminId} />}
      {section === "live" && <ProLive adminId={adminId} />}
      {section === "events" && <ProEvents adminId={adminId} />}
      {section === "badges" && <ProBadges adminId={adminId} />}
      {section === "market" && <ProMarketplace adminId={adminId} />}
      {section === "memories" && <ProMemories adminId={adminId} />}
      {section === "uploads" && <ProUploads adminId={adminId} />}
    </div>
  );
}
