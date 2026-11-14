import { Logo } from "@/components/brand/Logo";

// Shown by the App Router for any page in the app while its server component
// resolves, so a navigation never reveals a blank screen.
export default function RouteSplash() {
  return (
    <div className="route-splash" role="status" aria-live="polite">
      <Logo size="lg" variant="full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
