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
} from "lucide-react";
import {
  DISPATCH_STAGES,
  STAGE_RANK,
  type DispatchStage,
} from "@/lib/dispatch/types";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import { LeadCard } from "./LeadCard";

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
const OUTCOME_STAGES: DispatchStage[] = ["won", "lost"];

const OUTCOME_STYLES: Record<"won" | "lost", { bar: string; text: string; ring: string }> = {
  won: {
    bar: "bg-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
    ring: "ring-emerald-400/50",
  },
  lost: {
    bar: "bg-rose-400",
    text: "text-rose-700 dark:text-rose-400",
    ring: "ring-rose-400/50",
  },
};

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
  const sidebar = useSidebar();
  const t = makePartnerT(dictionary);
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

  const wonCount = activeGrouped.won.length;
  const lostCount = activeGrouped.lost.length;
  const closedCount = wonCount + lostCount;
  const conversionPct =
    closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : null;

  return (
    <TooltipProvider delay={250}>
      <div className="flex min-h-[calc(100dvh-9rem)] scroll-smooth flex-col gap-6">
        {/* Mobile-only sticky stage nav: scroll-jump to each section. */}
        <nav
          className="sticky top-0 z-20 -mx-4 -mt-4 flex gap-1.5 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur-sm md:hidden"
          aria-label="Navigation par étape"
        >
          {[...MAIN_STAGES, ...OUTCOME_STAGES].map((stage) => {
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
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4">
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

        {/* Bottom block: disqualified + outcomes. mt-auto pushes the whole
            block to the page footer, regardless of how empty the funnel is. */}
        <div className="mt-auto space-y-6">

        {/* Disqualified: same 4-column layout, aligned with active funnel. */}
        {mainDisqCount > 0 && (
          <details className="space-y-3" open>
            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
              {t("groups.disqualified")} ({mainDisqCount})
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

        {/* Outcomes at the bottom: Won / Lost side-by-side, color-tinted,
            collapsible. Drop targets stay active while collapsed (details
            keep their dragOver/drop handlers). While a card is being dragged,
            this row floats fixed to the viewport bottom — offset on the left
            by the sidebar width so it doesn't overlap the nav. */}
        <div
          style={
            draggingStage !== null && !sidebar.isMobile
              ? {
                  left:
                    sidebar.state === "expanded"
                      ? "var(--sidebar-width)"
                      : "var(--sidebar-width-icon)",
                }
              : undefined
          }
          className={`grid grid-cols-1 gap-3 transition-all md:grid-cols-2 ${
            draggingStage !== null
              ? "fixed right-0 bottom-0 left-0 z-30 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm md:px-6"
              : ""
          }`}
        >
          {OUTCOME_STAGES.map((stage) => {
            const tone = OUTCOME_STYLES[stage as "won" | "lost"];
            const isDropTarget = dropTarget === stage;
            const cards = activeGrouped[stage];
            const Icon = STAGE_ICONS[stage];
            return (
              <details
                key={stage}
                id={`stage-${stage}`}
                onDragOver={(e) => handleDragOver(e, stage)}
                onDragLeave={() => handleDragLeave(stage)}
                onDrop={(e) => handleDrop(e, stage)}
                className={`relative scroll-mt-16 overflow-hidden rounded-lg border bg-card p-3 pl-4 transition-shadow ${
                  isDropTarget ? `ring-2 ${tone.ring}` : ""
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`}
                />
                <summary
                  className={`flex cursor-pointer items-baseline justify-between gap-2 text-sm font-semibold ${tone.text}`}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{t(`stages.${stage}`)}</span>
                    <span className="text-xs text-muted-foreground">
                      ({cards.length})
                    </span>
                  </span>
                  {stage === "won" && conversionPct !== null && (
                    <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                      {conversionPct}% · {wonCount}/{closedCount}
                    </span>
                  )}
                </summary>
                <ul className="mt-3 space-y-2">
                  {cards.map((d) => (
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
      </div>
    </TooltipProvider>
  );
}
