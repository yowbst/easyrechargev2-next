import { describe, expect, it } from "vitest";
import {
  decodeAdsExport,
  findGaps,
  generateSeeds,
  mergeKeywords,
  normalizeRecord,
  parseAdsCsv,
  preGroupByNgrams,
} from "./keywords";

describe("generateSeeds", () => {
  it("builds unique prefix and suffix variations", () => {
    const seeds = generateSeeds("borne de recharge");
    expect(seeds).toContain("borne de recharge");
    expect(seeds).toContain("comment borne de recharge");
    expect(seeds).toContain("borne de recharge suisse");
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe("mergeKeywords", () => {
  it("dedupes case-insensitively and joins sources", () => {
    const [kw, ...rest] = mergeKeywords([
      { term: "Borne Prix", source: "gsc", gsc_impressions: 10 },
      { term: "borne prix ", source: "autocomplete" },
    ]);
    expect(rest).toEqual([]);
    expect(kw).toMatchObject({ term: "borne prix", source: "gsc,autocomplete", gsc_impressions: 10, status: "new" });
  });
});

describe("preGroupByNgrams", () => {
  it("joins a term to an existing group named by one of its n-grams and pools singletons", () => {
    // "prix borne" opens the group "prix borne"; "prix borne murale" contains that pair, so it joins.
    const groups = preGroupByNgrams([
      { term: "prix borne" },
      { term: "prix borne murale" },
      { term: "subvention vaud" },
    ]);
    expect(groups.get("prix borne")!.map((k) => k.term)).toEqual(["prix borne", "prix borne murale"]);
    expect(groups.get("_ungrouped")!.map((k) => k.term)).toEqual(["subvention vaud"]);
    expect(groups.size).toBe(2);
  });

  it("does not group terms that only share a word with no existing group key", () => {
    const groups = preGroupByNgrams([{ term: "prix borne" }, { term: "borne murale" }]);
    expect([...groups.keys()]).toEqual(["_ungrouped"]);
  });
});

describe("findGaps", () => {
  const kw = (cluster: string, status: string, imp: string, term = "t") => ({ cluster, status, gsc_impressions: imp, term });

  it("lists clusters with no published content, biggest first", () => {
    const { empty, totalClusters } = findGaps([kw("a", "new", "5"), kw("b", "new", "50"), kw("c", "published", "1")]);
    expect(totalClusters).toBe(3);
    expect(empty.map((g) => g.cluster)).toEqual(["b", "a"]);
  });

  it("flags a cluster with under 30% published as under-served", () => {
    const rows = [kw("x", "published", "1"), ...Array.from({ length: 4 }, () => kw("x", "new", "1"))];
    expect(findGaps(rows).underserved).toEqual([{ cluster: "x", published: 1, total: 5, coverage: "20%" }]);
  });
});

describe("Google Ads imports", () => {
  it("decodes UTF-16LE (Keyword Planner) and UTF-8 exports", () => {
    const text = "Keyword\tAvg. monthly searches\nborne\t100";
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
    expect(decodeAdsExport(utf16)).toBe(text);
    expect(decodeAdsExport(Buffer.from(`﻿${text}`, "utf-8"))).toBe(text);
  });

  it("skips title rows, finds the header and normalizes a Keyword Planner row", () => {
    const content = "Planificateur\nJuillet 2026\nKeyword\tAvg. monthly searches\tTop of page bid (high range)\nBorne Prix\t1 300\t2.45\n";
    const [rec] = parseAdsCsv(content);
    expect(normalizeRecord(rec)).toEqual({
      term: "borne prix",
      source: "keyword_planner",
      volume_estimate: "1300",
      cpc: "2.45",
      status: "new",
    });
  });

  it("normalizes a Search terms report row and ignores rows without a term", () => {
    expect(normalizeRecord({ "Search term": "Wallbox", Impressions: "1,200", Clicks: "30", "Avg. CPC": "CHF 1.10" })).toMatchObject({
      term: "wallbox",
      source: "google_ads",
      volume_estimate: "1200",
      ads_clicks: "30",
      cpc: "1.10",
    });
    expect(normalizeRecord({ "Search term": "  " })).toBeNull();
  });
});
