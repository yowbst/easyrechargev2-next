"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DISPATCH_STAGES, type DispatchStage } from "@/lib/dispatch/types";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { LeadCard } from "./LeadCard";

const STAGE_LABELS: Record<DispatchStage, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  appointment: "RDV pris",
  quote_sent: "Devis envoyé",
  won: "Gagné",
  lost: "Perdu",
};

export function Kanban({
  partnerToken,
  dispatches,
}: {
  partnerToken: string;
  dispatches: PartnerDispatchCard[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);

  const grouped: Record<DispatchStage, PartnerDispatchCard[]> = {
    new: [],
    contacted: [],
    appointment: [],
    quote_sent: [],
    won: [],
    lost: [],
  };
  const disqualified: PartnerDispatchCard[] = [];
  for (const d of dispatches) {
    if (d.disqualified) {
      disqualified.push(d);
    } else if ((DISPATCH_STAGES as string[]).includes(d.stage)) {
      grouped[d.stage as DispatchStage].push(d);
    }
  }

  async function moveStage(id: string, stage: DispatchStage) {
    setPending(id);
    try {
      const res = await fetch(
        `/api/partners/${partnerToken}/dispatches/${id}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Échec: ${err.error ?? res.status}`);
      } else {
        startTransition(() => router.refresh());
      }
    } finally {
      setPending(null);
    }
  }

  async function disqualify(id: string, reason: string) {
    setPending(id);
    try {
      const res = await fetch(
        `/api/partners/${partnerToken}/dispatches/${id}/disqualify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Échec: ${data.error ?? res.status}`);
      }
      // Refresh either way — even on "window_expired" the server flipped billable.
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        {DISPATCH_STAGES.map((stage) => (
          <section key={stage} className="rounded-lg border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              {STAGE_LABELS[stage]}{" "}
              <span className="ml-1 text-xs">({grouped[stage].length})</span>
            </h2>
            <ul className="space-y-2">
              {grouped[stage].map((d) => (
                <li key={d.id}>
                  <LeadCard
                    dispatch={d}
                    pending={pending === d.id}
                    onMove={(s) => moveStage(d.id, s)}
                    onDisqualify={(r) => disqualify(d.id, r)}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {disqualified.length > 0 && (
        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Disqualifiés ({disqualified.length})
          </summary>
          <ul className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {disqualified.map((d) => (
              <li key={d.id}>
                <LeadCard
                  dispatch={d}
                  pending={false}
                  onMove={() => {}}
                  onDisqualify={() => {}}
                  readOnly
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
