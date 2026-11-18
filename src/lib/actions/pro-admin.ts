"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "./admin";
import { revalidateSite } from "@/lib/revalidateSite";
import { hasActivePro } from "@/lib/pro";
import type { Database, Profile } from "@/lib/supabase/types";

// One PRO backend. The admin console panels and the assistant bot both call
// these functions, so a change made in either place is the same row in the same
// table and shows up in the other immediately. Nothing here keeps its own copy
// of a plan, a price or a membership.

export type ProPlan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  blurb: string;
  active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
};

export type PlanInput = {
  id?: string | null;
  name: string;
  price: number;
  currency?: string;
  duration_days: number;
  blurb?: string;
  active?: boolean;
  sort?: number;
};

export type FeatureRow = {
  key: string;
  label: string;
  description: string;
  bucket: "identity" | "community" | "entertainment" | "creator";
  enabled: boolean;
  sort: number;
};

export type UpgradeRequest = {
  id: string;
  user_id: string;
  amount: number;
  reference: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type UpgradeConfig = {
  price: number;
  accountName: string;
  accountNumber: string;
  instructions: string;
};

export type MemberInfo = {
  profile: Profile;
  pro: boolean;
  requests: UpgradeRequest[];
  streamAllowed: boolean | null;
};

const PRO_BUCKETS = ["identity", "community", "entertainment", "creator"] as const;
const PROMO_KEY = "pro_promo";

const MISSING_TABLE = /does not exist|schema cache|42P01/i;

function tableMissing(message: string, table: string): string {
  return MISSING_TABLE.test(message)
    ? `The “${table}” table is not in the database yet. Paste the PRO migrations in the Supabase SQL editor.`
    : message;
}

// stream_permissions predates the hand-written Database type, so this one table
// is reached through an untyped handle rather than widening every caller.
function loose(supabase: unknown): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

async function log(
  supabase: SupabaseClient,
  adminId: string,
  entry: { action: string; reason: string; entityType: string; entityId?: string | null; targetUserId?: string | null }
): Promise<void> {
  await supabase.from("moderation_actions").insert({
    admin_id: adminId,
    target_user_id: entry.targetUserId ?? null,
    entity_id: entry.entityId ?? null,
    entity_type: entry.entityType,
    action: entry.action,
    reason: entry.reason,
  });
}

function afterWrite(): void {
  revalidatePath("/admin");
  revalidatePath("/pro");
  revalidateSite();
}

/* ------------------------------------------------------------------ plans */

export async function listProPlans(): Promise<{ error: string } | { rows: ProPlan[] }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data, error } = await ctx.supabase.from("pro_plans").select("*").order("sort", { ascending: true });
  if (error) return { error: tableMissing(error.message, "pro_plans") };
  return { rows: (data ?? []) as ProPlan[] };
}

export async function saveProPlan(input: PlanInput): Promise<{ error: string } | { plan: ProPlan }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) return { error: "Give the plan a name of at least two characters." };
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) return { error: "Price must be a number of zero or more." };
  const days = Math.round(Number(input.duration_days));
  if (!Number.isFinite(days) || days < 1 || days > 3650) return { error: "Duration must be between 1 and 3650 days." };
  const currency = (input.currency ?? "NGN").trim().toUpperCase().slice(0, 6) || "NGN";

  const values = {
    name,
    price,
    currency,
    duration_days: days,
    blurb: (input.blurb ?? "").trim().slice(0, 300),
    active: input.active !== false,
    sort: Math.round(Number(input.sort ?? 0)) || 0,
  };

  const query = input.id
    ? ctx.supabase.from("pro_plans").update(values).eq("id", input.id)
    : ctx.supabase.from("pro_plans").insert(values);
  const { data, error } = await query.select().single();
  if (error || !data) {
    if (error && /duplicate key|unique/i.test(error.message)) return { error: `A plan called “${name}” already exists.` };
    return { error: tableMissing(error?.message ?? "Nothing came back.", "pro_plans") };
  }

  const plan = data as ProPlan;
  await log(ctx.supabase, ctx.adminId, {
    action: input.id ? "edit_pro_plan" : "create_pro_plan",
    entityType: "pro_plan",
    entityId: plan.id,
    reason: `${input.id ? "Updated" : "Created"} plan “${plan.name}” — ${plan.currency} ${plan.price} for ${plan.duration_days} days${plan.active ? "" : " (unpublished)"}`,
  });
  afterWrite();
  return { plan };
}

export async function deleteProPlan(id: string): Promise<{ error: string } | { success: true }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data: existing } = await ctx.supabase.from("pro_plans").select("name").eq("id", id).maybeSingle();
  const { error } = await ctx.supabase.from("pro_plans").delete().eq("id", id);
  if (error) return { error: tableMissing(error.message, "pro_plans") };
  await log(ctx.supabase, ctx.adminId, {
    action: "delete_pro_plan",
    entityType: "pro_plan",
    entityId: id,
    reason: `Removed plan “${existing?.name ?? id}”. Memberships already granted are untouched.`,
  });
  afterWrite();
  return { success: true };
}

/* --------------------------------------------------------------- features */

export async function listProFeatureRows(): Promise<{ error: string } | { rows: FeatureRow[] }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data, error } = await ctx.supabase.from("pro_features").select("*").order("sort", { ascending: true });
  if (error) return { error: tableMissing(error.message, "pro_features") };
  return { rows: (data ?? []) as FeatureRow[] };
}

export async function saveProFeature(
  key: string,
  patch: { label?: string; description?: string; enabled?: boolean; bucket?: string; sort?: number }
): Promise<{ error: string } | { feature: FeatureRow }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  const values: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim().slice(0, 80);
    if (!label) return { error: "A benefit needs a label." };
    values.label = label;
  }
  if (patch.description !== undefined) values.description = patch.description.trim().slice(0, 400);
  if (patch.enabled !== undefined) values.enabled = patch.enabled;
  if (patch.sort !== undefined) values.sort = Math.round(Number(patch.sort)) || 0;
  if (patch.bucket !== undefined) {
    if ((PRO_BUCKETS as readonly string[]).indexOf(patch.bucket) < 0) {
      return { error: `Bucket must be one of: ${PRO_BUCKETS.join(", ")}.` };
    }
    values.bucket = patch.bucket;
  }
  if (Object.keys(values).length === 0) return { error: "Nothing to change." };

  const { data, error } = await ctx.supabase.from("pro_features")
    .update(values as Database["public"]["Tables"]["pro_features"]["Update"]).eq("key", key).select().single();
  if (error || !data) return { error: error ? tableMissing(error.message, "pro_features") : `No benefit with the key “${key}”.` };

  const feature = data as FeatureRow;
  const changedSwitch = patch.enabled !== undefined;
  await log(ctx.supabase, ctx.adminId, {
    action: changedSwitch ? (feature.enabled ? "enable_pro_feature" : "disable_pro_feature") : "edit_pro_feature",
    entityType: "pro_feature",
    entityId: feature.key,
    reason: changedSwitch
      ? `${feature.label} switched ${feature.enabled ? "on" : "off"} for every account`
      : `Copies changed for ${feature.key}`,
  });
  afterWrite();
  return { feature };
}

export async function createProFeature(input: {
  key: string;
  label: string;
  description?: string;
  bucket: string;
  enabled?: boolean;
}): Promise<{ error: string } | { feature: FeatureRow }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
  if (key.length < 3) return { error: "Give the benefit a key of at least three letters, like priority_support." };
  const label = input.label.trim().slice(0, 80);
  if (!label) return { error: "Give the benefit a label members will read." };
  if ((PRO_BUCKETS as readonly string[]).indexOf(input.bucket) < 0) {
    return { error: `Bucket must be one of: ${PRO_BUCKETS.join(", ")}.` };
  }

  const { data, error } = await ctx.supabase.from("pro_features").insert({
    key,
    label,
    description: (input.description ?? "").trim().slice(0, 400),
    bucket: input.bucket as FeatureRow["bucket"],
    enabled: input.enabled !== false,
    sort: 900,
  }).select().single();
  if (error || !data) {
    if (error && /duplicate key|unique/i.test(error.message)) return { error: `A benefit with the key “${key}” already exists.` };
    return { error: tableMissing(error?.message ?? "Nothing came back.", "pro_features") };
  }

  const feature = data as FeatureRow;
  await log(ctx.supabase, ctx.adminId, {
    action: "create_pro_feature",
    entityType: "pro_feature",
    entityId: feature.key,
    reason: `Added benefit “${feature.label}” (${feature.key}) to ${feature.bucket}`,
  });
  afterWrite();
  return { feature };
}

export async function deleteProFeature(key: string): Promise<{ error: string } | { success: true }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data: existing } = await ctx.supabase.from("pro_features").select("label").eq("key", key).maybeSingle();
  if (!existing) return { error: `No benefit with the key “${key}”.` };
  const { error } = await ctx.supabase.from("pro_features").delete().eq("key", key);
  if (error) return { error: tableMissing(error.message, "pro_features") };
  await log(ctx.supabase, ctx.adminId, {
    action: "delete_pro_feature",
    entityType: "pro_feature",
    entityId: key,
    reason: `Removed benefit “${existing.label}”. A removed switch fails open, so the feature stays available to members.`,
  });
  afterWrite();
  return { success: true };
}

/* ---------------------------------------------------------------- members */

async function profileByName(supabase: SupabaseClient, username: string): Promise<Profile | null> {
  const clean = username.trim().replace(/^@/, "");
  if (!clean) return null;
  const { data } = await supabase.from("profiles").select("*").ilike("username", clean).limit(1);
  return ((data ?? []) as Profile[])[0] ?? null;
}

export async function findMember(username: string): Promise<{ error: string } | { member: MemberInfo }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const profile = await profileByName(ctx.supabase, username);
  if (!profile) return { error: `No account called “${username.replace(/^@/, "")}”.` };

  const { data: requests } = await ctx.supabase.from("account_upgrades")
    .select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(10);
  const { data: permission } = await loose(ctx.supabase).from("stream_permissions")
    .select("allowed").eq("user_id", profile.id).maybeSingle();

  return {
    member: {
      profile,
      pro: hasActivePro(profile),
      requests: (requests ?? []) as UpgradeRequest[],
      streamAllowed: permission ? !!permission.allowed : null,
    },
  };
}

export async function listProMembers(limit = 25): Promise<{ error: string } | { rows: Profile[] }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data, error } = await ctx.supabase.from("profiles")
    .select("*")
    .or("is_verified.eq.true,pro_expires_at.not.null")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Math.round(limit) || 25)));
  if (error) {
    // pro_expires_at arrives with migration 027; without it the tick is the answer.
    const fallback = await ctx.supabase.from("profiles").select("*").eq("is_verified", true)
      .order("created_at", { ascending: false }).limit(Math.max(1, Math.min(200, Math.round(limit) || 25)));
    if (fallback.error) return { error: fallback.error.message };
    return { rows: (fallback.data ?? []) as Profile[] };
  }
  return { rows: (data ?? []) as Profile[] };
}

// Grant, extend, set an end date and revoke are one write to the same two
// columns the badge and every premium gate already read.
export async function setMemberPro(
  username: string,
  change: { verified?: boolean; days?: number | null; expiresAt?: string | null },
  reason?: string
): Promise<{ error: string } | { member: MemberInfo }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const profile = await profileByName(ctx.supabase, username);
  if (!profile) return { error: `No account called “${username.replace(/^@/, "")}”.` };

  const values: Record<string, unknown> = {};
  let expiresAt = profile.pro_expires_at ?? null;

  if (change.expiresAt !== undefined) expiresAt = change.expiresAt;
  if (change.days !== undefined && change.days !== null) {
    const days = Math.round(Number(change.days));
    if (!Number.isFinite(days) || days < 1 || days > 3650) return { error: "Days must be between 1 and 3650." };
    // Extending an active membership adds to its own end date, not to today.
    const base = expiresAt && new Date(expiresAt).getTime() > Date.now() ? new Date(expiresAt).getTime() : Date.now();
    expiresAt = new Date(base + days * 86_400_000).toISOString();
  }
  if (change.days === null && change.expiresAt === undefined) expiresAt = null;

  const verified = change.verified !== undefined ? change.verified : change.days ? true : profile.is_verified;
  values.is_verified = verified;
  values.pro_expires_at = expiresAt;

  const { data, error } = await ctx.supabase.from("profiles")
    .update(values as Database["public"]["Tables"]["profiles"]["Update"]).eq("id", profile.id).select("id");
  if (error || !data?.length) {
    return { error: error ? tableMissing(error.message, "profiles") : "Nothing changed — the profile is not writable by this account." };
  }

  const action = !verified ? "revoke_pro" : change.days ? "extend_pro" : "grant_pro";
  await log(ctx.supabase, ctx.adminId, {
    action,
    entityType: "pro_membership",
    targetUserId: profile.id,
    entityId: profile.id,
    reason: reason ?? (!verified
      ? `PRO removed from @${profile.username}`
      : `PRO ${change.days ? `extended by ${change.days} days` : "granted"} for @${profile.username}${expiresAt ? ` until ${expiresAt.slice(0, 10)}` : " with no end date"}`),
  });
  afterWrite();

  const updated = await profileByName(ctx.supabase, profile.username);
  return {
    member: {
      profile: updated ?? profile,
      pro: hasActivePro(updated ?? profile),
      requests: [],
      streamAllowed: null,
    },
  };
}

export async function setStreamPermission(
  username: string,
  allowed: boolean,
  note?: string
): Promise<{ error: string } | { success: true }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const profile = await profileByName(ctx.supabase, username);
  if (!profile) return { error: `No account called “${username.replace(/^@/, "")}”.` };

  const { error } = await loose(ctx.supabase).from("stream_permissions").upsert(
    { user_id: profile.id, allowed, updated_by: ctx.adminId, note: note?.slice(0, 200) ?? null },
    { onConflict: "user_id" }
  );
  if (error) return { error: tableMissing(error.message, "stream_permissions") };

  await log(ctx.supabase, ctx.adminId, {
    action: allowed ? "allow_stream" : "block_stream",
    entityType: "stream_permission",
    targetUserId: profile.id,
    entityId: profile.id,
    reason: `Live streaming ${allowed ? "allowed" : "blocked"} for @${profile.username}${note ? ` — ${note}` : ""}`,
  });
  afterWrite();
  return { success: true };
}

/* --------------------------------------------------------------- requests */

export async function listUpgradeRequests(
  status: "pending" | "approved" | "rejected" | "all" = "pending",
  limit = 25
): Promise<{ error: string } | { rows: UpgradeRequest[] }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  let query = ctx.supabase.from("account_upgrades").select("*").order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.round(limit) || 25)));
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return { error: tableMissing(error.message, "account_upgrades") };
  return { rows: (data ?? []) as UpgradeRequest[] };
}

// The plan a member chose is written into the request note as “(30 days)”, so
// approving without an explicit duration still honours what they paid for.
function daysFromNote(note: string | null): number | null {
  const m = note?.match(/\((\d+)\s*days?\)/i);
  return m ? Number(m[1]) : null;
}

export async function decideUpgradeRequest(
  idOrReference: string,
  decision: "approved" | "rejected",
  days?: number | null,
  note?: string
): Promise<{ error: string } | { request: UpgradeRequest; username: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  const clean = idOrReference.trim();
  const byRef = await ctx.supabase.from("account_upgrades").select("*").ilike("reference", clean).limit(1);
  let request: UpgradeRequest | undefined = ((byRef.data ?? []) as UpgradeRequest[])[0];
  if (!request) {
    const byId = await ctx.supabase.from("account_upgrades").select("*").eq("id", clean).maybeSingle();
    request = (byId.data as UpgradeRequest | null) ?? undefined;
  }
  if (!request) return { error: `No upgrade request matching “${clean}”.` };

  const { data: person } = await ctx.supabase.from("profiles").select("*").eq("id", request.user_id).maybeSingle();
  const profile = person as Profile | null;
  const username = profile?.username ?? request.user_id;

  if (decision === "approved") {
    const length = days ?? daysFromNote(request.note) ?? 30;
    const granted = await setMemberPro(username, { verified: true, days: length }, `Payment ${request.reference} confirmed — ${length} days of PRO for @${username}`);
    if ("error" in granted) return granted;
  }

  const { data, error } = await ctx.supabase.from("account_upgrades").update({
    status: decision,
    note: note?.slice(0, 300) ?? request.note,
    reviewed_by: ctx.adminId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", request.id).select().single();
  if (error || !data) return { error: error?.message ?? "The request did not change." };

  await log(ctx.supabase, ctx.adminId, {
    action: decision === "approved" ? "approve_upgrade" : "reject_upgrade",
    entityType: "account_upgrade",
    entityId: request.id,
    targetUserId: request.user_id,
    reason: `${decision === "approved" ? "Confirmed" : "Declined"} payment ${request.reference} from @${username}${note ? ` — ${note}` : ""}`,
  });
  afterWrite();
  return { request: data as UpgradeRequest, username };
}

/* ------------------------------------------------------- prices and promo */

const UPGRADE_DEFAULT: UpgradeConfig = { price: 0, accountName: "CONNEXA", accountNumber: "", instructions: "" };

function parseUpgrade(body: string): UpgradeConfig {
  const grab = (label: string) => {
    const m = body.match(new RegExp(`${label}:\\s*(.+)`, "i"));
    return m ? m[1].trim() : "";
  };
  return {
    price: Number(grab("PRICE").replace(/[^0-9.]/g, "")) || 0,
    accountName: grab("PAY TO ACCOUNT NAME"),
    accountNumber: grab("PAY TO ACCOUNT NUMBER"),
    instructions: grab("INSTRUCTIONS"),
  };
}

function formatUpgrade(cfg: UpgradeConfig): string {
  return [
    `PRICE: ${cfg.price}`,
    `PAY TO ACCOUNT NAME: ${cfg.accountName || "CONNEXA"}`,
    `PAY TO ACCOUNT NUMBER: ${cfg.accountNumber || "—"}`,
    `INSTRUCTIONS: ${cfg.instructions || "Report your payment below and an administrator will confirm it."}`,
  ].join("\n");
}

export async function readUpgradeConfig(): Promise<{ error: string } | { config: UpgradeConfig }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data } = await ctx.supabase.from("site_content").select("body").eq("key", "upgrade").maybeSingle();
  return { config: data?.body ? parseUpgrade(data.body) : UPGRADE_DEFAULT };
}

export async function saveUpgradeConfig(patch: Partial<UpgradeConfig>): Promise<{ error: string } | { config: UpgradeConfig }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const current = await readUpgradeConfig();
  if ("error" in current) return current;

  const next: UpgradeConfig = { ...current.config };
  if (patch.price !== undefined) {
    const price = Number(patch.price);
    if (!Number.isFinite(price) || price < 0) return { error: "Price must be a number of zero or more." };
    next.price = price;
  }
  if (patch.accountName !== undefined) next.accountName = patch.accountName.trim().slice(0, 80);
  if (patch.accountNumber !== undefined) next.accountNumber = patch.accountNumber.trim().slice(0, 40);
  if (patch.instructions !== undefined) next.instructions = patch.instructions.trim().slice(0, 600);

  const { error } = await ctx.supabase.from("site_content")
    .upsert({ key: "upgrade", title: "Upgrade to PRO", body: formatUpgrade(next) }, { onConflict: "key" });
  if (error) return { error: error.message };

  await log(ctx.supabase, ctx.adminId, {
    action: "edit_upgrade_config",
    entityType: "site_content",
    entityId: "upgrade",
    reason: `Upgrade details updated — price ${next.price}, account ${next.accountNumber || "not set"}`,
  });
  afterWrite();
  return { config: next };
}

export async function readProPromo(): Promise<{ error: string } | { text: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const { data } = await ctx.supabase.from("site_settings").select("value").eq("key", PROMO_KEY).maybeSingle();
  return { text: data?.value ?? "" };
}

export async function saveProPromo(text: string): Promise<{ error: string } | { text: string }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;
  const clean = text.trim().slice(0, 400);
  const { error } = await ctx.supabase.from("site_settings").upsert({ key: PROMO_KEY, value: clean }, { onConflict: "key" });
  if (error) return { error: tableMissing(error.message, "site_settings") };
  await log(ctx.supabase, ctx.adminId, {
    action: "edit_pro_promo",
    entityType: "site_setting",
    entityId: PROMO_KEY,
    reason: clean ? `Promotional message set: ${clean.slice(0, 80)}` : "Promotional message cleared",
  });
  afterWrite();
  return { text: clean };
}

/* --------------------------------------------------------------- overview */

export type ProOverview = {
  plans: number;
  publishedPlans: number;
  features: number;
  featuresOff: string[];
  members: number;
  active: number;
  endingSoon: number;
  pending: number;
  price: number;
  promo: string;
};

export async function proOverview(): Promise<{ error: string } | { overview: ProOverview }> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  const [plans, features, members, pending, config, promo] = await Promise.all([
    ctx.supabase.from("pro_plans").select("id, active"),
    ctx.supabase.from("pro_features").select("key, label, enabled"),
    ctx.supabase.from("profiles").select("is_verified, pro_expires_at").or("is_verified.eq.true,pro_expires_at.not.null"),
    ctx.supabase.from("account_upgrades").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ctx.supabase.from("site_content").select("body").eq("key", "upgrade").maybeSingle(),
    ctx.supabase.from("site_settings").select("value").eq("key", PROMO_KEY).maybeSingle(),
  ]);

  const people = (members.data ?? []) as { is_verified: boolean; pro_expires_at: string | null }[];
  const active = people.filter((p) => hasActivePro(p));
  const featureRows = (features.data ?? []) as { key: string; label: string; enabled: boolean }[];

  return {
    overview: {
      plans: plans.data?.length ?? 0,
      publishedPlans: ((plans.data ?? []) as { active: boolean }[]).filter((p) => p.active).length,
      features: featureRows.length,
      featuresOff: featureRows.filter((f) => !f.enabled).map((f) => f.label),
      members: people.length,
      active: active.length,
      endingSoon: active.filter((p) => p.pro_expires_at && (new Date(p.pro_expires_at).getTime() - Date.now()) / 86_400_000 <= 7).length,
      pending: pending.count ?? 0,
      price: config.data?.body ? parseUpgrade(config.data.body).price : 0,
      promo: promo.data?.value ?? "",
    },
  };
}