import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { unsettled: [] as string[], existing: [] as unknown[], patched: [] as string[] };

vi.mock("@/lib/dispatch/queries", () => ({
  fetchDispatchConfig: vi.fn(async () => ({
    billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
  })),
}));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));
vi.mock("./scope", () => ({
  collectBillableDispatches: vi.fn(async () => ({
    lines: [{
      dispatchId: "d1", label: "P / PAPEIL / 1052 Le Mont / 2026-07-04",
      dispatchedAt: "2026-07-04T09:00:00.000Z", canton: "VD", postalCode: "1052",
      locality: "Le Mont", lastName: "Papeil", leadCategory: "owner_solar",
      product: "ecp", unitPriceChf: 40,
    }],
    subtotalChf: 40, unsettled: state.unsettled, excluded: [],
  })),
}));
vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path.startsWith("/items/partners")) {
      return { data: [{ id: "p1", slug: "eme-energies", invoice_code: "EME", name: "E-ME Énergies",
        business_name: "E-ME Énergies Sàrl", uid: "CHE-109.517.385", street_name: "Chemin de la Crétaux",
        street_number: "4", postal_code: "1196", locality: "Gland", notification_email: "jendoubi@emeenergies.ch" }] };
    }
    if (path.startsWith("/items/site_settings")) {
      return { data: { global_config: {
        invoicing: { payment_terms_days: 21 },
        company: { name: "easyRecharge", contact_name: "Yoan Basset", street: "Ch. de Sorécot 33",
          postal_code: "1033", locality: "Cheseaux/Lausanne", country: "CH", email: "yoan@easyrecharge.ch" },
      } } };
    }
    if (path.startsWith("/items/partner_invoices") && method === "GET") return { data: state.existing };
    if (path.startsWith("/items/partner_invoices") && method === "POST") return { data: { id: "inv-1" } };
    if (path.startsWith("/items/partner_invoice_lines")) return { data: {} };
    if (path.startsWith("/items/partner_dispatches/") && method === "PATCH") {
      state.patched.push(path.split("/").pop()!.split("?")[0]);
      return { data: {} };
    }
    return { data: [] };
  }),
}));

describe("previewInvoice", () => {
  beforeEach(() => { state.unsettled = []; state.existing = []; state.patched = []; vi.resetModules(); });

  it("reports the number, period and totals without writing", async () => {
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", new Date("2026-09-05T00:00:00Z"));
    expect(p.number).toBe("EME-202607");
    expect(p.period.issuableFrom).toBe("2026-08-16");
    expect(p.issuable).toBe(true);
    expect(p.totalChf).toBe(40);
  });

  it("reports not-issuable before the window closes", async () => {
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", new Date("2026-08-01T00:00:00Z"));
    expect(p.issuable).toBe(false);
  });
});

describe("issueInvoice", () => {
  beforeEach(() => { state.unsettled = []; state.existing = []; state.patched = []; vi.resetModules(); });

  it("refuses before the period is issuable", async () => {
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-08-01T00:00:00Z") }))
      .rejects.toThrow("period_not_issuable");
  });

  it("refuses while dispatches are unsettled", async () => {
    state.unsettled = ["d9"];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") }))
      .rejects.toThrow("unsettled_dispatches");
  });

  it("refuses to issue an existing number twice", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607" }];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") }))
      .rejects.toThrow("duplicate_number");
  });

  it("still refuses when the existing invoice for the period is live (sent)", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607", status: "sent" }];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") }))
      .rejects.toThrow("duplicate_number");
  });

  it("re-issues as -R2 when the only existing invoice for the period is cancelled", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607", status: "cancelled" }];
    const { issueInvoice } = await import("./invoice");
    const r = await issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") });
    expect(r.number).toBe("EME-202607-R2");
  });

  it("creates the invoice and stamps the dispatches", async () => {
    const { issueInvoice } = await import("./invoice");
    const r = await issueInvoice("eme-energies", "2026-07", { now: new Date("2026-09-05T00:00:00Z") });
    expect(r).toEqual({ id: "inv-1", number: "EME-202607", total_chf: 40 });
    expect(state.patched).toEqual(["d1"]);
  });
});
