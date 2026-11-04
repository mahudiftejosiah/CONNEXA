"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./admin";
import { revalidateSite } from "@/lib/revalidateSite";
import { BOT_OFF_MESSAGE, readBotSettings, type Supa } from "@/lib/bot";
import { healthSummary, runHealthChecks } from "@/lib/botHealth";
import type { BotFlag } from "@/lib/supabase/types";

export type CommandResult = { output: string; ok: boolean };

async function writeSetting(supabase: Supa, key: string, value: string): Promise<string | undefined> {
  const { error } = await supabase.from("site_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) return "Failed to save setting. Has the 014 migration been applied?";
  revalidatePath("/admin");
  return undefined;
}

export async function setBotEnabled(on: boolean): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const error = await writeSetting(ctx.supabase, "bot_enabled", on ? "on" : "off");
  if (error) return { error };
  return { success: true };
}

export async function setBotAutoHide(on: boolean): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const settings = await readBotSettings(ctx.supabase);
  if (!settings.enabled) return { error: BOT_OFF_MESSAGE };
  const error = await writeSetting(ctx.supabase, "bot_auto_hide", on ? "on" : "off");
  if (error) return { error };
  return { success: true };
}

export async function setBotKeywords(raw: string): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const settings = await readBotSettings(ctx.supabase);
  if (!settings.enabled) return { error: BOT_OFF_MESSAGE };

  const words = raw.split(",").map((k) => k.trim().slice(0, 40)).filter(Boolean);
  if (words.length === 0) return { error: "Give the bot at least one keyword." };
  if (words.length > 30) return { error: "Keep it to 30 keywords or fewer." };

  const error = await writeSetting(ctx.supabase, "bot_keywords", words.join(", "));
  if (error) return { error };
  return { success: true };
}

export async function botScan(limit: number): Promise<{ error?: string; raised?: number }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const settings = await readBotSettings(ctx.supabase);
  if (!settings.enabled) return { error: BOT_OFF_MESSAGE };

  const { data, error } = await ctx.supabase.rpc("bot_scan", { p_limit: Math.max(1, Math.min(200, Math.round(limit) || 25)) });
  if (error) return { error: error.message };
  return { raised: data as number };
}

export async function actOnFlag(flagId: string, action: "hide" | "restore"): Promise<{ error?: string; success?: boolean }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  if (action === "hide") {
    const settings = await readBotSettings(ctx.supabase);
    if (!settings.enabled) return { error: BOT_OFF_MESSAGE };
  }

  const { error } = action === "hide"
    ? await ctx.supabase.rpc("bot_hide", { p_flag_id: flagId })
    : await ctx.supabase.rpc("bot_restore", { p_flag_id: flagId });
  if (error) return { error: error.message };

  revalidateSite();
  return { success: true };
}

// Short codes are the first characters of the flag uuid, matched against the
// open queue so an admin can type four keys instead of a full uuid.
async function findByCode(supabase: Supa, code: string): Promise<BotFlag[]> {
  const { data } = await supabase
    .from("bot_flags")
    .select("*")
    .eq("open", true)
    .order("created_at", { ascending: false })
    .limit(200);
  const clean = code.trim().toLowerCase();
  return ((data || []) as BotFlag[]).filter((f) => f.id.toLowerCase().startsWith(clean));
}

export async function runBotCommand(input: string): Promise<CommandResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { output: ctx.error, ok: false };
  const { supabase } = ctx;

  const trimmed = input.trim();
  if (!trimmed) return { output: "Type a command. Try “help”.", ok: false };

  const [verb, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(" ");
  const settings = await readBotSettings(supabase);
  const cmd = verb.toLowerCase();

  switch (cmd) {
    case "help":
      return {
        output: [
          "status                 what the bot is doing right now",
          "check                  walk the live site: database, posting, messaging, schema",
          "security               same check, read as alerts — spam, links, reports",
          "scan [n]               sweep the last 30 days for matches (default 25)",
          "hide CODE              hide the flagged post or comment",
          "restore CODE           put a flagged item back",
          "turn on | turn off     master switch — off means no scanning at all",
          "autohide on | off      hide matches without asking you first",
          "keywords a, b, c       replace the word list",
        ].join("\n"),
        ok: true,
      };

    case "status": {
      const { count } = await supabase.from("bot_flags").select("id", { count: "exact", head: true }).eq("open", true);
      return {
        output: [
          `Master switch:  ${settings.enabled ? "ON" : "OFF"}`,
          `Auto-hide:      ${settings.autoHide ? "ON" : "OFF (review only)"}`,
          `Keywords:       ${settings.keywords.length ? settings.keywords.join(", ") : "(none)"}`,
          `Open flags:     ${count || 0}`,
        ].join("\n"),
        ok: true,
      };
    }

    case "turn": {
      const on = arg.toLowerCase();
      if (on !== "on" && on !== "off") return { output: "Usage: turn on  |  turn off", ok: false };
      const { error } = await supabase.from("site_settings").upsert({ key: "bot_enabled", value: on }, { onConflict: "key" });
      if (error) return { output: "Failed to save the switch. Has the 014 migration been applied?", ok: false };
      revalidatePath("/admin");
      return {
        output: on === "on"
          ? "Assistant bot is ON. It will check new posts and comments against your keywords."
          : "Assistant bot is OFF. It flags nothing and hides nothing until you turn it back on.",
        ok: true,
      };
    }

    case "autohide": {
      if (!settings.enabled) return { output: BOT_OFF_MESSAGE, ok: false };
      const on = arg.toLowerCase();
      if (on !== "on" && on !== "off") return { output: "Usage: autohide on  |  autohide off", ok: false };
      const { error } = await supabase.from("site_settings").upsert({ key: "bot_auto_hide", value: on }, { onConflict: "key" });
      if (error) return { output: "Failed to save setting.", ok: false };
      revalidatePath("/admin");
      return {
        output: on === "on"
          ? "Auto-hide ON: matches disappear from feeds the moment they are caught."
          : "Auto-hide OFF: matches go to the review queue and stay published until you act.",
        ok: true,
      };
    }

    case "keywords": {
      if (!settings.enabled) return { output: BOT_OFF_MESSAGE, ok: false };
      if (!arg) return { output: `Current keywords: ${settings.keywords.join(", ") || "(none)"}`, ok: true };
      const words = arg.split(",").map((k) => k.trim().slice(0, 40)).filter(Boolean);
      if (words.length === 0 || words.length > 30) return { output: "Between 1 and 30 keywords, comma separated.", ok: false };
      const { error } = await supabase.from("site_settings").upsert({ key: "bot_keywords", value: words.join(", ") }, { onConflict: "key" });
      if (error) return { output: "Failed to save keywords.", ok: false };
      revalidatePath("/admin");
      return { output: `Watching for ${words.length} keyword(s): ${words.join(", ")}`, ok: true };
    }

    case "scan": {
      if (!settings.enabled) return { output: BOT_OFF_MESSAGE, ok: false };
      const limit = arg ? Math.max(1, Math.min(200, parseInt(arg, 10) || 25)) : 25;
      const { data, error } = await supabase.rpc("bot_scan", { p_limit: limit });
      if (error) return { output: error.message, ok: false };
      revalidateSite();
      return {
        output: (data as number) > 0
          ? `Scanned up to ${limit} recent items — ${data} new flag(s) in the queue.`
          : `Scanned up to ${limit} recent items — nothing matched.`,
        ok: true,
      };
    }

    case "hide":
    case "restore": {
      if (!arg) return { output: `Usage: ${cmd} CODE  (the short code shown beside each flag)`, ok: false };
      if (cmd === "hide" && !settings.enabled) return { output: BOT_OFF_MESSAGE, ok: false };
      const matches = await findByCode(supabase, arg);
      if (matches.length === 0) return { output: `No open flag starts with “${arg}”. Run “status” to see the queue.`, ok: false };
      if (matches.length > 1) return { output: `“${arg}” matches ${matches.length} flags — type more characters.`, ok: false };
      const flag = matches[0];
      const { error } = cmd === "hide"
        ? await supabase.rpc("bot_hide", { p_flag_id: flag.id })
        : await supabase.rpc("bot_restore", { p_flag_id: flag.id });
      if (error) return { output: error.message, ok: false };
      revalidateSite();
      return {
        output: cmd === "hide"
          ? `Hid ${flag.entity_type} ${flag.id.slice(0, 8)} (${flag.matched_keyword || "manual"}).`
          : `Restored ${flag.entity_type} ${flag.id.slice(0, 8)} to the author's own setting.`,
        ok: true,
      };
    }

    case "check":
    case "health":
    case "security":
    case "alerts": {
      if (!settings.enabled) return { output: BOT_OFF_MESSAGE, ok: false };
      const checks = await runHealthChecks(supabase);
      const failing = checks.filter((c) => c.status === "fail").length;
      return { output: healthSummary(checks), ok: failing === 0 };
    }

    default:
      return { output: `Unknown command “${verb}”. Type “help”.`, ok: false };
  }
}
