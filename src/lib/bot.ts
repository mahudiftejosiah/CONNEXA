import { createClient } from "@/lib/supabase/server";
import type { BotFlagWithAuthor, BotSettings } from "@/lib/supabase/types";
import { runHealthChecks, type HealthCheck } from "@/lib/botHealth";

export type Supa = Awaited<ReturnType<typeof createClient>>;

export const BOT_OFF_MESSAGE = "Assistant bot is switched off. Turn it on first.";

const BOT_KEYS = ["bot_enabled", "bot_auto_hide", "bot_keywords"];

// bot_flags has two foreign keys into profiles, so each embed needs its
// constraint name as the hint or PostgREST cannot pick a path.
const FLAG_FIELDS = "*, author:profiles!bot_flags_author_id_fkey(id, username, display_name, avatar_url, is_verified)";

export async function readBotSettings(supabase: Supa): Promise<BotSettings> {
  const { data } = await supabase.from("site_settings").select("key, value").in("key", BOT_KEYS);
  const map: Record<string, string> = {};
  (data || []).forEach((row) => { map[row.key] = row.value; });
  return {
    enabled: map.bot_enabled === "on",
    autoHide: map.bot_auto_hide === "on",
    keywords: (map.bot_keywords || "").split(",").map((k) => k.trim()).filter(Boolean),
  };
}

export async function getBotPanel(): Promise<{
  settings: BotSettings;
  openFlags: BotFlagWithAuthor[];
  resolved: BotFlagWithAuthor[];
  checks: HealthCheck[];
}> {
  const supabase = await createClient();

  const [settings, openRes, resolvedRes] = await Promise.all([
    readBotSettings(supabase),
    supabase.from("bot_flags").select(FLAG_FIELDS).eq("open", true).order("created_at", { ascending: false }).limit(50),
    supabase.from("bot_flags").select(FLAG_FIELDS).eq("open", false).order("resolved_at", { ascending: false }).limit(20),
  ]);

  // Switched off means switched off: the bot runs no checks at all.
  const checks = settings.enabled ? await runHealthChecks(supabase) : [];

  // If migration 014 has not been applied yet the reads fail — the tab should
  // still open so the admin can flip the switch once the SQL is in.
  if (openRes.error || resolvedRes.error) return { settings, openFlags: [], resolved: [], checks };
  return {
    settings,
    openFlags: (openRes.data || []) as unknown as BotFlagWithAuthor[],
    resolved: (resolvedRes.data || []) as unknown as BotFlagWithAuthor[],
    checks,
  };
}
