"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";

// Nothing should ever leave the sheet up: a cancelled or failed navigation has
// no pathname change to clear it. The fade-in delay lives in globals.css, so a
// fast route change never flashes at all.
const GIVE_UP_MS = 8000;

function isInternalNavigation(anchor: HTMLAnchorElement, event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;

  let url: URL;
  try { url = new URL(anchor.href, window.location.href); } catch { return false; }
  if (url.origin !== window.location.origin) return false;
  // Same document: a tab switch or an in-page jump, not a route change.
  if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
  return true;
}

/**
 * The branded sheet that covers a route change. It lives above the router's
 * own boundary and the outgoing page stays mounted underneath it, which is
 * what gives the backdrop something real to blur.
 */
export default function RouteSplash() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => { setPending(false); }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (anchor && isInternalNavigation(anchor as HTMLAnchorElement, event)) setPending(true);
    }
    function onBack() { setPending(true); }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onBack);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onBack);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="route-splash" role="status" aria-live="polite">
      <Logo size="lg" variant="full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}