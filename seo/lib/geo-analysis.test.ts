import { describe, expect, it } from "vitest";
import { analyzePageGeo, type GeoConfig } from "./geo-analysis";
import { authorsOf, flattenNodes } from "./jsonld";

const cfg: GeoConfig = { freshnessThresholdDays: 90, targetCitationsPerWords: 200, questionHeadingTargetPct: 50 };
const NOW = new Date("2026-11-15T00:00:00Z");

/** The shape the site emits: one @graph block, author inline as a Person. */
function page(graph: unknown[]): string {
  return `<html><head><title>Guide</title>
    <meta name="description" content="Un guide complet pour choisir et installer une borne de recharge à domicile en Suisse.">
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
    </head><body><main><h1>Guide</h1>
    <h2>Combien coûte une borne ?</h2><p>Une borne coûte entre 1 000 et 3 000 CHF selon la puissance. Elle se pose en un jour.</p>
    </main></body></html>`;
}

const blogPosting = {
  "@type": "BlogPosting",
  headline: "Guide",
  datePublished: "2026-09-01",
  dateModified: "2026-11-01",
  author: { "@type": "Person", name: "Yoan Basset" },
};
const faq = { "@type": "FAQPage", mainEntity: [] };

describe("analyzePageGeo on a @graph page", () => {
  it("finds schema types, author and FAQ that live inside @graph", () => {
    const { scorecard, issues } = analyzePageGeo("https://x.ch/post", page([blogPosting, faq]), cfg, NOW);
    expect(scorecard.schema_types).toContain("BlogPosting");
    expect(scorecard.schema_types).toContain("FAQPage");
    expect(scorecard.has_author).toBe("yes");
    expect(scorecard.has_faq).toBe("yes");
    const types = issues.map((i) => i.issue_type);
    expect(types).not.toContain("geo_no_schema");
    expect(types).not.toContain("geo_no_author");
    expect(types).not.toContain("geo_no_faq");
  });

  it("still reports a page with no JSON-LD at all", () => {
    const { issues, scorecard } = analyzePageGeo("https://x.ch/bare", "<html><body><p>hi</p></body></html>", cfg, NOW);
    expect(issues.map((i) => i.issue_type)).toEqual(expect.arrayContaining(["geo_no_schema", "geo_no_faq"]));
    expect(scorecard.schema_types).toBe("");
  });

  it("flags a missing author on an article but not on a non-article page", () => {
    const noAuthor = { ...blogPosting, author: undefined };
    const article = analyzePageGeo("https://x.ch/post", page([noAuthor]), cfg, NOW);
    expect(article.issues.map((i) => i.issue_type)).toContain("geo_no_author");

    const home = analyzePageGeo("https://x.ch/fr", page([{ "@type": "Organization", name: "easyRecharge" }]), cfg, NOW);
    expect(home.issues.map((i) => i.issue_type)).not.toContain("geo_no_author");
  });

  it("computes content age from dateModified", () => {
    const { scorecard } = analyzePageGeo("https://x.ch/post", page([blogPosting]), cfg, NOW);
    expect(scorecard.content_age_days).toBe("14");
  });

  it("flags an Organization author as not a Person", () => {
    const org = { ...blogPosting, author: { "@type": "Organization", name: "easyRecharge" } };
    const { issues } = analyzePageGeo("https://x.ch/post", page([org]), cfg, NOW);
    expect(issues.map((i) => i.issue_type)).toContain("geo_author_not_person");
  });
});

describe("jsonld helpers", () => {
  it("flattens @graph, arrays and plain objects", () => {
    expect(flattenNodes({ "@graph": [{ "@type": "A" }, { "@type": "B" }] })).toHaveLength(2);
    expect(flattenNodes([{ "@type": "A" }, { "@graph": [{ "@type": "B" }] }])).toHaveLength(2);
    expect(flattenNodes({ "@type": "A" })).toHaveLength(1);
    expect(flattenNodes("nope")).toEqual([]);
  });

  it("resolves an author given as an @id reference", () => {
    const person = { "@id": "https://x.ch/#yoan", "@type": "Person", name: "Yoan" };
    const article = { "@type": "BlogPosting", author: { "@id": "https://x.ch/#yoan" } };
    expect(authorsOf(article, [person, article])[0]).toMatchObject({ "@type": "Person", name: "Yoan" });
  });

  it("accepts an array @type", () => {
    const html = page([{ ...blogPosting, "@type": ["BlogPosting", "Article"] }]);
    expect(analyzePageGeo("https://x.ch/p", html, cfg, NOW).scorecard.schema_types).toContain("BlogPosting");
  });
});
