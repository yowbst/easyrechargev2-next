"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HelpCircle,
  X,
  Ban,
  Mail,
  Phone,
  MapPin,
  Home,
  Building2,
  Key,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { DISQUALIFICATION_REASONS } from "@/lib/dispatch/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import {
  makePartnerT,
  type PartnerDict,
  type PartnerT,
} from "@/lib/partner-i18n";

function relativeShortLabel(iso: string, t: PartnerT): string {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 86_400_000,
  );
  if (days <= 0) return t("card.date.today");
  if (days === 1) return t("card.date.yesterday");
  return t("card.date.days_ago", { n: days });
}

// Icon-only maps — labels come from the dictionary via t().
const HOUSING_ICONS: Record<string, LucideIcon> = {
  owner: Home,
  "co-owner": Building2,
  tenant: Key,
};

// Reason → category. Labels (group + reason + description) all come from the
// dictionary via t(). The arrays only define grouping + order.
const REASON_GROUPS: Array<{ labelKey: string; reasons: string[] }> = [
  { labelKey: "already_managed", reasons: ["already_known"] },
  {
    labelKey: "contact",
    reasons: ["wrong_contact_info", "unreachable", "not_interested", "ghosted"],
  },
  { labelKey: "geo", reasons: ["out_of_area"] },
  {
    labelKey: "project",
    reasons: [
      "project_cancelled", "technically_infeasible", "competitor",
      "long_timeframe", "no_authorization",
    ],
  },
  { labelKey: "other", reasons: ["other"] },
];

export function DisqualifyModal({
  open,
  onClose,
  onConfirm,
  allowedReasons,
  dispatch,
  dictionary,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, note?: string) => void;
  allowedReasons?: string[] | null;
  dispatch: PartnerDispatchCard;
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const allowedSet = useMemo(() => {
    if (!Array.isArray(allowedReasons) || allowedReasons.length === 0) {
      return new Set<string>(DISQUALIFICATION_REASONS);
    }
    return new Set(
      allowedReasons.filter((r) =>
        (DISQUALIFICATION_REASONS as readonly string[]).includes(r),
      ),
    );
  }, [allowedReasons]);

  const firstAllowedReason = useMemo(() => {
    for (const g of REASON_GROUPS) {
      for (const r of g.reasons) {
        if (allowedSet.has(r)) return r;
      }
    }
    return "";
  }, [allowedSet]);

  const [reason, setReason] = useState<string>(firstAllowedReason);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (open) {
      setReason(firstAllowedReason);
      setNote("");
    }
  }, [open, firstAllowedReason]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  // -------- Lead-context derivation --------
  const user = dispatch.submission?.user ?? null;
  const submissionData = (dispatch.submission?.data ?? null) as
    | Record<string, unknown>
    | null;
  const firstName = user?.first_name ?? "—";
  const lastInitial = user?.last_name ? `${user.last_name[0]}.` : "";
  const fullName = user?.last_name
    ? `${user?.first_name ?? ""} ${user.last_name}`.trim()
    : (user?.first_name ?? "—");
  const zip =
    typeof submissionData?.postalCode === "string"
      ? submissionData.postalCode
      : null;
  const locality =
    typeof submissionData?.locality === "string"
      ? submissionData.locality
      : null;
  const streetName =
    typeof submissionData?.streetName === "string"
      ? submissionData.streetName
      : null;
  const streetNb =
    typeof submissionData?.streetNb === "string"
      ? submissionData.streetNb
      : null;
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
  const housingKey =
    typeof submissionData?.housingStatus === "string"
      ? submissionData.housingStatus.toLowerCase()
      : null;
  const HousingIcon =
    housingKey && housingKey in HOUSING_ICONS ? HOUSING_ICONS[housingKey] : null;
  const housingLabel = housingKey ? t(`card.housing.${housingKey}`) : null;
  const deadlineKey =
    typeof submissionData?.deadline === "string"
      ? submissionData.deadline
      : null;
  const deadlineLabel = deadlineKey ? t(`card.deadline.${deadlineKey}`) : null;

  // Relative dispatch date for the lead-context header.
  const relativeShort = relativeShortLabel(dispatch.dispatched_at, t);

  const isOtherReason = reason === "other";
  const trimmedNote = note.trim();
  const noteRequired = isOtherReason;
  const canSubmit =
    !!reason && allowedSet.has(reason) && (!noteRequired || trimmedNote.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    onConfirm(reason, trimmedNote.length > 0 ? trimmedNote : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--sidebar)_60%,transparent)] p-4 sm:p-8">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-6 border-b px-6 py-5 sm:px-7">
          <div>
            <h2 className="font-heading text-2xl font-semibold leading-tight tracking-tight">
              {t("modal.title")}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("modal.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("modal.cancel")}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-7">
          <div className="grid grid-cols-1 gap-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {/* Lead context (left) */}
          <aside className="h-fit rounded-lg bg-muted p-5 text-sm">
            <div className="mb-4">
              <p className="text-[17px] font-semibold leading-tight">
                {firstName} {lastInitial}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`stages.${dispatch.stage}`)}
                {" · "}
                {relativeShort}
                {dispatch.canton && ` · ${dispatch.canton}`}
              </p>
            </div>

            <dl className="space-y-2 text-[15px]">
              {user?.email && (
                <div className="flex items-center gap-2.5">
                  <Mail
                    className="size-[15px] shrink-0 text-muted-foreground"
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
                <div className="flex items-center gap-2.5">
                  <Phone
                    className="size-[15px] shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <a href={`tel:${user.phone}`} className="hover:underline">
                    {user.phone}
                  </a>
                </div>
              )}
              {(zip || locality) && (
                <div className="flex items-center gap-2.5">
                  <MapPin
                    className="size-[15px] shrink-0 text-muted-foreground"
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
                    </a>
                  ) : (
                    <span className="truncate">
                      {[zip, locality].filter(Boolean).join(" ")}
                    </span>
                  )}
                </div>
              )}
              {HousingIcon && (
                <div className="flex items-center gap-2.5">
                  <HousingIcon
                    className="size-[15px] shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{housingLabel}</span>
                </div>
              )}
              {deadlineLabel && (
                <div className="flex items-center gap-2.5">
                  <CalendarClock
                    className="size-[15px] shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{deadlineLabel}</span>
                </div>
              )}
            </dl>

            <p className="mt-[18px] border-t pt-3.5 text-[13px] leading-relaxed text-muted-foreground">
              {t("modal.billing_notice")}
            </p>
          </aside>

          {/* Reasons (right) */}
          <div role="radiogroup" className="flex flex-col">
            {REASON_GROUPS.map((g) => (
              <div key={g.labelKey} className="border-t py-4 first:border-t-0 first:pt-0">
                <p className="mb-2.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {t(`reason_groups.${g.labelKey}`)}
                </p>
                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                  {g.reasons.map((r) => {
                    const allowed = allowedSet.has(r);
                    return (
                      <label
                        key={r}
                        className={`flex min-h-10 items-center gap-2.5 rounded-md px-2 text-[15px] transition-colors ${
                          g.reasons.length === 1 ? "sm:col-span-2" : ""
                        } ${
                          allowed
                            ? "cursor-pointer hover:bg-muted/60"
                            : "cursor-not-allowed opacity-45"
                        } ${
                          reason === r
                            ? "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={r}
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          disabled={!allowed}
                          className="size-5 shrink-0 accent-[var(--primary)]"
                        />
                        <span className="flex flex-1 items-center gap-2">
                          <span className="flex-1">{t(`reasons.${r}.label`)}</span>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="inline-flex shrink-0 text-muted-foreground/70" />
                              }
                            >
                              <HelpCircle className="size-[15px]" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {t(`reasons.${r}.description`)}
                              {!allowed && (
                                <span className="mt-1 block italic opacity-80">
                                  {t("modal.reason_unavailable")}
                                </span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        <div className="shrink-0 space-y-4 border-t bg-background px-6 py-5 sm:px-7">
        <label className="block">
          <span className="text-sm text-muted-foreground">
            {noteRequired ? (
              <span className="text-destructive">
                {t("modal.note_required")} *
              </span>
            ) : (
              t("modal.note_optional")
            )}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            required={noteRequired}
            placeholder={
              noteRequired
                ? t("modal.note_placeholder_required")
                : t("modal.note_placeholder", { name: fullName })
            }
            className={`mt-2 w-full resize-y rounded-lg border bg-card px-3.5 py-3 text-[15px] leading-relaxed ${
              noteRequired && trimmedNote.length === 0
                ? "border-destructive/60"
                : ""
            }`}
          />
        </label>

        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-md border px-4.5 text-[15px] font-semibold transition-colors hover:bg-muted"
          >
            {t("modal.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-destructive px-4.5 text-[15px] font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Ban className="size-4" aria-hidden />
            {t("modal.confirm")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
