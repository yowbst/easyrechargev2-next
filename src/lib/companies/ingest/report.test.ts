import { describe, expect, it } from "vitest";
import { buildReport } from "./report";
import type { CmsCompany } from "./types";

const r = (over: Record<string, unknown>) =>
  ({ id: "x", ehraid: "x", status: "draft", canton: "VD", classification: "other", classification_override: null, partner: null, register_gone_at: null, ...over }) as CmsCompany;

describe("buildReport", () => {
  const rows = [
    r({ classification: "installer", status: "published", partner: "p" }),
    r({ classification: "other", classification_override: "installer", enrichment_status: "done", prospect_status: "contacted" }),
    r({ canton: "ZH", classification: "installer" }),
    r({ status: "archived", register_gone_at: "2026-10-01T00:00:00" }),
  ];

  it("counts per canton with overrides, partners and gone rows apart", () => {
    const report = buildReport(rows);
    const vd = report.find((c) => c.canton === "VD")!;
    expect(vd).toMatchObject({ rows: 2, installers: 2, published: 1, partners: 1, enriched: 1, gone: 1 });
    expect(vd.prospects).toEqual({ none: 1, contacted: 1 });
  });

  it("filters by canton and sorts by installers", () => {
    expect(buildReport(rows, ["ZH"]).map((c) => c.canton)).toEqual(["ZH"]);
    expect(buildReport(rows).map((c) => c.canton)).toEqual(["VD", "ZH"]);
  });
});
