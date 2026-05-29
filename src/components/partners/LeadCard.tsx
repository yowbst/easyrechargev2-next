"use client";

import { useState, type DragEvent } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Gift,
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
  RotateCcw,
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
import {
  scoreLead,
  type ScoreBand,
  type ScoringFactorKey,
} from "@/lib/dispatch/scoring";
import { makePartnerT, type PartnerDict, type PartnerT } from "@/lib/partner-i18n";
import { DisqualifyModal } from "./DisqualifyModal";
import { LostModal } from "./LostModal";

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

function formatRelativeDate(
  iso: string,
  t: PartnerT,
): { short: string; full: string } {
  const d = new Date(iso);
  const diffDays = Math.floor(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  let short: string;
  if (diffDays <= 0) short = t("card.date.today");
  else if (diffDays === 1) short = t("card.date.yesterday");
  else short = t("card.date.days_ago", { n: diffDays });
  const full = d.toLocaleString("fr-CH", {
    dateStyle: "long",
    timeStyle: "short",
  });
  return { short, full };
}

// Icon-only maps — labels come from the dictionary via t().
const HOUSING_ICONS: Record<string, LucideIcon> = {
  owner: Home,
  "co-owner": Building2,
  tenant: Key,
};

// Icon-only — value semantics now come from the score, not per-field colour.
const APPROVAL_ICONS: Record<string, LucideIcon> = {
  yes: CircleCheck,
  "in-progress": CircleDashed,
  no: CircleX,
};

const SCORE_BAND_CLASS: Record<ScoreBand, string> = {
  hot: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warm: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  cold: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

export function LeadCard({
  dispatch,
  lang,
  pending,
  onMove,
  onDisqualify,
  onLose,
  onReopen,
  onDragStart,
  onDragEnd,
  rottingDaysByStage,
  reasonsByStage,
  scoringWeights,
  dictionary,
  readOnly = false,
}: {
  dispatch: PartnerDispatchCard;
  lang: string;
  pending: boolean;
  onMove: (stage: DispatchStage) => void;
  onDisqualify: (reason: string, note?: string) => void;
  onLose?: (reason: string, note?: string) => void;
  onReopen?: () => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  rottingDaysByStage: Record<string, number>;
  reasonsByStage: Record<string, string[]>;
  scoringWeights?: Record<ScoringFactorKey, number>;
  dictionary: PartnerDict;
  readOnly?: boolean;
}) {
  const t = makePartnerT(dictionary);
  const [open, setOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
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
  const HousingIcon =
    housingStatusKey && housingStatusKey in HOUSING_ICONS
      ? HOUSING_ICONS[housingStatusKey]
      : null;
  const housingLabel = housingStatusKey
    ? t(`card.housing.${housingStatusKey}`)
    : null;
  const deadlineKey =
    typeof submissionData?.deadline === "string"
      ? submissionData.deadline
      : null;
  const deadlineLabel = deadlineKey ? t(`card.deadline.${deadlineKey}`) : null;
  const approvalKey =
    typeof submissionData?.approval === "string"
      ? submissionData.approval.toLowerCase()
      : null;
  const ApprovalIcon =
    approvalKey && approvalKey in APPROVAL_ICONS
      ? APPROVAL_ICONS[approvalKey]
      : null;
  const approvalLabel = approvalKey ? t(`card.approval.${approvalKey}`) : null;

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

  const isClosed = dispatch.stage === "won" || dispatch.stage === "lost";
  // Won/Lost only make sense once the partner has engaged the lead — earlier
  // drop-offs are disqualifications, not outcomes.
  const canClose =
    !readOnly &&
    !dispatch.disqualified &&
    (dispatch.stage === "appointment" || dispatch.stage === "quote_sent");

  // Quality score — shown only on the active pipeline (where prioritisation
  // matters); disqualified/closed cards omit it to cut noise.
  const leadScore =
    !readOnly && !dispatch.disqualified && !isClosed && scoringWeights
      ? scoreLead(submissionData, scoringWeights)
      : null;

  // Left accent bar marks terminal outcomes only. Rotting is a soft nudge —
  // signalled by the small hourglass icon in the header, nothing more.
  const accentBar =
    dispatch.stage === "won"
      ? "bg-emerald-500"
      : dispatch.stage === "lost"
        ? "bg-rose-500"
        : null;

  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`group relative overflow-hidden rounded-md border p-2.5 text-sm shadow-sm transition-opacity ${
        isRotten ? "bg-amber-50 dark:bg-amber-950/30" : "bg-background"
      } ${dispatch.disqualified || isClosed ? "opacity-60" : ""} ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {accentBar && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 ${accentBar}`}
        />
      )}
      {/* Header: name + relative date inline (left) + status icons (right) */}
      {(() => {
        const { short, full } = formatRelativeDate(dispatch.dispatched_at, t);
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
              {leadScore && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        className={`shrink-0 self-center rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${SCORE_BAND_CLASS[leadScore.band]}`}
                        aria-label={t("score.label")}
                      />
                    }
                  >
                    {leadScore.score}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="mb-1 font-medium">
                      {t(`score.band.${leadScore.band}`)} · {leadScore.score}/100
                    </p>
                    <ul className="space-y-0.5">
                      {leadScore.breakdown.map((b) => (
                        <li key={b.key} className="flex justify-between gap-3">
                          <span>{t(`score.factors.${b.key}`)}</span>
                          <span className="tabular-nums opacity-80">
                            {Math.round(b.subScore * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              )}
              <span className="truncate">
                {user?.first_name ?? "—"} {lastInitial}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="shrink-0 text-xs font-normal text-muted-foreground" />
                  }
                >
                  · {short}
                </TooltipTrigger>
                <TooltipContent>{t("card.received", { date: full })}</TooltipContent>
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
                    {t("card.rotting", { n: days })}
                  </TooltipContent>
                </Tooltip>
              )}
        {dispatch.gift && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="inline-flex text-muted-foreground"
                  aria-label={t("card.billing.gift")}
                />
              }
            >
              <Gift className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t("card.billing.gift_tip")}</TooltipContent>
          </Tooltip>
        )}

        {/* Reopen a closed (won/lost) lead back into the active pipeline. */}
        {readOnly && isClosed && onReopen && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  disabled={pending}
                  onClick={onReopen}
                  aria-label={t("card.actions.reopen")}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                />
              }
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t("card.actions.reopen")}</TooltipContent>
          </Tooltip>
        )}

        {/* Separator — only when a status icon precedes the action buttons. */}
        {!readOnly && (dispatch.gift || isRotten) && (
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        )}

        {/* View the full quote request. */}
        {!readOnly && quoteHref && (
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={quoteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("card.actions.view")}
                />
              }
            >
              <FileSearch className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t("card.actions.view")}</TooltipContent>
          </Tooltip>
        )}

        {/* Close actions — mark the lead won or lost (engaged stages only). */}
        {canClose && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onMove("won")}
                    aria-label={t("card.actions.won")}
                    className="rounded p-1 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950 dark:hover:text-emerald-400 disabled:opacity-40"
                  />
                }
              >
                <CircleCheck className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>{t("card.actions.won")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setLostOpen(true)}
                    aria-label={t("card.actions.lost")}
                    className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400 disabled:opacity-40"
                  />
                }
              >
                <CircleX className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>{t("card.actions.lost")}</TooltipContent>
            </Tooltip>
          </>
        )}

        {!readOnly && dispatch.billable_locked_at && !dispatch.disqualified && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="inline-flex rounded p-1 text-muted-foreground"
                  aria-label={t("card.actions.locked")}
                />
              }
            >
              <Lock className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>{t("card.actions.locked_tip")}</TooltipContent>
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
                  aria-label={t("card.actions.disqualify")}
                  className="rounded p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                />
              }
            >
              <Ban className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              {t(dispatch.disqualified ? "card.actions.already_disqualified" : "card.actions.disqualify")}
            </TooltipContent>
          </Tooltip>
        )}
        </div>
          </header>
        );
      })()}

      {/* Details box — contact (active), reason (disqualified), outcome (closed) */}
      <div className="mb-2 space-y-1 rounded bg-muted/40 p-1.5">
        {dispatch.disqualified ? (
          <div className="flex items-start gap-1.5 text-xs">
            <Ban
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400"
              aria-hidden
            />
            <div className="min-w-0">
              {dispatch.disqualification_reason && (
                <p className="font-medium">
                  {t(`reasons.${dispatch.disqualification_reason}.label`)}
                </p>
              )}
              {dispatch.disqualification_note && (
                <p className="text-muted-foreground">
                  {dispatch.disqualification_note}
                </p>
              )}
            </div>
          </div>
        ) : isClosed ? (
          (() => {
            const won = dispatch.stage === "won";
            const Icon = won ? CircleCheck : CircleX;
            const tone = won
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400";
            const { short } = formatRelativeDate(dispatch.stage_entered_at, t);
            return (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden />
                  <span className={`font-medium ${tone}`}>
                    {t(`stages.${dispatch.stage}`)}
                  </span>
                  <span className="text-muted-foreground">· {short}</span>
                </div>
                {!won && dispatch.lost_reason && (
                  <div className="pl-5 text-xs">
                    <p className="text-muted-foreground">
                      {t(`lost_reasons.${dispatch.lost_reason}.label`)}
                    </p>
                    {dispatch.lost_note && (
                      <p className="text-muted-foreground/80">
                        {dispatch.lost_note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()
        ) : (
          <>
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
          {HousingIcon && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Tooltip>
                <TooltipTrigger
                  render={<span className="flex items-center gap-1.5" />}
                >
                  <HousingIcon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{housingLabel}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {housingStatusKey === "owner"
                    ? t("card.housing.owner_tip")
                    : housingLabel}
                </TooltipContent>
              </Tooltip>
              {ApprovalIcon && (
                <span className="flex items-center gap-1">
                  <ApprovalIcon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{approvalLabel}</span>
                </span>
              )}
            </div>
          )}
        {deadlineLabel && (
          <div className="flex items-center gap-1.5 text-xs">
            <CalendarClock
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span>{deadlineLabel}</span>
          </div>
        )}
          </>
        )}
      </div>

      {/* Mobile-only stage dropdown (desktop uses drag-and-drop). */}
      {!readOnly && (
        <select
          disabled={pending || dispatch.disqualified}
          value={dispatch.stage}
          onChange={(e) => {
            const s = e.target.value as DispatchStage;
            if (s === "lost") setLostOpen(true);
            else onMove(s);
          }}
          className="mt-1 w-full rounded border bg-background px-2 py-1 text-xs lg:hidden"
          aria-label={t("card.actions.change_stage")}
        >
          {DISPATCH_STAGES.map((s) => {
            const isBackward =
              STAGE_RANK[s] < STAGE_RANK[dispatch.stage as DispatchStage];
            // Won/Lost only from engaged stages (appointment onwards).
            const isEarlyClose =
              (s === "won" || s === "lost") &&
              STAGE_RANK[dispatch.stage as DispatchStage] <
                STAGE_RANK.appointment;
            return (
              <option key={s} value={s} disabled={isBackward || isEarlyClose}>
                {t(`stages.${s}`)}
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
        dictionary={dictionary}
        onConfirm={(reason, note) => {
          setOpen(false);
          onDisqualify(reason, note);
        }}
      />

      <LostModal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        dispatch={dispatch}
        dictionary={dictionary}
        onConfirm={(reason, note) => {
          setLostOpen(false);
          onLose?.(reason, note);
        }}
      />
    </article>
  );
}
