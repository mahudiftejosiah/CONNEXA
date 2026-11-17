"use client";

import { useState } from "react";
import { Fingerprint, ShieldCheck, Copy, Trash2, Search, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  getAlgorithms, getUsage, hashText, identifyHash, revertWithKnownTexts, saveSettings, verifyOriginal,
} from "@/lib/actions/hashing";
import type { HashingSettings, HashingUsage } from "@/lib/hashing-settings";
import type { HashAlgorithm } from "@/lib/hashing";
import toast from "react-hot-toast";

type AlgorithmOption = HashAlgorithm;

interface Props {
  settings: HashingSettings;
  algorithms: AlgorithmOption[];
  usage?: HashingUsage | { error: string };
  // Members get the tool; only the admin page gets the switches and the counts.
  manage?: boolean;
}

type Generated = { hash: string; label: string; algorithm: string };
type Identified = { format: string; bytes: number; hexLength: number; candidates: AlgorithmOption[]; explanation: string };
type Reverted = { original: string; label: string }[];

// A hash is a fingerprint, not a locked box: this tool is honest about that.
// Mode B never claims to undo a digest — it identifies the format and proves a
// text you already hold is the one that made it.
export function HashingBot({ settings: init, algorithms: initAlgorithms, usage: initUsage, manage = true }: Props) {
  const [settings, setSettings] = useState(init);
  const [algorithms, setAlgorithms] = useState(initAlgorithms);
  const [usage, setUsage] = useState<HashingUsage | { error: string }>(initUsage ?? { total: 0, byMode: {}, byAlgorithm: {} });

  const [mode, setMode] = useState<"generate" | "inspect">("generate");
  const [busy, setBusy] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [algorithm, setAlgorithm] = useState(settings.default_algorithm);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [copied, setCopied] = useState(false);

  const [hashInput, setHashInput] = useState("");
  const [identified, setIdentified] = useState<Identified | null>(null);
  const [suspect, setSuspect] = useState(settings.default_algorithm);
  const [original, setOriginal] = useState("");
  const [verified, setVerified] = useState<{ match: boolean; label: string } | null>(null);
  const [knownTexts, setKnownTexts] = useState("");
  const [reverted, setReverted] = useState<Reverted | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    title: init.title,
    description: init.description,
    enabled: init.enabled,
    visible: init.visible,
    audience: init.audience,
    default_algorithm: init.default_algorithm,
    algorithms: init.algorithms,
  });
  const [saving, setSaving] = useState(false);

  const enabled = algorithms.filter((a) => draft.algorithms.includes(a.id));

  async function generate() {
    setError(null);
    setBusy("generate");
    const res = await hashText(text, algorithm);
    setBusy(null);
    if ("error" in res) { setError(res.error ?? "The hashing bot refused that request."); return; }
    setGenerated({ hash: res.hash, label: res.label, algorithm: res.algorithm });
    refreshUsage();
  }

  async function identify() {
    setError(null);
    setBusy("identify");
    const res = await identifyHash(hashInput);
    setBusy(null);
    if ("error" in res) { setIdentified(null); setError(res.error ?? "That string could not be read as a hash."); return; }
    setIdentified({
      format: res.format,
      bytes: res.bytes,
      hexLength: res.hexLength,
      candidates: res.candidates,
      explanation: res.explanation,
    });
    if (res.candidates.length === 1) setSuspect(res.candidates[0].id);
    refreshUsage();
  }

  async function verify() {
    setError(null);
    setBusy("verify");
    const res = await verifyOriginal(hashInput, suspect, original);
    setBusy(null);
    if ("error" in res) { setVerified(null); setError(res.error ?? "Verification could not run."); return; }
    const label = algorithms.find((a) => a.id === suspect)?.label ?? suspect;
    setVerified({ match: res.match, label });
    refreshUsage();
  }

  async function revert() {
    setError(null);
    setBusy("revert");
    const list = knownTexts.split("\n").map((l) => l.trim()).filter(Boolean);
    const res = await revertWithKnownTexts(hashInput, list);
    setBusy(null);
    if ("error" in res) { setReverted(null); setError(res.error ?? "Nothing could be matched."); return; }
    setReverted(res.found.map((f) => ({ original: f.original, label: f.label })));
    if (res.found.length === 0) toast("None of those texts produced this hash.");
    refreshUsage();
  }

  async function refreshUsage() {
    if (!manage) return;
    const res = await getUsage();
    if ("error" in res) return;
    if ("usage" in res) setUsage(res.usage);
  }

  async function copyResult() {
    if (!generated) return;
    try {
      await navigator.clipboard.writeText(generated.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("This browser blocked the clipboard.");
    }
  }

  async function persist() {
    setSaving(true);
    const res = await saveSettings(draft);
    setSaving(false);
    if ("error" in res) { toast.error(res.error ?? "Settings were not saved."); return; }
    setSettings(res.settings);
    setDraft({
      title: res.settings.title,
      description: res.settings.description,
      enabled: res.settings.enabled,
      visible: res.settings.visible,
      audience: res.settings.audience,
      default_algorithm: res.settings.default_algorithm,
      algorithms: res.settings.algorithms,
    });
    if (!res.settings.algorithms.includes(algorithm)) setAlgorithm(res.settings.default_algorithm);
    toast.success("Hashing bot settings saved.");
  }

  async function probeAlgorithms() {
    const res = await getAlgorithms();
    setAlgorithms(res.algorithms);
    toast(`This server provides ${res.algorithms.length} of the ${algorithms.length} listed algorithms.`);
  }

  return (
    <div className="space-y-4">
      {settings.visible && (
        <div className="card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-green-800 flex items-center justify-center flex-shrink-0">
              <Fingerprint className="w-5 h-5 text-brand-gold-400" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--text-primary)]">{settings.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{settings.description}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {(["generate", "inspect"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  mode === m
                    ? "border-brand-green-800 text-brand-green-800 dark:border-brand-gold-400 dark:text-brand-gold-400"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}>
                {m === "generate" ? "Original text → hash" : "Hash → identify / verify"}
              </button>
            ))}
          </div>

          {mode === "generate" && (
            <div className="space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="Type or paste the text to hash"
                className="input w-full font-mono text-sm"
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Algorithm</span>
                  <select value={algorithm} onChange={(e) => setAlgorithm(e.target.value)} className="input">
                    {algorithms.filter((a) => settings.algorithms.includes(a.id)).map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </label>
                <Button loading={busy === "generate"} onClick={() => void generate()}>Generate Hash</Button>
                {generated && (
                  <>
                    <Button variant="ghost" icon={<Copy className="w-3.5 h-3.5" />} onClick={() => void copyResult()}>
                      {copied ? "Copied" : "Copy Result"}
                    </Button>
                    <Button variant="ghost" icon={<Trash2 className="w-3.5 h-3.5" />}
                      onClick={() => { setGenerated(null); setText(""); }}>
                      Clear
                    </Button>
                  </>
                )}
              </div>
              {generated && (
                <div className="rounded-xl border border-[var(--border)] p-3 space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {generated.label} · {generated.hash.length} hex characters
                  </p>
                  <p className="font-mono text-xs break-all text-[var(--text-primary)]">{generated.hash}</p>
                </div>
              )}
            </div>
          )}

          {mode === "inspect" && (
            <div className="space-y-3">
              <textarea
                value={hashInput}
                onChange={(e) => setHashInput(e.target.value)}
                rows={3}
                placeholder="Paste the hash (hexadecimal or base64)"
                className="input w-full font-mono text-sm"
              />
              <div className="flex flex-wrap items-end gap-3">
                <Button variant="ghost" icon={<Search className="w-3.5 h-3.5" />} loading={busy === "identify"}
                  onClick={() => void identify()}>
                  Identify format
                </Button>
                <label className="text-sm">
                  <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Suspected algorithm</span>
                  <select value={suspect} onChange={(e) => setSuspect(e.target.value)} className="input">
                    {algorithms.filter((a) => settings.algorithms.includes(a.id)).map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {identified && (
                <div className="rounded-xl border border-[var(--border)] p-3 space-y-1.5 text-sm">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {identified.bytes}-byte digest, written as {identified.format}
                    ({identified.hexLength} hex characters)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {identified.candidates.map((c) => (
                      <span key={c.id} className="text-xs px-2 py-0.5 rounded-full bg-brand-gold-400/20 text-brand-green-800 dark:text-brand-gold-400">
                        {c.label}
                      </span>
                    ))}
                  </div>
                  <p className="text-[var(--text-secondary)]">{identified.explanation}</p>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm flex-1 min-w-[14rem]">
                  <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Original text to verify</span>
                  <input value={original} onChange={(e) => setOriginal(e.target.value)} className="input w-full font-mono text-xs" />
                </label>
                <Button icon={<ShieldCheck className="w-3.5 h-3.5" />} loading={busy === "verify"} onClick={() => void verify()}>
                  Verify Original Text
                </Button>
              </div>
              {verified && (
                <p className={`text-sm font-semibold ${verified.match ? "text-green-600" : "text-red-500"}`}>
                  {verified.match
                    ? `Match — that hash is ${verified.label} of the text you entered.`
                    : `No match — ${verified.label} of your text produces a different digest.`}
                </p>
              )}

              <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
                <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Return a hash to its text
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Hashes cannot be decrypted, and CONNEXA will not guess or crack passwords. If you
                  already know the possible texts, list them here (one per line) and the tool tells you
                  which one produced the hash.
                </p>
                <textarea value={knownTexts} onChange={(e) => setKnownTexts(e.target.value)} rows={3}
                  placeholder={"candidate text\nanother candidate"} className="input w-full font-mono text-xs" />
                <Button variant="ghost" loading={busy === "revert"} onClick={() => void revert()}>
                  Check my texts
                </Button>
                {reverted && (
                  <ul className="space-y-1">
                    {reverted.length === 0 ? (
                      <li className="text-sm text-[var(--text-secondary)]">None of those texts produced this hash.</li>
                    ) : reverted.map((r) => (
                      <li key={`${r.original}-${r.label}`} className="text-sm font-mono break-all">
                        “{r.original}” → {r.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 rounded-xl bg-red-500/10 px-3 py-2">{error}</p>
          )}
          {!settings.enabled && (
            <p className="text-sm rounded-xl px-3 py-2 bg-yellow-500/10 text-yellow-700">
              The hashing bot is switched off — results are not being produced.
            </p>
          )}
        </div>
      )}

      {manage && (
      <div className="card p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-[var(--text-primary)] flex-1">Hashing Bot Management</h3>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => void probeAlgorithms()}>
            Re-check algorithms
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.visible} onChange={(e) => setDraft({ ...draft, visible: e.target.checked })} />
            Show the tool
          </label>
          <label className="text-sm">
            <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Who may use it</span>
            <select className="input" value={draft.audience}
              onChange={(e) => setDraft({ ...draft, audience: e.target.value as HashingSettings["audience"] })}>
              <option value="admin">Administrators only</option>
              <option value="pro">PRO members (and admins)</option>
              <option value="all">Every signed-in user</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Default algorithm</span>
            <select className="input" value={draft.default_algorithm}
              onChange={(e) => setDraft({ ...draft, default_algorithm: e.target.value })}>
              {algorithms.filter((a) => draft.algorithms.includes(a.id)).map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Algorithms</p>
          <div className="flex flex-wrap gap-2">
            {algorithms.map((a) => (
              <label key={a.id} className="text-xs flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[var(--border)]">
                <input type="checkbox" checked={draft.algorithms.includes(a.id)}
                  onChange={(e) => setDraft({
                    ...draft,
                    algorithms: e.target.checked
                      ? [...draft.algorithms, a.id]
                      : draft.algorithms.filter((id) => id !== a.id),
                  })} />
                {a.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{enabled.length} of {algorithms.length} selected.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Title</span>
            <input className="input w-full" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="text-sm">
            <span className="block mb-1 font-semibold text-[var(--text-secondary)]">Description</span>
            <input className="input w-full" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
        </div>

        <div className="flex justify-end">
          <Button loading={saving} onClick={() => void persist()}>Save settings</Button>
        </div>

        <div className="border-t border-[var(--border)] pt-4">
          <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Usage</p>
          {"error" in usage ? (
            <p className="text-sm text-[var(--text-secondary)]">{usage.error}</p>
          ) : usage.total === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No hashing has been run yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p>{usage.total.toLocaleString()} operation{(usage.total === 1 ? "" : "s")} recorded. No text and no hash is stored.</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(usage.byMode).map(([m, n]) => (
                  <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)]">{m}: {n}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(usage.byAlgorithm).map(([id, n]) => (
                  <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-brand-gold-400/20 text-brand-green-800 dark:text-brand-gold-400">
                    {algorithms.find((a) => a.id === id)?.label ?? id}: {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
