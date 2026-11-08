"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

/**
 * iPhone Safari refuses element fullscreen, so the request is tried first and
 * `.pseudo-full` fills the viewport by CSS whenever the browser says no. The
 * caller only ever reads `active` and calls `enter` / `exit`.
 */
export function useFullscreen<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [refused, setRefused] = useState(false);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setGranted(!!document.fullscreenElement);
      if (document.fullscreenElement) setRefused(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!refused) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRefused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refused]);

  // Has to run synchronously inside the click that opened it.
  const enter = useCallback(() => {
    const el = ref.current as FsElement | null;
    if (!el) return;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (typeof request !== "function") {
      setRefused(true);
      return;
    }
    try {
      const outcome = request.call(el) as unknown;
      if (outcome && typeof (outcome as Promise<void>).then === "function") {
        (outcome as Promise<void>).catch(() => setRefused(true));
      } else if (!document.fullscreenElement) {
        setRefused(true);
      }
    } catch {
      setRefused(true);
    }
  }, []);

  const exit = useCallback(() => {
    if (document.fullscreenElement) {
      const done = document.exitFullscreen();
      if (done && typeof done.catch === "function") done.catch(() => {});
    }
    setRefused(false);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement || refused) exit();
    else enter();
  }, [enter, exit, refused]);

  return { ref, active: granted || refused, enter, exit, toggle };
}
