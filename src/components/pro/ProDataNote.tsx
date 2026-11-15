// Plain, honest notice for a PRO page whose tables or switches are not ready.
// It never carries made-up content to fill the space.
export function ProDataNote({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className="rounded-xl border px-4 py-3 text-sm"
      style={{
        borderColor: "var(--border)",
        background: tone === "warn" ? "rgba(234,179,8,0.08)" : "var(--bg-card)",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </div>
  );
}
