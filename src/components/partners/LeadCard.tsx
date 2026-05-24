"use client";

import { useState, type DragEvent } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Gift,
  Coins,
  Lock,
  Ban,
  FileSearch,
  GripVertical,
  Calendar,
  Hourglass,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DISPATCH_STAGES,
  STAGE_RANK,
  type DispatchStage,
} from "@/lib/dispatch/types";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { DisqualifyModal } from "./DisqualifyModal";

function isRottenClient(
  stage: string,
  stageEnteredAt: string | null | undefined,
  rottingDaysByStage: Record<string, number>,
): boolean {
  if (!stageEnteredAt) return false;
  const days = rottingDaysByStage[stage];
  if (typeof days !== "number" || days <= 0) return false;
  const elapsed =
    (Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000;
  return elapsed >= days;
}

function daysAtStage(stageEnteredAt: string | null | undefined): number {
  if (!stageEnteredAt) return 0;
  return Math.floor(
    (Date.now() - new Date(stageEnteredAt).getTime()) / 86_400_000,
  );
}

const STAGE_LABELS: Record<DispatchStage, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  appointment: "RDV pris",
  quote_sent: "Devis envoyé",
  won: "Gagné",
  lost: "Perdu",
};

function formatRelativeDate(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  let short: string;
  if (diffDays <= 0) short = "Aujourd'hui";
  else if (diffDays === 1) short = "Hier";
  else short = `Il y a ${diffDays} j`;
  const full = d.toLocaleString("fr-CH", {
    dateStyle: "long",
    timeStyle: "short",
  });
  return { short, full };
}

const REASON_LABELS: Record<string, string> = {
  partner_already_has: "Lead déjà reçu directement",
  dedup: "Lead déjà transmis récemment",
  unreachable: "Lead injoignable",
  not_engaging: "Lead ne souhaite pas s'engager",
  competitor: "Lead a choisi un concurrent",
  long_timeframe: "Projet au-delà de 12 mois",
  no_authorization: "Lead n'a pas l'autorisation",
};

export function LeadCard({
  dispatch,
  lang,
  pending,
  onMove,
  onDisqualify,
  onDragStart,
  onDragEnd,
  rottingDaysByStage,
  reasonsByStage,
  readOnly = false,
}: {
  dispatch: PartnerDispatchCard;
  lang: string;
  pending: boolean;
  onMove: (stage: DispatchStage) => void;
  onDisqualify: (reason: string, note?: string) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  rottingDaysByStage: Record<string, number>;
  reasonsByStage: Record<string, string[]>;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const user = dispatch.submission?.user ?? null;
  const lastInitial = user?.last_name ? `${user.last_name[0]}.` : "";

  const submissionData = (dispatch.submission?.data ?? null) as
    | Record<string, unknown>
    | null;
  const zip =
    typeof submissionData?.postalCode === "string"
      ? submissionData.postalCode
      : null;
  const locality =
    typeof submissionData?.locality === "string" ? submissionData.locality : null;

  const quoteHref = dispatch.submission?.id
    ? `/${lang}/demande-devis/${dispatch.submission.id}?view=partner`
    : null;

  // Disqualified cards aren't draggable — the stage API would 409. Mobile/touch
  // devices ignore HTML5 DnD natively, so they fall back to the dropdown.
  const draggable = !readOnly && !pending && !dispatch.disqualified;
  const disqualifyDisabled =
    pending || dispatch.disqualified || !!dispatch.billable_locked_at;
  const isRotten =
    !readOnly &&
    !dispatch.disqualified &&
    isRottenClient(dispatch.stage, dispatch.stage_entered_at, rottingDaysByStage);
  const stageReasons = reasonsByStage[dispatch.stage] ?? null;

  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`group relative overflow-hidden rounded-md border bg-background p-3 text-sm shadow-sm transition-opacity ${
        dispatch.disqualified ? "opacity-60" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {isRotten && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-amber-400"
        />
      )}
      {/* Header: name (left) + all status icons (right) */}
      <header className="mb-2 flex items-start justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1 font-medium">
          {draggable && (
            <GripVertical
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground"
              aria-hidden
            />
          )}
          <span className="truncate">
            {user?.first_name ?? "—"} {lastInitial}
          </span>
        </h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                  dispatch.gift
                    ? "bg-amber-100 text-amber-900"
                    : "bg-sky-100 text-sky-900"
                }`}
                aria-label={dispatch.gift ? "Gift" : "Standard"}
              />
            }
          >
            {dispatch.gift ? (
              <Gift className="h-3 w-3" />
            ) : (
              <Coins className="h-3 w-3" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {dispatch.gift
              ? "Gift — ce lead ne sera pas facturé"
              : "Standard — lead facturable dans le cycle en cours"}
          </TooltipContent>
        </Tooltip>

        {!readOnly && dispatch.disqualified && dispatch.disqualification_reason && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-900" />
              }
            >
              Disqualifié
            </TooltipTrigger>
            <TooltipContent>
              {REASON_LABELS[dispatch.disqualification_reason] ??
                dispatch.disqualification_reason}
            </TooltipContent>
          </Tooltip>
        )}
        </div>
      </header>

      {/* Lead info — grouped block */}
      <div className="mb-3 space-y-1 rounded bg-muted/40 p-2">
        {(() => {
          const { short, full } = formatRelativeDate(dispatch.dispatched_at);
          const days = daysAtStage(dispatch.stage_entered_at);
          return (
            <div className="flex items-center gap-1.5 text-xs">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div
                      className={`flex items-center gap-1.5 ${
                        isRotten ? "text-amber-700" : "text-muted-foreground"
                      }`}
                    />
                  }
                >
                  <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{short}</span>
                </TooltipTrigger>
                <TooltipContent>Reçu le {full}</TooltipContent>
              </Tooltip>
              {isRotten && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="ml-auto inline-flex items-center gap-1 text-amber-700" />
                    }
                  >
                    <Hourglass className="h-3.5 w-3.5" aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent>
                    Stagne depuis {days} {days === 1 ? "jour" : "jours"} à cette étape
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          );
        })()}
        {user?.email && (
            <div className="flex items-center gap-1.5 text-xs">
              <Mail
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <a
                href={`mailto:${user.email}`}
                className="truncate hover:underline"
              >
                {user.email}
              </a>
            </div>
          )}
          {user?.phone && (
            <div className="flex items-center gap-1.5 text-xs">
              <Phone
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <a href={`tel:${user.phone}`} className="hover:underline">
                {user.phone}
              </a>
            </div>
          )}
        {(zip || locality) && (
          <div className="flex items-center gap-1.5 text-xs">
            <MapPin
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="truncate">
              {[zip, locality].filter(Boolean).join(" ")}
              {dispatch.canton && (
                <span className="ml-1 text-muted-foreground">
                  · {dispatch.canton}
                </span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Actions: stage dropdown (mobile/tablet only) + icon button group */}
      {!readOnly && (
        <div className="flex items-center justify-between gap-2">
          <select
            disabled={pending || dispatch.disqualified}
            value={dispatch.stage}
            onChange={(e) => onMove(e.target.value as DispatchStage)}
            className="flex-1 rounded border bg-background px-2 py-1 text-xs lg:hidden"
            aria-label="Changer de stage"
          >
            {DISPATCH_STAGES.map((s) => {
              const isBackward =
                STAGE_RANK[s] < STAGE_RANK[dispatch.stage as DispatchStage];
              return (
                <option key={s} value={s} disabled={isBackward}>
                  {STAGE_LABELS[s]}
                </option>
              );
            })}
          </select>

          <div className="ml-auto flex items-center gap-1">
            {quoteHref && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <a
                      href={quoteHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Voir la demande de devis"
                    />
                  }
                >
                  <FileSearch className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>Voir la demande de devis</TooltipContent>
              </Tooltip>
            )}

            {dispatch.billable_locked_at && !dispatch.disqualified ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className="inline-flex rounded p-1.5 text-emerald-700"
                      aria-label="Verrouillé pour facturation"
                    />
                  }
                >
                  <Lock className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  Verrouillé pour facturation — disqualification impossible
                </TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      disabled={disqualifyDisabled}
                      onClick={() => setOpen(true)}
                      aria-label="Disqualifier"
                      className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    />
                  }
                >
                  <Ban className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  {dispatch.disqualified ? "Déjà disqualifié" : "Disqualifier"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      <DisqualifyModal
        open={open}
        onClose={() => setOpen(false)}
        allowedReasons={stageReasons}
        onConfirm={(reason, note) => {
          setOpen(false);
          onDisqualify(reason, note);
        }}
      />
    </article>
  );
}
