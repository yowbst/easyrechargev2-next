import { FileSearch } from "lucide-react";
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

const STATUS_TONE: Record<string, string> = {
  issued: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  sent: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  disputed: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  paid: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

function InvoiceLines({
  lines,
  lang,
  t,
}: {
  lines: PartnerInvoiceLine[];
  lang: "fr" | "de";
  t: ReturnType<typeof makePartnerT>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("detail.col.date")}</th>
            <th className="py-2 pr-4 font-medium">{t("detail.col.lead")}</th>
            <th className="py-2 pr-4 font-medium">{t("detail.col.category")}</th>
            <th className="py-2 pr-4 text-right font-medium">{t("detail.col.amount")}</th>
            <th className="w-8 py-2" />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const { name, place } = splitLabel(line.label);
            const submissionId = line.dispatch?.submission ?? null;
            const isGift = line.kind === "gift";
            return (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-4 whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {frDate(line.dispatched_at)}
                </td>
                <td className="py-2 pr-4">
                  <span className="font-medium">{name}</span>
                  {place && <span className="ml-2 text-muted-foreground">{place}</span>}
                  {isGift && (
                    <span className="ml-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                      {t("detail.gift")}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {line.lead_category ? t(`category.${line.lead_category}`) : "—"}
                </td>
                <td className="py-2 pr-4 text-right font-mono whitespace-nowrap">
                  {chf(line.amount_chf)}
                </td>
                <td className="py-2">
                  {submissionId && (
                    <a
                      href={`/${lang}/demande-devis/${submissionId}?view=partner`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("detail.view")}
                      title={t("detail.view")}
                      className="inline-flex rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <FileSearch className="h-3.5 w-3.5" />
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceList({
  invoices,
  dictionary,
  lang,
}: {
  invoices: PartnerInvoice[];
  dictionary: PartnerDict;
  lang: "fr" | "de";
}) {
  const t = makePartnerT(dictionary);

  if (invoices.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      {invoices.map((inv) => {
        const lines = inv.lines ?? [];
        const billed = lines.filter((l) => l.kind !== "adjustment" && l.kind !== "gift");
        const gifts = lines.filter((l) => l.kind === "gift");
        const tone = STATUS_TONE[inv.status] ?? "border-border bg-muted text-muted-foreground";

        return (
          <details
            key={inv.id}
            className="group rounded-lg border bg-card shadow-sm transition-shadow open:shadow-md"
          >
            <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono text-base font-semibold">{inv.number}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
                  {t(`status.${inv.status}`)}
                </span>
                <span className="text-sm text-muted-foreground">{inv.period_month}</span>
                <span className="ml-auto font-mono text-base font-semibold">
                  {chf(inv.total_chf)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
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

            <div className="border-t px-4 pb-4">
              {lines.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("detail.empty")}</p>
              ) : (
                <InvoiceLines lines={lines} lang={lang} t={t} />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
