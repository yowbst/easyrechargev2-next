"use client";

import { useState, type DragEvent } from "react";
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

export function LeadCard({
  dispatch,
  pending,
  onMove,
  onDisqualify,
  onDragStart,
  readOnly = false,
}: {
  dispatch: PartnerDispatchCard;
  pending: boolean;
  onMove: (stage: DispatchStage) => void;
  onDisqualify: (reason: string) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const user = dispatch.submission?.user ?? null;
  const firstName = user?.first_name ?? "—";
  const lastInitial = user?.last_name ? `${user.last_name[0]}.` : "";

  const billingBadge = dispatch.gift ? "Gift" : "Standard";
  const billingTone = dispatch.gift
    ? "bg-amber-100 text-amber-900"
    : "bg-sky-100 text-sky-900";

  // Disqualified cards aren't draggable — the stage API would 409. Mobile/touch
  // devices ignore HTML5 DnD natively, so they fall back to the dropdown.
  const draggable = !readOnly && !pending && !dispatch.disqualified;

  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={`rounded-md border bg-background p-3 text-sm shadow-sm transition-opacity ${
        dispatch.disqualified ? "opacity-60" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-medium">
          {firstName} {lastInitial}
        </h3>
        <span className="text-[10px] uppercase text-muted-foreground">
          {dispatch.canton}
        </span>
      </header>

      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        <span className={`rounded px-1.5 py-0.5 ${billingTone}`}>{billingBadge}</span>
        {dispatch.lead_category && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            {dispatch.lead_category.replace(/_/g, " ")}
          </span>
        )}
        {dispatch.billable_locked_at && !dispatch.disqualified && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">
            Verrouillé
          </span>
        )}
        {dispatch.disqualified && (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-900">
            Disqualifié: {dispatch.disqualification_reason}
          </span>
        )}
      </div>

      {user && (
        <div className="mb-2 space-y-0.5 text-xs text-muted-foreground">
          {user.email && <div>📧 {user.email}</div>}
          {user.phone && <div>📞 {user.phone}</div>}
        </div>
      )}

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2">
          <select
            disabled={pending || dispatch.disqualified}
            value={dispatch.stage}
            onChange={(e) => onMove(e.target.value as DispatchStage)}
            className="flex-1 rounded border bg-background px-2 py-1 text-xs"
          >
            {DISPATCH_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || dispatch.disqualified || !!dispatch.billable_locked_at}
            onClick={() => setOpen(true)}
            className="rounded border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            Disqualifier
          </button>
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
