"use server";

import { requireAdmin } from "./admin";
import type { Profile } from "@/lib/supabase/types";

export type FoundUser = Profile & { email: string | null };

export type UserSearchPage = {
  rows: FoundUser[];
  total: number;
  page: number;
  pageSize: number;
  withEmail: boolean;
};

const PAGE_SIZE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The rail on the admin page only ever holds the twenty newest accounts, so a
// lookup has to reach the whole table. Email lives in auth.users, which the
// browser cannot read, so migration 034 exposes one admin-only function that
// joins it in. Until that paste lands the same search still works on name,
// username and id — it just cannot match an address.
export async function adminFindUsers(term: string, page = 1): Promise<{ error: string } | UserSearchPage> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx;

  const clean = term.trim().slice(0, 120);
  if (clean.length < 2) return { error: "Type at least two characters." };
  const pageIndex = Math.max(1, Math.round(page) || 1);

  const rpc = await ctx.supabase.rpc("admin_find_users", {
    p_term: clean,
    p_page: pageIndex,
    p_size: PAGE_SIZE,
  });

  if (!rpc.error) {
    const hits = (rpc.data ?? []) as { id: string; email: string | null; total_count: number }[];
    const total = hits.length ? Number(hits[0].total_count) : 0;
    if (!hits.length) return { rows: [], total, page: pageIndex, pageSize: PAGE_SIZE, withEmail: true };

    const { data: people, error: readError } = await ctx.supabase
      .from("profiles").select("*").in("id", hits.map((h) => h.id));
    if (readError) return { error: readError.message };

    const byId = new Map(((people ?? []) as Profile[]).map((p) => [p.id, p]));
    const rows: FoundUser[] = [];
    for (const hit of hits) {
      const person = byId.get(hit.id);
      if (person) rows.push({ ...person, email: hit.email });
    }
    return { rows, total, page: pageIndex, pageSize: PAGE_SIZE, withEmail: true };
  }

  const missing = rpc.error.code === "42883" || rpc.error.message.includes("admin_find_users");
  if (!missing) return { error: rpc.error.message };

  const safe = clean.replace(/[%,()]/g, " ").trim();
  const filters = [`username.ilike.%${safe}%`, `display_name.ilike.%${safe}%`];
  if (UUID.test(clean)) filters.push(`id.eq.${clean}`);

  const { data, error, count } = await ctx.supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .or(filters.join(","))
    .order("created_at", { ascending: false })
    .range((pageIndex - 1) * PAGE_SIZE, pageIndex * PAGE_SIZE - 1);
  if (error) return { error: error.message };

  return {
    rows: ((data ?? []) as Profile[]).map((p) => ({ ...p, email: null })),
    total: count ?? 0,
    page: pageIndex,
    pageSize: PAGE_SIZE,
    withEmail: false,
  };
}