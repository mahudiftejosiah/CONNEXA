import {
  createProFeature,
  decideUpgradeRequest,
  deleteProFeature,
  deleteProPlan,
  findMember,
  listProFeatureRows,
  listProMembers,
  listProPlans,
  listUpgradeRequests,
  proOverview,
  readProPromo,
  readUpgradeConfig,
  saveProFeature,
  saveProPlan,
  saveProPromo,
  saveUpgradeConfig,
  setMemberPro,
  setStreamPermission,
  type FeatureRow,
  type ProPlan,
} from "@/lib/actions/pro-admin";
import { hasActivePro } from "@/lib/pro";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

export type ProCommandResult = { output: string; ok: boolean };

// The bot does not own any PRO data. Every line below calls the same server
// actions the admin console calls, so the two surfaces can never disagree.

const HELP = [
  "pro                                the whole programme at a glance",
  "pro plans                          every subscription plan, with its short code",
  "pro plan add | Name | price | days | currency | blurb",
  "pro plan set CODE | price=… | days=… | name=… | currency=… | blurb=… | active=on|off | sort=…",
  "pro plan remove CODE confirm       delete a plan (memberships already granted stay)",
  "pro benefits                       every PRO benefit and its switch",
  "pro benefit KEY on | off           open or close a benefit for every account",
  "pro benefit KEY | label=… | description=… | bucket=… | sort=…",
  "pro benefit add | key | label | bucket | description",
  "pro benefit remove KEY confirm     delete a benefit row",
  "pro members [n]                    who holds PRO, newest first",
  "pro member @username               one account: status, end date, payments, live access",
  "pro grant @username [days]         give PRO (default 30 days)",
  "pro extend @username days          add days to the current end date",
  "pro expiry @username yyyy-mm-dd    set an exact end date, or “none” to clear it",
  "pro revoke @username confirm       take PRO away",
  "pro allow @username                let this account go live",
  "pro disallow @username confirm     block live streaming for this account",
  "pro requests [pending|approved|rejected|all]",
  "pro approve REF [days]             confirm a payment and grant its plan length",
  "pro reject REF confirm | reason=…  decline a payment",
  "pro price                          the payment details members see",
  "pro price | price=… | name=… | number=… | instructions=…",
  "pro promo                          the banner shown on the PRO page",
  "pro promo Your message here        replace it (pro promo clear removes it)",
  "",
  "Buckets: identity, community, entertainment, creator.",
  "Anything marked confirm is destructive: run it once without the word to see",
  "what would change, then add confirm to go ahead.",
].join("\n");

function money(price: number, currency: string): string {
  const symbols: Record<string, string> = { NGN: "₦", USD: "$", GHS: "₵", KES: "KSh ", ZAR: "R", EUR: "€", GBP: "£" };
  const symbol = symbols[currency.toUpperCase()];
  const amount = Number(price).toLocaleString();
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}

function dayText(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "no end date";
}

function planLine(p: ProPlan): string {
  return `${p.id.slice(0, 8)}  ${p.active ? "live" : "hidden"}  ${p.name} — ${money(p.price, p.currency)} / ${p.duration_days} days${p.blurb ? `\n          ${p.blurb}` : ""}`;
}

function memberLine(p: Profile): string {
  const state = hasActivePro(p) ? "PRO active" : p.is_verified ? "ticked, PRO lapsed" : "no PRO";
  return `@${p.username}  ${state}  ends ${dayText(p.pro_expires_at)}`;
}

function featureLine(f: FeatureRow): string {
  return `${f.enabled ? "on " : "OFF"}  ${f.key}  [${f.bucket}]  ${f.label}`;
}

// Fields after the first are either key=value pairs or positional words.
function pairs(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const eq = field.indexOf("=");
    if (eq > 0) out[field.slice(0, eq).trim().toLowerCase()] = field.slice(eq + 1).trim();
  }
  return out;
}

function onOff(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  const v = value.toLowerCase();
  if (v === "on" || v === "true" || v === "yes" || v === "1") return true;
  if (v === "off" || v === "false" || v === "no" || v === "0") return false;
  return null;
}

function needsConfirm(what: string, command: string): ProCommandResult {
  return {
    output: `${what}\n\nNothing has changed. To go ahead, type:\n${command} confirm`,
    ok: false,
  };
}

async function planByCode(code: string): Promise<{ error: string } | { plan: ProPlan }> {
  const list = await listProPlans();
  if ("error" in list) return list;
  const clean = code.trim().toLowerCase();
  const matches = list.rows.filter((p) => p.id.toLowerCase().startsWith(clean) || p.name.toLowerCase() === clean);
  if (matches.length === 0) return { error: `No plan matches “${code}”. Run “pro plans” to see the codes.` };
  if (matches.length > 1) return { error: `“${code}” matches ${matches.length} plans — type more characters.` };
  return { plan: matches[0] };
}

export async function runProCommand(args: string[]): Promise<ProCommandResult> {
  const raw = args.join(" ").trim();
  const confirmed = /(^|[\s|])confirm\s*$/i.test(raw);
  const body = raw.replace(/(^|[\s|])confirm\s*$/i, "").trim();
  const fields = body.split("|").map((f) => f.trim()).filter(Boolean);
  const head = fields.shift() ?? "";
  const words = head.split(/\s+/).filter(Boolean);
  const sub = (words[0] ?? "").toLowerCase();
  const opts = pairs(fields);

  if (!sub || sub === "help") return { output: HELP, ok: true };

  /* ------------------------------------------------------------- overview */
  if (sub === "status" || sub === "overview" || sub === "summary") {
    const res = await proOverview();
    if ("error" in res) return { output: res.error, ok: false };
    const o = res.overview;
    return {
      output: [
        `Plans:            ${o.plans} (${o.publishedPlans} published)`,
        `Benefits:         ${o.features}${o.featuresOff.length ? ` — switched off: ${o.featuresOff.join(", ")}` : " — all on"}`,
        `PRO members:      ${o.active} active of ${o.members} who ever held it`,
        `Ending in 7 days: ${o.endingSoon}`,
        `Payments waiting: ${o.pending}`,
        `Upgrade price:    ${o.price ? o.price.toLocaleString() : "not set"}`,
        `Promo banner:     ${o.promo || "(none)"}`,
        "",
        "Type “pro help” for every PRO command.",
      ].join("\n"),
      ok: true,
    };
  }

  /* ---------------------------------------------------------------- plans */
  if (sub === "plans") {
    const res = await listProPlans();
    if ("error" in res) return { output: res.error, ok: false };
    if (res.rows.length === 0) {
      return { output: "No plans yet. Create the first one:\npro plan add | Monthly | 5000 | 30 | NGN | Everything in PRO", ok: true };
    }
    return { output: res.rows.map(planLine).join("\n"), ok: true };
  }

  if (sub === "plan") {
    const action = (words[1] ?? "").toLowerCase();

    if (action === "add" || action === "new" || action === "create") {
      // pro plan add | Name | price | days | currency | blurb
      const [name, price, days, currency, ...blurb] = fields;
      if (!name || price === undefined || days === undefined) {
        return { output: "Usage: pro plan add | Name | price | days | currency | blurb\nExample: pro plan add | Monthly | 5000 | 30 | NGN | Everything in PRO", ok: false };
      }
      const res = await saveProPlan({
        name,
        price: Number(price.replace(/[^0-9.]/g, "")),
        duration_days: Number(days),
        currency: currency || "NGN",
        blurb: blurb.join(" | "),
      });
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `Plan created.\n${planLine(res.plan)}\nIt is live on the PRO page now.`, ok: true };
    }

    if (action === "set" || action === "edit" || action === "update") {
      const code = words[2];
      if (!code) return { output: "Usage: pro plan set CODE | price=… | days=… | name=… | active=on|off", ok: false };
      const found = await planByCode(code);
      if ("error" in found) return { output: found.error, ok: false };
      const p = found.plan;
      const active = onOff(opts.active);
      const res = await saveProPlan({
        id: p.id,
        name: opts.name ?? p.name,
        price: opts.price !== undefined ? Number(opts.price.replace(/[^0-9.]/g, "")) : p.price,
        duration_days: opts.days !== undefined ? Number(opts.days) : opts.duration !== undefined ? Number(opts.duration) : p.duration_days,
        currency: opts.currency ?? p.currency,
        blurb: opts.blurb ?? p.blurb,
        active: active === null ? p.active : active,
        sort: opts.sort !== undefined ? Number(opts.sort) : p.sort,
      });
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `Plan updated.\n${planLine(res.plan)}`, ok: true };
    }

    if (action === "remove" || action === "delete") {
      const code = words[2];
      if (!code) return { output: "Usage: pro plan remove CODE confirm", ok: false };
      const found = await planByCode(code);
      if ("error" in found) return { output: found.error, ok: false };
      if (!confirmed) {
        return needsConfirm(
          `This deletes the plan “${found.plan.name}” (${money(found.plan.price, found.plan.currency)} / ${found.plan.duration_days} days). Members who already hold PRO keep it.`,
          `pro plan remove ${found.plan.id.slice(0, 8)}`
        );
      }
      const res = await deleteProPlan(found.plan.id);
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `Plan “${found.plan.name}” deleted. Existing memberships are untouched.`, ok: true };
    }

    return { output: "Usage: pro plan add | … , pro plan set CODE | … , pro plan remove CODE confirm", ok: false };
  }

  /* ------------------------------------------------------------- benefits */
  if (sub === "benefits" || sub === "features") {
    const res = await listProFeatureRows();
    if ("error" in res) return { output: res.error, ok: false };
    if (res.rows.length === 0) return { output: "No benefit rows yet — paste migration 029 to seed the switches.", ok: true };
    return { output: res.rows.map(featureLine).join("\n"), ok: true };
  }

  if (sub === "benefit" || sub === "feature") {
    const action = (words[1] ?? "").toLowerCase();

    if (action === "add" || action === "new" || action === "create") {
      const [key, label, bucket, ...description] = fields;
      if (!key || !label || !bucket) {
        return { output: "Usage: pro benefit add | key | label | bucket | description\nExample: pro benefit add | priority_support | Priority support | identity | Answers within a day", ok: false };
      }
      const res = await createProFeature({ key, label, bucket: bucket.toLowerCase(), description: description.join(" | ") });
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `Benefit added.\n${featureLine(res.feature)}`, ok: true };
    }

    if (action === "remove" || action === "delete") {
      const key = words[2];
      if (!key) return { output: "Usage: pro benefit remove KEY confirm", ok: false };
      const list = await listProFeatureRows();
      if ("error" in list) return { output: list.error, ok: false };
      const row = list.rows.filter((f) => f.key === key.toLowerCase())[0];
      if (!row) return { output: `No benefit with the key “${key}”.`, ok: false };
      if (!confirmed) {
        return needsConfirm(
          `This deletes the benefit “${row.label}” (${row.key}). A removed switch fails open, so the feature itself stays available to members.`,
          `pro benefit remove ${row.key}`
        );
      }
      const res = await deleteProFeature(row.key);
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `Benefit “${row.label}” deleted.`, ok: true };
    }

    const key = words[1];
    if (!key) return { output: "Usage: pro benefit KEY on|off  ·  pro benefit KEY | label=… | description=…", ok: false };
    const switchWord = (words[2] ?? "").toLowerCase();
    const toggle = onOff(switchWord);

    if (toggle !== null && Object.keys(opts).length === 0) {
      const res = await saveProFeature(key.toLowerCase(), { enabled: toggle });
      if ("error" in res) return { output: res.error, ok: false };
      return {
        output: toggle
          ? `${res.feature.label} is ON for every PRO member.`
          : `${res.feature.label} is OFF. It is hidden in the app and blocked at the database.`,
        ok: true,
      };
    }

    if (Object.keys(opts).length === 0) {
      const list = await listProFeatureRows();
      if ("error" in list) return { output: list.error, ok: false };
      const row = list.rows.filter((f) => f.key === key.toLowerCase())[0];
      if (!row) return { output: `No benefit with the key “${key}”. Run “pro benefits”.`, ok: false };
      return { output: `${featureLine(row)}\n${row.description || "(no description)"}\nSort position: ${row.sort}`, ok: true };
    }

    const res = await saveProFeature(key.toLowerCase(), {
      label: opts.label,
      description: opts.description ?? opts.desc,
      bucket: opts.bucket,
      sort: opts.sort !== undefined ? Number(opts.sort) : undefined,
      enabled: onOff(opts.enabled) ?? undefined,
    });
    if ("error" in res) return { output: res.error, ok: false };
    return { output: `Benefit updated.\n${featureLine(res.feature)}\n${res.feature.description}`, ok: true };
  }

  /* -------------------------------------------------------------- members */
  if (sub === "members") {
    const res = await listProMembers(words[1] ? Number(words[1]) : 25);
    if ("error" in res) return { output: res.error, ok: false };
    if (res.rows.length === 0) return { output: "Nobody holds PRO yet. Grant it with: pro grant @username 30", ok: true };
    return { output: res.rows.map(memberLine).join("\n"), ok: true };
  }

  if (sub === "member" || sub === "whois") {
    const name = words[1];
    if (!name) return { output: "Usage: pro member @username", ok: false };
    const res = await findMember(name);
    if ("error" in res) return { output: res.error, ok: false };
    const m = res.member;
    const lines = [
      `${m.profile.display_name} (@${m.profile.username})`,
      `PRO:            ${m.pro ? "active" : m.profile.is_verified ? "ticked but lapsed" : "no"}`,
      `End date:       ${dayText(m.profile.pro_expires_at)}`,
      `Live streaming: ${m.streamAllowed === null ? "no override (PRO decides)" : m.streamAllowed ? "allowed by an administrator" : "blocked by an administrator"}`,
      `Payments:       ${m.requests.length ? "" : "none reported"}`,
    ];
    for (const r of m.requests.slice(0, 5)) {
      lines.push(`  ${r.reference}  ${r.status}  ${r.amount.toLocaleString()}  ${r.created_at.slice(0, 10)}${r.note ? `  ${r.note}` : ""}`);
    }
    return { output: lines.join("\n"), ok: true };
  }

  if (sub === "grant" || sub === "extend" || sub === "expiry" || sub === "revoke") {
    const name = words[1];
    if (!name) return { output: `Usage: pro ${sub} @username${sub === "revoke" ? " confirm" : sub === "expiry" ? " yyyy-mm-dd" : " days"}`, ok: false };

    if (sub === "revoke") {
      if (!confirmed) {
        const found = await findMember(name);
        if ("error" in found) return { output: found.error, ok: false };
        return needsConfirm(
          `This removes PRO from @${found.member.profile.username}. The crown disappears and every premium gate closes for them at once.`,
          `pro revoke @${found.member.profile.username}`
        );
      }
      const res = await setMemberPro(name, { verified: false });
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `PRO removed from @${res.member.profile.username}.`, ok: true };
    }

    if (sub === "expiry") {
      const value = (words[2] ?? "").toLowerCase();
      if (!value) return { output: "Usage: pro expiry @username yyyy-mm-dd  ·  pro expiry @username none", ok: false };
      if (value === "none" || value === "clear") {
        const res = await setMemberPro(name, { expiresAt: null });
        if ("error" in res) return { output: res.error, ok: false };
        return { output: `End date cleared for @${res.member.profile.username} — PRO no longer lapses.`, ok: true };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { output: "Write the date as yyyy-mm-dd, for example 2026-12-31.", ok: false };
      const res = await setMemberPro(name, { expiresAt: new Date(`${value}T23:59:59`).toISOString() });
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `@${res.member.profile.username} now has PRO until ${value}.`, ok: true };
    }

    const days = words[2] !== undefined ? Number(words[2]) : sub === "grant" ? 30 : NaN;
    if (!Number.isFinite(days) || days < 1) {
      return { output: `Usage: pro ${sub} @username days  (a whole number of days)`, ok: false };
    }
    const res = await setMemberPro(name, { verified: true, days });
    if ("error" in res) return { output: res.error, ok: false };
    return {
      output: `@${res.member.profile.username} has PRO until ${dayText(res.member.profile.pro_expires_at)} (${days} day${days === 1 ? "" : "s"} ${sub === "extend" ? "added" : "granted"}).`,
      ok: true,
    };
  }

  if (sub === "allow" || sub === "disallow") {
    const name = words[1];
    if (!name) return { output: `Usage: pro ${sub} @username${sub === "disallow" ? " confirm" : ""}`, ok: false };
    if (sub === "disallow" && !confirmed) {
      const found = await findMember(name);
      if ("error" in found) return { output: found.error, ok: false };
      return needsConfirm(
        `This blocks live streaming for @${found.member.profile.username}, even while their PRO is active.`,
        `pro disallow @${found.member.profile.username}`
      );
    }
    const res = await setStreamPermission(name, sub === "allow", opts.reason);
    if ("error" in res) return { output: res.error, ok: false };
    return { output: `Live streaming ${sub === "allow" ? "allowed" : "blocked"} for ${name.replace(/^@/, "@")}.`, ok: true };
  }

  /* ------------------------------------------------------------- payments */
  if (sub === "requests" || sub === "payments") {
    const status = (words[1] ?? "pending").toLowerCase();
    if (["pending", "approved", "rejected", "all"].indexOf(status) < 0) {
      return { output: "Usage: pro requests [pending|approved|rejected|all]", ok: false };
    }
    const res = await listUpgradeRequests(status as "pending" | "approved" | "rejected" | "all", 25);
    if ("error" in res) return { output: res.error, ok: false };
    if (res.rows.length === 0) return { output: `No ${status} payment requests.`, ok: true };
    const names = await usernames(res.rows.map((r) => r.user_id));
    const lines: string[] = [];
    for (const r of res.rows) {
      lines.push(`${r.reference}  ${r.status}  ${r.amount.toLocaleString()}  ${names[r.user_id] ?? r.user_id.slice(0, 8)}  ${r.created_at.slice(0, 10)}${r.note ? `\n          ${r.note}` : ""}`);
    }
    return { output: lines.join("\n"), ok: true };
  }

  if (sub === "approve" || sub === "reject") {
    const ref = words[1];
    if (!ref) return { output: `Usage: pro ${sub} REF${sub === "approve" ? " [days]" : " confirm | reason=…"}`, ok: false };

    if (sub === "reject") {
      if (!confirmed) {
        return needsConfirm(
          `This declines payment ${ref}. The member sees that it was not confirmed and can report a payment again.`,
          `pro reject ${ref}`
        );
      }
      const res = await decideUpgradeRequest(ref, "rejected", null, opts.reason);
      if ("error" in res) return { output: res.error, ok: false };
      return { output: `Payment ${res.request.reference} from @${res.username} declined.`, ok: true };
    }

    const days = words[2] !== undefined ? Number(words[2]) : null;
    if (days !== null && (!Number.isFinite(days) || days < 1)) {
      return { output: "Days must be a whole number, or leave it out to use the plan length on the request.", ok: false };
    }
    const res = await decideUpgradeRequest(ref, "approved", days, opts.reason);
    if ("error" in res) return { output: res.error, ok: false };
    return { output: `Payment ${res.request.reference} confirmed. @${res.username} has PRO${days ? ` for ${days} days` : " for the plan length they chose"}.`, ok: true };
  }

  /* -------------------------------------------------------- price + promo */
  if (sub === "price" || sub === "upgrade") {
    if (Object.keys(opts).length === 0) {
      const res = await readUpgradeConfig();
      if ("error" in res) return { output: res.error, ok: false };
      const c = res.config;
      return {
        output: [
          `Price:        ${c.price ? c.price.toLocaleString() : "not set"}`,
          `Account name: ${c.accountName || "not set"}`,
          `Account no:   ${c.accountNumber || "not set"}`,
          `Instructions: ${c.instructions || "not set"}`,
          "",
          "Change it with: pro price | price=5000 | number=0123456789 | name=CONNEXA | instructions=…",
        ].join("\n"),
        ok: true,
      };
    }
    const res = await saveUpgradeConfig({
      price: opts.price !== undefined ? Number(opts.price.replace(/[^0-9.]/g, "")) : undefined,
      accountName: opts.name ?? opts.account,
      accountNumber: opts.number ?? opts.accountnumber,
      instructions: opts.instructions ?? opts.text,
    });
    if ("error" in res) return { output: res.error, ok: false };
    return { output: `Upgrade details saved. Members see ${res.config.price.toLocaleString()} payable to ${res.config.accountNumber || "an account you have not set yet"}.`, ok: true };
  }

  if (sub === "promo" || sub === "message") {
    const text = [head.slice(words[0].length).trim(), ...fields].join(" ").trim();
    if (!text) {
      const res = await readProPromo();
      if ("error" in res) return { output: res.error, ok: false };
      return { output: res.text ? `Current promo:\n${res.text}` : "No promo banner is set. Write one with: pro promo Your message here", ok: true };
    }
    if (text.toLowerCase() === "clear" || text.toLowerCase() === "off" || text.toLowerCase() === "none") {
      const res = await saveProPromo("");
      if ("error" in res) return { output: res.error, ok: false };
      return { output: "Promo banner removed from the PRO page.", ok: true };
    }
    const res = await saveProPromo(text);
    if ("error" in res) return { output: res.error, ok: false };
    return { output: `Promo banner live on the PRO page:\n${res.text}`, ok: true };
  }

  return { output: `Unknown PRO command “${sub}”. Type “pro help”.`, ok: false };
}

// Payment rows name people by id; the bot prints usernames. One read for the
// whole list, not one per row.
async function usernames(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, username").in("id", unique);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; username: string }[]) map[row.id] = `@${row.username}`;
  return map;
}