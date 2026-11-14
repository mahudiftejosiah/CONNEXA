"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/Modal";
import { adminSignOut } from "@/lib/actions/adminView";

// The admin header used to submit a plain form action, which cannot be
// interrupted. This keeps the same server action behind the same confirmation
// the rest of the site gives before signing anybody out.
export function AdminLogoutButton() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function logOut() {
    setBusy(true);
    await adminSignOut();
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 whitespace-nowrap"
        style={{ backgroundColor: "var(--brand-green)", color: "#ffffff" }}
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden sm:inline">Log out</span>
      </button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={logOut}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmLabel="Yes, Log Out"
        danger
        loading={busy}
      />
    </>
  );
}
