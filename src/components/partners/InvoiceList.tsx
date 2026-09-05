import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import type { PartnerInvoice } from "@/lib/billing/partner-queries";

/** 2026-09-05T… -> 05.09.2026. Matches `frDate` in `lib/billing/google-docs.ts`
 *  (duplicated here rather than imported so this Server Component never pulls
 *  in that module's lazy `googleapis` import). */
function frDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Matches `chf` in `lib/billing/google-docs.ts`. */
function chf(v: string): string {
  return `CHF ${Number(v).toFixed(2)}`;
}

export function InvoiceList({
  invoices,
  dictionary,
}: {
  invoices: PartnerInvoice[];
  dictionary: PartnerDict;
  lang: "fr" | "de";
}) {
  const t = makePartnerT(dictionary);

  if (invoices.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {invoices.map((inv) => (
        <details key={inv.id} className="rounded-lg border p-4">
          <summary className="cursor-pointer list-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono font-medium">{inv.number}</span>
              <span className="text-sm text-muted-foreground">{inv.period_month}</span>
              <span className="font-medium">{chf(inv.total_chf)}</span>
              <span className="rounded-full border px-2 py-0.5 text-xs">
                {t(`status.${inv.status}`)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("col.issued")} {frDate(inv.issued_at)} · {t("col.due")} {frDate(inv.due_at)}
            </div>
          </summary>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">{t("detail.col.date")}</th>
                <th className="py-1">{t("detail.col.lead")}</th>
                <th className="py-1">{t("detail.col.category")}</th>
                <th className="py-1 text-right">{t("detail.col.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(inv.lines ?? []).map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">{frDate(line.dispatched_at)}</td>
                  <td className="py-1">{line.label}</td>
                  <td className="py-1">{line.lead_category ?? "—"}</td>
                  <td className="py-1 text-right font-mono">{chf(line.amount_chf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
