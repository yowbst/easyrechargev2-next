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

describe("summarizeCantonSubsidies", () => {
  const prog = (id: number, chf: number[]) => ({
    source_id: id, category: "charging-infrastructure", audiences: ["personal"], name: `P${id}`,
    contributor: { name: "Canton de Vaud" }, site_url: "https://vd.ch", amounts: [{ text: `${chf.join("-")} fr.`, chf }],
  });
  const row = (name: string, subs: unknown[], at = "2026-04-18T06:00:00") => ({ name, postal_code: "1000", subsidies_fetched_at: at, translations: [{ subsidies: subs }] });

  it("counts localities, keeps the max amount and the canton-wide programs", async () => {
    const { summarizeCantonSubsidies } = await import("./localities-server");
    const s = summarizeCantonSubsidies([
      row("A", [prog(1, [200, 400]), prog(9, [1500])]),
      row("B", [prog(1, [200, 400])], "2026-04-18T07:00:00"),
      row("C", [prog(1, [200, 400]), { category: "charging-infrastructure", audiences: ["business"], amounts: [{ chf: [9000] }] }]),
      row("D", []),
      { name: "TEST VD", postal_code: "9999", translations: [{ subsidies: [prog(1, [99999])] }] },
    ]);
    expect(s.total).toBe(4);
    expect(s.withSubsidy).toBe(3);
    expect(s.maxChf).toBe(1500);
    expect(s.widePrograms.map((p) => p.name)).toEqual(["P1"]);
    expect(s.widePrograms[0]).toMatchObject({ localities: 3, contributor: "Canton de Vaud", amounts: ["200-400 fr."], conditions: null });
    expect(s.fetchedAt).toBe("2026-04-18T07:00:00");
  });

  it("handles an empty canton", async () => {
    const { summarizeCantonSubsidies } = await import("./localities-server");
    expect(summarizeCantonSubsidies([])).toEqual({ total: 0, withSubsidy: 0, maxChf: null, widePrograms: [], fetchedAt: null });
  });
});

describe("clipSentences", () => {
  it("keeps whole sentences under the limit", async () => {
    const { clipSentences } = await import("./localities-server");
    const text = "Cette subvention est allouée pour les bornes. Elle est destinée aux copropriétaires. Troisième phrase très longue qui dépasse.";
    expect(clipSentences(text, 90)).toBe("Cette subvention est allouée pour les bornes. Elle est destinée aux copropriétaires.");
    expect(clipSentences(text, 10)).toBe("Cette subvention est allouée pour les bornes.");
    expect(clipSentences(null, 50)).toBeNull();
  });
});
