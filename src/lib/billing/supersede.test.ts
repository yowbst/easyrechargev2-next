import { beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const state: { invoice: any } = { invoice: null };

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async () => ({ data: state.invoice })),
}));

function gateway(files: Record<string, string>, siblings: Record<string, string[]> = {}) {
  const renames: Array<[string, string]> = [];
  return {
    copyTemplate: vi.fn(),
    replaceText: vi.fn(),
    linkText: vi.fn(),
    dropRowsContaining: vi.fn(),
    getFileName: vi.fn(async (id: string) => files[id] ?? null),
    findSiblingsByNamePrefix: vi.fn(async (id: string) =>
      (siblings[id] ?? []).map((name, i) => ({ id: `${id}-s${i}`, name })),
    ),
    renameFile: vi.fn(async (id: string, name: string) => { renames.push([id, name]); }),
    renames,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => { state.invoice = null; vi.resetModules(); });

describe("markInvoiceDocumentsSuperseded", () => {
  it("marks the document and the exported PDF sitting beside it", async () => {
    state.invoice = { doc_file_id: "f1", doc_versions: [{ doc_file_id: "f1" }] };
    const gw = gateway(
      { f1: "Facture _ EME-202607 _ v1" },
      { f1: ["Facture _ EME-202607 _ v1", "Facture _ EME-202607 _ v1.pdf"] },
    );
    const { markInvoiceDocumentsSuperseded } = await import("./google-docs");
    const r = await markInvoiceDocumentsSuperseded("inv-1", gw);

    expect(r.renamed).toEqual([
      "ANNULÉE — Facture _ EME-202607 _ v1",
      "ANNULÉE — Facture _ EME-202607 _ v1.pdf",
    ]);
    // The PDF matters: it is the file that was actually sent.
    expect(gw.renames.map(([, n]: [string, string]) => n)).toContain(
      "ANNULÉE — Facture _ EME-202607 _ v1.pdf",
    );
  });

  it("marks every earlier version, not only the current document", async () => {
    state.invoice = {
      doc_file_id: "f2",
      doc_versions: [{ doc_file_id: "f1" }, { doc_file_id: "f2" }],
    };
    const gw = gateway({ f1: "Facture _ A _ v1", f2: "Facture _ A _ v2" });
    const { markInvoiceDocumentsSuperseded } = await import("./google-docs");
    const r = await markInvoiceDocumentsSuperseded("inv-1", gw);
    expect(r.renamed.sort()).toEqual(["ANNULÉE — Facture _ A _ v1", "ANNULÉE — Facture _ A _ v2"]);
  });

  it("is idempotent — a second cancel does not double the prefix", async () => {
    state.invoice = { doc_file_id: "f1", doc_versions: [] };
    const gw = gateway({ f1: "ANNULÉE — Facture _ A _ v1" });
    const { markInvoiceDocumentsSuperseded } = await import("./google-docs");
    const r = await markInvoiceDocumentsSuperseded("inv-1", gw);
    expect(r.renamed).toEqual([]);
    expect(r.skipped).toEqual(["ANNULÉE — Facture _ A _ v1"]);
    expect(gw.renameFile).not.toHaveBeenCalled();
  });

  it("skips a file that no longer exists in Drive", async () => {
    state.invoice = { doc_file_id: "gone", doc_versions: [] };
    const gw = gateway({});
    const { markInvoiceDocumentsSuperseded } = await import("./google-docs");
    const r = await markInvoiceDocumentsSuperseded("inv-1", gw);
    expect(r.renamed).toEqual([]);
    expect(r.skipped).toEqual(["gone"]);
  });

  it("does nothing when the invoice never had a document", async () => {
    state.invoice = { doc_file_id: null, doc_versions: [] };
    const gw = gateway({});
    const { markInvoiceDocumentsSuperseded } = await import("./google-docs");
    expect(await markInvoiceDocumentsSuperseded("inv-1", gw)).toEqual({ renamed: [], skipped: [] });
  });
});
