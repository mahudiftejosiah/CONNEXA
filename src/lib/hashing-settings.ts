import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { DEFAULT_ALGORITHM, HASH_ALGORITHMS } from "@/lib/hashing";

type Client = SupabaseClient<Database>;

export type HashingSettings = {
  enabled: boolean;
  visible: boolean;
  audience: "admin" | "all" | "pro";
  default_algorithm: string;
  algorithms: string[];
  title: string;
  description: string;
};

export const SETTINGS_KEY = "hashing_bot";

export const HASHING_DEFAULTS: HashingSettings = {
  enabled: true,
  visible: true,
  audience: "admin",
  default_algorithm: DEFAULT_ALGORITHM,
  algorithms: HASH_ALGORITHMS.map((a) => a.id),
  title: "CONNEXA HASHING BOT",
  description: "Turn text into a hash, or check a hash against the text you believe made it.",
};

// One JSON document in the settings table already the app uses — the tool's
// switches live with the theme rather than in a table of their own.
export async function getHashingSettings(supabase: Client): Promise<HashingSettings> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (!data?.value) return { ...HASHING_DEFAULTS };
  try {
    const raw = JSON.parse(data.value) as Partial<HashingSettings>;
    const known = HASH_ALGORITHMS.map((a) => a.id);
    const algorithms = Array.isArray(raw.algorithms)
      ? raw.algorithms.filter((id): id is string => typeof id === "string" && known.includes(id))
      : HASHING_DEFAULTS.algorithms;
    return {
      enabled: raw.enabled !== false,
      visible: raw.visible !== false,
      audience: raw.audience === "all" || raw.audience === "pro" ? raw.audience : "admin",
      default_algorithm: algorithms.includes(raw.default_algorithm ?? "") ? raw.default_algorithm! : DEFAULT_ALGORITHM,
      algorithms: algorithms.length > 0 ? algorithms : [DEFAULT_ALGORITHM],
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title : HASHING_DEFAULTS.title,
      description: typeof raw.description === "string" ? raw.description : HASHING_DEFAULTS.description,
    };
  } catch {
    return { ...HASHING_DEFAULTS };
  }
}

export async function saveHashingSettings(supabase: Client, settings: HashingSettings) {  const clean: HashingSettings = {
    ...settings,
    title: settings.title.trim().slice(0, 80) || HASHING_DEFAULTS.title,
    description: settings.description.trim().slice(0, 400) || HASHING_DEFAULTS.description,
  };
  const { error } = await supabase.from("site_settings")
    .upsert({ key: SETTINGS_KEY, value: JSON.stringify(clean) }, { onConflict: "key" });
  return { error: error?.message ?? null, settings: clean };
}

export type HashingUsage = {
  total: number;
  byMode: Record<string, number>;
  byAlgorithm: Record<string, number>;
};

// Counts only. The table holds no text and no hash, so a usage report can
// never reveal what anybody processed.
export async function readUsage(supabase: Client): Promise<HashingUsage | { error: string }> {
  const { data, error } = await supabase.from("hashing_usage")
    .select("mode, algorithm")
    .limit(2000);
  if (error) return { error: "Usage statistics need migration 028." };

  const usage: HashingUsage = { total: 0, byMode: {}, byAlgorithm: {} };
  for (const row of data ?? []) {
    usage.total += 1;
    usage.byMode[row.mode] = (usage.byMode[row.mode] ?? 0) + 1;
    if (row.algorithm) usage.byAlgorithm[row.algorithm] = (usage.byAlgorithm[row.algorithm] ?? 0) + 1;
  }
  return usage;
}
