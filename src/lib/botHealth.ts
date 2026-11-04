import type { Supa } from "@/lib/bot";
import type { Database } from "@/lib/supabase/types";

export type CheckStatus = "ok" | "warn" | "fail";

export interface HealthCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

type TableName = keyof Database["public"]["Tables"];

function since(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

async function countRows(
  supabase: Supa,
  table: TableName,
  build: (q: any) => any
): Promise<{ count: number; error?: string }> {
  // The client's builder type is a union across every table, which is not
  // callable as a generic; the table names here are all real.
  const from = (supabase as any).from(table);
  const res = await build(from.select("id", { count: "exact", head: true }));
  if (res.error) return { count: 0, error: res.error.message };
  return { count: res.count ?? 0 };
}

/**
 * Read-only sweep of the live site: is the data reachable, is the bot's own
 * schema installed, and is anything asking for the admin's attention.
 * Every question is a head-count, so this stays cheap enough to run on the
 * admin page load.
 */
export async function runHealthChecks(supabase: Supa): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  const users = await countRows(supabase, "profiles", (q) => q);
  checks.push(
    users.error
      ? { key: "db", label: "Database", status: "fail", detail: "CONNEXA cannot read profiles: " + users.error }
      : { key: "db", label: "Database", status: "ok", detail: `${users.count} accounts reachable` }
  );
  if (users.error) return checks;

  const [admins, posts24, comments24, messages1h, reports, upgrades, flags, links24, botschema] = await Promise.all([
    countRows(supabase, "profiles", (q) => q.eq("is_admin", true)),
    countRows(supabase, "posts", (q) => q.gte("created_at", since(24))),
    countRows(supabase, "comments", (q) => q.gte("created_at", since(24))),
    countRows(supabase, "messages", (q) => q.gte("created_at", since(1))),
    countRows(supabase, "content_reports", (q) => q.eq("status", "pending")),
    countRows(supabase, "account_upgrades", (q) => q.eq("status", "pending")),
    countRows(supabase, "bot_flags", (q) => q.eq("open", true)),
    countRows(supabase, "posts", (q) => q.gte("created_at", since(24)).ilike("content", "%http%")),
    supabase.from("comments").select("id, hidden").limit(1),
  ]);

  checks.push(
    admins.count === 0
      ? { key: "admins", label: "Admin cover", status: "fail", detail: "No admin account exists — nobody can moderate." }
      : admins.count > 3
        ? { key: "admins", label: "Admin cover", status: "warn", detail: `${admins.count} admin accounts; more than expected.` }
        : { key: "admins", label: "Admin cover", status: "ok", detail: `${admins.count} admin account(s)` }
  );

  checks.push(
    posts24.error
      ? { key: "posts", label: "Posting", status: "fail", detail: "Cannot read posts: " + posts24.error }
      : {
          key: "posts",
          label: "Posting",
          status: posts24.count === 0 ? "warn" : "ok",
          detail: posts24.count === 0 ? "No posts in the last 24 hours." : `${posts24.count} post(s) in the last 24 hours`,
        }
  );

  checks.push({
    key: "comments",
    label: "Commenting",
    status: "ok",
    detail: `${comments24.count} comment(s) in the last 24 hours`,
  });

  checks.push({
    key: "messaging",
    label: "Messaging",
    status: messages1h.error ? "warn" : "ok",
    detail: messages1h.error ? "Cannot read messages table." : `${messages1h.count} message(s) in the last hour`,
  });

  const burst = await countRows(supabase, "profiles", (q) => q.gte("created_at", since(24)));
  checks.push({
    key: "signup-burst",
    label: "Sign-up burst",
    status: !burst.error && burst.count > 50 ? "warn" : "ok",
    detail: burst.error
      ? "Cannot count recent sign-ups."
      : `${burst.count} new account(s) in the last 24 hours${burst.count > 50 ? " — check these are real people." : ""}`,
  });

  checks.push({
    key: "links",
    label: "Links in fresh posts",
    status: !links24.error && links24.count > 20 ? "warn" : "ok",
    detail: links24.error
      ? "Cannot scan recent post content."
      : `${links24.count} post(s) with a link in the last 24 hours${!links24.error && links24.count > 20 ? " — possible spam wave." : ""}`,
  });

  checks.push(
    botschema.error
      ? {
          key: "schema",
          label: "Bot schema",
          status: "fail",
          detail: "Migration 014 is not applied — comments.hidden is missing, so the bot cannot hide comments.",
        }
      : { key: "schema", label: "Bot schema", status: "ok", detail: "Flag table and comment hiding are installed." }
  );

  checks.push({
    key: "reports",
    label: "Reported content",
    status: reports.error ? "fail" : reports.count > 0 ? "warn" : "ok",
    detail: reports.error ? "Cannot read content_reports." : `${reports.count} report(s) still pending`,
  });

  checks.push({
    key: "queue",
    label: "Assistant queue",
    status: flags.error ? "warn" : flags.count > 0 ? "warn" : "ok",
    detail: flags.error ? "Flag table not readable yet." : `${flags.count} flagged item(s) waiting on you`,
  });

  checks.push({
    key: "upgrades",
    label: "Paid upgrades",
    status: upgrades.count > 0 ? "warn" : "ok",
    detail: `${upgrades.count} upgrade request(s) awaiting approval`,
  });

  return checks;
}

export function alertsOf(checks: HealthCheck[]): HealthCheck[] {
  return checks.filter((c) => c.status !== "ok");
}

export function healthSummary(checks: HealthCheck[]): string {
  if (checks.length === 0) return "No check has been run yet.";
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  const headline = fails > 0
    ? `${fails} problem(s) found`
    : warns > 0
      ? `${warns} item(s) need attention`
      : "All clear";
  const lines = alertsOf(checks).map((c) => `• [${c.status.toUpperCase()}] ${c.label}: ${c.detail}`);
  return [`Site check — ${headline}`, ...lines].join("\n");
}
