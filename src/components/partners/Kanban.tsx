"use client";

import { useEffect, useState, useTransition, type DragEvent } from "react";
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

  // Local mirror so we can update the UI optimistically on drag-drop. Server
  // is still source of truth — re-sync whenever the prop changes (router.refresh
  // or revalidation).
  const [localDispatches, setLocalDispatches] =
    useState<PartnerDispatchCard[]>(dispatches);
  useEffect(() => {
    setLocalDispatches(dispatches);
  }, [dispatches]);

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
  for (const d of localDispatches) {
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
    const previous = localDispatches;
    const now = new Date().toISOString();
    // Optimistic: move the card immediately.
    setLocalDispatches((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, stage, stage_entered_at: now } : d,
      ),
    );
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
        setLocalDispatches(previous);
        const err = await res.json().catch(() => ({}));
        alert(`Échec: ${err.error ?? res.status}`);
        return;
      }
      // Sync server-decided fields (billable lock) without waiting for refresh.
      const data: { billable?: boolean } = await res.json().catch(() => ({}));
      if (typeof data.billable === "boolean") {
        setLocalDispatches((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  billable: data.billable!,
                  billable_locked_at:
                    data.billable && !d.billable_locked_at
                      ? now
                      : d.billable_locked_at,
                }
              : d,
          ),
        );
      }
      // Background re-sync; won't flicker since local state already matches.
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  }

  async function disqualify(id: string, reason: string) {
    const previous = localDispatches;
    const now = new Date().toISOString();
    // Optimistic: mark disqualified + lock billing immediately.
    setLocalDispatches((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              disqualified: true,
              disqualification_reason: reason,
              billable: false,
              billable_locked_at: now,
            }
          : d,
      ),
    );
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
      if (!res.ok) {
        // Window expired or billing already locked — revert and let the
        // background refresh tell us the true state (the server may have
        // flipped billable=true in the window_expired case).
        setLocalDispatches(previous);
        const data = await res.json().catch(() => ({}));
        alert(`Échec: ${data.error ?? res.status}`);
        startTransition(() => router.refresh());
        return;
      }
      // Background re-sync.
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
    const card = localDispatches.find((c) => c.id === id);
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
