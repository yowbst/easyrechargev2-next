import { describe, expect, it, vi } from "vitest";
import { appendNote, buildCompanyFilter, listCompanies, updateCompanyProspect } from "./companies";

describe("buildCompanyFilter", () => {
  it("hides gone and liquidated companies by default", () => {
    const f = buildCompanyFilter({}) as { _and: unknown[] };
    expect(JSON.stringify(f)).toContain("register_gone_at");
    expect(JSON.stringify(f)).toContain('"in_liquidation":{"_eq":false}');
  });

  it("can include them", () => {
    expect(JSON.stringify(buildCompanyFilter({ include_gone: true, include_liquidation: true }))).toBe('{"_and":[]}');
  });

  it("filters on the effective classification: override first, then the model", () => {
    const s = JSON.stringify(buildCompanyFilter({ classification: "installer", include_gone: true, include_liquidation: true }));
    expect(s).toContain('{"classification_override":{"_eq":"installer"}}');
    expect(s).toContain('{"classification_override":{"_null":true}}');
    expect(s).toContain('{"classification":{"_eq":"installer"}}');
  });

  it("upper-cases the canton and maps has_partner to a null test", () => {
    const base = { include_gone: true, include_liquidation: true };
    expect(JSON.stringify(buildCompanyFilter({ ...base, canton: "zh" }))).toContain('"canton":{"_eq":"ZH"}');
    expect(JSON.stringify(buildCompanyFilter({ ...base, has_partner: false }))).toContain('"partner":{"_null":true}');
    expect(JSON.stringify(buildCompanyFilter({ ...base, has_partner: true }))).toContain('"partner":{"_null":false}');
  });
});

describe("appendNote", () => {
  it("starts notes and appends without losing earlier ones", () => {
    expect(appendNote(null, "called", "2026-11-20")).toBe("2026-11-20: called");
    expect(appendNote("2026-11-01: first", " second ", "2026-11-20")).toBe("2026-11-01: first\n2026-11-20: second");
  });
});

describe("listCompanies", () => {
  it("returns the effective classification, a formatted UID and no raw purpose text", async () => {
    const fetcher = vi.fn(async () => ({
      data: [
        {
          ehraid: "1", legal_name: "Müller AG", display_name: null, legal_form_kind: "corporation",
          street_address: "Bahnhofstr. 1", postal_code: "8001", locality: "Zürich", canton: "ZH",
          uid: "CHE107036057", classification: "other", classification_override: "installer",
          classification_confidence: "0.40", partner: null, phone: "+41 44 000 00 00",
          contact_person_name: "A. Müller", contact_person_role: "GL", prospect_status: "none",
          purpose_text: "SHOULD NOT LEAK",
        },
      ],
      meta: { filter_count: 123 },
    }));
    const r = await listCompanies({ canton: "ZH", limit: 10 }, fetcher as never);
    expect(r.total).toBe(123);
    expect(r.companies[0]).toMatchObject({
      name: "Müller AG",
      address: "Bahnhofstr. 1, 8001 Zürich",
      uid: "CHE-107.036.057",
      classification: "installer",
      classificationConfidence: 0.4,
      isPartner: false,
      contact: { phone: "+41 44 000 00 00", person: "A. Müller, GL" },
    });
    expect(JSON.stringify(r)).not.toContain("SHOULD NOT LEAK");
    const url = decodeURIComponent((fetcher.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("limit=10");
    expect(url).not.toContain("purpose_text");
  });
});

describe("updateCompanyProspect", () => {
  const found = (notes: string | null) =>
    vi.fn(async (path: string) => (path.includes("filter") ? { data: [{ id: "uuid-1", notes, legal_name: "Müller AG" }] } : undefined));

  it("patches only the prospect fields, appending the note", async () => {
    const fetcher = found("2026-11-01: first");
    const r = await updateCompanyProspect(
      { ehraid: "1", prospect_status: "contacted", last_contacted_at: "2026-11-20", note: "left voicemail" },
      { fetcher: fetcher as never, today: "2026-11-20" },
    );
    const [path, init] = fetcher.mock.calls[1] as unknown as [string, { method: string; body: string; retry: boolean }];
    expect(path).toBe("/items/companies/uuid-1");
    expect(init.method).toBe("PATCH");
    expect(init.retry).toBe(false);
    expect(JSON.parse(init.body)).toEqual({
      prospect_status: "contacted",
      last_contacted_at: "2026-11-20",
      notes: "2026-11-01: first\n2026-11-20: left voicemail",
    });
    expect(r.updated).toEqual(["prospect_status", "last_contacted_at", "notes"]);
  });

  it("refuses an unknown company and an empty update", async () => {
    const none = vi.fn(async () => ({ data: [] }));
    await expect(updateCompanyProspect({ ehraid: "9", note: "x" }, { fetcher: none as never })).rejects.toThrow(/No company/);
    await expect(updateCompanyProspect({ ehraid: "1" }, { fetcher: found(null) as never })).rejects.toThrow(/Nothing to update/);
  });
});
