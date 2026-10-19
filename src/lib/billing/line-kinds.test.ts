import { describe, expect, it } from "vitest";
import { countBilledLeads, partnerStatus, sortBand, splitTotals } from "./line-kinds";

const lines = [
  { kind: "lead", amount_chf: "40.00" },
  { kind: "lead", amount_chf: "40.00" },
  { kind: "gift", amount_chf: "0.00" },
  { kind: "disqualified", amount_chf: "0.00" },
  { kind: "disqualified", amount_chf: "0.00" },
  { kind: "adjustment", amount_chf: "-10.00" },
];

describe("invoice line kinds", () => {
  it("counts only lead lines as billed requests — refused and gifted ones are not", () => {
    // EME-202607-R2 showed "17 demandes facturées" for 10 billed leads.
    expect(countBilledLeads(lines)).toBe(2);
  });

  it("tells the partner which lines are on the amount owed; an adjustment is neither", () => {
    expect(partnerStatus("lead")).toBe("billed");
    expect(partnerStatus("gift")).toBe("notBilled");
    expect(partnerStatus("disqualified")).toBe("notBilled");
    expect(partnerStatus("adjustment")).toBeNull();
  });

  it("keeps adjustments out of the subtotal and sums them apart, to the cent", () => {
    expect(splitTotals([...lines, { kind: "lead", amount_chf: "0.10" }, { kind: "lead", amount_chf: "0.20" }])).toEqual({
      subtotal: 80.3,
      adjustment: -10,
      total: 70.3,
    });
  });

  it("orders kinds in bands: leads, gifts, refused, adjustments last", () => {
    expect(sortBand("lead")).toBeLessThan(sortBand("gift"));
    expect(sortBand("gift")).toBeLessThan(sortBand("disqualified"));
    expect(sortBand("disqualified")).toBeLessThan(sortBand("adjustment"));
  });

  it("treats an unknown kind as money on the invoice but not a billed request", () => {
    const mystery = [{ kind: "mystery", amount_chf: 5 }];
    expect(countBilledLeads(mystery)).toBe(0);
    expect(partnerStatus("mystery")).toBeNull();
    expect(splitTotals(mystery).subtotal).toBe(5);
  });
});
