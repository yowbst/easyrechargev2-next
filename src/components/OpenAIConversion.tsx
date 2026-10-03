"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { measureQuoteSubmitted } from "@/lib/openaiAds";

// Quote-submitted event for the ChatGPT Ads pixel, once per submission
// (quote success page). Inert without a configured pixel. event_id = the
// submission id, shared with the server-side Conversions API event.
export function OpenAIConversion() {
  const searchParams = useSearchParams();
  const submissionId = searchParams.get("submissionId") || undefined;
  // nd=1: the lead is stored but never dispatched (battery visitor without PV).
  const notALead = searchParams.get("nd") === "1";

  useEffect(() => {
    if (notALead) return;
    const guardKey = `er-oaiq-conv-${submissionId || "unknown"}`;
    try {
      if (sessionStorage.getItem(guardKey)) return;
      sessionStorage.setItem(guardKey, "1");
    } catch {
      /* private browsing — event_id still dedupes */
    }
    measureQuoteSubmitted(submissionId);
  }, [submissionId, notALead]);

  return null;
}
