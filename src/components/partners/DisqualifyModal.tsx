"use client";

import { useEffect, useState } from "react";
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
  allowedReasons,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, note?: string) => void;
  /** If non-null and non-empty, restricts the list to these reasons (in this order). */
  allowedReasons?: string[] | null;
}) {
  const reasons =
    Array.isArray(allowedReasons) && allowedReasons.length > 0
      ? allowedReasons.filter((r) => DISQUALIFICATION_REASONS.includes(r as never))
      : (DISQUALIFICATION_REASONS as string[]);

  const [reason, setReason] = useState<string>(reasons[0] ?? "");
  const [note, setNote] = useState<string>("");

  // Reset selection when the available list changes or the modal opens.
  useEffect(() => {
    if (open) {
      setReason(reasons[0] ?? "");
      setNote("");
    }
  }, [open, reasons]);

  if (!open) return null;

  const submit = () => {
    if (!reason) return;
    const trimmed = note.trim();
    onConfirm(reason, trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">Disqualifier ce lead</h2>
        {reasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun motif disponible pour cette étape.
          </p>
        ) : (
          <>
            <fieldset className="space-y-2">
              {reasons.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
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

            <label className="mt-4 block">
              <span className="text-xs text-muted-foreground">
                Note (optionnelle)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Détails utiles pour le contexte…"
                className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm"
              />
            </label>
          </>
        )}
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
            onClick={submit}
            disabled={!reason}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
