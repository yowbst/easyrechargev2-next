import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORING_WEIGHTS,
  SCORE_BANDS,
  resolveScoreBands,
  resolveWeights,
  scoreLead,
} from "./scoring";

const W = DEFAULT_SCORING_WEIGHTS;

/** A lead that scores full marks on everything except the field under test. */
function perfect(overrides: Record<string, unknown> = {}) {
  return {
    housingStatus: "owner",
    approval: "yes",
    deadline: "asap",
    parkingSpotCount: "1",
    solarEquipment: "none",
    ...overrides,
  };
}

describe("volume sub-score", () => {
  it("gives one charger full marks — it is the normal case, not a weakness", () => {
    const one = scoreLead(perfect({ parkingSpotCount: "1" }), W);
    expect(one.score).toBe(100);
    expect(one.breakdown.find((b) => b.key === "volume")?.subScore).toBe(1);
  });

  it("treats two and three-or-more identically, as a bonus above full marks", () => {
    for (const n of ["2", "3+"]) {
      const s = scoreLead(perfect({ parkingSpotCount: n }), W);
      expect(s.breakdown.find((b) => b.key === "volume")?.subScore).toBe(1.5);
    }
  });

  it("clamps the total at 100 rather than letting the bonus overflow", () => {
    // Without the clamp this lead computes above 100.
    expect(scoreLead(perfect({ parkingSpotCount: "2" }), W).score).toBe(100);
  });

  it("lets the bonus lift a mid-range lead", () => {
    const base = perfect({ housingStatus: "tenant", approval: "no", deadline: "6+mo" });
    const one = scoreLead({ ...base, parkingSpotCount: "1" }, W).score;
    const two = scoreLead({ ...base, parkingSpotCount: "2" }, W).score;
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(100);
  });

  it("drops the factor when the field is absent, without penalising", () => {
    const s = scoreLead(perfect({ parkingSpotCount: undefined }), W);
    expect(s.breakdown.some((b) => b.key === "volume")).toBe(false);
    // Everything else is full marks, so the score stays 100.
    expect(s.score).toBe(100);
  });
});

describe("scoreLead", () => {
  it("scores an empty submission at zero rather than throwing", () => {
    expect(scoreLead({}, W).score).toBe(0);
    expect(scoreLead(null, W).score).toBe(0);
  });

  it("puts a weak lead in the cold band", () => {
    const s = scoreLead(
      {
        housingStatus: "tenant",
        approval: "no",
        deadline: "6+mo",
        parkingSpotCount: "1",
        solarEquipment: "exists",
      },
      W,
    );
    expect(s.band).toBe("cold");
    expect(s.score).toBeLessThan(40);
  });

  it("gives an owner full authorisation marks without an approval field", () => {
    // The quote form only asks co-owners and tenants; an owner authorises
    // the works themselves.
    const s = scoreLead(perfect({ approval: undefined }), W);
    expect(s.breakdown.find((b) => b.key === "authorization")?.subScore).toBe(1);
  });

  it("ignores a factor whose weight a partner set to zero", () => {
    const s = scoreLead(perfect({ solarEquipment: "exists" }), { ...W, solar_upsell: 0 });
    expect(s.breakdown.some((b) => b.key === "solar_upsell")).toBe(false);
    expect(s.score).toBe(100);
  });
});

describe("resolveWeights", () => {
  it("falls back to the defaults and ignores nonsense overrides", () => {
    expect(resolveWeights(null)).toEqual(W);
    expect(resolveWeights({ urgency: -1, bogus: 5 })).toEqual(W);
    expect(resolveWeights({ urgency: 0.5 })).toEqual({ ...W, urgency: 0.5 });
  });
});

describe("resolveScoreBands", () => {
  it("falls back to the code defaults when Directus holds nothing", () => {
    expect(resolveScoreBands(null)).toEqual(SCORE_BANDS);
    expect(resolveScoreBands(undefined)).toEqual(SCORE_BANDS);
    expect(resolveScoreBands({})).toEqual(SCORE_BANDS);
  });

  it("takes each threshold independently", () => {
    expect(resolveScoreBands({ hot: 90 })).toEqual({ hot: 90, warm: SCORE_BANDS.warm });
    expect(resolveScoreBands({ warm: 60 })).toEqual({ hot: SCORE_BANDS.hot, warm: 60 });
    expect(resolveScoreBands({ hot: 90, warm: 75 })).toEqual({ hot: 90, warm: 75 });
  });

  it("collapses an inverted pair rather than making warm unreachable", () => {
    // warm above hot would leave no score that lands in "warm".
    expect(resolveScoreBands({ hot: 40, warm: 70 })).toEqual({ hot: 40, warm: 40 });
  });

  it("ignores a non-numeric threshold", () => {
    // A Directus text field holding "90" must not silently become a band.
    expect(resolveScoreBands({ hot: "90" } as never)).toEqual(SCORE_BANDS);
  });
});

describe("bands drive the badge, not the score", () => {
  const mid = { housingStatus: "tenant", approval: "in-progress", deadline: "2-3mo" };

  it("reads the same lead differently under tighter thresholds", () => {
    const lenient = scoreLead(mid, W, { hot: 40, warm: 20 });
    const strict = scoreLead(mid, W, { hot: 95, warm: 90 });
    expect(lenient.score).toBe(strict.score);
    expect(lenient.band).toBe("hot");
    expect(strict.band).toBe("cold");
  });

  it("defaults to the code bands when none are passed", () => {
    expect(scoreLead(mid, W).band).toBe(scoreLead(mid, W, SCORE_BANDS).band);
  });
});

describe("battery scoring", () => {
  const battery = (overrides: Record<string, unknown> = {}) => ({
    housingStatus: "owner",
    deadline: "asap",
    solarEquipment: "exists",
    pvPower: 15,
    evCount: 3,
    heatPump: "no",
    ...overrides,
  });
  const sub = (s: ReturnType<typeof scoreLead>, key: string) => s.breakdown.find((b) => b.key === key)?.subScore;

  it("scores a large-PV owner with 3+ EVs at full marks", () => {
    expect(scoreLead(battery(), W, SCORE_BANDS, "battery").score).toBe(100);
  });

  it("never uses the charger factors for a battery lead", () => {
    const s = scoreLead(battery({ parkingSpotCount: "2" }), W, SCORE_BANDS, "battery");
    expect(s.breakdown.some((b) => b.key === "volume" || b.key === "solar_upsell")).toBe(false);
  });

  it("never uses the battery factors for a charger lead", () => {
    const s = scoreLead({ housingStatus: "owner", deadline: "asap", parkingSpotCount: "1", solarEquipment: "none", pvPower: 15, evCount: 3 }, W);
    expect(s.breakdown.some((b) => b.key === "pv_size" || b.key === "load")).toBe(false);
    expect(s.score).toBe(100);
  });

  it("scores PV size 1 from the threshold, 0.6 below or unknown", () => {
    expect(sub(scoreLead(battery({ pvPower: 10 }), W, SCORE_BANDS, "battery"), "pv_size")).toBe(1);
    expect(sub(scoreLead(battery({ pvPower: 8 }), W, SCORE_BANDS, "battery"), "pv_size")).toBe(0.6);
    expect(sub(scoreLead(battery({ pvPower: "na" }), W, SCORE_BANDS, "battery"), "pv_size")).toBe(0.6);
  });

  it("drops PV size when the field is absent", () => {
    const s = scoreLead(battery({ pvPower: undefined }), W, SCORE_BANDS, "battery");
    expect(s.breakdown.some((b) => b.key === "pv_size")).toBe(false);
  });

  it("grades the load: 3+ EVs, then 1–2 EVs or a heat pump, then EV planned, then nothing", () => {
    const load = (o: Record<string, unknown>) => sub(scoreLead(battery(o), W, SCORE_BANDS, "battery"), "load");
    expect(load({ evCount: 3 })).toBe(1);
    expect(load({ evCount: 1 })).toBe(0.8);
    expect(load({ evCount: 0, heatPump: "yes" })).toBe(0.8);
    expect(load({ evCount: 0, heatPump: "no", evPlanned: "yes" })).toBe(0.5);
    expect(load({ evCount: 0, heatPump: "no", evPlanned: "no" })).toBe(0.3);
    expect(load({ evCount: undefined, heatPump: undefined, evPlanned: undefined })).toBeUndefined();
  });

  it("treats an unknown product string as the charger", () => {
    const s = scoreLead(battery(), W, SCORE_BANDS, "solar");
    expect(s.breakdown.some((b) => b.key === "pv_size")).toBe(false);
  });
});
