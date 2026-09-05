import { beforeEach, describe, expect, it, vi } from "vitest";

interface Call { path: string; method: string; body: Record<string, unknown> | undefined }

const calls: Call[] = [];

function baseInvoice() {
  return {
    id: "inv-1", number: "EME-202607", version: 1, period_month: "2026-07",
    period_start: "2026-07-01", period_end: "2026-07-31",
    issued_at: "2026-09-05T00:00:00.000Z", due_at: "2026-09-26T00:00:00.000Z",
    subtotal_chf: "80.00", adjustment_chf: "0.00", total_chf: "80.00",
    vat_rate: "0.00", vat_chf: "0.00",
    doc_versions: [] as unknown[], doc_url: null as string | null, doc_file_id: null as string | null,
    issuer_snapshot: { name: "easyRecharge", contact_name: "Yoan Basset",
      street: "Ch. de Sorécot 33", postal_code: "1033", locality: "Cheseaux/Lausanne" },
    debtor_snapshot: { name: "E-ME Énergies Sàrl", street: "Chemin de la Crétaux 4",
      postal_code: "1196", locality: "Gland", email: "jendoubi@emeenergies.ch" },
    partner: { dashboard_token: "tok-123", name: "E-ME Énergies", language: "fr", invoice_code: "EME" },
  };
}

function baseLeadLines() {
  return [
    { kind: "lead", amount_chf: "40.00", unit_price_chf: "40.00" },
    { kind: "lead", amount_chf: "40.00", unit_price_chf: "40.00" },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state: { invoice: any; lines: any[] } = { invoice: baseInvoice(), lines: baseLeadLines() };

function resetState() {
  calls.length = 0;
  state.invoice = baseInvoice();
  state.lines = baseLeadLines();
}

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ path, method, body });

    if (path.startsWith("/items/partner_invoices/") && method === "GET") {
      return { data: { ...state.invoice } };
    }
    if (path.startsWith("/items/partner_invoices/") && method === "PATCH") {
      Object.assign(state.invoice, body);
      return { data: {} };
    }
    if (path.startsWith("/items/partner_invoice_lines")) {
      return { data: state.lines };
    }
    return { data: {} };
  }),
}));

describe("buildPlaceholders", () => {
  it("produces English keys with French-formatted values", async () => {
    const { buildPlaceholders } = await import("./google-docs");
    const map = buildPlaceholders(
      { number: "EME-202607", version: 2, period_start: "2026-07-01", period_end: "2026-07-31",
        period_month: "2026-07", issued_at: "2026-09-05T00:00:00.000Z",
        due_at: "2026-09-26T00:00:00.000Z", total_chf: "680.00", vat_rate: "0.00", vat_chf: "0.00",
        issuer_snapshot: { name: "easyRecharge", contact_name: "Yoan Basset",
          street: "Ch. de Sorécot 33", postal_code: "1033", locality: "Cheseaux/Lausanne" },
        debtor_snapshot: { name: "E-ME Énergies Sàrl", street: "Chemin de la Crétaux 4",
          postal_code: "1196", locality: "Gland", email: "jendoubi@emeenergies.ch" } },
      17, 40,
      "https://easyrecharge.ch/fr/partners/tok-123/invoices",
    );

    expect(map["{{invoice_number}}"]).toBe("EME-202607");
    expect(map["{{invoice_version}}"]).toBe("v2");
    expect(map["{{issue_date}}"]).toBe("05.09.2026");
    expect(map["{{due_date}}"]).toBe("26.09.2026");
    expect(map["{{period_label}}"]).toBe("07.2026");
    expect(map["{{line_description}}"]).toBe("Demandes de devis – 01.07 au 31.07.2026");
    expect(map["{{line_quantity}}"]).toBe("17");
    expect(map["{{line_unit_price}}"]).toBe("CHF 40.00");
    // 17 x CHF 40.00 = the lead-line subtotal — must NOT be invoice.total_chf,
    // which folds in adjustments too (Critical 1).
    expect(map["{{line_amount}}"]).toBe("CHF 680.00");
    expect(map["{{total_due}}"]).toBe("CHF 680.00");
    expect(map["{{sent_to}}"]).toBe("jendoubi@emeenergies.ch");
    expect(map["{{dashboard_url}}"]).toBe("https://easyrecharge.ch/fr/partners/tok-123/invoices");
    // No adjustment on this invoice — both keys render as empty string, never "CHF 0.00"/"null".
    expect(map["{{adjustment_label}}"]).toBe("");
    expect(map["{{adjustment_amount}}"]).toBe("");
    // No French keys leak in.
    expect(Object.keys(map).some((k) => /numero|facture|montant/i.test(k))).toBe(false);
  });

  it("keeps line_amount as quantity x unitPrice, distinct from total_due, when an adjustment shrinks the total", async () => {
    const { buildPlaceholders } = await import("./google-docs");
    const map = buildPlaceholders(
      { number: "EME-202607", version: 1, period_start: "2026-07-01", period_end: "2026-07-31",
        period_month: "2026-07", issued_at: "2026-09-05T00:00:00.000Z",
        due_at: "2026-09-26T00:00:00.000Z", total_chf: "630.00", vat_rate: "0.00", vat_chf: "0.00",
        issuer_snapshot: {}, debtor_snapshot: {} },
      17, 40,
      "https://easyrecharge.ch/fr/partners/tok-123/invoices",
      { label: "Remise fidélité", amountChf: -50 },
    );

    expect(map["{{line_amount}}"]).toBe("CHF 680.00");
    expect(map["{{total_due}}"]).toBe("CHF 630.00");
    expect(map["{{adjustment_label}}"]).toBe("Remise fidélité");
    expect(map["{{adjustment_amount}}"]).toBe("CHF -50.00");
  });
});

describe("generateInvoiceDocument", () => {
  beforeEach(() => { resetState(); vi.resetModules(); });

  function fakeGateway(...results: { fileId: string; url: string }[]) {
    const copyTemplate = vi.fn<(name: string, year: string) => Promise<{ fileId: string; url: string }>>();
    results.forEach((r) => copyTemplate.mockResolvedValueOnce(r));
    const replaceText = vi.fn<(fileId: string, map: Record<string, string>) => Promise<void>>(
      async () => {},
    );
    const linkText = vi.fn<(fileId: string, text: string, url: string) => Promise<void>>(async () => {});
    return { copyTemplate, replaceText, linkText };
  }

  it("creates the first version and starts doc_versions as a one-entry array", async () => {
    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    const r = await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    expect(r).toEqual({ doc_url: "https://docs.google.com/document/d/f1/edit", doc_file_id: "f1", version: 1 });
    expect(gateway.copyTemplate).toHaveBeenCalledWith("Facture _ E-ME Énergies _ 2026-07 _ EME _ v1", "2026");

    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeDefined();
    const body = patch!.body!;
    expect(body.doc_url).toBe("https://docs.google.com/document/d/f1/edit");
    expect(body.doc_file_id).toBe("f1");
    expect(body.version).toBe(1);
    expect(body.doc_versions).toEqual([
      { version: 1, doc_url: "https://docs.google.com/document/d/f1/edit", doc_file_id: "f1", generated_at: "2026-09-05T00:00:00.000Z" },
    ]);
  });

  it("derives the destination year from the invoice period, not from today", async () => {
    // A January 2027 invoice must file under 2027 even if it is generated later.
    state.invoice = { ...state.invoice, period_month: "2027-01", number: "EME-202701" };
    const gateway = fakeGateway({ fileId: "f9", url: "https://docs.google.com/document/d/f9/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await generateInvoiceDocument("inv-1", gateway, new Date("2027-03-01T00:00:00Z"));

    expect(gateway.copyTemplate).toHaveBeenCalledWith("Facture _ E-ME Énergies _ 2027-01 _ EME _ v1", "2027");
  });

  it("names the file in the partner's language and links the dashboard url", async () => {
    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    const dash = "https://easyrecharge.ch/fr/partners/tok-123/invoices";
    expect(gateway.linkText).toHaveBeenCalledWith("f1", dash, dash);
  });

  it("falls back to the English word for a language with no mapping", async () => {
    state.invoice = { ...state.invoice, partner: { ...state.invoice.partner, language: "it" } };
    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    expect(gateway.copyTemplate).toHaveBeenCalledWith("Invoice _ E-ME Énergies _ 2026-07 _ EME _ v1", "2026");
  });

  it("hands replaceText the quantity and unit price derived from the mocked lead lines", async () => {
    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    expect(gateway.replaceText).toHaveBeenCalledOnce();
    const map = gateway.replaceText.mock.calls[0][1] as Record<string, string>;
    expect(map["{{line_quantity}}"]).toBe("2");
    expect(map["{{line_unit_price}}"]).toBe("CHF 40.00");
    expect(map["{{line_amount}}"]).toBe("CHF 80.00");
    expect(map["{{invoice_version}}"]).toBe("v1");
  });

  it("bumps the version and accumulates doc_versions on a second generation, keeping the first entry unchanged", async () => {
    const gateway = fakeGateway(
      { fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" },
      { fileId: "f2", url: "https://docs.google.com/document/d/f2/edit" },
    );
    const { generateInvoiceDocument } = await import("./google-docs");

    const first = await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));
    expect(first.version).toBe(1);

    const second = await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-10T00:00:00Z"));
    expect(second).toEqual({ doc_url: "https://docs.google.com/document/d/f2/edit", doc_file_id: "f2", version: 2 });

    // The filename and the {{invoice_version}} placeholder both reflect the bump.
    expect(gateway.copyTemplate).toHaveBeenNthCalledWith(2, "Facture _ E-ME Énergies _ 2026-07 _ EME _ v2", "2026");
    const secondMap = gateway.replaceText.mock.calls[1][1] as Record<string, string>;
    expect(secondMap["{{invoice_version}}"]).toBe("v2");

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(2);
    const secondBody = patches[1].body!;
    expect(secondBody.version).toBe(2);
    expect(secondBody.doc_url).toBe("https://docs.google.com/document/d/f2/edit");
    expect(secondBody.doc_file_id).toBe("f2");
    expect(secondBody.doc_versions).toEqual([
      { version: 1, doc_url: "https://docs.google.com/document/d/f1/edit", doc_file_id: "f1", generated_at: "2026-09-05T00:00:00.000Z" },
      { version: 2, doc_url: "https://docs.google.com/document/d/f2/edit", doc_file_id: "f2", generated_at: "2026-09-10T00:00:00.000Z" },
    ]);
    // The first entry's url/fileId survive the second generation untouched.
    expect((secondBody.doc_versions as { doc_url: string }[])[0].doc_url).toBe("https://docs.google.com/document/d/f1/edit");
  });

  it("renders a non-empty adjustment and keeps line_amount at quantity x unit price when the invoice carries an adjustment line", async () => {
    state.lines.push({ kind: "adjustment", label: "Remise fidélité", unit_price_chf: "-20.00", amount_chf: "-20.00" });
    state.invoice.adjustment_chf = "-20.00";
    state.invoice.total_chf = "60.00";

    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    const map = gateway.replaceText.mock.calls[0][1] as Record<string, string>;
    expect(map["{{adjustment_label}}"]).toBe("Remise fidélité");
    expect(map["{{adjustment_amount}}"]).toBe("CHF -20.00");
    expect(map["{{line_amount}}"]).toBe("CHF 80.00");
    expect(map["{{total_due}}"]).toBe("CHF 60.00");
  });
  it("throws mixed_unit_prices rather than printing a line that does not add up (Important 3)", async () => {
    // 12 leads at CHF 40 + 5 at CHF 60 = CHF 780, but a single aggregated line
    // taking leadLines[0] would print "17 | CHF 40.00 | CHF 680.00".
    state.lines = [
      ...Array.from({ length: 12 }, () => ({ kind: "lead", unit_price_chf: "40.00", amount_chf: "40.00" })),
      ...Array.from({ length: 5 }, () => ({ kind: "lead", unit_price_chf: "60.00", amount_chf: "60.00" })),
    ];
    state.invoice.subtotal_chf = "780.00";
    state.invoice.total_chf = "780.00";

    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");

    await expect(generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z")))
      .rejects.toThrow("mixed_unit_prices");
    // Nothing was copied and nothing was written: no half-made client document.
    expect(gateway.copyTemplate).not.toHaveBeenCalled();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("still generates when an adjustment line carries a different amount than the leads", async () => {
    // Only `lead` lines take part in the uniformity check — an adjustment has
    // no business being compared to a lead price.
    state.lines.push({ kind: "adjustment", label: "Remise", unit_price_chf: "-20.00", amount_chf: "-20.00" });
    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await expect(generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z")))
      .resolves.toMatchObject({ doc_file_id: "f1" });
  });

  it("generates for a manual lead line priced identically to the ledger leads", async () => {
    // kind "lead" + dispatch null (addManualLeadLine) is a normal lead for the
    // document's purposes — it counts towards the quantity.
    state.lines.push({ kind: "lead", unit_price_chf: "40.00", amount_chf: "40.00" });
    const gateway = fakeGateway({ fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" });
    const { generateInvoiceDocument } = await import("./google-docs");
    await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));
    const map = gateway.replaceText.mock.calls[0][1] as Record<string, string>;
    expect(map["{{line_quantity}}"]).toBe("3");
    expect(map["{{line_amount}}"]).toBe("CHF 120.00");
  });
});

describe("buildDocumentName", () => {
  it("uses the partner's language, falling back to English", async () => {
    const { buildDocumentName } = await import("./google-docs");
    expect(buildDocumentName("fr", "E-ME Énergies", "2026-07", "EME", 1))
      .toBe("Facture _ E-ME Énergies _ 2026-07 _ EME _ v1");
    expect(buildDocumentName("de", "Muster AG", "2026-07", "MUS", 2))
      .toBe("Rechnung _ Muster AG _ 2026-07 _ MUS _ v2");
    expect(buildDocumentName("en", "Acme", "2026-07", "ACM", 1))
      .toBe("Invoice _ Acme _ 2026-07 _ ACM _ v1");
    expect(buildDocumentName(null, "Acme", "2026-07", "ACM", 1))
      .toBe("Invoice _ Acme _ 2026-07 _ ACM _ v1");
  });
});
