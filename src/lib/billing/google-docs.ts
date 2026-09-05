import { directusFetch } from "@/lib/directus";

export interface DocGateway {
  copyTemplate(name: string): Promise<{ fileId: string; url: string }>;
  replaceText(fileId: string, map: Record<string, string>): Promise<void>;
}

function chf(v: string | number): string {
  return `CHF ${Number(v).toFixed(2)}`;
}

/** 2026-09-05T… -> 05.09.2026 */
function frDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** 2026-07-01 + 2026-07-31 -> "Demandes de devis – 01.07 au 31.07.2026" */
function lineDescription(start: string, end: string): string {
  const [, sm, sd] = start.split("-");
  const [ey, em, ed] = end.split("-");
  return `Demandes de devis – ${sd}.${sm} au ${ed}.${em}.${ey}`;
}

export interface DocAdjustment {
  label: string;
  amountChf: number;
}

/**
 * Full set of `{{placeholder}}` keys substituted into the invoice Doc.
 * Keys are always English; values are French-formatted (dates as
 * `05.09.2026`, money as `CHF 680.00`).
 *
 * `{{line_amount}}` is `quantity * unitPrice` (the aggregated lead line
 * only) so the printed line is internally consistent — it must NOT be
 * `invoice.total_chf`, which also folds in any adjustment. `{{total_due}}`
 * is the one place `total_chf` belongs.
 *
 * `{{adjustment_label}}` / `{{adjustment_amount}}` are sourced from the
 * invoice's `adjustment`-kind lines (discounts/corrections). When there is
 * no adjustment both render as an empty string — never "CHF 0.00" or
 * "null" — so the template's adjustment row collapses to blank on an
 * ordinary invoice.
 */
export function buildPlaceholders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoice: any, quantity: number, unitPrice: number, dashboardUrl: string,
  adjustment?: DocAdjustment | null,
): Record<string, string> {
  const issuer = invoice.issuer_snapshot ?? {};
  const debtor = invoice.debtor_snapshot ?? {};
  const [year, month] = invoice.period_month.split("-");
  const lineAmount = quantity * unitPrice;

  return {
    "{{invoice_number}}": invoice.number,
    "{{invoice_version}}": `v${invoice.version}`,
    "{{issue_date}}": frDate(invoice.issued_at),
    "{{due_date}}": frDate(invoice.due_at),
    "{{issuer_name}}": issuer.name ?? "",
    "{{issuer_contact}}": issuer.contact_name ?? "",
    "{{issuer_street}}": issuer.street ?? "",
    "{{issuer_city}}": `${issuer.postal_code ?? ""} ${issuer.locality ?? ""}`.trim(),
    "{{debtor_name}}": debtor.name ?? "",
    "{{debtor_street}}": debtor.street ?? "",
    "{{debtor_city}}": `${debtor.postal_code ?? ""} ${debtor.locality ?? ""}`.trim(),
    "{{sent_to}}": debtor.email ?? "",
    "{{period_label}}": `${month}.${year}`,
    "{{period_start}}": frDate(invoice.period_start),
    "{{period_end}}": frDate(invoice.period_end),
    "{{line_description}}": lineDescription(invoice.period_start, invoice.period_end),
    "{{line_quantity}}": String(quantity),
    "{{line_unit_price}}": chf(unitPrice),
    "{{line_amount}}": chf(lineAmount),
    "{{adjustment_label}}": adjustment ? adjustment.label : "",
    "{{adjustment_amount}}": adjustment ? chf(adjustment.amountChf) : "",
    "{{vat_rate}}": `${Number(invoice.vat_rate ?? 0).toFixed(0)}%`,
    "{{vat_amount}}": chf(invoice.vat_chf ?? 0),
    "{{total_due}}": chf(invoice.total_chf),
    "{{dashboard_url}}": dashboardUrl,
  };
}

/**
 * Lazily built so tests never need Google credentials — every test injects a
 * fake gateway instead.
 */
async function defaultGateway(): Promise<DocGateway> {
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? "").replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  return {
    async copyTemplate(name) {
      const res = await drive.files.copy({
        fileId: process.env.GOOGLE_INVOICE_TEMPLATE_DOC_ID!,
        requestBody: { name, parents: [process.env.GOOGLE_INVOICE_FOLDER_ID!] },
      });
      const fileId = res.data.id!;
      return { fileId, url: `https://docs.google.com/document/d/${fileId}/edit` };
    },
    async replaceText(fileId, map) {
      await docs.documents.batchUpdate({
        documentId: fileId,
        requestBody: {
          requests: Object.entries(map).map(([find, replace]) => ({
            replaceAllText: { containsText: { text: find, matchCase: true }, replaceText: replace },
          })),
        },
      });
    },
  };
}

/**
 * Always produces a NEW document and appends it to doc_versions. Yoan edits
 * these by hand (he adds the QR payment part), so overwriting the existing
 * Doc would destroy his work — every call to this function copies a fresh
 * template and bumps the invoice's version instead.
 *
 * The first generation (no doc_url yet) keeps the invoice's current version.
 * Every subsequent generation increments it by one, and both the Drive
 * filename and the `{{invoice_version}}` placeholder reflect the new number.
 */
export async function generateInvoiceDocument(
  invoiceId: string, gateway?: DocGateway, now: Date = new Date(),
): Promise<{ doc_url: string; doc_file_id: string; version: number }> {
  const gw = gateway ?? (await defaultGateway());

  const invRes = await directusFetch<{ data: any }>( // eslint-disable-line @typescript-eslint/no-explicit-any
    `/items/partner_invoices/${invoiceId}?fields=*,partner.dashboard_token`,
    { next: { revalidate: 0 } },
  );
  const invoice = invRes?.data;
  if (!invoice) throw new Error("invoice_not_found");

  const linesRes = await directusFetch<{
    data: { kind: string; label?: string | null; unit_price_chf: string; amount_chf: string }[];
  }>(
    `/items/partner_invoice_lines?filter[invoice][_eq]=${invoiceId}&fields=kind,label,unit_price_chf,amount_chf&limit=500`,
    { next: { revalidate: 0 } },
  );
  const lines = linesRes?.data ?? [];
  const leadLines = lines.filter((l) => l.kind === "lead");
  const adjustmentLines = lines.filter((l) => l.kind === "adjustment");
  const quantity = leadLines.length;
  const unitPrice = quantity > 0 ? Number(leadLines[0].unit_price_chf) : 0;
  const adjustment: DocAdjustment | null = adjustmentLines.length > 0
    ? {
        label: adjustmentLines.map((l) => l.label).filter(Boolean).join(", "),
        amountChf: adjustmentLines.reduce((sum, l) => sum + Number(l.amount_chf), 0),
      }
    : null;

  const token = invoice.partner?.dashboard_token ?? "";
  const dashboardUrl = `https://easyrecharge.ch/fr/partners/${token}/invoices`;

  const previous = Array.isArray(invoice.doc_versions) ? invoice.doc_versions : [];
  const currentVersion = Number(invoice.version) || 1;
  const newVersion = invoice.doc_url ? currentVersion + 1 : currentVersion;

  const name = `${invoice.number} v${newVersion}`;
  const { fileId, url } = await gw.copyTemplate(name);
  await gw.replaceText(
    fileId,
    buildPlaceholders({ ...invoice, version: newVersion }, quantity, unitPrice, dashboardUrl, adjustment),
  );

  await directusFetch(`/items/partner_invoices/${invoiceId}`, {
    method: "PATCH",
    body: JSON.stringify({
      doc_url: url, doc_file_id: fileId, version: newVersion,
      doc_versions: [...previous, {
        version: newVersion, doc_url: url, doc_file_id: fileId,
        generated_at: now.toISOString(),
      }],
    }),
    next: { revalidate: 0 },
  });

  return { doc_url: url, doc_file_id: fileId, version: newVersion };
}
