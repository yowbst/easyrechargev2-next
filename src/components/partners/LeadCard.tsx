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
  type ScoreBands,
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
  hot: "bg-partner-hot-bg text-partner-hot",
  warm: "bg-partner-warm-bg text-partner-warm",
  cold: "bg-partner-cold-bg text-partner-cold",
};

// The badge carries the band as stars rather than as bare colour: colour alone
// is not an accessible signal, and a partner scanning a column reads "★★★"
// faster than they decode a green chip.
const SCORE_BAND_GLYPH: Record<ScoreBand, string> = {
  hot: "★★★",
  warm: "★★",
  cold: "★",
};

/** Square icon button used across the card's footer and header. */
const ICON_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md " +
  "text-muted-foreground transition-colors hover:bg-background " +
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

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
  scoreBands,
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
  scoreBands?: ScoreBands;
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
      ? scoreLead(submissionData, scoringWeights, scoreBands, dispatch.product)
      : null;

  // Left accent bar marks terminal outcomes only. Rotting is a soft nudge —
  // signalled by the small hourglass icon in the header, nothing more.
  const accentBar =
    dispatch.stage === "won"
      ? "bg-partner-won"
      : dispatch.stage === "lost"
        ? "bg-partner-lost"
        : null;

  const locked =
    !readOnly && !!dispatch.billable_locked_at && !dispatch.disqualified;
  // The footer only earns its border when it has something to hold: the quote
  // link, the close actions, or the disqualify button (absent once billing is
  // locked — the lock icon in the header says why).
  const hasFooter = !readOnly && (!!quoteHref || canClose || !locked);

  const { short, full } = formatRelativeDate(dispatch.dispatched_at, t);
  const days = daysAtStage(dispatch.stage_entered_at);

  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-card p-3 text-sm transition-opacity ${
        isRotten ? "border-partner-rot/55" : ""
      } ${dispatch.disqualified || isClosed ? "opacity-75" : ""} ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {accentBar && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[5px] ${accentBar}`}
        />
      )}

      {/* Header: grip + score badge + name/date stack, status icons on the right */}
      <header
        className={`mb-2.5 flex items-center gap-2 ${accentBar ? "pl-2" : ""}`}
      >
        {draggable && (
          <GripVertical
            className="size-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground"
            aria-hidden
          />
        )}
        {leadScore && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className={`inline-flex h-[22px] shrink-0 items-center rounded-md px-[7px] text-xs font-semibold leading-none tracking-[0.05em] ${SCORE_BAND_CLASS[leadScore.band]}`}
                  aria-label={`${t("score.label")} — ${t(`score.band.${leadScore.band}`)}`}
                />
              }
            >
              {SCORE_BAND_GLYPH[leadScore.band]}
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
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-[15px] font-semibold leading-tight">
            {user?.first_name ?? "—"} {lastInitial}
          </h3>
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="w-fit text-[13px] text-muted-foreground" />
              }
            >
              {short}
            </TooltipTrigger>
            <TooltipContent>{t("card.received", { date: full })}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {isRotten && (
            <Tooltip>
              <TooltipTrigger
                render={<span className="inline-flex text-partner-rot" />}
              >
                <Hourglass className="size-[15px]" aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{t("card.rotting", { n: days })}</TooltipContent>
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
                <Gift className="size-[15px]" />
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
                    className={`${ICON_BUTTON} size-7 hover:text-foreground`}
                  />
                }
              >
                <RotateCcw className="size-[15px]" />
              </TooltipTrigger>
              <TooltipContent>{t("card.actions.reopen")}</TooltipContent>
            </Tooltip>
          )}
          {/* A locked lead is already billable; the lock replaces the
              disqualify action rather than sitting next to it. */}
          {locked && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="inline-flex text-muted-foreground"
                    aria-label={t("card.actions.locked")}
                  />
                }
              >
                <Lock className="size-[15px]" />
              </TooltipTrigger>
              <TooltipContent>{t("card.actions.locked_tip")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      {/* Details box — contact (active), reason (disqualified), outcome (closed) */}
      <div
        className={`space-y-1.5 rounded-md bg-partner-inset px-3 py-2.5 ${accentBar ? "ml-2" : ""}`}
      >
        {dispatch.disqualified ? (
          <div className="flex items-start gap-2">
            <Ban
              className="mt-0.5 size-3.5 shrink-0 text-partner-lost"
              aria-hidden
            />
            <div className="min-w-0">
              {dispatch.disqualification_reason && (
                <p className="font-semibold">
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
            const tone = won ? "text-partner-won" : "text-partner-lost";
            const closedAt = formatRelativeDate(dispatch.stage_entered_at, t);
            return (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Icon className={`size-3.5 shrink-0 ${tone}`} aria-hidden />
                  <span className={`font-semibold ${tone}`}>
                    {t(`stages.${dispatch.stage}`)}
                  </span>
                  <span className="text-muted-foreground">
                    · {closedAt.short}
                  </span>
                </div>
                {!won && dispatch.lost_reason && (
                  <div className="pl-5">
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
              <div className="flex items-center gap-2">
                <Mail
                  className="size-3.5 shrink-0 text-muted-foreground"
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
              <div className="flex items-center gap-2">
                <Phone
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <a href={`tel:${user.phone}`} className="hover:underline">
                  {user.phone}
                </a>
              </div>
            )}
            {(zip || locality) && (
              <div className="flex items-center gap-2">
                <MapPin
                  className="size-3.5 shrink-0 text-muted-foreground"
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
            {/* Housing, authorisation and deadline share one wrapping row —
                three short facts that read as a single line of context. */}
            {(HousingIcon || deadlineLabel) && (
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                {HousingIcon && (
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="flex items-center gap-2" />}
                    >
                      <HousingIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
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
                )}
                {ApprovalIcon && (
                  <span className="flex items-center gap-1.5">
                    <ApprovalIcon
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>{approvalLabel}</span>
                  </span>
                )}
                {deadlineLabel && (
                  <span className="flex items-center gap-1.5">
                    <CalendarClock
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>{deadlineLabel}</span>
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Action row. Separated from the content by a rule so the card reads as
          "who this is" then "what you can do about it", rather than crowding
          every control into the header next to the name. */}
      {hasFooter && (
        <footer
          className={`mt-2 flex items-center gap-1 border-t pt-2 ${accentBar ? "ml-2" : ""}`}
        >
          {/* Icon-only, like the actions opposite it: the French label for this
              is a four-word sentence ("Voir la demande de devis") that wraps to
              three lines in a kanban column. The tooltip and aria-label carry
              the name. */}
          {quoteHref && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    href={quoteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("card.actions.view")}
                    className={`${ICON_BUTTON} hover:text-foreground`}
                  />
                }
              >
                <FileSearch className="size-4" />
              </TooltipTrigger>
              <TooltipContent>{t("card.actions.view")}</TooltipContent>
            </Tooltip>
          )}
          <span className="ml-auto flex items-center gap-0.5">
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
                        className={`${ICON_BUTTON} text-primary hover:text-primary`}
                      />
                    }
                  >
                    <CircleCheck className="size-4" />
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
                        className={`${ICON_BUTTON} text-partner-lost hover:text-partner-lost`}
                      />
                    }
                  >
                    <CircleX className="size-4" />
                  </TooltipTrigger>
                  <TooltipContent>{t("card.actions.lost")}</TooltipContent>
                </Tooltip>
              </>
            )}
            {!locked && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      disabled={disqualifyDisabled}
                      onClick={() => setOpen(true)}
                      aria-label={t("card.actions.disqualify")}
                      className={`${ICON_BUTTON} hover:text-partner-lost`}
                    />
                  }
                >
                  <Ban className="size-4" />
                </TooltipTrigger>
                <TooltipContent>
                  {t(
                    dispatch.disqualified
                      ? "card.actions.already_disqualified"
                      : "card.actions.disqualify",
                  )}
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        </footer>
      )}

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
          className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-[13px] lg:hidden"
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
