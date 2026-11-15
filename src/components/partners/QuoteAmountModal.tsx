"use client";

import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

const MAX_CHF = 100_000;

/** "2'450", "2 450", "2450.-" -> 2450; anything else (decimals, letters, out of range) -> null. */
export function parseQuotedAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s'’]/g, "").replace(/\.-$/, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value >= 1 && value <= MAX_CHF ? value : null;
}

/**
 * Asked when a partner moves a lead to "Devis envoyé": the amount they quoted,
 * optional. Skipping moves the lead without it; closing cancels the move.
 * Mount it only while open (keyed by lead), so each opening starts empty.
 */
export function QuoteAmountModal({
  onClose,
  onConfirm,
  dictionary,
}: {
  onClose: () => void;
  /** `undefined` when the partner skips. */
  onConfirm: (amountChf: number | undefined) => void;
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const amount = parseQuotedAmount(value);
  const showError = touched && value.trim() !== "" && amount === null;

  const submit = () => {
    setTouched(true);
    if (amount !== null) onConfirm(amount);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-amount-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--sidebar)_60%,transparent)] p-4 sm:p-8"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-6 border-b px-6 py-5">
          <div>
            <h2 id="quote-amount-title" className="font-heading text-xl font-semibold leading-tight tracking-tight">
              {t("quote_amount.title")}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{t("quote_amount.subtitle")}</p>
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

        <form
          className="px-6 py-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="quote-amount-input">
            {t("quote_amount.label")}
          </label>
          <input
            id="quote-amount-input"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder={t("quote_amount.placeholder")}
            aria-invalid={showError}
            aria-describedby={showError ? "quote-amount-error" : undefined}
            className={`mt-2 h-11 w-full rounded-lg border bg-card px-3.5 text-[15px] ${showError ? "border-destructive/60" : ""}`}
          />
          {showError && (
            <p id="quote-amount-error" className="mt-2 text-sm text-destructive">
              {t("quote_amount.invalid")}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => onConfirm(undefined)}
              className="inline-flex h-11 items-center rounded-md border px-4.5 text-[15px] font-semibold transition-colors hover:bg-muted"
            >
              {t("quote_amount.skip")}
            </button>
            <button
              type="submit"
              disabled={amount === null}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4.5 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Send className="size-4" aria-hidden />
              {t("quote_amount.confirm")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
