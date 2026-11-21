import { describe, expect, it } from "vitest";
import page from "./__fixtures__/sparql-page.json";
import { buildCantonQuery, fetchCanton, parseBindings, type SparqlResponse } from "./sparql";
import { CANDIDATE_PATTERN } from "./candidates";

describe("buildCantonQuery", () => {
  it("filters on the canton and embeds the shared candidate pattern", () => {
    const q = buildCantonQuery("VD", 2000, 2000);
    expect(q).toContain('FILTER(?region = "VD")');
    expect(q).toContain("LIMIT 2000 OFFSET 2000");
    expect(q).toContain(CANDIDATE_PATTERN.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
  });

  it("rejects anything that is not a two-letter canton code", () => {
    expect(() => buildCantonQuery('VD" || true', 0)).toThrow(/Invalid canton/);
    expect(() => buildCantonQuery("vd", 0)).toThrow(/Invalid canton/);
  });
});

describe("parseBindings", () => {
  const rows = parseBindings(page.results.bindings);

  it("keeps one row per ehraid, first wins", () => {
    expect(rows.map((r) => r.ehraid)).toEqual(["15706", "128282"]);
    expect(rows[0].purpose).toContain("plâtrerie");
  });

  it("reads the identifiers, legal form and municipality from URI tails", () => {
    expect(rows[0]).toMatchObject({
      uid: "CHE107036057",
      chid: "CH55000774120",
      legalFormCode: "0106",
      bfsId: 5586,
      postalCode: "1004",
      canton: "VD",
    });
  });

  it("tolerates missing optional fields and skips rows without a purpose", () => {
    expect(rows[1].uid).toBeNull();
    expect(rows[1].street).toBeNull();
    expect(rows.find((r) => r.ehraid === "999")).toBeUndefined();
  });
});

describe("fetchCanton", () => {
  it("pages until a short page and dedupes across pages", async () => {
    const mk = (id: number) => ({
      s: { type: "uri", value: `https://register.ld.admin.ch/zefix/company/${id}` },
      legalName: { type: "literal", value: `Co ${id}` },
      purpose: { type: "literal", value: "installations électriques" },
      form: { type: "uri", value: "https://ld.admin.ch/ech/97/legalforms/0107" },
      region: { type: "literal", value: "VD" },
      locality: { type: "literal", value: "X" },
      muni: { type: "uri", value: "https://ld.admin.ch/municipality/1" },
    });
    const pages: SparqlResponse[] = [
      { results: { bindings: [mk(1), mk(2)] } },
      { results: { bindings: [mk(2), mk(3)] } },
      { results: { bindings: [mk(4)] } },
    ];
    const queries: string[] = [];
    const rows = await fetchCanton("VD", async (q) => {
      queries.push(q);
      return pages[queries.length - 1];
    }, { pageSize: 2 });
    expect(rows.map((r) => r.ehraid).sort()).toEqual(["1", "2", "3", "4"]);
    expect(queries).toHaveLength(3);
    expect(queries[1]).toContain("OFFSET 2");
  });
});
