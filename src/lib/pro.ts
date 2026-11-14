import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export type ProStatus = {
  pro: boolean;
  expiresAt: string | null;
  friendLimit: number;
  dailyRequestLimit: number | null;
};

// The badge a name wears is decided by exactly the same two columns the server
// gates on: the paid tick, and an expiry that has not passed. A row fetched
// before migration 027 simply has no expiry, which reads as "never lapsed".
export function hasActivePro(
  account?: { is_verified?: boolean | null; pro_expires_at?: string | null } | null
): boolean {
  if (!account?.is_verified) return false;
  const expiry = account.pro_expires_at;
  return !expiry || new Date(expiry).getTime() > Date.now();
}

const FREE = { friendLimit: 5000, dailyRequestLimit: 50 } as const;
const PAID = { friendLimit: 10000, dailyRequestLimit: null } as const;

// CONNEXA PRO is the paid verification an account buys through Upgrade account,
// so the tick plus the expiry the PRO migration carries is the whole answer.
// Every caller runs this on the server; a client is never trusted with it.
export async function getProStatus(supabase: Client, userId: string): Promise<ProStatus> {
  const withExpiry = await supabase.from("profiles")
    .select("is_verified, pro_expires_at")
    .eq("id", userId)
    .single();

  if (withExpiry.error) {
    // pro_expires_at does not exist until migration 027 has been pasted, and
    // naming a missing column fails the whole select.
    const { data } = await supabase.from("profiles").select("is_verified").eq("id", userId).single();
    return data?.is_verified ? { pro: true, expiresAt: null, ...PAID } : { pro: false, expiresAt: null, ...FREE };
  }

  const expiresAt = withExpiry.data.pro_expires_at ?? null;
  const live = expiresAt === null || new Date(expiresAt).getTime() > Date.now();
  const pro = !!withExpiry.data.is_verified && live;
  return pro ? { pro: true, expiresAt, ...PAID } : { pro: false, expiresAt, ...FREE };
}

export type ProFeature = {
  key: string;
  label: string;
  description: string;
  bucket: "identity" | "community" | "entertainment" | "creator";
  enabled: boolean;
};

// Migration 029 seeds every feature as switched on, so a missing table means
// exactly the same thing as a missing row: still available. An administrator
// turning a switch off is the only way a key becomes locked.
export async function listProFeatures(supabase: Client): Promise<ProFeature[]> {
  const { data } = await supabase.from("pro_features")
    .select("key, label, description, bucket, enabled")
    .order("sort", { ascending: true });
  return (data ?? []) as ProFeature[];
}

export async function featureEnabled(supabase: Client, key: string): Promise<boolean> {
  const { data } = await supabase.from("pro_features").select("enabled").eq("key", key).maybeSingle();
  if (!data) return true;
  return data.enabled !== false;
}

// Every premium write path calls this. The frontend hides things, but this is
// what actually decides, and it re-reads the database on each call.
export async function requirePro(supabase: Client, userId: string, feature: string): Promise<{ error: string } | { ok: true }> {
  const status = await getProStatus(supabase, userId);
  if (!status.pro) {
    return { error: "CONNEXA PRO is required for this. Upgrade from your profile to unlock it." };
  }
  if (!(await featureEnabled(supabase, feature))) {
    return { error: "An administrator has switched this CONNEXA PRO feature off." };
  }
  return { ok: true };
}
