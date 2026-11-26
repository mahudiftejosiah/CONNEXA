"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";

// Minimum time the splash stays visible — prevents an instant flash-and-gone
// on cached pages while still clearing promptly when the new page is ready.
const MIN_VISIBLE_MS  = 500;
// Safety net: clear the splash even if pathname never changes (error, redirect)
const GIVE_UP_MS      = 8000;

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
  if (url.pathname === window.location.pathname && url.search === window.location.search) return false;
  return true;
}

export default function RouteSplash() {
  const pathname    = usePathname();
  const [show, setShow]     = useState(false);
  const startedAt   = useRef<number>(0);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When pathname changes the navigation is done — wait out the minimum time
  useEffect(() => {
    if (!show) return;
    const elapsed   = Date.now() - startedAt.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const timer     = setTimeout(() => setShow(false), remaining);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (anchor && isInternalNavigation(anchor as HTMLAnchorElement, event)) {
        startedAt.current = Date.now();
        setShow(true);
        if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
        giveUpTimer.current = setTimeout(() => setShow(false), GIVE_UP_MS);
      }
    }
    function onBack() {
      startedAt.current = Date.now();
      setShow(true);
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
      giveUpTimer.current = setTimeout(() => setShow(false), GIVE_UP_MS);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onBack);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onBack);
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="route-splash" role="status" aria-live="polite">
      <Logo size="lg" variant="full" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
