"use client";

import { useState } from "react";
import { DISQUALIFICATION_REASONS } from "@/lib/dispatch/types";

const REASON_LABELS: Record<string, string> = {
  partner_already_has: "Lead déjà reçu directement",
  dedup: "Lead déjà transmis récemment",
  unreachable: "Lead injoignable",
  not_engaging: "Lead ne souhaite pas s'engager",
  competitor: "Lead a choisi un concurrent",
  long_timeframe: "Projet au-delà de 12 mois",
  no_authorization: "Lead n'a pas l'autorisation",
};

export function DisqualifyModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string>(DISQUALIFICATION_REASONS[0]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">Disqualifier ce lead</h2>
        <fieldset className="space-y-2">
          {DISQUALIFICATION_REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="mt-1"
              />
              <span>{REASON_LABELS[r] ?? r}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border px-3 py-1.5 text-sm"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
