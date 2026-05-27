"use client";

import { useEffect, useMemo, useState } from "react";
import {
  HelpCircle,
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
    reasons: ["project_cancelled", "competitor", "long_timeframe", "no_authorization"],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg bg-background shadow-lg">
        <div className="shrink-0 border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{t("modal.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("modal.subtitle")}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Lead context (left) */}
          <aside className="rounded-md border bg-muted/30 p-4 text-sm">
            <div className="mb-3">
              <p className="font-semibold">
                {firstName} {lastInitial}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`stages.${dispatch.stage}`)}
                {" · "}
                {relativeShort}
                {dispatch.canton && ` · ${dispatch.canton}`}
              </p>
            </div>

            <dl className="space-y-1.5 text-xs">
              {user?.email && (
                <div className="flex items-center gap-1.5">
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
                <div className="flex items-center gap-1.5">
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
                <div className="flex items-center gap-1.5">
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
                    </a>
                  ) : (
                    <span className="truncate">
                      {[zip, locality].filter(Boolean).join(" ")}
                    </span>
                  )}
                </div>
              )}
              {HousingIcon && (
                <div className="flex items-center gap-1.5">
                  <HousingIcon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{housingLabel}</span>
                </div>
              )}
              {deadlineLabel && (
                <div className="flex items-center gap-1.5">
                  <CalendarClock
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{deadlineLabel}</span>
                </div>
              )}
            </dl>

            <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
              {t("modal.billing_notice")}
            </p>
          </aside>

          {/* Reasons (right) */}
          <div role="radiogroup" className="divide-y">
            {REASON_GROUPS.map((g) => (
              <div key={g.labelKey} className="py-5 first:pt-0 last:pb-0">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`reason_groups.${g.labelKey}`)}
                </p>
                <div className="space-y-2">
                  {g.reasons.map((r) => {
                    const allowed = allowedSet.has(r);
                    return (
                      <label
                        key={r}
                        className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${
                          allowed
                            ? "cursor-pointer hover:bg-muted/50"
                            : "cursor-not-allowed opacity-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="reason"
                          value={r}
                          checked={reason === r}
                          onChange={() => setReason(r)}
                          disabled={!allowed}
                          className="shrink-0"
                        />
                        <span className="flex-1">
                          {t(`reasons.${r}.label`)}
                        </span>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="inline-flex shrink-0 text-muted-foreground/60" />
                            }
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
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
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>

        <div className="shrink-0 space-y-3 border-t px-6 py-4">
        <label className="block">
          <span className="text-xs text-muted-foreground">
            {noteRequired ? (
              <span className="text-rose-600 dark:text-rose-400">
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
            className={`mt-1 w-full rounded border bg-background px-2 py-1 text-sm ${
              noteRequired && trimmedNote.length === 0
                ? "border-rose-300 dark:border-rose-700"
                : ""
            }`}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-3 py-1.5 text-sm"
          >
            {t("modal.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {t("modal.confirm")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
