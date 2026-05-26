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
  Hourglass,
  Home,
  Building2,
  Key,
  CalendarClock,
  CircleCheck,
  CircleDashed,
  CircleX,
  type LucideIcon,
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

const HOUSING_STATUS: Record<string, { label: string; Icon: LucideIcon }> = {
  owner: { label: "Propriétaire", Icon: Home },
  "co-owner": { label: "Copropriétaire", Icon: Building2 },
  tenant: { label: "Locataire", Icon: Key },
};

const APPROVAL: Record<string, { label: string; Icon: LucideIcon; tone: string }> = {
  yes: { label: "Autorisation OK", Icon: CircleCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  "in-progress": {
    label: "Autorisation en cours",
    Icon: CircleDashed,
    tone: "text-muted-foreground",
  },
  no: { label: "Sans autorisation", Icon: CircleX, tone: "text-rose-600 dark:text-rose-400" },
};

const DEADLINE_LABELS: Record<string, string> = {
  asap: "Dès que possible",
  "2-3mo": "Dans 2 à 3 mois",
  "3-6mo": "Dans 3 à 6 mois",
  "6+mo": "Dans 6 mois ou plus",
};

// Near-term deadlines highlight green — these are the warm/buyable leads.
const DEADLINE_HOT_KEYS = new Set(["asap", "2-3mo"]);

const REASON_LABELS: Record<string, string> = {
  already_known: "Lead déjà connu (CRM ou canal direct)",
  wrong_contact_info: "Coordonnées erronées",
  unreachable: "Lead injoignable",
  not_interested: "Pas intéressé",
  ghosted: "Ne répond plus après contact",
  out_of_area: "Hors zone d'intervention",
  project_cancelled: "Projet annulé par le lead",
  competitor: "Lead a choisi un concurrent",
  long_timeframe: "Projet au-delà de 12 mois",
  no_authorization: "Lead n'a pas l'autorisation",
  other: "Autre raison",
  // Legacy keys retained so old partner_dispatches rows still render with
  // their original wording on the card.
  partner_already_has: "Lead déjà reçu directement",
  not_engaging: "Lead ne souhaite pas s'engager",
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
  const streetName =
    typeof submissionData?.streetName === "string"
      ? submissionData.streetName
      : null;
  const streetNb =
    typeof submissionData?.streetNb === "string" ? submissionData.streetNb : null;
  const addressLine = [
    streetName && streetNb ? `${streetName} ${streetNb}` : streetName,
    [zip, locality].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const mapsHref = addressLine
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${addressLine}${dispatch.canton ? `, ${dispatch.canton}` : ""}, Suisse`,
      )}`
    : null;
  const housingStatusKey =
    typeof submissionData?.housingStatus === "string"
      ? submissionData.housingStatus.toLowerCase()
      : null;
  const housing =
    housingStatusKey && housingStatusKey in HOUSING_STATUS
      ? HOUSING_STATUS[housingStatusKey]
      : null;
  const deadlineKey =
    typeof submissionData?.deadline === "string"
      ? submissionData.deadline
      : null;
  const deadlineLabel = deadlineKey
    ? (DEADLINE_LABELS[deadlineKey] ?? deadlineKey)
    : null;
  const approvalKey =
    typeof submissionData?.approval === "string"
      ? submissionData.approval.toLowerCase()
      : null;
  const approval =
    approvalKey && approvalKey in APPROVAL ? APPROVAL[approvalKey] : null;

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
      className={`group relative overflow-hidden rounded-md border bg-background p-2.5 text-sm shadow-sm transition-opacity ${
        dispatch.disqualified ? "opacity-60" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {isRotten && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1 bg-amber-500"
        />
      )}
      {/* Header: name + relative date inline (left) + status icons (right) */}
      {(() => {
        const { short, full } = formatRelativeDate(dispatch.dispatched_at);
        const days = daysAtStage(dispatch.stage_entered_at);
        return (
          <header className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-baseline gap-1.5 font-medium">
              {draggable && (
                <GripVertical
                  className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/40 group-hover:text-muted-foreground"
                  aria-hidden
                />
              )}
              <span className="truncate">
                {user?.first_name ?? "—"} {lastInitial}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={`shrink-0 text-xs font-normal ${
                        isRotten
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  }
                >
                  · {short}
                </TooltipTrigger>
                <TooltipContent>Reçu le {full}</TooltipContent>
              </Tooltip>
            </h3>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {isRotten && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="inline-flex text-amber-600 dark:text-amber-400" />
                    }
                  >
                    <Hourglass className="h-3.5 w-3.5" aria-hidden />
                  </TooltipTrigger>
                  <TooltipContent>
                    Stagne depuis {days} {days === 1 ? "jour" : "jours"} à cette étape
                  </TooltipContent>
                </Tooltip>
              )}
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="inline-flex text-muted-foreground"
                aria-label={dispatch.gift ? "Gift" : "Standard"}
              />
            }
          >
            {dispatch.gift ? (
              <Gift className="h-3.5 w-3.5" />
            ) : (
              <Coins className="h-3.5 w-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {dispatch.gift
              ? "Gift — ce lead ne sera pas facturé"
              : "Standard — lead facturable dans le cycle en cours"}
          </TooltipContent>
        </Tooltip>

        {/* Separator between status icons and action buttons */}
        {!readOnly && (
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        )}

        {/* Action buttons (desktop + mobile) */}
        {!readOnly && quoteHref && (
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={quoteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Voir la demande de devis"
                />
              }
            >
              <FileSearch className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>Voir la demande de devis</TooltipContent>
          </Tooltip>
        )}

        {!readOnly && dispatch.billable_locked_at && !dispatch.disqualified && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="inline-flex rounded p-1 text-muted-foreground"
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
        )}

        {!readOnly && !(dispatch.billable_locked_at && !dispatch.disqualified) && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={disqualifyDisabled}
                  onClick={() => setOpen(true)}
                  aria-label="Disqualifier"
                  className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
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
          </header>
        );
      })()}

      {/* Lead info — grouped block */}
      <div className="mb-2 space-y-1 rounded bg-muted/40 p-1.5">
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
              {mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  {[zip, locality].filter(Boolean).join(" ")}
                  {dispatch.canton && <span className="ml-1">· {dispatch.canton}</span>}
                </a>
              ) : (
                <span className="truncate">
                  {[zip, locality].filter(Boolean).join(" ")}
                  {dispatch.canton && <span className="ml-1">· {dispatch.canton}</span>}
                </span>
              )}
            </div>
          )}
          {housing && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      className={`flex items-center gap-1.5 ${
                        housingStatusKey === "owner"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : ""
                      }`}
                    />
                  }
                >
                  <housing.Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      housingStatusKey === "owner" ? "" : "text-muted-foreground"
                    }`}
                    aria-hidden
                  />
                  <span>{housing.label}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {housingStatusKey === "owner"
                    ? "Propriétaire — aucune autorisation requise"
                    : housing.label}
                </TooltipContent>
              </Tooltip>
              {approval && (
                <span
                  className={`flex items-center gap-1 ${approval.tone}`}
                >
                  <approval.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{approval.label}</span>
                </span>
              )}
            </div>
          )}
        {deadlineLabel && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              deadlineKey && DEADLINE_HOT_KEYS.has(deadlineKey)
                ? "text-emerald-600 dark:text-emerald-400"
                : ""
            }`}
          >
            <CalendarClock
              className={`h-3.5 w-3.5 shrink-0 ${
                deadlineKey && DEADLINE_HOT_KEYS.has(deadlineKey)
                  ? ""
                  : "text-muted-foreground"
              }`}
              aria-hidden
            />
            <span>{deadlineLabel}</span>
          </div>
        )}
      </div>

      {/* Mobile-only stage dropdown (desktop uses drag-and-drop). */}
      {!readOnly && (
        <select
          disabled={pending || dispatch.disqualified}
          value={dispatch.stage}
          onChange={(e) => onMove(e.target.value as DispatchStage)}
          className="mt-1 w-full rounded border bg-background px-2 py-1 text-xs lg:hidden"
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
      )}

      <DisqualifyModal
        open={open}
        onClose={() => setOpen(false)}
        allowedReasons={stageReasons}
        dispatch={dispatch}
        onConfirm={(reason, note) => {
          setOpen(false);
          onDisqualify(reason, note);
        }}
      />
    </article>
  );
}
