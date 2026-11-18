"use client";

import { useState } from "react";
import { BadgeCheck, ShieldCheck, Copy, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export type UpgradeStatus = "none" | "pending" | "approved" | "rejected";

export type PlanChoice = {
  id: string;
  name: string;
  price: number;
  currency: string;
  duration_days: number;
  blurb: string;
};

const SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", GHS: "₵", KES: "KSh ", ZAR: "R", EUR: "€", GBP: "£" };

function money(amount: number, currency: string) {
  const symbol = SYMBOLS[currency.toUpperCase()];
  const value = amount.toLocaleString();
  return symbol ? `${symbol}${value}` : `${value} ${currency}`;
}

// Pull editable fields out of the admin's upgrade instructions text.
function parseConfig(body: string) {
  const grab = (label: string) => {
    const m = body.match(new RegExp(`${label}:\\s*(.+)`, "i"));
    return m ? m[1].trim() : "";
  };
  const amount = Number(grab("PRICE").replace(/[^0-9.]/g, "")) || 0;
  const accName = grab("PAY TO ACCOUNT NAME");
  const accNo = grab("PAY TO ACCOUNT NUMBER");
  const instructions = grab("INSTRUCTIONS");
  return { amount, accName, accNo, instructions };
}

function makeRef() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CNXA-${rand}`;
}

export function UpgradePanel({
  userId,
  verified,
  initialStatus,
  initialReference,
  configText,
  plans = [],
}: {
  userId: string;
  verified: boolean;
  initialStatus: UpgradeStatus;
  initialReference: string | null;
  configText: string;
  plans?: PlanChoice[];
}) {
  const cfg = parseConfig(configText);
  const [status, setStatus] = useState<UpgradeStatus>(verified ? "approved" : initialStatus);
  const [reference, setReference] = useState<string | null>(initialReference);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? "");

  // A published plan overrides the flat price in the upgrade text, and its
  // length is written into the request so approving it grants what was bought.
  const chosen = plans.filter((p) => p.id === planId)[0] ?? plans[0];
  const amount = chosen ? chosen.price : cfg.amount;
  const currency = chosen?.currency ?? "NGN";

  async function markPaid() {
    setBusy(true);
    const supabase = createClient();
    const ref = makeRef();
    const details = [
      cfg.accNo ? `Paid to ${cfg.accNo}` : null,
      chosen ? `${chosen.name} (${chosen.duration_days} days)` : null,
    ].filter(Boolean).join(" · ");
    const { error } = await supabase.from("account_upgrades").insert({
      user_id: userId,
      amount,
      reference: ref,
      status: "pending",
      note: details || null,
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }
    setReference(ref);
    setStatus("pending");
    setBusy(false);
    toast.success("Payment reported. The admin will confirm shortly.");
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (status === "approved") {
    return (
      <div className="card p-5 flex items-center gap-3">
        <BadgeCheck className="w-9 h-9 flex-shrink-0" style={{ color: "#16a34a" }} fill="currentColor" stroke="#fff" />
        <div>
          <p className="font-bold" style={{ color: "var(--text-primary)" }}>Your account is verified</p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>The green tick now appears on your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5" style={{ color: "rgb(var(--a-800))" }} />
        <h2 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Upgrade to a verified account</h2>
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{cfg.instructions || "Get a green verification tick on your profile."}</p>

      {plans.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>Choose a plan</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {plans.map((p) => {
              const active = p.id === (chosen?.id ?? "");
              return (
                <button key={p.id} type="button" onClick={() => setPlanId(p.id)}
                  className="text-left rounded-xl border p-3 transition-all"
                  style={{
                    borderColor: active ? "var(--brand-gold)" : "var(--border)",
                    background: active ? "rgb(var(--a-800) / 0.06)" : "transparent",
                    boxShadow: active ? "0 0 0 1px var(--brand-gold)" : "none",
                  }}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                    <span className="font-extrabold text-sm" style={{ color: "var(--brand-gold-text)" }}>{money(p.price, p.currency)}</span>
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {p.duration_days} day{p.duration_days === 1 ? "" : "s"} of PRO{p.blurb ? ` · ${p.blurb}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Payment details (admin-controlled) */}
      <div className="rounded-xl border p-4 space-y-2" style={{ borderColor: "var(--border)" }}>
        <Row label="Amount" value={money(amount, currency)} strong />
        {chosen && <Row label="Membership length" value={`${chosen.duration_days} day${chosen.duration_days === 1 ? "" : "s"}`} />}
        <Row label="Account name" value={cfg.accName || "—"} />
        <div className="flex items-center justify-between gap-2">
          <Row label="Account number" value={cfg.accNo || "—"} mono />
          {cfg.accNo && (
            <button
              type="button"
              onClick={() => copy(cfg.accNo)}
              className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>

      {status === "pending" && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "rgb(var(--a-800) / 0.08)", color: "rgb(var(--a-800))" }}>
          <p className="font-semibold">Payment reported — awaiting admin confirmation.</p>
          {reference && <p className="mt-1">Your one-time payment reference: <span className="font-mono font-bold">{reference}</span></p>}
        </div>
      )}

      {status === "rejected" && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
          Your last request was not confirmed. You can report a payment again below.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {status === "none" && (
          <button
            type="button"
            disabled={busy}
            onClick={markPaid}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-60"
            style={{ backgroundColor: "rgb(var(--a-800))" }}
          >
            {busy ? "Submitting…" : "I have paid"}
          </button>
        )}
        {status === "pending" && (
          <button
            type="button"
            onClick={markPaid}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            Report another payment
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Prices and account details are set by the CONNEXA admin and can change at any time.
      </p>
    </div>
  );
}

function Row({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className={`${mono ? "font-mono" : ""} text-sm ${strong ? "text-base font-extrabold" : "font-semibold"}`} style={{ color: "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}
