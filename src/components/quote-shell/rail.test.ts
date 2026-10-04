import { describe, expect, it } from "vitest";
import { answerRows, subsidyLine } from "./Rail";
import { timeLeftKey } from "./QuoteHeader";
import { ecpFunnel } from "./products/ecp";
import { batteryFunnel } from "./products/battery";

const tq = (k: string) => `T(${k})`;
const tqOpt = (k: string) => (k.includes(".options.") ? `O(${k.split(".options.")[1]})` : undefined);
const tc = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ""}`;

describe("timeLeftKey", () => {
  it("counts down from 2 min to the last step, whatever the length of the funnel", () => {
    expect([0, 1, 2, 3, 4].map((i) => timeLeftKey(i, 5).split(".").pop())).toEqual(["2min", "1min30", "1min", "under1", "last"]);
    expect([0, 1, 2, 3].map((i) => timeLeftKey(i, 4).split(".").pop())).toEqual(["1min30", "1min", "under1", "last"]);
  });
});

describe("answerRows", () => {
  it("lists the answers of the steps already done, with option labels", () => {
    const rows = answerRows(ecpFunnel, ["housing"], { housingStatus: "owner", housingType: "house", solarEquipment: "none", parkingSpotLocation: "garage" }, tq, tqOpt);
    expect(rows.map((r) => [r.field, r.value])).toEqual([["housingStatus", "O(owner)"], ["housingType", "O(house)"], ["solarEquipment", "O(none)"]]);
    expect(rows[0]).toMatchObject({ stepId: "housing", label: "T(steps.housing.fields.housingStatus.label)" });
  });

  it("skips empty answers and formats counts and kWc", () => {
    expect(answerRows(ecpFunnel, ["charger"], { parkingSpotCount: "3+", deadline: "" }, tq, tqOpt).map((r) => r.value)).toEqual([
      "3+ T(steps.charger.fields.parkingSpotCount.options.3plus)",
    ]);
    expect(answerRows(batteryFunnel, ["pv"], { pvPower: 8, inverterBrand: "na" }, tq, tqOpt).map((r) => r.value)).toEqual([
      "6–10 kWc",
      "T(common.dontKnow)",
    ]);
  });
});

describe("answerRows labels", () => {
  it("names a repeated label after its step", () => {
    const rows = answerRows(ecpFunnel, ["housing", "vehicle"], { housingStatus: "owner", vehicleStatus: "own" }, (k) => (k.endsWith("Status.label") ? "Statut" : k), tqOpt);
    expect(rows.map((r) => r.label)).toEqual(["Statut", "steps.vehicle.title"]);
  });
});

describe("subsidyLine", () => {
  it("names the amount when there is one, else a general line", () => {
    expect(subsidyLine(tc, { locality: "Lausanne", available: true, maxChf: 400 })).toBe('quote.rail.subsidy{"locality":"Lausanne","amount":"400"}');
    expect(subsidyLine(tc, { locality: "Bern", available: true, maxChf: null })).toBe('quote.rail.subsidyAvailable{"locality":"Bern"}');
    expect(subsidyLine(tc, null)).toBe("quote.rail.subsidyFallback");
  });
});
