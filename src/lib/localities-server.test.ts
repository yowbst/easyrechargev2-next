import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({ directusFetch: vi.fn(), DIRECTUS_DEFAULT_LOCALE: "fr-FR" }));

import { summarizeChargingSubsidies } from "./localities-server";

const personal = (amounts: unknown) => ({ category: "charging-infrastructure", audiences: ["personal"], amounts });

describe("summarizeChargingSubsidies", () => {
  it("keeps only personal charging-infrastructure programmes and takes the highest CHF amount", () => {
    expect(
      summarizeChargingSubsidies([
        { subsidies: [personal([{ chf: [200, 400] }]), { category: "charging-infrastructure", audiences: ["business"], amounts: [{ chf: [5000] }] }] },
        { subsidies: [{ category: "electric-vehicles", audiences: ["personal"], amounts: [{ chf: [900] }] }] },
      ]),
    ).toEqual({ available: true, maxChf: 400 });
  });

  it("reports a programme without an amount as available, with no figure", () => {
    expect(summarizeChargingSubsidies([{ subsidies: [personal(null)] }])).toEqual({ available: true, maxChf: null });
  });

  it("handles missing or empty data", () => {
    expect(summarizeChargingSubsidies([])).toEqual({ available: false, maxChf: null });
    expect(summarizeChargingSubsidies([{ subsidies: null }])).toEqual({ available: false, maxChf: null });
  });
});
