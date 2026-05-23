"use client";

import { useState, useTransition, type DragEvent } from "react";
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

const DRAG_MIME = "application/x-partner-dispatch-id";

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
  const [dropTarget, setDropTarget] = useState<DispatchStage | null>(null);

  // Group every dispatch by stage — disqualified rows stay in the column
  // matching the stage they were disqualified at, so partners see where
  // attrition happens in the funnel.
  const grouped: Record<DispatchStage, PartnerDispatchCard[]> = {
    new: [],
    contacted: [],
    appointment: [],
    quote_sent: [],
    won: [],
    lost: [],
  };
  for (const d of dispatches) {
    if ((DISPATCH_STAGES as string[]).includes(d.stage)) {
      grouped[d.stage as DispatchStage].push(d);
    }
  }
  // Active cards above disqualified; within each group, newest first.
  for (const s of DISPATCH_STAGES) {
    grouped[s].sort((a, b) => {
      if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
      return b.dispatched_at.localeCompare(a.dispatched_at);
    });
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

  function handleDragStart(e: DragEvent<HTMLElement>, id: string) {
    e.dataTransfer.setData(DRAG_MIME, id);
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e: DragEvent<HTMLElement>, stage: DispatchStage) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== stage) setDropTarget(stage);
  }
  function handleDragLeave(stage: DispatchStage) {
    setDropTarget((prev) => (prev === stage ? null : prev));
  }
  function handleDrop(e: DragEvent<HTMLElement>, stage: DispatchStage) {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME);
    setDropTarget(null);
    if (!id) return;
    const card = dispatches.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    moveStage(id, stage);
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
      {DISPATCH_STAGES.map((stage) => {
        const isDropTarget = dropTarget === stage;
        return (
          <section
            key={stage}
            onDragOver={(e) => handleDragOver(e, stage)}
            onDragLeave={() => handleDragLeave(stage)}
            onDrop={(e) => handleDrop(e, stage)}
            className={`rounded-lg border bg-card p-3 transition-colors ${
              isDropTarget ? "border-primary bg-primary/5 ring-2 ring-primary/40" : ""
            }`}
          >
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
              {STAGE_LABELS[stage]}{" "}
              <span className="ml-1 text-xs">({grouped[stage].length})</span>
            </h2>
            <ul className="min-h-[40px] space-y-2">
              {grouped[stage].map((d) => (
                <li key={d.id}>
                  <LeadCard
                    dispatch={d}
                    pending={pending === d.id}
                    onMove={(s) => moveStage(d.id, s)}
                    onDisqualify={(r) => disqualify(d.id, r)}
                    onDragStart={(e) => handleDragStart(e, d.id)}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
