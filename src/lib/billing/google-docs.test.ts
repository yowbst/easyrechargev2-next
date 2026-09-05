import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith("/items/partner_invoices/") && (init?.method ?? "GET") === "GET") {
      return { data: {
        id: "inv-1", number: "EME-202607", version: 1, period_month: "2026-07",
        period_start: "2026-07-01", period_end: "2026-07-31",
        issued_at: "2026-09-05T00:00:00.000Z", due_at: "2026-09-26T00:00:00.000Z",
        subtotal_chf: "680.00", adjustment_chf: "0.00", total_chf: "680.00",
        vat_rate: "0.00", vat_chf: "0.00", doc_versions: [],
        issuer_snapshot: { name: "easyRecharge", contact_name: "Yoan Basset",
          street: "Ch. de Sorécot 33", postal_code: "1033", locality: "Cheseaux/Lausanne" },
        debtor_snapshot: { name: "E-ME Énergies Sàrl", street: "Chemin de la Crétaux 4",
          postal_code: "1196", locality: "Gland", email: "jendoubi@emeenergies.ch" },
        partner: { dashboard_token: "tok-123" },
      } };
    }
    if (path.startsWith("/items/partner_invoice_lines")) {
      return { data: [
        { kind: "lead", amount_chf: "40.00", unit_price_chf: "40.00" },
        { kind: "lead", amount_chf: "40.00", unit_price_chf: "40.00" },
      ] };
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
    expect(map["{{line_amount}}"]).toBe("CHF 680.00");
    expect(map["{{total_due}}"]).toBe("CHF 680.00");
    expect(map["{{sent_to}}"]).toBe("jendoubi@emeenergies.ch");
    expect(map["{{dashboard_url}}"]).toBe("https://easyrecharge.ch/fr/partners/tok-123/invoices");
    // No French keys leak in.
    expect(Object.keys(map).some((k) => /numero|facture|montant/i.test(k))).toBe(false);
  });
});

describe("generateInvoiceDocument", () => {
  it("uses the injected gateway and bumps the version", async () => {
    const calls: string[] = [];
    const gateway = {
      copyTemplate: vi.fn(async (name: string) => { calls.push(`copy:${name}`); return { fileId: "f1", url: "https://docs.google.com/document/d/f1/edit" }; }),
      replaceText: vi.fn(async (fileId: string) => { calls.push(`replace:${fileId}`); }),
    };
    const { generateInvoiceDocument } = await import("./google-docs");
    const r = await generateInvoiceDocument("inv-1", gateway, new Date("2026-09-05T00:00:00Z"));

    expect(r.doc_file_id).toBe("f1");
    expect(r.version).toBe(1);
    expect(calls).toEqual(["copy:EME-202607 v1", "replace:f1"]);
    expect(gateway.replaceText).toHaveBeenCalledOnce();
  });
});
