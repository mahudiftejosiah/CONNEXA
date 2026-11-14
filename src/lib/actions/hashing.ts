"use server";

import { createClient } from "@/lib/supabase/server";
import { getProStatus } from "@/lib/pro";
import {
  HASHING_DEFAULTS, getHashingSettings, readUsage, saveHashingSettings, type HashingSettings,
} from "@/lib/hashing-settings";
import {
  algorithmById, candidatesFor, digestHex, parseHash, supportedAlgorithms, verifyAgainst,
} from "@/lib/hashing";

const MAX_INPUT = 20_000;

type Access = { error: string } | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; settings: HashingSettings };

// The browser is never the authority here: every mode below re-reads the saved
// switches and the signed-in profile on the server.
async function access(algorithm?: string): Promise<Access> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  const settings = await getHashingSettings(supabase);

  if (!settings.enabled) return { error: "The hashing bot is switched off by an administrator." };
  if (settings.audience === "admin" && !profile?.is_admin) return { error: "Administrators only." };
  if (settings.audience === "pro" && !profile?.is_admin) {
    const pro = await getProStatus(supabase, user.id);
    if (!pro.pro) return { error: "CONNEXA PRO is required for the hashing bot." };
  }
  if (algorithm && !settings.algorithms.includes(algorithm)) {
    return { error: `That algorithm has been disabled by an administrator.` };
  }
  return { ok: true, supabase, settings };
}

// Only the shape of the request is recorded. Text and hashes never leave the
// call they belong to, so there is nothing here to log.
async function record(supabase: Awaited<ReturnType<typeof createClient>>, mode: string, algorithm: string | null) {
  try {
    await supabase.from("hashing_usage").insert({ mode, algorithm });
  } catch {
    // Usage counting is optional; the result the admin asked for is not.
  }
}

export async function hashText(text: string, algorithm: string) {
  const guard = await access(algorithm);
  if ("error" in guard) return { error: guard.error };
  const value = String(text ?? "");
  if (!value.trim()) return { error: "Type or paste some text first." };
  if (value.length > MAX_INPUT) return { error: `Keep it under ${MAX_INPUT.toLocaleString()} characters.` };

  const hash = digestHex(algorithm, value);
  if (hash === null) return { error: "This server does not provide that algorithm." };
  await record(guard.supabase, "generate", algorithm);
  return { hash, algorithm, label: algorithmById(algorithm)?.label ?? algorithm };
}

export async function identifyHash(hash: string) {
  const guard = await access();
  if ("error" in guard) return { error: guard.error };

  const parsed = parseHash(hash);
  if ("error" in parsed) return { error: parsed.error };

  const matches = candidatesFor(parsed.bytes.length).filter((a) => guard.settings.algorithms.includes(a.id));
  await record(guard.supabase, "identify", matches.length === 1 ? matches[0].id : null);
  return {
    format: parsed.format,
    bytes: parsed.bytes.length,
    hexLength: parsed.bytes.length * 2,
    candidates: matches,
    explanation: matches.length > 1
      ? `A ${parsed.bytes.length}-byte digest is produced by ${matches.length} algorithms on this list, so the length alone cannot pick one: ${matches.map((m) => m.label).join(", ")}. Use Verify to settle it.`
      : matches.length === 1
        ? `Only ${matches[0].label} produces a ${parsed.bytes.length}-byte digest here.`
        : "The length matches algorithms this tool has, but an administrator has switched them all off.",
  };
}

export async function verifyOriginal(hash: string, algorithm: string, original: string) {
  const guard = await access(algorithm);
  if ("error" in guard) return { error: guard.error };

  const parsed = parseHash(hash);
  if ("error" in parsed) return { error: parsed.error };
  const value = String(original ?? "");
  if (!value) return { error: "Enter the original text to test." };
  if (value.length > MAX_INPUT) return { error: `Keep it under ${MAX_INPUT.toLocaleString()} characters.` };

  const match = verifyAgainst(algorithm, parsed, value);
  await record(guard.supabase, "verify", algorithm);
  return { match, algorithm };
}

// The only honest way to "reverse" a hash: test the texts the caller already
// holds and report which one produced it. No guessing, no wordlists, no
// cracking — a hash is one-way and CONNEXA says so.
export async function revertWithKnownTexts(hash: string, originals: string[]) {
  const guard = await access();
  if ("error" in guard) return { error: guard.error };

  const parsed = parseHash(hash);
  if ("error" in parsed) return { error: parsed.error };

  const texts = originals.map((t) => String(t ?? "")).filter((t) => t.length > 0).slice(0, 200);
  if (texts.length === 0) return { error: "Add at least one text you believe produced this hash." };

  const ids = guard.settings.algorithms.filter((id) => candidatesFor(parsed.bytes.length).some((a) => a.id === id));
  if (ids.length === 0) return { error: "No enabled algorithm matches that length." };

  const found: { original: string; algorithm: string; label: string }[] = [];
  for (const text of texts) {
    for (const id of ids) {
      if (verifyAgainst(id, parsed, text)) {
        found.push({ original: text, algorithm: id, label: algorithmById(id)?.label ?? id });
      }
    }
  }
  await record(guard.supabase, "revert", found.length === 1 ? found[0].algorithm : null);
  return { found, tried: texts.length, algorithms: ids.length };
}

export async function getAlgorithms() {
  return { algorithms: supportedAlgorithms().map((a) => ({ id: a.id, label: a.label, bytes: a.bytes, warning: a.warning ?? null })) };
}

export async function saveSettings(patch: Partial<HashingSettings>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { error: "Administrators only." };

  const current = await getHashingSettings(supabase);
  const next: HashingSettings = { ...current, ...patch };
  if (next.algorithms.length === 0) next.algorithms = [HASHING_DEFAULTS.default_algorithm];
  if (!next.algorithms.includes(next.default_algorithm)) next.default_algorithm = next.algorithms[0];
  const saved = await saveHashingSettings(supabase, next);
  if (saved.error) return { error: saved.error };
  return { settings: saved.settings };
}

export async function getUsage() {
  const guard = await access();
  if ("error" in guard) return { error: guard.error };
  return { usage: await readUsage(guard.supabase) };
}
