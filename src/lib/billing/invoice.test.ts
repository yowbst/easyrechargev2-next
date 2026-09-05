import { beforeEach, describe, expect, it, vi } from "vitest";

interface InvoiceRow { id: string; number: string; status: string; events?: unknown[] }

const state = {
  unsettled: [] as string[],
  existing: [] as InvoiceRow[],
  /** dispatch id -> the invoice it is stamped with, or null when free. */
  stamps: {} as Record<string, string | null>,
  patched: [] as string[],
  nextInvoiceId: 1,
};

/** The three-lead July fixture, priced at CHF 40 each. */
function line(id: string) {
  return {
    dispatchId: id, label: `P / LEAD-${id} / 1052 Le Mont / 2026-07-04`,
    dispatchedAt: "2026-07-04T09:00:00.000Z", canton: "VD", postalCode: "1052",
    locality: "Le Mont", lastName: "Papeil", leadCategory: "owner_solar",
    product: "ecp", unitPriceChf: 40,
  };
}

vi.mock("@/lib/dispatch/queries", () => ({
  fetchDispatchConfig: vi.fn(async () => ({
    billing: { currency: "CHF", acceptance_window_days: 15, dedup_window_days: 30 },
  })),
}));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "production" }));

// The scope mock honours the invoice stamp, exactly as the real
// collectBillableDispatches does (scope.ts excludes any row whose `invoice` is
// non-null as "already_invoiced"). A mock that ignored the stamp would mask
// Critical 1 — it is what let the -R2 re-issue test pass against code that
// never released anything.
vi.mock("./scope", () => ({
  collectBillableDispatches: vi.fn(async () => {
    const free = Object.entries(state.stamps).filter(([, inv]) => inv === null);
    const taken = Object.entries(state.stamps).filter(([, inv]) => inv !== null);
    const lines = free.map(([id]) => line(id));
    return {
      lines,
      subtotalChf: Number(lines.reduce((s, l) => s + l.unitPriceChf, 0).toFixed(2)),
      unsettled: state.unsettled,
      excluded: taken.map(([id]) => ({ id, reason: "already_invoiced" })),
    };
  }),
}));

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

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
    // Single invoice by id (fetchInvoiceState) — note the trailing slash.
    if (path.startsWith("/items/partner_invoices/") && method === "GET") {
      const id = path.slice("/items/partner_invoices/".length).split("?")[0];
      const row = state.existing.find((i) => i.id === id);
      return { data: row ? { ...row, events: row.events ?? [], subtotal_chf: 40, adjustment_chf: 0 } : null };
    }
    if (path.startsWith("/items/partner_invoices/") && method === "PATCH") {
      const id = path.slice("/items/partner_invoices/".length).split("?")[0];
      const row = state.existing.find((i) => i.id === id);
      if (row && body?.status) row.status = body.status as string;
      return { data: {} };
    }
    if (path.startsWith("/items/partner_invoices") && method === "GET") {
      return { data: state.existing };
    }
    if (path.startsWith("/items/partner_invoices") && method === "POST") {
      const row = { id: `inv-${state.nextInvoiceId++}`, number: body!.number as string, status: "issued" };
      state.existing.push(row);
      return { data: { id: row.id } };
    }
    if (path.startsWith("/items/partner_invoice_lines")) return { data: [] };
    // Bulk release: { keys, data: { invoice: null } }
    if (path === "/items/partner_dispatches" && method === "PATCH") {
      for (const id of (body!.keys ?? []) as string[]) {
        state.stamps[id] = (body!.data as { invoice: string | null }).invoice;
      }
      return { data: {} };
    }
    if (path.startsWith("/items/partner_dispatches?") && method === "GET") {
      const m = /filter\[invoice\]\[_eq\]=([^&]+)/.exec(decodeURIComponent(path));
      const invoiceId = m?.[1];
      return { data: Object.entries(state.stamps)
        .filter(([, inv]) => inv === invoiceId)
        .map(([id]) => ({ id })) };
    }
    if (path.startsWith("/items/partner_dispatches/") && method === "PATCH") {
      const id = path.split("/").pop()!.split("?")[0];
      state.patched.push(id);
      state.stamps[id] = (body as { invoice: string }).invoice;
      return { data: {} };
    }
    return { data: [] };
  }),
}));

function reset(stamps: Record<string, string | null> = { d1: null }) {
  state.unsettled = [];
  state.existing = [];
  state.stamps = { ...stamps };
  state.patched = [];
  state.nextInvoiceId = 1;
  vi.resetModules();
}

const NOW = new Date("2026-09-05T00:00:00Z");

describe("previewInvoice", () => {
  beforeEach(() => reset());

  it("reports the number, period and totals without writing", async () => {
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", NOW);
    expect(p.number).toBe("EME-202607");
    expect(p.issuanceRank).toBe(1);
    expect(p.existingLiveInvoice).toBeNull();
    expect(p.period.issuableFrom).toBe("2026-08-16");
    expect(p.issuable).toBe(true);
    expect(p.totalChf).toBe(40);
  });

  it("reports not-issuable before the window closes", async () => {
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", new Date("2026-08-01T00:00:00Z"));
    expect(p.issuable).toBe(false);
  });

  it("shows the -R2 number issuance would actually mint after a cancellation (Important 5)", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607", status: "cancelled" }];
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", NOW);
    expect(p.number).toBe("EME-202607-R2");
    expect(p.issuanceRank).toBe(2);
    expect(p.existingLiveInvoice).toBeNull();
  });

  it("reports the live invoice that would make issuance refuse", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607", status: "sent" }];
    const { previewInvoice } = await import("./invoice");
    const p = await previewInvoice("eme-energies", "2026-07", NOW);
    expect(p.existingLiveInvoice).toEqual({ id: "inv-0", number: "EME-202607", status: "sent" });
  });

  it("rejects a malformed month before ever fetching the partner", async () => {
    const { previewInvoice } = await import("./invoice");
    const { directusFetch } = await import("@/lib/directus");
    // fetchPartner is the only thing in this module that calls directusFetch
    // directly — clear prior calls from earlier tests so this assertion
    // reflects only this call.
    vi.mocked(directusFetch).mockClear();
    await expect(previewInvoice("eme-energies", "not-a-month")).rejects.toThrow("invalid_month");
    expect(vi.mocked(directusFetch)).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range month number before ever fetching the partner", async () => {
    const { previewInvoice } = await import("./invoice");
    const { directusFetch } = await import("@/lib/directus");
    vi.mocked(directusFetch).mockClear();
    await expect(previewInvoice("eme-energies", "2026-13")).rejects.toThrow("invalid_month");
    expect(vi.mocked(directusFetch)).not.toHaveBeenCalled();
  });
});

describe("issueInvoice", () => {
  beforeEach(() => reset());

  it("refuses before the period is issuable", async () => {
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: new Date("2026-08-01T00:00:00Z") }))
      .rejects.toThrow("period_not_issuable");
  });

  it("refuses while dispatches are unsettled", async () => {
    state.unsettled = ["d9"];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: NOW }))
      .rejects.toThrow("unsettled_dispatches");
  });

  it("refuses to issue an existing number twice", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607", status: "issued" }];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: NOW }))
      .rejects.toThrow("duplicate_number");
  });

  it("still refuses when the existing invoice for the period is live (sent)", async () => {
    state.existing = [{ id: "inv-0", number: "EME-202607", status: "sent" }];
    const { issueInvoice } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: NOW }))
      .rejects.toThrow("duplicate_number");
  });

  it("creates the invoice and stamps the dispatches", async () => {
    const { issueInvoice } = await import("./invoice");
    const r = await issueInvoice("eme-energies", "2026-07", { now: NOW });
    expect(r).toEqual({ id: "inv-1", number: "EME-202607", total_chf: 40 });
    expect(state.patched).toEqual(["d1"]);
    expect(state.stamps.d1).toBe("inv-1");
  });

  it("throws invoice_create_failed when the POST returns no id, instead of writing orphan lines (Minor 7)", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const real = vi.mocked(directusFetch).getMockImplementation()!;
    vi.mocked(directusFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/items/partner_invoices") && (init?.method ?? "GET") === "POST") {
        return { data: {} } as never; // unexpected shape: no id
      }
      return real(path, init) as never;
    });
    try {
      const { issueInvoice } = await import("./invoice");
      await expect(issueInvoice("eme-energies", "2026-07", { now: NOW }))
        .rejects.toThrow("invoice_create_failed");
      expect(state.patched).toEqual([]);
    } finally {
      vi.mocked(directusFetch).mockImplementation(real);
    }
  });

  it("rejects a malformed month before ever fetching the partner", async () => {
    const { issueInvoice } = await import("./invoice");
    const { directusFetch } = await import("@/lib/directus");
    // fetchPartner/fetchCompany are the only things here that call directusFetch
    // directly — clear prior calls from earlier tests so this assertion
    // reflects only this call.
    vi.mocked(directusFetch).mockClear();
    await expect(
      issueInvoice("eme-energies", "not-a-month", { now: NOW }),
    ).rejects.toThrow("invalid_month");
    expect(vi.mocked(directusFetch)).not.toHaveBeenCalled();
  });
});

/**
 * The stamp/release cycle end to end — the regression Critical 1 describes.
 * These exercise the real interaction between the invoice stamp and the scope,
 * so they fail against code where cancellation does not release.
 */
describe("issue -> cancel -> re-issue", () => {
  beforeEach(() => reset({ d1: null, d2: null, d3: null }));

  it("re-issues the FULL scope as -R2 after a cancellation", async () => {
    const { issueInvoice, setInvoiceStatus } = await import("./invoice");

    const first = await issueInvoice("eme-energies", "2026-07", { now: NOW });
    expect(first.number).toBe("EME-202607");
    expect(first.total_chf).toBe(120);
    expect(Object.values(state.stamps)).toEqual(["inv-1", "inv-1", "inv-1"]);

    await setInvoiceStatus("inv-1", "cancelled", "wrong scope");
    // The leads are free again — this is the assertion the old ./scope mock
    // could not make, and the reason the bug survived.
    expect(Object.values(state.stamps)).toEqual([null, null, null]);

    const second = await issueInvoice("eme-energies", "2026-07", { now: NOW });
    expect(second.number).toBe("EME-202607-R2");
    // All three leads are billed again — not empty_scope, not a short invoice.
    expect(second.total_chf).toBe(120);
    expect(Object.values(state.stamps)).toEqual(["inv-2", "inv-2", "inv-2"]);
  });

  it("recovers the full amount after a PARTIAL write failure, via cancel-then-reissue", async () => {
    const { directusFetch } = await import("@/lib/directus");
    const real = vi.mocked(directusFetch).getMockImplementation()!;
    let stampedSoFar = 0;
    vi.mocked(directusFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/items/partner_dispatches/") && init?.method === "PATCH") {
        stampedSoFar += 1;
        if (stampedSoFar > 2) throw new Error("Directus 502: gateway");
      }
      return real(path, init) as never;
    });

    const { issueInvoice, setInvoiceStatus } = await import("./invoice");
    await expect(issueInvoice("eme-energies", "2026-07", { now: NOW })).rejects.toThrow("502");
    // Two of three leads stamped: the half-written state the loop's own
    // comment prescribes cancel-then-reissue for.
    expect(Object.values(state.stamps).filter(Boolean)).toHaveLength(2);

    vi.mocked(directusFetch).mockImplementation(real);
    await setInvoiceStatus("inv-1", "cancelled", "partial write");

    const retry = await issueInvoice("eme-energies", "2026-07", { now: NOW });
    expect(retry.number).toBe("EME-202607-R2");
    // CHF 120, not CHF 40 — no lead is lost.
    expect(retry.total_chf).toBe(120);
  });
});
