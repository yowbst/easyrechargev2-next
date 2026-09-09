import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER_STATE,
  parseFilterParams,
  serialiseFilterParams,
} from "./partner-filter-params";

describe("parseFilterParams", () => {
  it("returns defaults for an empty query", () => {
    expect(parseFilterParams({})).toEqual(DEFAULT_FILTER_STATE);
  });

  it("reads a date preset, a sort and comma-separated facets", () => {
    const s = parseFilterParams({
      period: "30d", sort: "score", housing: "owner,tenant", score: "hot",
    });
    expect(s.filter.preset).toBe("30d");
    expect(s.sort).toBe("score");
    expect(s.facets.housing).toEqual(["owner", "tenant"]);
    expect(s.facets.score).toEqual(["hot"]);
    expect(s.facets.deadline).toEqual([]);
  });

  it("keeps from/to for a custom range and month for a billing cycle", () => {
    const custom = parseFilterParams({ period: "custom", from: "2026-07-01", to: "2026-07-31" });
    expect(custom.filter).toMatchObject({ preset: "custom", from: "2026-07-01", to: "2026-07-31" });
    expect(parseFilterParams({ period: "month", month: "2026-07" }).filter.month).toBe("2026-07");
  });

  it("degrades a hand-edited link to the unfiltered view instead of throwing", () => {
    const s = parseFilterParams({ period: "nonsense", sort: "bogus", housing: " , ,, " });
    expect(s.filter.preset).toBe("all");
    expect(s.sort).toBe("recent");
    expect(s.facets.housing).toEqual([]);
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseFilterParams({ period: ["7d", "30d"] }).filter.preset).toBe("7d");
  });
});

describe("serialiseFilterParams", () => {
  it("omits defaults, so an unfiltered view has a clean URL", () => {
    expect(serialiseFilterParams("", DEFAULT_FILTER_STATE)).toBe("");
  });

  it("preserves params it does not own", () => {
    const qs = serialiseFilterParams("lang=de&tab=performance", {
      ...DEFAULT_FILTER_STATE, sort: "score",
    });
    const p = new URLSearchParams(qs);
    expect(p.get("lang")).toBe("de");
    expect(p.get("tab")).toBe("performance");
    expect(p.get("sort")).toBe("score");
  });

  it("drops a facet group once its last value is cleared", () => {
    const withFacet = serialiseFilterParams("", {
      ...DEFAULT_FILTER_STATE, facets: { ...DEFAULT_FILTER_STATE.facets, housing: ["owner"] },
    });
    expect(new URLSearchParams(withFacet).get("housing")).toBe("owner");
    const cleared = serialiseFilterParams(withFacet, DEFAULT_FILTER_STATE);
    expect(new URLSearchParams(cleared).has("housing")).toBe(false);
  });

  it("drops from/to when the preset is no longer custom", () => {
    const custom = serialiseFilterParams("", {
      ...DEFAULT_FILTER_STATE,
      filter: { preset: "custom", from: "2026-07-01", to: "2026-07-31", month: null },
    });
    expect(new URLSearchParams(custom).get("from")).toBe("2026-07-01");
    const back = serialiseFilterParams(custom, {
      ...DEFAULT_FILTER_STATE, filter: { preset: "7d", from: null, to: null, month: null },
    });
    const p = new URLSearchParams(back);
    expect(p.get("period")).toBe("7d");
    expect(p.has("from")).toBe(false);
    expect(p.has("to")).toBe(false);
  });

  it("round-trips: what it writes, the parser reads back", () => {
    const state = {
      filter: { preset: "month" as const, from: null, to: null, month: "2026-08" },
      sort: "stage_age" as const,
      facets: { housing: ["owner", "tenant"], deadline: ["asap"], approval: [], score: ["hot"] },
    };
    const qs = serialiseFilterParams("", state);
    const parsed = parseFilterParams(Object.fromEntries(new URLSearchParams(qs)));
    expect(parsed).toEqual(state);
  });
});
