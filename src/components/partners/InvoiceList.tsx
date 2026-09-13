import { ChevronDown, FileSearch } from "lucide-react";
import { InvoiceUrlSync } from "./InvoiceUrlSync";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import type { PartnerInvoice, PartnerInvoiceLine } from "@/lib/billing/partner-queries";

function frDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function chf(v: string | number): string {
  return `CHF ${Number(v).toFixed(2)}`;
}

/** `P / PAPEIL / 1052 Le Mont-sur-Lausanne / 2026-07-04` → name + place. */
function splitLabel(label: string): { name: string; place: string } {
  const parts = label.split(" / ");
  return parts.length >= 3
    ? { name: parts[1], place: parts[2] }
    : { name: label, place: "" };
}

/**
 * Chronological, oldest first — the partner reads this as the list of requests
 * they received over the month. Adjustments have no date, so they sit at the
 * end. Sorted here as well as in the query because Directus null-ordering on a
 * nested sort is not something to rely on.
 */
function byDispatchDate(a: PartnerInvoiceLine, b: PartnerInvoiceLine): number {
  const da = a.dispatched_at ?? "";
  const db = b.dispatched_at ?? "";
  if (!da && !db) return a.label.localeCompare(b.label);
  if (!da) return 1;
  if (!db) return -1;
  return da === db ? a.label.localeCompare(b.label) : da.localeCompare(db);
}

// Warm tones for "you owe this", green for settled, neutral for void — drawn
// from the partner palette so they hold up in both themes.
const STATUS_TONE: Record<string, string> = {
  issued: "border-partner-warm/35 bg-partner-warm-bg text-partner-warm",
  sent: "border-partner-cold/35 bg-partner-cold-bg text-partner-cold",
  disputed: "border-partner-lost/35 bg-partner-lost/10 text-partner-lost",
  paid: "border-partner-won/40 bg-partner-hot-bg text-partner-hot",
  cancelled: "border-border bg-muted text-muted-foreground",
};

/** Statuses that mean money is still owed — summed into the header figure. */
const OUTSTANDING = new Set(["issued", "sent", "disputed"]);

function InvoiceLines({
  lines,
  lang,
  t,
  total,
}: {
  lines: PartnerInvoiceLine[];
  lang: "fr" | "de";
  t: ReturnType<typeof makePartnerT>;
  /** Invoice total, repeated under the lines so the column adds up on screen. */
  total?: string | number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left font-semibold text-muted-foreground">
            <th className="py-3 pr-4 font-semibold">{t("detail.col.date")}</th>
            <th className="py-3 pr-4 font-semibold">{t("detail.col.lead")}</th>
            <th className="py-3 pr-4 font-semibold">{t("detail.col.category")}</th>
            <th className="py-3 pr-4 font-semibold">{t("detail.col.reason")}</th>
            <th className="py-3 pr-4 font-semibold">{t("detail.col.status")}</th>
            {/* Rightmost, so the per-line amounts line up with the invoice total. */}
            <th className="py-3 text-right font-semibold">{t("detail.col.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {[...lines].sort(byDispatchDate).map((line, i) => {
            const { name, place } = splitLabel(line.label);
            const submissionId = line.dispatch?.submission ?? null;
            const isGift = line.kind === "gift";
            const isRefused = line.kind === "disqualified";
            // Binary on purpose: the partner only needs to know whether this
            // request is on the amount they owe.
            const billed = !isGift && !isRefused;
            const reason = isRefused
              ? line.disqualification_reason
                ? t(`reasons.${line.disqualification_reason}.label`)
                : t("detail.refused")
              : isGift
                ? line.gift_reason
                  ? t(`gift_reasons.${line.gift_reason}`)
                  : t("detail.gift")
                : "—";
            return (
              <tr
                key={i}
                className={`border-t border-border/60${
                  billed ? "" : " text-muted-foreground"
                }`}
              >
                <td className="py-3 pr-4 whitespace-nowrap tabular-nums text-muted-foreground">
                  {frDate(line.dispatched_at)}
                </td>
                <td className="py-3 pr-4">
                  {submissionId && (
                    <a
                      href={`/${lang}/demande-devis/${submissionId}?view=partner`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("detail.view")}
                      title={t("detail.view")}
                      className="mr-1.5 inline-flex translate-y-px rounded p-0.5 align-middle text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <span className="font-semibold">{name}</span>
                  {place && <span className="ml-2 text-muted-foreground">{place}</span>}

                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {line.lead_category ? t(`category.${line.lead_category}`) : "—"}
                </td>
                <td className="py-3 pr-4">{reason}</td>
                <td className="py-3 pr-4 whitespace-nowrap">
                  <span
                    className={`inline-flex h-[26px] items-center rounded-md px-2.5 text-xs font-semibold ${
                      billed
                        ? "bg-partner-hot-bg text-partner-hot"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {billed ? t("detail.status.billed") : t("detail.status.notBilled")}
                  </span>
                </td>
                <td className="py-3 text-right font-semibold tabular-nums whitespace-nowrap">
                  {billed ? (
                    chf(line.amount_chf)
                  ) : (
                    // What it WOULD have cost, struck: a plain CHF 0.00 hides
                    // that a decision was taken.
                    <span className="font-normal text-muted-foreground line-through">
                      {chf(line.unit_price_chf ?? 0)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {total !== undefined && (
          <tfoot>
            <tr>
              <td
                colSpan={5}
                className="pt-4 pr-4 text-right font-semibold text-muted-foreground"
              >
                {t("detail.col.amount")}
              </td>
              <td className="pt-4 text-right font-heading text-xl font-semibold tracking-tight tabular-nums">
                {chf(total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function InvoiceList({
  invoices,
  dictionary,
  lang,
  openInvoice,
}: {
  invoices: PartnerInvoice[];
  dictionary: PartnerDict;
  lang: "fr" | "de";
  /** Invoice number from `?invoice=` — that one renders expanded. */
  openInvoice?: string;
}) {
  const t = makePartnerT(dictionary);

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  // What the partner actually owes right now, across every unsettled invoice.
  // The per-invoice totals are each one row of this; the sum is the number
  // they came to the page for, so it leads.
  const outstanding = invoices
    .filter((inv) => OUTSTANDING.has(inv.status))
    .reduce((sum, inv) => sum + Number(inv.total_chf), 0);

  return (
    <div className="space-y-3">
      <InvoiceUrlSync />

      {outstanding > 0 && (
        <div className="flex items-baseline justify-end gap-3 pb-1">
          <span className="text-sm text-muted-foreground">
            {t("status.issued")}
          </span>
          <span className="font-heading text-2xl font-semibold tracking-tight tabular-nums text-partner-warm">
            {chf(outstanding)}
          </span>
        </div>
      )}

      {invoices.map((inv) => {
        const lines = inv.lines ?? [];
        const billed = lines.filter((l) => l.kind !== "adjustment" && l.kind !== "gift");
        const gifts = lines.filter((l) => l.kind === "gift");
        const tone = STATUS_TONE[inv.status] ?? "border-border bg-muted text-muted-foreground";
        // A cancelled invoice is history, not an amount owed: de-emphasise it
        // and strike the total so it cannot be mistaken for something due.
        const cancelled = inv.status === "cancelled";

        return (
          <details
            key={inv.id}
            id={`invoice-${inv.number}`}
            data-invoice-number={inv.number}
            open={openInvoice === inv.number}
            className={`group rounded-xl border bg-card transition-shadow open:shadow-md${
              cancelled ? " opacity-60" : ""
            }`}
          >
            <summary className="cursor-pointer list-none px-6 py-5 [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                <span
                  className={`font-heading text-xl font-semibold tracking-tight${cancelled ? " line-through" : ""}`}
                >
                  {inv.number}
                </span>
                <span
                  className={`inline-flex h-7 items-center rounded-md border px-2.5 text-[13px] font-semibold ${tone}`}
                >
                  {t(`status.${inv.status}`)}
                </span>
                <span className="text-[15px] text-muted-foreground">{inv.period_month}</span>
                <span
                  className={`ml-auto font-heading text-2xl font-semibold tracking-tight tabular-nums${cancelled ? " line-through" : ""}`}
                >
                  {chf(inv.total_chf)}
                </span>
                <ChevronDown
                  className="size-[18px] shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 text-sm text-muted-foreground">
                <span>
                  {t("col.issued")} {frDate(inv.issued_at)}
                </span>
                <span>
                  {t("col.due")} {frDate(inv.due_at)}
                </span>
                {inv.paid_at && (
                  <span>
                    {t("col.paid")} {frDate(inv.paid_at)}
                  </span>
                )}
                <span>
                  {t("detail.count", { count: billed.length })}
                  {gifts.length > 0 && ` · ${t("detail.giftCount", { count: gifts.length })}`}
                </span>
              </div>
            </summary>

            <div className="border-t px-6 pb-6">
              {lines.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("detail.empty")}</p>
              ) : (
                <InvoiceLines lines={lines} lang={lang} t={t} total={inv.total_chf} />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
