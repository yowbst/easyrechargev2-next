import { describe, expect, it } from "vitest";
import { assertPlanSane, buildCompanyPlan, sameValue, summarize } from "./diff";
import type { ClassifiedCompany, CmsCompany } from "./types";

const NOW = "2026-11-20T10:00:00.000Z";

function company(over: Partial<ClassifiedCompany> = {}): ClassifiedCompany {
  return {
    ehraid: "1",
    uid: "CHE111111111",
    chid: "CH1",
    register_url: "https://register.ld.admin.ch/zefix/company/1",
    legal_name: "Dupont Electricité Sàrl",
    purpose_text: "installations électriques",
    purpose_hash: "h1",
    legal_form_code: "0107",
    legal_form_kind: "llc",
    in_liquidation: false,
    installation_evidence: "explicit",
    street_address: "Rue 1",
    postal_code: "1003",
    locality: "Lausanne",
    canton: "VD",
    bfs_id: 5586,
    lat: 46.5,
    lng: 6.6,
    geo_source: "postcode_centroid",
    classification: "installer",
    classification_confidence: 0.9,
    classification_reason: "installe",
    classification_model: "m",
    classified_at: "2026-11-01T00:00:00.000Z",
    classified_purpose_hash: "h1",
    ...over,
  };
}

/** A CMS row exactly as the pipeline would have stored `c`, with Directus-style string decimals. */
function stored(c: ClassifiedCompany, over: Partial<CmsCompany> = {}): CmsCompany {
  return {
    id: `cms-${c.ehraid}`,
    status: "published",
    partner: null,
    classification_override: null,
    do_not_display: false,
    register_gone_at: null,
    ...c,
    lat: String(c.lat),
    lng: String(c.lng),
    classification_confidence: "0.90",
    classified_at: "2026-11-01T00:00:00",
    register_seen_at: "2026-11-01T00:00:00",
    pipeline_updated_at: "2026-11-01T00:00:00",
    ...over,
  } as CmsCompany;
}

describe("sameValue", () => {
  it("treats null, undefined and empty string alike", () => {
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue("", null)).toBe(true);
    expect(sameValue(null, "x")).toBe(false);
  });

  it("compares numbers with Directus numeric strings", () => {
    expect(sameValue("46.585354", 46.585354)).toBe(true);
    expect(sameValue("0.90", 0.9)).toBe(true);
    expect(sameValue("0.80", 0.9)).toBe(false);
  });

  it("does not coerce a non-numeric string to a number", () => {
    expect(sameValue("abc", 0)).toBe(false);
    expect(sameValue("1033", "1033")).toBe(true);
  });
});

describe("buildCompanyPlan", () => {
  it("CREATEs a new company with a computed status and first-seen stamps", () => {
    const plan = buildCompanyPlan([company()], [], { now: NOW });
    const [e] = plan.entries;
    expect(e.bucket).toBe("CREATE");
    expect(e.statusFlip).toBe("PUBLISH");
    expect(e.payload).toMatchObject({
      ehraid: "1",
      status: "published",
      register_first_seen_at: NOW,
      register_gone_at: null,
      partner: null,
    });
  });

  it("creates a low-confidence classification as a draft", () => {
    const plan = buildCompanyPlan([company({ classification_confidence: 0.5 })], [], { now: NOW });
    expect(plan.entries[0].payload?.status).toBe("draft");
    expect(plan.entries[0].statusFlip).toBeUndefined();
  });

  it("reports UNCHANGED when only Directus formatting differs", () => {
    const c = company();
    const plan = buildCompanyPlan([c], [stored(c)], { now: NOW });
    expect(plan.entries[0].bucket).toBe("UNCHANGED");
    expect(plan.entries[0].changes).toEqual({});
  });

  it("UPDATEs on a real change and refreshes the stamps with it", () => {
    const c = company({ street_address: "Rue 2" });
    const plan = buildCompanyPlan([c], [stored(company())], { now: NOW });
    const [e] = plan.entries;
    expect(e.bucket).toBe("UPDATE");
    expect(e.changes.street_address).toEqual({ from: "Rue 1", to: "Rue 2" });
    expect(e.changes.pipeline_updated_at.to).toBe(NOW);
    expect(e.changes.status).toBeUndefined();
  });

  it("never writes human-owned fields", () => {
    const c = company({ street_address: "Rue 2" });
    const plan = buildCompanyPlan([c], [stored(company(), { notes: "call Monday" })], { now: NOW });
    const keys = Object.keys(plan.entries[0].changes);
    for (const human of ["do_not_display", "classification_override", "display_name", "notes", "prospect_status", "assigned_to"]) {
      expect(keys).not.toContain(human);
    }
  });

  it("unpublishes when a company enters liquidation", () => {
    const c = company({ in_liquidation: true, legal_name: "Dupont Electricité Sàrl en liquidation" });
    const plan = buildCompanyPlan([c], [stored(company())], { now: NOW });
    expect(plan.entries[0].statusFlip).toBe("UNPUBLISH");
    expect(plan.entries[0].changes.status).toEqual({ from: "published", to: "draft" });
  });

  it("keeps a human override in force when the model disagrees", () => {
    const c = company({ classification: "other", classification_confidence: 0.3, classified_purpose_hash: "h2", purpose_hash: "h2" });
    const plan = buildCompanyPlan([c], [stored(company(), { classification_override: "installer" })], { now: NOW });
    expect(plan.entries[0].changes.status).toBeUndefined();
    expect(plan.entries[0].changes.classification).toEqual({ from: "installer", to: "other" });
  });

  it("respects do_not_display", () => {
    const c = company({ street_address: "Rue 2" });
    const plan = buildCompanyPlan([c], [stored(company(), { status: "draft", do_not_display: true })], { now: NOW });
    expect(plan.entries[0].changes.status).toBeUndefined();
  });

  it("links a production partner by UID and stamps the link date", () => {
    const plan = buildCompanyPlan([company()], [stored(company())], {
      now: NOW,
      partnerByUid: new Map([["CHE111111111", "partner-1"]]),
    });
    const [e] = plan.entries;
    expect(e.bucket).toBe("UPDATE");
    expect(e.changes.partner).toEqual({ from: null, to: "partner-1" });
    expect(e.changes.partner_linked_at.to).toBe(NOW);
  });

  it("marks a row GONE when it is no longer a candidate", () => {
    const plan = buildCompanyPlan([], [stored(company())], { now: NOW });
    const [e] = plan.entries;
    expect(e.bucket).toBe("GONE");
    expect(e.statusFlip).toBe("UNPUBLISH");
    expect(e.changes.status.to).toBe("archived");
    expect(e.changes.register_gone_at.to).toBe(NOW);
    expect(plan.cmsCount).toBe(1);
  });

  it("ignores rows that are already gone", () => {
    const gone = stored(company(), { status: "archived", register_gone_at: "2026-10-01T00:00:00" });
    const plan = buildCompanyPlan([], [gone], { now: NOW });
    expect(plan.entries).toHaveLength(0);
    expect(plan.cmsCount).toBe(0);
  });

  it("REAPPEARED clears the gone stamp and comes back as a draft, never published", () => {
    const gone = stored(company(), { status: "archived", register_gone_at: "2026-10-01T00:00:00" });
    const plan = buildCompanyPlan([company()], [gone], { now: NOW });
    const [e] = plan.entries;
    expect(e.bucket).toBe("REAPPEARED");
    expect(e.changes.status.to).toBe("draft");
    expect(e.changes.register_gone_at.to).toBeNull();
  });

  it("judges GONE only inside the scope cantons", () => {
    const vd = stored(company({ ehraid: "1", canton: "VD" }));
    const zh = stored(company({ ehraid: "2", canton: "ZH" }));
    const plan = buildCompanyPlan([], [vd, zh], { now: NOW, scopeCantons: ["VD"] });
    expect(plan.entries.map((e) => e.ehraid)).toEqual(["1"]);
    expect(plan.cmsCount).toBe(1);
    expect(plan.scopeCantons).toEqual(["VD"]);
  });
});

describe("summarize", () => {
  it("counts buckets, flips, creates by canton and classification", () => {
    const plan = buildCompanyPlan(
      [
        company({ ehraid: "1", canton: "VD" }),
        company({ ehraid: "2", canton: "ZH", classification: "other" }),
      ],
      [stored(company({ ehraid: "3" }))],
      { now: NOW },
    );
    const s = summarize(plan);
    expect(s.buckets).toMatchObject({ CREATE: 2, GONE: 1 });
    expect(s.publish).toBe(1);
    expect(s.unpublish).toBe(1);
    expect(s.createsByCanton).toEqual({ VD: 1, ZH: 1 });
    expect(s.classification).toEqual({ installer: 1, other: 1 });
  });
});

describe("assertPlanSane", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => company({ ehraid: String(i + 1) }));

  it("accepts a first import into an empty CMS", () => {
    expect(() => assertPlanSane(buildCompanyPlan(many(50), [], { now: NOW }))).not.toThrow();
  });

  it("refuses when every CREATE is unclassified", () => {
    const rows = many(3).map((c) => ({ ...c, classification: "unclassified" as const }));
    expect(() => assertPlanSane(buildCompanyPlan(rows, [], { now: NOW }))).toThrow(/unclassified/);
  });

  it("refuses a candidate count far below the live row count", () => {
    const cms = many(100).map((c) => stored(c));
    const plan = buildCompanyPlan(many(40), cms, { now: NOW });
    expect(() => assertPlanSane(plan)).toThrow(/candidates against 100/);
    expect(() => assertPlanSane(plan, { partial: true, maxChangeRatio: 5 })).not.toThrow();
  });

  it("does not apply the candidate floor when the run is scoped to cantons", () => {
    const cms = many(100).map((c) => stored(c));
    const plan = buildCompanyPlan(many(40), cms, { now: NOW, scopeCantons: ["VD"] });
    expect(() => assertPlanSane(plan)).not.toThrow();
  });

  it("refuses a change ratio above the ceiling and honours an explicit override", () => {
    const cms = many(10).map((c) => stored(c));
    const changed = many(10).map((c) => ({ ...c, street_address: "Elsewhere" }));
    const plan = buildCompanyPlan(changed, cms, { now: NOW });
    expect(() => assertPlanSane(plan)).toThrow(/change ratio 100%/);
    expect(() => assertPlanSane(plan, { maxChangeRatio: 1.5 })).not.toThrow();
  });

  it("refuses a NaN ceiling instead of silently disarming it", () => {
    expect(() => assertPlanSane(buildCompanyPlan(many(2), [], { now: NOW }), { maxChangeRatio: NaN })).toThrow(/finite/);
  });
});
