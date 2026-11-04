"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, Bot, CheckCircle2, Power, Search, ShieldOff, Terminal, Wand2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { actOnFlag, botScan, runBotCommand, setBotAutoHide, setBotEnabled, setBotKeywords } from "@/lib/actions/bot";
import type { BotFlagWithAuthor, BotSettings } from "@/lib/supabase/types";
import type { HealthCheck } from "@/lib/botHealth";
import { formatRelativeTime } from "@/lib/utils";
import toast from "react-hot-toast";

interface AssistantBotProps {
  settings: BotSettings;
  openFlags: BotFlagWithAuthor[];
  resolved: BotFlagWithAuthor[];
  checks: HealthCheck[];
}

type LogLine = { input: string; output: string; ok: boolean };

export function AssistantBot({ settings, openFlags, resolved, checks }: AssistantBotProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [keywordDraft, setKeywordDraft] = useState(settings.keywords.join(", "));
  const [scanCount, setScanCount] = useState("25");
  const [command, setCommand] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);

  const on = settings.enabled;
  const alerts = checks.filter((c) => c.status !== "ok");
  const failing = checks.filter((c) => c.status === "fail").length;

  async function toggleMaster(next: boolean) {
    setBusy("master");
    const res = await setBotEnabled(next);
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(next ? "Assistant bot is ON." : "Assistant bot is OFF — it does nothing until you turn it back on.");
    router.refresh();
  }

  async function toggleAutoHide(next: boolean) {
    setBusy("autohide");
    const res = await setBotAutoHide(next);
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(next ? "Matches will now be hidden straight away." : "Matches will now only be queued for you.");
    router.refresh();
  }

  async function saveKeywords() {
    setBusy("keywords");
    const res = await setBotKeywords(keywordDraft);
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success("Keyword list saved.");
    router.refresh();
  }

  async function scanNow() {
    setBusy("scan");
    const res = await botScan(parseInt(scanCount, 10) || 25);
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(res.raised && res.raised > 0 ? `${res.raised} item(s) flagged.` : "Nothing matched those keywords.");
    router.refresh();
  }

  async function act(flag: BotFlagWithAuthor, action: "hide" | "restore") {
    setBusy(flag.id);
    const res = await actOnFlag(flag.id, action);
    setBusy(null);
    if (res?.error) { toast.error(res.error); return; }
    toast.success(action === "hide" ? "Hidden — only the author can see it now." : "Restored to the author's own setting.");
    router.refresh();
  }

  async function submitCommand() {
    const text = command.trim();
    if (!text) return;
    setBusy("cmd");
    const res = await runBotCommand(text);
    setBusy(null);
    setLog((p) => [{ input: text, output: res.output, ok: res.ok }, ...p].slice(0, 12));
    setCommand("");
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Master switch */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${on ? "bg-brand-green-800" : "bg-[var(--border)]"}`}>
            <Bot className={`w-5 h-5 ${on ? "text-brand-gold-400" : "text-[var(--text-secondary)]"}`} />
          </div>
          <div className="flex-1 min-w-[12rem]">
            <h3 className="font-semibold text-[var(--text-primary)]">Assistant bot</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              {on ? "Watching new posts and comments for your keywords." : "Switched off. It flags nothing and hides nothing."}
            </p>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${on ? "bg-green-500/20 text-green-700" : "bg-[var(--border)] text-[var(--text-secondary)]"}`}>
            {on ? "RUNNING" : "OFF"}
          </span>
          <Button
            size="sm"
            variant={on ? "danger" : "primary"}
            loading={busy === "master"}
            onClick={() => toggleMaster(!on)}
            icon={on ? <ShieldOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
          >
            {on ? "Turn off" : "Turn on"}
          </Button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          The switch is enforced in the database, not just on this page: with it off, the scanning functions refuse to run even if called directly.
        </p>
      </div>

      {/* Site check + security alerts */}
      <div className={`card p-5 space-y-3 ${on ? "" : "opacity-50"}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <Activity className="w-4 h-4 text-[var(--text-secondary)]" />
          <h3 className="font-semibold text-[var(--text-primary)] flex-1 min-w-[8rem]">Site check</h3>
          {on && checks.length > 0 && (
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${failing > 0 ? "bg-red-500/20 text-red-700" : alerts.length > 0 ? "bg-amber-500/20 text-amber-700" : "bg-green-500/20 text-green-700"}`}>
              {failing > 0 ? `${failing} PROBLEM(S)` : alerts.length > 0 ? `${alerts.length} TO WATCH` : "ALL CLEAR"}
            </span>
          )}
          <Button size="sm" variant="secondary" disabled={!on} onClick={() => router.refresh()} icon={<Search className="w-3.5 h-3.5" />}>
            Run check
          </Button>
        </div>

        {!on ? (
          <p className="text-sm text-[var(--text-secondary)]">
            The bot runs no checks while it is switched off. Turn it on above to have it watch the site for you.
          </p>
        ) : checks.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Press “Run check” to walk the live site.</p>
        ) : (
          <>
            {alerts.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5" /> Security alerts
                </p>
                {alerts.map((c) => (
                  <p key={c.key} className="text-sm text-[var(--text-primary)]">
                    <span className="font-semibold">{c.label}:</span> {c.detail}
                  </p>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checks.map((c) => (
                <div key={c.key} className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-2.5">
                  <CheckCircle2
                    className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                      c.status === "fail" ? "text-red-600" : c.status === "warn" ? "text-amber-600" : "text-green-600"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{c.label}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Rules */}
      <div className={`card p-5 space-y-4 transition-opacity ${on ? "" : "opacity-50 pointer-events-none"}`}>
        <h3 className="font-semibold flex items-center gap-2 text-[var(--text-primary)]">
          <Wand2 className="w-4 h-4" /> What it watches for
        </h3>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[var(--brand-green)]"
            checked={settings.autoHide}
            disabled={busy === "autohide"}
            onChange={(e) => toggleAutoHide(e.target.checked)}
          />
          <span className="text-sm text-[var(--text-primary)]">Auto-hide matches (otherwise they just wait in the queue)</span>
        </label>

        <div>
          <label className="label">Keywords (comma separated)</label>
          <div className="flex gap-2">
            <input
              className="input"
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              placeholder="scam, fraud, impersonation"
            />
            <Button size="sm" variant="secondary" loading={busy === "keywords"} onClick={saveKeywords}>Save</Button>
          </div>
          {settings.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {settings.keywords.map((k) => (
                <span key={k} className="badge">{k}</span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="label">Sweep recent content</label>
          <div className="flex gap-2 items-center">
            <input
              className="input w-24"
              type="number"
              min={1}
              max={200}
              value={scanCount}
              onChange={(e) => setScanCount(e.target.value)}
            />
            <Button size="sm" loading={busy === "scan"} onClick={scanNow} icon={<Search className="w-3.5 h-3.5" />}>
              Scan last {scanCount || 25} items
            </Button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5">
            Posts and comments are checked the moment they are published, so a scan is only needed to catch up on older content.
          </p>
        </div>
      </div>

      {/* Open queue */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-[var(--border)]">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Review queue ({openFlags.length})</p>
        </div>
        {openFlags.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] p-6 text-center">
            Nothing waiting. If this stays empty even after a scan, apply <span className="font-mono text-xs">014_assistant_bot.sql</span> in the Supabase dashboard.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {openFlags.map((f) => (
              <div key={f.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono bg-[var(--border)] px-2 py-0.5 rounded text-[var(--text-primary)]">{f.id.slice(0, 8)}</span>
                  <span className="badge">{f.entity_type}</span>
                  {f.matched_keyword && <span className="text-xs font-semibold text-red-600">“{f.matched_keyword}”</span>}
                  <span className="text-[var(--text-secondary)] ml-auto">{formatRelativeTime(f.created_at)}</span>
                </div>
                <p className="text-sm text-[var(--text-primary)] line-clamp-2">{f.excerpt || "(no text captured)"}</p>
                <div className="flex items-center gap-2">
                  {f.author && (
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] min-w-0">
                      <Avatar src={f.author.avatar_url} name={f.author.display_name} size={22} />
                      <span className="truncate">{f.author.display_name} @{f.author.username}</span>
                    </span>
                  )}
                  <div className="flex gap-1.5 ml-auto flex-shrink-0">
                    {f.action === "flag" && (
                      <Button size="sm" loading={busy === f.id} onClick={() => act(f, "hide")} icon={<ShieldOff className="w-3.5 h-3.5" />}>Hide</Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === f.id}
                      onClick={() => act(f, "restore")}
                      icon={<Power className="w-3.5 h-3.5" />}
                    >
                      {f.action === "hide" ? "Restore" : "Dismiss"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Command console */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2 text-[var(--text-primary)]">
          <Terminal className="w-4 h-4" /> Command console
        </h3>
        <div className="flex gap-2">
          <input
            className="input font-mono text-xs"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitCommand(); }}
            placeholder="status"
          />
          <Button size="sm" loading={busy === "cmd"} onClick={submitCommand}>Run</Button>
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Type <span className="font-mono">help</span> for the full list — status, check, security, scan, hide CODE, restore CODE, turn on/off, autohide on/off, keywords.
        </p>
        {log.length > 0 && (
          <div className="space-y-2">
            {log.map((line, i) => (
              <div key={i} className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-3">
                <p className="text-xs font-mono text-[var(--text-secondary)]">&gt; {line.input}</p>
                <pre className={`text-xs whitespace-pre-wrap mt-1 font-mono ${line.ok ? "text-[var(--text-primary)]" : "text-red-600"}`}>{line.output}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Recently closed ({resolved.length})</p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {resolved.map((f) => (
              <div key={f.id} className="flex items-center gap-2 px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                <span className="font-mono">{f.id.slice(0, 8)}</span>
                <span className="badge">{f.entity_type}</span>
                <span>{f.action === "hide" ? "hidden then restored" : "flagged then dismissed"}</span>
                {f.author && <span className="truncate">@{f.author.username}</span>}
                <span className="ml-auto">{f.resolved_at ? formatRelativeTime(f.resolved_at) : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
