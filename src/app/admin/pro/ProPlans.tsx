"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Megaphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  listProPlans, saveProPlan, deleteProPlan,
  readUpgradeConfig, saveUpgradeConfig,
  readProPromo, saveProPromo,
  type ProPlan, type UpgradeConfig,
} from "@/lib/actions/pro-admin";
import { Field, Panel, Notice, Switch } from "./useRows";
import toast from "react-hot-toast";

// Plans, payment details and the promo banner. Every write here goes through the
// same server actions the assistant bot calls, so “pro plan set …” in the bot and
// this form are two doors into one room.

const CURRENCIES = ["NGN", "USD", "GHS", "KES", "ZAR", "EUR", "GBP"];

const BLANK = { name: "", price: "5000", currency: "NGN", duration_days: "30", blurb: "", active: true, sort: "0" };
type Draft = typeof BLANK;

function toDraft(p: ProPlan): Draft {
  return {
    name: p.name,
    price: String(p.price),
    currency: p.currency,
    duration_days: String(p.duration_days),
    blurb: p.blurb,
    active: p.active,
    sort: String(p.sort),
  };
}

export function ProPlans() {
  const [plans, setPlans] = useState<ProPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<UpgradeConfig | null>(null);
  const [promo, setPromo] = useState("");
  const [creating, setCreating] = useState<Draft>(BLANK);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, cfg, banner] = await Promise.all([listProPlans(), readUpgradeConfig(), readProPromo()]);
    setLoading(false);
    if ("error" in list) { setError(list.error); setPlans([]); }
    else { setError(null); setPlans(list.rows); }
    if (!("error" in cfg)) setConfig(cfg.config);
    if (!("error" in banner)) setPromo(banner.text);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create() {
    setBusy("new");
    const res = await saveProPlan({
      name: creating.name,
      price: Number(creating.price),
      currency: creating.currency,
      duration_days: Number(creating.duration_days),
      blurb: creating.blurb,
      active: creating.active,
      sort: Number(creating.sort),
    });
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    setPlans((p) => p.concat([res.plan]).sort((a, b) => a.sort - b.sort));
    setCreating(BLANK);
    toast.success(`“${res.plan.name}” is published.`);
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Subscription plans"
        hint="What a member can buy. Published plans appear on the PRO page and set the length of PRO granted when you confirm their payment."
      >
        <Notice text={error} />
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : plans.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No plans yet. Create the first one below — nothing is seeded, so the PRO page shows only what you publish here.
          </p>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <PlanEditor key={p.id} plan={p} busy={busy === p.id} setBusy={setBusy}
                onSaved={(next) => setPlans((prev) => prev.map((x) => (x.id === next.id ? next : x)).sort((a, b) => a.sort - b.sort))}
                onRemoved={(id) => setPlans((prev) => prev.filter((x) => x.id !== id))} />
            ))}
          </div>
        )}

        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "var(--bg-main)" }}>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">New plan</p>
          <PlanFields draft={creating} onChange={setCreating} />
          <Button loading={busy === "new"} icon={<Plus className="w-4 h-4" />} onClick={() => void create()}>
            Publish plan
          </Button>
        </div>
      </Panel>

      <Panel
        title="Payment details"
        hint="The amount and account a member pays into. This is the text the Upgrade panel reads, so a change here is live on the next page load."
      >
        {!config ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : (
          <PaymentForm config={config} onSaved={setConfig} />
        )}
      </Panel>

      <Panel
        title="Promotional message"
        hint="A short banner above the plans on the PRO page. Leave it empty to show nothing."
      >
        <PromoForm value={promo} onSaved={setPromo} />
      </Panel>
    </div>
  );
}

function PlanFields({ draft, onChange }: { draft: Draft; onChange: (next: Draft) => void }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <Field label="Plan name">
        <input className="input" value={draft.name} placeholder="Monthly"
          onChange={(e) => onChange({ ...draft, name: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price">
          <input className="input" type="number" min={0} step="0.01" value={draft.price}
            onChange={(e) => onChange({ ...draft, price: e.target.value })} />
        </Field>
        <Field label="Currency">
          <select className="input" value={draft.currency} onChange={(e) => onChange({ ...draft, currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (days)">
          <input className="input" type="number" min={1} max={3650} value={draft.duration_days}
            onChange={(e) => onChange({ ...draft, duration_days: e.target.value })} />
        </Field>
        <Field label="Sort position">
          <input className="input" type="number" value={draft.sort}
            onChange={(e) => onChange({ ...draft, sort: e.target.value })} />
        </Field>
      </div>
      <Field label="What the member gets">
        <input className="input" value={draft.blurb} placeholder="Everything in PRO, billed monthly"
          onChange={(e) => onChange({ ...draft, blurb: e.target.value })} />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Switch on={draft.active} onChange={(v) => onChange({ ...draft, active: v })} label="Published" />
        <span className="text-sm text-[var(--text-secondary)]">
          {draft.active ? "Published — members can choose it" : "Hidden — kept here but not offered"}
        </span>
      </div>
    </div>
  );
}

function PlanEditor({ plan, busy, setBusy, onSaved, onRemoved }: {
  plan: ProPlan;
  busy: boolean;
  setBusy: (id: string | null) => void;
  onSaved: (next: ProPlan) => void;
  onRemoved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(plan));
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(plan));

  async function save() {
    setBusy(plan.id);
    const res = await saveProPlan({
      id: plan.id,
      name: draft.name,
      price: Number(draft.price),
      currency: draft.currency,
      duration_days: Number(draft.duration_days),
      blurb: draft.blurb,
      active: draft.active,
      sort: Number(draft.sort),
    });
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    setDraft(toDraft(res.plan));
    onSaved(res.plan);
    toast.success(`“${res.plan.name}” saved.`);
  }

  async function remove() {
    setBusy(plan.id);
    const res = await deleteProPlan(plan.id);
    setBusy(null);
    if ("error" in res) { toast.error(res.error); return; }
    onRemoved(plan.id);
    toast.success(`“${plan.name}” deleted. Existing memberships are untouched.`);
  }

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Wallet className="w-4 h-4" style={{ color: "var(--brand-gold)" }} />
        <p className="font-semibold text-sm text-[var(--text-primary)]">{plan.name}</p>
        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
          style={{ background: plan.active ? "rgb(var(--a-800) / 0.12)" : "var(--border)", color: plan.active ? "rgb(var(--a-800))" : "var(--text-secondary)" }}>
          {plan.active ? "Published" : "Hidden"}
        </span>
        <span className="text-xs font-mono text-[var(--text-secondary)] ml-auto">{plan.id.slice(0, 8)}</span>
      </div>
      <PlanFields draft={draft} onChange={setDraft} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy} disabled={!dirty} onClick={() => void save()}>Save plan</Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => setDraft(toDraft(plan))}>Discard</Button>}
        {confirming ? (
          <>
            <Button size="sm" variant="ghost" loading={busy} icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => void remove()}>
              Yes, delete it
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setConfirming(true)}>Delete</Button>
        )}
      </div>
      {confirming && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Deleting “{plan.name}” removes it from the PRO page. Members who already hold PRO keep their end date.
        </p>
      )}
    </div>
  );
}

function PaymentForm({ config, onSaved }: { config: UpgradeConfig; onSaved: (next: UpgradeConfig) => void }) {
  const [draft, setDraft] = useState({
    price: String(config.price),
    accountName: config.accountName,
    accountNumber: config.accountNumber,
    instructions: config.instructions,
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await saveUpgradeConfig({
      price: Number(draft.price),
      accountName: draft.accountName,
      accountNumber: draft.accountNumber,
      instructions: draft.instructions,
    });
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    onSaved(res.config);
    toast.success("Payment details saved.");
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Price">
          <input className="input" type="number" min={0} step="0.01" value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        </Field>
        <Field label="Account name">
          <input className="input" value={draft.accountName}
            onChange={(e) => setDraft({ ...draft, accountName: e.target.value })} />
        </Field>
        <Field label="Account number">
          <input className="input font-mono" value={draft.accountNumber}
            onChange={(e) => setDraft({ ...draft, accountNumber: e.target.value })} />
        </Field>
      </div>
      <Field label="Instructions members read">
        <textarea className="input min-h-[5rem]" value={draft.instructions}
          onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
      </Field>
      <Button loading={busy} onClick={() => void save()}>Save payment details</Button>
    </div>
  );
}

function PromoForm({ value, onSaved }: { value: string; onSaved: (next: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);

  async function save(text: string) {
    setBusy(true);
    const res = await saveProPromo(text);
    setBusy(false);
    if ("error" in res) { toast.error(res.error); return; }
    onSaved(res.text);
    setDraft(res.text);
    toast.success(res.text ? "Promo banner is live." : "Promo banner removed.");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Megaphone className="w-4 h-4 mt-2.5 flex-shrink-0" style={{ color: "var(--brand-gold)" }} />
        <textarea className="input min-h-[4rem] flex-1" maxLength={400} value={draft}
          placeholder="Launch offer: three months of PRO for the price of two."
          onChange={(e) => setDraft(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} onClick={() => void save(draft)}>Save banner</Button>
        {value && <Button variant="ghost" loading={busy} onClick={() => void save("")}>Remove banner</Button>}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">{draft.length}/400 characters</p>
    </div>
  );
}