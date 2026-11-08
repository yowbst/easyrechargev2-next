import { ChevronDown, FileSearch } from "lucide-react";
import { InvoiceUrlSync } from "./InvoiceUrlSync";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import type { PartnerInvoice, PartnerInvoiceLine } from "@/lib/billing/partner-queries";
import { countBilledLeads, partnerStatus } from "@/lib/billing/line-kinds";

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

/** `2026-09` → `Septembre 2026` / `September 2026`. */
function periodLabel(period: string, lang: "fr" | "de"): string {
  const d = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return period;
  const s = new Intl.DateTimeFormat(lang === "de" ? "de-CH" : "fr-CH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Statuses that mean money is still owed — summed into the header figure. */
const OUTSTANDING = new Set(["issued", "sent", "disputed"]);

type StepTone = "done" | "pending" | "won" | "late" | "void";

interface Step {
  label: string;
  date: string | null;
  tone: StepTone;
}

const DOT_TONE: Record<StepTone, string> = {
  done: "border-foreground/70 bg-foreground/70",
  pending: "border-border bg-card",
  won: "border-partner-won bg-partner-won",
  late: "border-partner-lost bg-card",
  void: "border-muted-foreground/50 bg-muted-foreground/50",
};

const LABEL_TONE: Record<StepTone, string> = {
  done: "text-foreground",
  pending: "text-muted-foreground",
  won: "text-partner-hot",
  late: "text-partner-lost",
  void: "text-muted-foreground",
};

/**
 * Issued → sent → settled. The last step is whatever ended the invoice (paid,
 * cancelled, disputed) or, while it is still open, the due date — in red once
 * that date has passed. The status is read off the line, so no separate pill.
 */
function invoiceSteps(
  inv: PartnerInvoice,
  t: ReturnType<typeof makePartnerT>,
  now: Date,
): Step[] {
  // `sent_at` is set by hand and older invoices predate it: a status past
  // `issued` proves the invoice left even when the date is missing.
  const sent = Boolean(inv.sent_at) || ["sent", "paid", "disputed"].includes(inv.status);

  let last: Step;
  if (inv.status === "paid") {
    last = { label: t("status.paid"), date: inv.paid_at, tone: "won" };
  } else if (inv.status === "cancelled") {
    last = { label: t("status.cancelled"), date: null, tone: "void" };
  } else if (inv.status === "disputed") {
    last = { label: t("status.disputed"), date: null, tone: "late" };
  } else {
    const overdue = Boolean(inv.due_at) && new Date(inv.due_at!) < now;
    last = { label: t("col.due"), date: inv.due_at, tone: overdue ? "late" : "pending" };
  }

  return [
    { label: t("status.issued"), date: inv.issued_at, tone: "done" },
    { label: t("status.sent"), date: inv.sent_at, tone: sent ? "done" : "pending" },
    last,
  ];
}

function StatusTrack({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid w-full max-w-sm grid-cols-3">
      {steps.map((step, i) => {
        // A segment is drawn solid once the step it leads to has happened.
        const reached = step.tone !== "pending" && step.tone !== "late";
        return (
          <li key={i} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-1 right-1/2 h-0.5 w-full ${
                  reached
                    ? step.tone === "won"
                      ? "bg-partner-won"
                      : step.tone === "void"
                        ? "bg-muted-foreground/40"
                        : "bg-foreground/60"
                    : "bg-border"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 size-2.5 rounded-full border-2 ${DOT_TONE[step.tone]}`}
            />
            <span className={`mt-1.5 text-xs font-semibold ${LABEL_TONE[step.tone]}`}>
              {step.label}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {step.date ? frDate(step.date) : "—"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
            // Binary on purpose for requests: the partner only needs to know
            // whether one is on the amount they owe. An adjustment is not a
            // request and carries no status — just its amount.
            const status = partnerStatus(line.kind);
            const billed = status !== "notBilled";
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
                  {status && (
                    <span
                      className={`inline-flex h-[26px] items-center rounded-md px-2.5 text-xs font-semibold ${
                        billed
                          ? "bg-partner-hot-bg text-partner-hot"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {billed ? t("detail.status.billed") : t("detail.status.notBilled")}
                    </span>
                  )}
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
              <td className="pt-4 text-right font-heading text-base font-semibold tracking-tight tabular-nums">
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
  const now = new Date();

  return (
    <div className="space-y-3">
      <InvoiceUrlSync />

      {outstanding > 0 && (
        <div className="flex items-baseline justify-end gap-3 pb-1">
          <span className="text-sm text-muted-foreground">
            {t("status.issued")}
          </span>
          <span className="font-heading text-lg font-semibold tracking-tight tabular-nums text-partner-warm">
            {chf(outstanding)}
          </span>
        </div>
      )}

      {invoices.map((inv) => {
        const lines = inv.lines ?? [];
        const billedCount = countBilledLeads(lines);
        const gifts = lines.filter((l) => l.kind === "gift");
        // A cancelled invoice is history, not an amount owed: de-emphasise it
        // and strike the total so it cannot be mistaken for something due.
        const cancelled = inv.status === "cancelled";
        const counts =
          t("detail.count", { count: billedCount }) +
          (gifts.length > 0 ? ` · ${t("detail.giftCount", { count: gifts.length })}` : "");

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
            <summary className="cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-4 md:gap-x-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div
                    className={`whitespace-nowrap font-heading text-base font-semibold tracking-tight${cancelled ? " line-through" : ""}`}
                  >
                    {inv.number}
                  </div>
                  <div className="whitespace-nowrap text-sm text-muted-foreground">
                    {periodLabel(inv.period_month, lang)}
                  </div>
                </div>

                <div className="col-span-2 row-start-2 flex justify-center md:col-span-1 md:row-start-auto">
                  <StatusTrack steps={invoiceSteps(inv, t, now)} />
                </div>

                {/* On a phone the counts would crowd the number; they move under the track. */}
                <div className="col-span-2 -mt-2 text-center text-xs text-muted-foreground md:hidden">
                  {counts}
                </div>

                <div className="col-start-2 row-start-1 flex items-center justify-end gap-3 md:col-start-auto md:row-start-auto">
                  <div className="text-right">
                    <div
                      className={`font-heading text-lg font-semibold tracking-tight tabular-nums${cancelled ? " line-through" : ""}`}
                    >
                      {chf(inv.total_chf)}
                    </div>
                    <div className="hidden text-xs text-muted-foreground md:block">{counts}</div>
                  </div>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </div>
              </div>
            </summary>

            <div className="border-t px-5 pb-5">
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
