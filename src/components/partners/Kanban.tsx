"use client";

import {
  useEffect,
  useState,
  useTransition,
  type ComponentType,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Inbox,
  PhoneCall,
  CalendarCheck,
  FileText,
  Trophy,
  XCircle,
  ChevronRight,
  Ban,
  Archive,
} from "lucide-react";
import { STAGE_RANK, type DispatchStage } from "@/lib/dispatch/types";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import { LeadCard } from "./LeadCard";
import { usePartnerFilter, type SortKey } from "./PartnerFilterContext";

function leadName(d: PartnerDispatchCard): string {
  const u = d.submission?.user;
  return `${u?.first_name ?? ""} ${u?.last_name ?? ""}`.trim().toLowerCase();
}

function compareCards(
  a: PartnerDispatchCard,
  b: PartnerDispatchCard,
  sort: SortKey,
): number {
  switch (sort) {
    case "oldest":
      return a.dispatched_at.localeCompare(b.dispatched_at);
    case "name":
      return leadName(a).localeCompare(leadName(b), "fr", {
        sensitivity: "base",
      });
    case "stage_age":
      // Longest time in current stage first (oldest stage_entered_at).
      return (a.stage_entered_at ?? a.dispatched_at).localeCompare(
        b.stage_entered_at ?? b.dispatched_at,
      );
    case "recent":
    default:
      return b.dispatched_at.localeCompare(a.dispatched_at);
  }
}

const STAGE_ICONS: Record<DispatchStage, ComponentType<{ className?: string }>> = {
  new: Inbox,
  contacted: PhoneCall,
  appointment: CalendarCheck,
  quote_sent: FileText,
  won: Trophy,
  lost: XCircle,
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

const DRAG_MIME = "application/x-partner-dispatch-id";

export function Kanban({
  partnerToken,
  lang,
  dispatches,
  rottingDaysByStage,
  reasonsByStage,
  dictionary,
}: {
  partnerToken: string;
  lang: string;
  dispatches: PartnerDispatchCard[];
  rottingDaysByStage: Record<string, number>;
  reasonsByStage: Record<string, string[]>;
  dictionary: PartnerDict;
}) {
  const router = useRouter();
  const t = makePartnerT(dictionary);
  const { inRange, sort, facets } = usePartnerFilter();
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DispatchStage | null>(null);
  const [draggingStage, setDraggingStage] = useState<DispatchStage | null>(null);

  // Local mirror so we can update the UI optimistically on drag-drop. Server
  // is still source of truth — re-sync whenever the prop changes (router.refresh
  // or revalidation).
  const [localDispatches, setLocalDispatches] =
    useState<PartnerDispatchCard[]>(dispatches);
  useEffect(() => {
    setLocalDispatches(dispatches);
  }, [dispatches]);

  // Three stacked grids keyed on the four funnel stages:
  //  - active: open leads in their current stage
  //  - disqualified: lost-to-attrition leads, in the stage they were dropped
  //  - closed: won/lost leads, in the funnel stage they were *closed from*
  //    (derived from stage_history). The card's green/red bar marks the outcome.
  const emptyMainGroups = (): Record<string, PartnerDispatchCard[]> => ({
    new: [],
    contacted: [],
    appointment: [],
    quote_sent: [],
  });
  const activeGrouped = emptyMainGroups();
  const disqGrouped = emptyMainGroups();
  const closedGrouped = emptyMainGroups();
  let wonCount = 0;
  let lostCount = 0;

  const closedFromStage = (d: PartnerDispatchCard): string => {
    const h = d.stage_history;
    if (Array.isArray(h)) {
      for (let i = h.length - 1; i >= 0; i--) {
        if ((MAIN_STAGES as string[]).includes(h[i].stage)) return h[i].stage;
      }
    }
    return "quote_sent";
  };

  // Header filters (date window + attribute facets) apply across every
  // section. A facet group with no selection doesn't constrain.
  const matchesFacets = (d: PartnerDispatchCard): boolean => {
    const data = (d.submission?.data ?? {}) as Record<string, unknown>;
    if (facets.housing.length > 0) {
      const v =
        typeof data.housingStatus === "string"
          ? data.housingStatus.toLowerCase()
          : null;
      if (!v || !facets.housing.includes(v)) return false;
    }
    if (facets.deadline.length > 0) {
      const v = typeof data.deadline === "string" ? data.deadline : null;
      if (!v || !facets.deadline.includes(v)) return false;
    }
    if (facets.approval.length > 0) {
      const v =
        typeof data.approval === "string" ? data.approval.toLowerCase() : null;
      if (!v || !facets.approval.includes(v)) return false;
    }
    return true;
  };
  const visibleDispatches = localDispatches.filter(
    (d) => inRange(d.dispatched_at) && matchesFacets(d),
  );

  for (const d of visibleDispatches) {
    if (d.disqualified) {
      if ((MAIN_STAGES as string[]).includes(d.stage)) disqGrouped[d.stage].push(d);
      continue;
    }
    if (d.stage === "won" || d.stage === "lost") {
      if (d.stage === "won") wonCount += 1;
      else lostCount += 1;
      closedGrouped[closedFromStage(d)].push(d);
      continue;
    }
    if ((MAIN_STAGES as string[]).includes(d.stage)) activeGrouped[d.stage].push(d);
  }
  for (const s of MAIN_STAGES) {
    activeGrouped[s].sort((a, b) => compareCards(a, b, sort));
    disqGrouped[s].sort((a, b) => compareCards(a, b, sort));
    closedGrouped[s].sort((a, b) => compareCards(a, b, sort));
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

  async function lose(id: string, reason: string, note?: string) {
    const previous = localDispatches;
    const now = new Date().toISOString();
    // Optimistic: close as Lost with its reason; Lost locks billing.
    setLocalDispatches((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              stage: "lost",
              stage_entered_at: now,
              lost_reason: reason,
              lost_note: note ?? null,
              billable: true,
              billable_locked_at: d.billable_locked_at ?? now,
            }
          : d,
      ),
    );
    setPending(id);
    try {
      const res = await fetch(
        `/api/partners/${partnerToken}/dispatches/${id}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "lost",
            lost_reason: reason,
            ...(note ? { lost_note: note } : {}),
          }),
        },
      );
      if (!res.ok) {
        setLocalDispatches(previous);
        const err = await res.json().catch(() => ({}));
        alert(`Échec: ${err.error ?? res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  }

  async function reopen(id: string, stage: DispatchStage) {
    const previous = localDispatches;
    const now = new Date().toISOString();
    // Optimistic: move back into the active pipeline, clear the lost reason.
    setLocalDispatches((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              stage,
              stage_entered_at: now,
              lost_reason: null,
              lost_note: null,
            }
          : d,
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
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  }

  async function disqualify(id: string, reason: string, note?: string) {
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
          body: JSON.stringify(note ? { reason, note } : { reason }),
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
    const card = localDispatches.find((c) => c.id === id);
    if (card) setDraggingStage(card.stage as DispatchStage);
  }
  function handleDragEnd() {
    setDropTarget(null);
    setDraggingStage(null);
  }
  function handleDragOver(e: DragEvent<HTMLElement>, stage: DispatchStage) {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    // Block backward drops by skipping preventDefault — the browser then
    // refuses the drop entirely, no visual highlight on this column.
    if (draggingStage && STAGE_RANK[stage] < STAGE_RANK[draggingStage]) return;
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
    setDraggingStage(null);
    if (!id) return;
    const card = localDispatches.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    if (STAGE_RANK[stage] < STAGE_RANK[card.stage as DispatchStage]) return;
    moveStage(id, stage);
  }

  // Restrict disqualified grid to main funnel stages — Won/Lost are terminal
  // outcomes that can't be disqualified (billing is already locked there).
  const mainDisqCount = MAIN_STAGES.reduce(
    (sum, s) => sum + disqGrouped[s].length,
    0,
  );

  const closedCount = wonCount + lostCount;

  return (
    <TooltipProvider delay={250}>
      <div className="flex min-h-[calc(100dvh-9rem)] scroll-smooth flex-col gap-6">
        {/* Mobile-only sticky stage nav: scroll-jump to each section. */}
        <nav
          className="sticky top-0 z-20 -mx-4 -mt-4 flex gap-1.5 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur-sm md:hidden"
          aria-label="Navigation par étape"
        >
          {MAIN_STAGES.map((stage) => {
            const Icon = STAGE_ICONS[stage];
            const count = activeGrouped[stage].length;
            return (
              <a
                key={stage}
                href={`#stage-${stage}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted"
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span>{t(`stages.${stage}`)}</span>
                <span className="text-muted-foreground">({count})</span>
              </a>
            );
          })}
        </nav>

        {/* Active pipeline. Mobile: horizontal scroll-snap so the partner
            can swipe between stage columns. Desktop: 4-column grid. */}
        <div
          id="crm-open"
          className="-mx-4 flex snap-x snap-mandatory scroll-mt-16 gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4"
        >
          {MAIN_STAGES.map((stage) => {
            const isDropTarget = dropTarget === stage;
            const Icon = STAGE_ICONS[stage];
            return (
              <section
                key={stage}
                id={`stage-${stage}`}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={() => handleDragLeave(stage)}
                onDrop={(e) => handleDrop(e, stage)}
                className={`w-[85vw] shrink-0 snap-start scroll-mt-16 rounded-lg border bg-card p-3 transition-colors md:w-auto md:shrink ${
                  isDropTarget
                    ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                    : ""
                }`}
              >
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{t(`stages.${stage}`)}</span>
                  <span className="text-xs">({activeGrouped[stage].length})</span>
                </h2>
                <ul className="min-h-[40px] space-y-2">
                  {activeGrouped[stage].map((d) => (
                    <li key={d.id}>
                      <LeadCard
                        dispatch={d}
                        rottingDaysByStage={rottingDaysByStage}
                        reasonsByStage={reasonsByStage}
                        dictionary={dictionary}
                        lang={lang}
                        pending={pending === d.id}
                        onMove={(s) => moveStage(d.id, s)}
                        onDisqualify={(r, n) => disqualify(d.id, r, n)}
                        onLose={(r, n) => lose(d.id, r, n)}
                        onDragStart={(e) => handleDragStart(e, d.id)}
                        onDragEnd={handleDragEnd}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

        </div>

        {/* Bottom block: disqualified + closed. mt-auto pushes the whole
            block to the page footer, regardless of how empty the funnel is. */}
        <div className="mt-auto space-y-6">

        {/* Disqualified: same 4-column layout, aligned with active funnel. */}
        {mainDisqCount > 0 && (
          <details id="crm-disqualified" className="group scroll-mt-16 space-y-3" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
              <Ban className="h-4 w-4 shrink-0" />
              <span>
                {t("groups.disqualified")} ({mainDisqCount})
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {MAIN_STAGES.map((stage) => {
                const Icon = STAGE_ICONS[stage];
                return (
                <section
                  key={stage}
                  className="rounded-lg border border-dashed bg-muted/20 p-3"
                >
                  <h2 className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon
                      className="h-3.5 w-3.5 shrink-0"
                      aria-label={t(`stages.${stage}`)}
                    />
                    <span>({disqGrouped[stage].length})</span>
                  </h2>
                  <ul className="space-y-2">
                    {disqGrouped[stage].map((d) => (
                      <li key={d.id}>
                        <LeadCard
                          dispatch={d}
                          rottingDaysByStage={rottingDaysByStage}
                          reasonsByStage={reasonsByStage}
                          dictionary={dictionary}
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
                );
              })}
            </div>
          </details>
        )}

        {/* Closed: won/lost leads, column by column like Disqualifiés, placed
            in the funnel stage they were closed from. The green/red left bar on
            each card (rendered by LeadCard from its won/lost stage) marks the
            outcome. Read-only review — closing happens via the card buttons. */}
        {closedCount > 0 && (
          <details id="crm-closed" className="group scroll-mt-16 space-y-3" open>
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" />
              <Archive className="h-4 w-4 shrink-0" />
              <span>
                {t("groups.closed")} ({closedCount})
              </span>
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {MAIN_STAGES.map((stage) => {
                const Icon = STAGE_ICONS[stage];
                const cards = closedGrouped[stage];
                return (
                  <section
                    key={stage}
                    className="rounded-lg border border-dashed bg-muted/20 p-3"
                  >
                    <h2 className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        aria-label={t(`stages.${stage}`)}
                      />
                      <span>({cards.length})</span>
                    </h2>
                    <ul className="space-y-2">
                      {cards.map((d) => (
                        <li key={d.id}>
                          <LeadCard
                            dispatch={d}
                            rottingDaysByStage={rottingDaysByStage}
                            reasonsByStage={reasonsByStage}
                            dictionary={dictionary}
                            lang={lang}
                            pending={pending === d.id}
                            onMove={() => {}}
                            onDisqualify={() => {}}
                            onReopen={() => reopen(d.id, closedFromStage(d) as DispatchStage)}
                            readOnly
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </details>
        )}
        </div>
      </div>
    </TooltipProvider>
  );
}
