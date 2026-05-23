"use client";

import { useEffect, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { DISPATCH_STAGES, type DispatchStage } from "@/lib/dispatch/types";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LeadCard } from "./LeadCard";

const STAGE_LABELS: Record<DispatchStage, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  appointment: "RDV pris",
  quote_sent: "Devis envoyé",
  won: "Gagné",
  lost: "Perdu",
};

// Main funnel: active pipeline columns. Outcomes (Won/Lost) live in a
// separate compact section below — they're informational for conversion-rate
// / CAC tracking, not part of the day-to-day workflow.
const MAIN_STAGES: DispatchStage[] = [
  "new",
  "contacted",
  "appointment",
  "quote_sent",
];
const OUTCOME_STAGES: DispatchStage[] = ["won", "lost"];

const OUTCOME_STYLES: Record<"won" | "lost", { border: string; bg: string; text: string; ring: string }> = {
  won: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/40",
    text: "text-emerald-900",
    ring: "ring-emerald-400/50",
  },
  lost: {
    border: "border-rose-300",
    bg: "bg-rose-50/40",
    text: "text-rose-900",
    ring: "ring-rose-400/50",
  },
};

const DRAG_MIME = "application/x-partner-dispatch-id";

export function Kanban({
  partnerToken,
  lang,
  dispatches,
}: {
  partnerToken: string;
  lang: string;
  dispatches: PartnerDispatchCard[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DispatchStage | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Local mirror so we can update the UI optimistically on drag-drop. Server
  // is still source of truth — re-sync whenever the prop changes (router.refresh
  // or revalidation).
  const [localDispatches, setLocalDispatches] =
    useState<PartnerDispatchCard[]>(dispatches);
  useEffect(() => {
    setLocalDispatches(dispatches);
  }, [dispatches]);

  // Two stacked 6-column grids sharing the same breakpoints. Active cards
  // up top, disqualified cards below — each card stays in the column
  // matching the stage it was at, so disqualifications align vertically
  // under the stage where the lead was lost.
  const emptyGroups = (): Record<DispatchStage, PartnerDispatchCard[]> => ({
    new: [],
    contacted: [],
    appointment: [],
    quote_sent: [],
    won: [],
    lost: [],
  });
  const activeGrouped = emptyGroups();
  const disqGrouped = emptyGroups();
  for (const d of localDispatches) {
    if (!(DISPATCH_STAGES as string[]).includes(d.stage)) continue;
    const bucket = d.disqualified ? disqGrouped : activeGrouped;
    bucket[d.stage as DispatchStage].push(d);
  }
  for (const s of DISPATCH_STAGES) {
    activeGrouped[s].sort((a, b) =>
      b.dispatched_at.localeCompare(a.dispatched_at),
    );
    disqGrouped[s].sort((a, b) =>
      (b.disqualified_at ?? b.dispatched_at).localeCompare(
        a.disqualified_at ?? a.dispatched_at,
      ),
    );
  }
  const disqCount = DISPATCH_STAGES.reduce(
    (sum, s) => sum + disqGrouped[s].length,
    0,
  );

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
    setIsDragging(true);
  }
  function handleDragEnd() {
    setIsDragging(false);
    setDropTarget(null);
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
    setIsDragging(false);
    if (!id) return;
    const card = localDispatches.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    moveStage(id, stage);
  }

  // Restrict disqualified grid to main funnel stages — Won/Lost are terminal
  // outcomes that can't be disqualified (billing is already locked there).
  const mainDisqCount = MAIN_STAGES.reduce(
    (sum, s) => sum + disqGrouped[s].length,
    0,
  );

  const wonCount = activeGrouped.won.length;
  const lostCount = activeGrouped.lost.length;
  const closedCount = wonCount + lostCount;
  const conversionPct =
    closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : null;

  // 5-column grid: 4 active funnel columns + 1 outcomes column (Won/Lost stacked).
  // The outcomes column is narrow by default and widens while any card is being
  // dragged so the partner has an obvious target to drop onto.
  const gridColsClass = isDragging
    ? "lg:[grid-template-columns:1fr_1fr_1fr_1fr_1.4fr]"
    : "lg:[grid-template-columns:1fr_1fr_1fr_1fr_minmax(150px,_0.55fr)]";

  return (
    <TooltipProvider delay={250}>
      <div className="space-y-6">
        {/* Active pipeline + outcomes column */}
        <div
          className={`grid grid-cols-1 gap-4 transition-[grid-template-columns] duration-200 md:grid-cols-2 ${gridColsClass}`}
        >
          {MAIN_STAGES.map((stage) => {
            const isDropTarget = dropTarget === stage;
            return (
              <section
                key={stage}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={() => handleDragLeave(stage)}
                onDrop={(e) => handleDrop(e, stage)}
                className={`rounded-lg border bg-card p-3 transition-colors ${
                  isDropTarget
                    ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                    : ""
                }`}
              >
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                  {STAGE_LABELS[stage]}{" "}
                  <span className="ml-1 text-xs">({activeGrouped[stage].length})</span>
                </h2>
                <ul className="min-h-[40px] space-y-2">
                  {activeGrouped[stage].map((d) => (
                    <li key={d.id}>
                      <LeadCard
                        dispatch={d}
                        lang={lang}
                        pending={pending === d.id}
                        onMove={(s) => moveStage(d.id, s)}
                        onDisqualify={(r) => disqualify(d.id, r)}
                        onDragStart={(e) => handleDragStart(e, d.id)}
                        onDragEnd={handleDragEnd}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {/* Outcomes column: stacked Won + Lost. Each accordion is its own
              drop target; the parent grid cell widens while dragging. */}
          <div className="flex flex-col gap-3">
            {OUTCOME_STAGES.map((stage) => {
              const tone = OUTCOME_STYLES[stage as "won" | "lost"];
              const isDropTarget = dropTarget === stage;
              const cards = activeGrouped[stage];
              return (
                <details
                  key={stage}
                  onDragOver={(e) => handleDragOver(e, stage)}
                  onDragLeave={() => handleDragLeave(stage)}
                  onDrop={(e) => handleDrop(e, stage)}
                  className={`rounded-lg border ${tone.border} ${tone.bg} p-3 transition-shadow ${
                    isDropTarget ? `ring-2 ${tone.ring}` : ""
                  }`}
                >
                  <summary
                    className={`flex cursor-pointer items-baseline justify-between gap-2 text-sm font-semibold ${tone.text}`}
                  >
                    <span>
                      {STAGE_LABELS[stage]}{" "}
                      <span className="ml-1 text-xs opacity-80">({cards.length})</span>
                    </span>
                    {stage === "won" && conversionPct !== null && (
                      <span className="whitespace-nowrap text-xs font-medium opacity-80">
                        {conversionPct}% · {wonCount}/{closedCount}
                      </span>
                    )}
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {cards.map((d) => (
                      <li key={d.id}>
                        <LeadCard
                          dispatch={d}
                          lang={lang}
                          pending={pending === d.id}
                          onMove={(s) => moveStage(d.id, s)}
                          onDisqualify={(r) => disqualify(d.id, r)}
                          onDragStart={(e) => handleDragStart(e, d.id)}
                          onDragEnd={handleDragEnd}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </div>

        {/* Disqualified: same 5-column template, last cell empty, so each
            disqualified column aligns vertically with its active counterpart. */}
        {mainDisqCount > 0 && (
          <details className="space-y-3" open>
            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
              Disqualifiés ({mainDisqCount})
            </summary>
            <div
              className={`mt-3 grid grid-cols-1 gap-4 transition-[grid-template-columns] duration-200 md:grid-cols-2 ${gridColsClass}`}
            >
              {MAIN_STAGES.map((stage) => (
                <section
                  key={stage}
                  className="rounded-lg border border-dashed bg-muted/20 p-3"
                >
                  <h2 className="mb-2 text-xs text-muted-foreground">
                    {STAGE_LABELS[stage]}{" "}
                    <span className="ml-1">({disqGrouped[stage].length})</span>
                  </h2>
                  <ul className="space-y-2">
                    {disqGrouped[stage].map((d) => (
                      <li key={d.id}>
                        <LeadCard
                          dispatch={d}
                          lang={lang}
                          pending={pending === d.id}
                          onMove={() => {}}
                          onDisqualify={() => {}}
                          readOnly
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {/* placeholder cell aligning with the outcomes column */}
              <div aria-hidden className="hidden lg:block" />
            </div>
          </details>
        )}
      </div>
    </TooltipProvider>
  );
}
