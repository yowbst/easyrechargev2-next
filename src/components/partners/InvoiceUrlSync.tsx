"use client";

import { useEffect } from "react";

/**
 * Keeps `?invoice=<number>` in step with whichever invoice is expanded, so the
 * link printed on the Google Doc can point at one open invoice and so a partner
 * can share what they are looking at.
 *
 * The list itself stays a Server Component and the disclosure stays a native
 * <details> — this only rewrites the address bar. `toggle` does not bubble, so
 * the listener has to run in the capture phase.
 */
export function InvoiceUrlSync() {
  useEffect(() => {
    function onToggle(event: Event) {
      const el = event.target as HTMLElement | null;
      if (!(el instanceof HTMLDetailsElement)) return;
      const number = el.dataset.invoiceNumber;
      if (!number) return;

      const url = new URL(window.location.href);
      if (el.open) url.searchParams.set("invoice", number);
      else if (url.searchParams.get("invoice") === number) url.searchParams.delete("invoice");
      else return; // another invoice is the one named in the URL — leave it alone
      // replaceState, not push: collapsing and expanding should not fill the
      // back button with steps the partner never navigated to.
      window.history.replaceState(null, "", url.toString());
    }
    document.addEventListener("toggle", onToggle, true);
    return () => document.removeEventListener("toggle", onToggle, true);
  }, []);

  return null;
}
