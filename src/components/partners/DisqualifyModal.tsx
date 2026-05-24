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
} from "lucide-react";
import { DISQUALIFICATION_REASONS } from "@/lib/dispatch/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";

const REASON_LABELS: Record<string, string> = {
  partner_already_has: "Lead déjà reçu directement",
  unreachable: "Lead injoignable",
  not_engaging: "Lead ne souhaite pas s'engager",
  competitor: "Lead a choisi un concurrent",
  long_timeframe: "Projet au-delà de 12 mois",
  no_authorization: "Lead n'a pas l'autorisation",
  out_of_area: "Hors zone d'intervention",
};

const REASON_DESCRIPTIONS: Record<string, string> = {
  partner_already_has:
    "Vous aviez déjà ce lead par un autre canal (référence directe, contact existant, autre formulaire).",
  unreachable:
    "Plusieurs tentatives de contact (téléphone, email) sans réponse — le lead n'est pas joignable.",
  not_engaging:
    "Le lead refuse d'engager la conversation ou ne souhaite plus recevoir de devis / rendez-vous.",
  competitor:
    "Le lead a confirmé qu'il a choisi un autre installateur — l'opportunité est perdue.",
  long_timeframe:
    "Le projet est planifié au-delà de 12 mois — pas exploitable dans le cycle actuel.",
  no_authorization:
    "Le lead n'a pas l'autorisation nécessaire (propriétaire, syndic, bailleur) pour réaliser le projet.",
  out_of_area:
    "L'adresse du lead est en dehors de votre zone d'intervention raisonnable, malgré la couverture du canton.",
};

const REASON_GROUPS: Array<{ label: string; reasons: string[] }> = [
  { label: "Déjà géré", reasons: ["partner_already_has"] },
  { label: "Contact difficile", reasons: ["unreachable", "not_engaging"] },
  {
    label: "Projet incompatible",
    reasons: ["out_of_area", "competitor", "long_timeframe", "no_authorization"],
  },
];

const STAGE_LABELS: Record<string, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  appointment: "RDV pris",
  quote_sent: "Devis envoyé",
  won: "Gagné",
  lost: "Perdu",
};

const HOUSING_INFO: Record<
  string,
  { label: string; Icon: typeof Home }
> = {
  owner: { label: "Propriétaire", Icon: Home },
  "co-owner": { label: "Copropriétaire", Icon: Building2 },
  tenant: { label: "Locataire", Icon: Key },
};

const DEADLINE_LABELS: Record<string, string> = {
  asap: "Dès que possible",
  "2-3mo": "Dans 2 à 3 mois",
  "3-6mo": "Dans 3 à 6 mois",
  "6+mo": "Dans 6 mois ou plus",
};

function relativeShort(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `Il y a ${days} j`;
}

export function DisqualifyModal({
  open,
  onClose,
  onConfirm,
  allowedReasons,
  dispatch,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, note?: string) => void;
  allowedReasons?: string[] | null;
  dispatch: PartnerDispatchCard;
}) {
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
  const housing = housingKey && HOUSING_INFO[housingKey];
  const deadlineKey =
    typeof submissionData?.deadline === "string"
      ? submissionData.deadline
      : null;
  const deadlineLabel = deadlineKey
    ? (DEADLINE_LABELS[deadlineKey] ?? deadlineKey)
    : null;

  const submit = () => {
    if (!reason || !allowedSet.has(reason)) return;
    const trimmed = note.trim();
    onConfirm(reason, trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-background p-6 shadow-lg">
        <h2 className="mb-1 text-lg font-semibold">Disqualifier ce lead</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          Choisissez un motif. Certains motifs ne sont pas disponibles à cette
          étape.
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* Lead context (left) */}
          <aside className="rounded-md border bg-muted/30 p-4 text-sm">
            <div className="mb-3">
              <p className="font-semibold">
                {firstName} {lastInitial}
              </p>
              <p className="text-xs text-muted-foreground">
                {STAGE_LABELS[dispatch.stage] ?? dispatch.stage}
                {" · "}
                {relativeShort(dispatch.dispatched_at)}
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
              {housing && (
                <div className="flex items-center gap-1.5">
                  <housing.Icon
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span>{housing.label}</span>
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
              Le lead sera marqué disqualifié et ne sera pas facturé pour ce
              cycle.
            </p>
          </aside>

          {/* Reasons (right) */}
          <div role="radiogroup" className="divide-y">
            {REASON_GROUPS.map((g) => (
              <div key={g.label} className="py-5 first:pt-0 last:pb-0">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.label}
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
                          {REASON_LABELS[r] ?? r}
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
                            {REASON_DESCRIPTIONS[r] ?? REASON_LABELS[r]}
                            {!allowed && (
                              <span className="mt-1 block italic opacity-80">
                                (Non disponible à cette étape)
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

        <label className="mt-5 block">
          <span className="text-xs text-muted-foreground">
            Note (optionnelle)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={`Détails utiles pour le contexte (${fullName})…`}
            className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
          />
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || !allowedSet.has(reason)}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Confirmer la disqualification
          </button>
        </div>
      </div>
    </div>
  );
}
