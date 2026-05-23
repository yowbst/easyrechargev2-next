"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import {
  Mail,
  Phone,
  Gift,
  Coins,
  Lock,
  Ban,
  FileSearch,
  GripVertical,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DISPATCH_STAGES, type DispatchStage } from "@/lib/dispatch/types";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { DisqualifyModal } from "./DisqualifyModal";

const STAGE_LABELS: Record<DispatchStage, string> = {
  new: "Nouveau",
  contacted: "Contacté",
  appointment: "RDV pris",
  quote_sent: "Devis envoyé",
  won: "Gagné",
  lost: "Perdu",
};

const CATEGORY_LABELS: Record<string, string> = {
  owner_no_solar: "Propriétaire, sans installation solaire",
  owner_solar: "Propriétaire, avec installation solaire",
  co_owner_no_solar: "Copropriétaire, sans installation solaire",
  co_owner_solar: "Copropriétaire, avec installation solaire",
  tenant_no_solar: "Locataire, sans installation solaire",
  tenant_solar: "Locataire, avec installation solaire",
};

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
  partnerToken,
  pending,
  onMove,
  onDisqualify,
  onDragStart,
  readOnly = false,
}: {
  dispatch: PartnerDispatchCard;
  partnerToken: string;
  pending: boolean;
  onMove: (stage: DispatchStage) => void;
  onDisqualify: (reason: string) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const user = dispatch.submission?.user ?? null;
  const lastInitial = user?.last_name ? `${user.last_name[0]}.` : "";

  // Disqualified cards aren't draggable — the stage API would 409. Mobile/touch
  // devices ignore HTML5 DnD natively, so they fall back to the dropdown.
  const draggable = !readOnly && !pending && !dispatch.disqualified;
  const disqualifyDisabled =
    pending || dispatch.disqualified || !!dispatch.billable_locked_at;

  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={`group rounded-md border bg-background p-3 text-sm shadow-sm transition-opacity ${
        dispatch.disqualified ? "opacity-60" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {/* Header: name + drag handle hint + canton */}
      <header className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 font-medium">
          {draggable && (
            <GripVertical
              className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground"
              aria-hidden
            />
          )}
          <span>
            {user?.first_name ?? "—"} {lastInitial}
          </span>
        </h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {dispatch.canton}
        </span>
      </header>

      {/* Badges row: icon-only billing + category key + lifecycle flags */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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

        {dispatch.lead_category && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground" />
              }
            >
              {dispatch.lead_category}
            </TooltipTrigger>
            <TooltipContent>
              {CATEGORY_LABELS[dispatch.lead_category] ?? dispatch.lead_category}
            </TooltipContent>
          </Tooltip>
        )}

        {dispatch.billable_locked_at && !dispatch.disqualified && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  className="inline-flex text-emerald-700"
                  aria-label="Verrouillé pour facturation"
                />
              }
            >
              <Lock className="h-3.5 w-3.5" />
            </TooltipTrigger>
            <TooltipContent>Verrouillé pour facturation</TooltipContent>
          </Tooltip>
        )}

        {dispatch.disqualified && dispatch.disqualification_reason && (
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

      {/* Lead info — grouped block */}
      {user && (user.email || user.phone) && (
        <div className="mb-3 space-y-1 rounded bg-muted/40 p-2">
          {user.email && (
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
          {user.phone && (
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
        </div>
      )}

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
            {DISPATCH_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Link
                    href={`/partners/${partnerToken}/lead/${dispatch.id}`}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Voir la demande"
                  />
                }
              >
                <FileSearch className="h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>Voir la demande</TooltipContent>
            </Tooltip>

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
                {disqualifyDisabled
                  ? dispatch.disqualified
                    ? "Déjà disqualifié"
                    : "Facturation déjà verrouillée"
                  : "Disqualifier"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      <DisqualifyModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={(reason) => {
          setOpen(false);
          onDisqualify(reason);
        }}
      />
    </article>
  );
}
