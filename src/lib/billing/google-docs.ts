import { directusFetch } from "@/lib/directus";

export interface DocGateway {
  /**
   * `year` selects the destination folder. Filing is year-scoped
   * (`<root>/<year>/Revenus`), so the year travels with the call rather than
   * living in a static env var that would silently keep filing into the old
   * folder every January.
   */
  copyTemplate(name: string, year: string): Promise<{ fileId: string; url: string }>;
  replaceText(fileId: string, map: Record<string, string>): Promise<void>;
  /** Turn every occurrence of `text` into a hyperlink pointing at `url`. */
  linkText(fileId: string, text: string, url: string): Promise<void>;
  /**
   * Delete any table row containing one of `markers`. Used to drop the optional
   * gift and adjustment rows: an empty row on an invoice is noise, and a blank
   * amount next to a label reads as a mistake.
   */
  dropRowsContaining(fileId: string, markers: string[]): Promise<void>;
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
  giftQuantity = 0,
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
    "{{gift_quantity}}": giftQuantity > 0 ? String(giftQuantity) : "",
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

  /** Exact name of the revenue subfolder inside each year folder. */
  const REVENUE_FOLDER = "Revenus";

  async function childFolderId(parentId: string, name: string): Promise<string> {
    const res = await drive.files.list({
      q:
        `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' ` +
        `and name='${name.replace(/'/g, "\\'")}' and trashed=false`,
      fields: "files(id,name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const id = res.data.files?.[0]?.id;
    // Refuse rather than create: a folder appearing on its own would file real
    // invoices somewhere nobody is looking.
    if (!id) throw new Error("invoice_folder_not_found");
    return id;
  }

  return {
    async copyTemplate(name, year) {
      const root = process.env.GOOGLE_INVOICE_ROOT_FOLDER_ID!;
      const yearFolder = await childFolderId(root, year);
      const target = await childFolderId(yearFolder, REVENUE_FOLDER);
      const res = await drive.files.copy({
        fileId: process.env.GOOGLE_INVOICE_TEMPLATE_DOC_ID!,
        requestBody: { name, parents: [target] },
        supportsAllDrives: true,
      });
      const fileId = res.data.id!;
      return { fileId, url: `https://docs.google.com/document/d/${fileId}/edit` };
    },
    async dropRowsContaining(fileId, markers) {
      if (!markers.length) return;
      const doc = await docs.documents.get({ documentId: fileId });
      const requests: unknown[] = [];
      for (const el of doc.data.body?.content ?? []) {
        if (!el.table) continue;
        // Walk rows high-to-low so each deletion cannot shift the next index.
        el.table.tableRows?.forEach((row, ri) => {
          const text = (row.tableCells ?? []).flatMap((c) =>
            (c.content ?? []).flatMap((cc) => (cc.paragraph?.elements ?? []).map((x) => x.textRun?.content ?? "")),
          ).join("");
          if (markers.some((m) => text.includes(m))) {
            requests.push({
              deleteTableRow: { tableCellLocation: { tableStartLocation: { index: el.startIndex }, rowIndex: ri } },
            });
          }
        });
      }
      if (requests.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await docs.documents.batchUpdate({ documentId: fileId, requestBody: { requests: requests.reverse() as any } });
      }
    },
    async linkText(fileId, text, url) {
      // replaceAllText cannot set a link, so locate the substituted text and
      // restyle its range. A single pass is enough: the URL appears once.
      const doc = await docs.documents.get({ documentId: fileId });
      const requests: unknown[] = [];
      for (const el of doc.data.body?.content ?? []) {
        for (const e of el.paragraph?.elements ?? []) {
          const content = e.textRun?.content ?? "";
          const at = content.indexOf(text);
          if (at < 0 || e.startIndex == null) continue;
          requests.push({
            updateTextStyle: {
              range: { startIndex: e.startIndex + at, endIndex: e.startIndex + at + text.length },
              textStyle: { link: { url } },
              fields: "link",
            },
          });
        }
      }
      if (requests.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await docs.documents.batchUpdate({ documentId: fileId, requestBody: { requests: requests as any } });
      }
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
/**
 * The word "invoice" in the partner's own language, used in the Drive file name.
 * Falls back to English for any language we do not have a word for.
 */
const INVOICE_WORD: Record<string, string> = { fr: "Facture", de: "Rechnung" };

export function buildDocumentName(
  language: string | null | undefined,
  partnerName: string,
  periodMonth: string,
  invoiceCode: string,
  version: number,
): string {
  const word = INVOICE_WORD[(language ?? "").toLowerCase()] ?? "Invoice";
  return `${word} _ ${partnerName} _ ${periodMonth} _ ${invoiceCode} _ v${version}`;
}

export async function generateInvoiceDocument(
  invoiceId: string, gateway?: DocGateway, now: Date = new Date(),
): Promise<{ doc_url: string; doc_file_id: string; version: number }> {
  const gw = gateway ?? (await defaultGateway());

  const invRes = await directusFetch<{ data: any }>( // eslint-disable-line @typescript-eslint/no-explicit-any
    `/items/partner_invoices/${invoiceId}?fields=*,partner.dashboard_token,partner.name,partner.language,partner.invoice_code`,
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
  const giftLines = lines.filter((l) => l.kind === "gift");
  const quantity = leadLines.length;

  /*
   * The Doc carries ONE aggregated lead line (`17 | CHF 40.00 | CHF 680.00`),
   * which is only truthful while every lead costs the same. `price_chf` is
   * snapshotted per lead CATEGORY at dispatch (see lib/dispatch/resolver.ts),
   * so a month can legitimately mix CHF 40 and CHF 60 leads. Taking
   * leadLines[0] then prints a line that does not add up to the total on the
   * same page — on a document sent to a client. Refuse instead: the invoice
   * stays valid, the Doc is simply not generated until the template grows a
   * per-price row (or the operator splits the invoice).
   */
  const unitPrices = new Set(leadLines.map((l) => Number(l.unit_price_chf).toFixed(2)));
  if (unitPrices.size > 1) throw new Error("mixed_unit_prices");

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

  const name = buildDocumentName(
    invoice.partner?.language,
    invoice.partner?.name ?? "",
    String(invoice.period_month),
    invoice.partner?.invoice_code ?? "",
    newVersion,
  );
  const year = String(invoice.period_month).slice(0, 4);
  const { fileId, url } = await gw.copyTemplate(name, year);
  // Drop optional rows before substituting: an invoice with no gifts and no
  // discount should not carry blank rows explaining nothing.
  const unusedRows: string[] = [];
  if (giftLines.length === 0) unusedRows.push("{{gift_quantity}}");
  if (!adjustment) unusedRows.push("{{adjustment_label}}");
  await gw.dropRowsContaining(fileId, unusedRows);

  await gw.replaceText(
    fileId,
    buildPlaceholders(
      { ...invoice, version: newVersion }, quantity, unitPrice, dashboardUrl, adjustment, giftLines.length,
    ),
  );
  // The placeholder is substituted as plain text; turn it into a real hyperlink.
  await gw.linkText(fileId, dashboardUrl, dashboardUrl);

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
