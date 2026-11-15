"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import toast from "react-hot-toast";

// The PRO console touches a dozen tables by name, so it uses an untyped handle:
// the database decides what a row looks like, and each panel says which fields
// it actually reads. A table that has not been created yet is an error string,
// never a blank page.
export function db(): SupabaseClient {
  return createClient() as unknown as SupabaseClient;
}

export type Table<T> = {
  rows: T[];
  error: string | null;
  loading: boolean;
  reload: () => void;
  set: (next: (prev: T[]) => T[]) => void;
  add: (values: Record<string, unknown>) => Promise<T | null>;
  patch: (idColumn: string, id: unknown, values: Record<string, unknown>) => Promise<T | null>;
  drop: (idColumn: string, id: unknown) => Promise<boolean>;
};

export function useRows<T>(table: string, opts: { order?: string; ascending?: boolean; or?: string; limit?: number } = {}): Table<T> {
  const { order, ascending = false, or, limit } = opts;
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = db().from(table).select("*");
    if (or) query = query.or(or);
    if (order) query = query.order(order, { ascending });
    if (limit) query = query.limit(limit);
    const { data, error: err } = await query;
    setLoading(false);
    if (err) {
      setRows([]);
      setError(err.code === "42P01" || /does not exist/i.test(err.message)
        ? `Table “${table}” is not in the database yet — paste the PRO migrations.`
        : err.message);
      return;
    }
    setError(null);
    setRows((data ?? []) as T[]);
  }, [table, order, ascending, or, limit]);

  useEffect(() => { void load(); }, [load]);

  async function add(values: Record<string, unknown>): Promise<T | null> {
    const { data, error: err } = await db().from(table).insert(values).select().single();
    if (err || !data) { toast.error("Could not save: " + (err?.message ?? "nothing came back")); return null; }
    setRows((p) => [data, ...p]);
    return data;
  }

  async function patch(idColumn: string, id: unknown, values: Record<string, unknown>): Promise<T | null> {
    const { data, error: err } = await db().from(table).update(values).eq(idColumn, id).select().single();
    if (err || !data) { toast.error("Could not save: " + (err?.message ?? "nothing came back")); return null; }
    setRows((p) => p.map((r) => (readId(r, idColumn) === id ? (data as T) : r)));
    return data as T;
  }

  async function drop(idColumn: string, id: unknown): Promise<boolean> {
    const { error: err } = await db().from(table).delete().eq(idColumn, id);
    if (err) { toast.error("Delete failed: " + err.message); return false; }
    setRows((p) => p.filter((r) => readId(r, idColumn) !== id));
    return true;
  }

  return { rows, error, loading, reload: load, set: setRows, add, patch, drop };
}

// Panels name people by id in the tables; this turns those ids into the
// usernames an administrator reads. Small, three columns, one request.
export function useNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void db().from("profiles").select("id, username").limit(5000).then(({ data }) => {
      if (!alive || !data) return;
      const map: Record<string, string> = {};
      for (const row of data as { id: string; username: string }[]) map[row.id] = row.username;
      setNames(map);
    });
    return () => { alive = false; };
  }, []);
  return names;
}

function readId(row: unknown, column: string): unknown {
  return (row as Record<string, unknown>)[column];
}

// Small shared pieces so every panel looks like the rest of the dashboard.
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-1">{label}</span>
      {children}
    </label>
  );
}

export function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
        {hint && <p className="text-sm text-[var(--text-secondary)] mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="card p-4 text-sm border-l-4" style={{ borderLeftColor: "var(--brand-gold)", color: "var(--text-secondary)" }}>
      {text}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-extrabold text-[var(--text-primary)]">{value}</p>
      <p className="text-xs text-[var(--text-secondary)] mt-0.5">{label}</p>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
      style={{ backgroundColor: on ? "rgb(var(--a-800))" : "var(--border)" }}
    >
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? "1.5rem" : "0.125rem" }} />
    </button>
  );
}

// Every date comes back from Supabase as an ISO string; forms want the short
// yyyy-mm-dd shape a native date input accepts.
export function dayValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

export function whenValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
