import { describe, expect, it, vi } from "vitest";
import { displayStreet, fetchInstallerCandidates, monogram, monogramTone, selectNearby, summarizeCanton, toPublicInstaller, type PublicInstaller } from "./installers";

const inst = (over: Partial<PublicInstaller> & { ehraid: string }): PublicInstaller => ({
  name: `Co ${over.ehraid}`, legalForm: "llc", street: "Rue 1", postalCode: "1033", locality: "Cheseaux", canton: "VD",
  uid: "CHE-107.036.057", lat: 46.58, lng: 6.60, isPartner: false, partnerId: null, specialties: [], tradeSummary: null, seenAt: null, ...over,
});
const ORIGIN = { lat: 46.58, lng: 6.60 };
// ~1 km of latitude
const km = (n: number) => 46.58 + n / 111;

describe("displayStreet", () => {
  it("drops care-of lines that name private people", () => {
    expect(displayStreet("c/o Enzo et Michèle Di Stefano, Rue de la Mèbre 6")).toBe("Rue de la Mèbre 6");
    expect(displayStreet("c/o Hexopus SA, Route de Genève 15")).toBe("Route de Genève 15");
    expect(displayStreet("Chez M. Dupont, Chemin 3")).toBe("Chemin 3");
  });

  it("keeps ordinary streets and handles empties", () => {
    expect(displayStreet("Route de Lausanne 86")).toBe("Route de Lausanne 86");
    expect(displayStreet("c/o Somebody")).toBeNull();
    expect(displayStreet(null)).toBeNull();
  });
});

describe("toPublicInstaller", () => {
  it("formats the UID, parses decimals, keeps only known specialties and reduces partner to a flag", () => {
    const p = toPublicInstaller({ ehraid: "1", legal_name: "X Sàrl", display_name: null, uid: "CHE107036057", lat: "46.5", lng: "6.6", partner: "uuid", specialties: ["bornes", "junk"], trade_summary: "Installations", street_address: "c/o A, Rue 2" });
    expect(p).toMatchObject({ name: "X Sàrl", uid: "CHE-107.036.057", lat: 46.5, lng: 6.6, isPartner: true, specialties: ["bornes"], tradeSummary: "Installations", street: "Rue 2" });
  });
});

describe("selectNearby", () => {
  it("widens the radius until it finds the minimum", () => {
    const c = [inst({ ehraid: "a", lat: km(2) }), inst({ ehraid: "b", lat: km(7) }), inst({ ehraid: "c", lat: km(8) }), inst({ ehraid: "d", lat: km(20) })];
    expect(selectNearby(c, ORIGIN).map((x) => x.ehraid)).toEqual(["a", "b", "c"]);
  });

  it("orders partners first, companies before sole proprietors, then distance, then id", () => {
    const c = [
      inst({ ehraid: "sp", legalForm: "sp", lat: km(0.5) }),
      inst({ ehraid: "far", legalForm: "corporation", lat: km(4) }),
      inst({ ehraid: "near", legalForm: "llc", lat: km(1) }),
      inst({ ehraid: "partner", legalForm: "sp", lat: km(4.5), isPartner: true }),
    ];
    expect(selectNearby(c, ORIGIN).map((x) => x.ehraid)).toEqual(["partner", "near", "far", "sp"]);
  });

  it("caps at max, excludes ids already shown, skips rows without coordinates", () => {
    const c = Array.from({ length: 8 }, (_, i) => inst({ ehraid: `x${i}`, lat: km(i * 0.3) })).concat(inst({ ehraid: "nogeo", lat: null }));
    const r = selectNearby(c, ORIGIN, { excludeIds: new Set(["x0"]) });
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.ehraid)).not.toContain("x0");
    expect(r.map((x) => x.ehraid)).not.toContain("nogeo");
  });

  it("returns what it has (even 0) when nothing reaches the minimum", () => {
    expect(selectNearby([inst({ ehraid: "a", lat: km(30) })], ORIGIN)).toEqual([]);
    expect(selectNearby([inst({ ehraid: "a", lat: km(12) })], ORIGIN).map((x) => x.ehraid)).toEqual(["a"]);
  });
});

describe("summarizeCanton", () => {
  it("counts, ranks localities and samples one company per top locality", () => {
    const rows = [
      inst({ ehraid: "1", locality: "Lausanne", legalForm: "sp" }),
      inst({ ehraid: "2", locality: "Lausanne", legalForm: "corporation" }),
      inst({ ehraid: "3", locality: "Lausanne" }),
      inst({ ehraid: "4", locality: "Nyon" }),
      inst({ ehraid: "5", locality: null }),
    ];
    const s = summarizeCanton(rows);
    expect(s.count).toBe(5);
    expect(s.topLocalities).toEqual([{ locality: "Lausanne", postalCode: "1033", count: 3 }, { locality: "Nyon", postalCode: "1033", count: 1 }]);
    expect(s.sample.map((x) => x.ehraid)).toEqual(["2", "4"]);
  });
});

describe("fetchInstallerCandidates", () => {
  it("queries published rows inside a bounding box, cached, and survives errors", async () => {
    const fetcher = vi.fn(async () => ({ data: [{ ehraid: "1", legal_name: "A", lat: "46.58", lng: "6.6" }] }));
    const r = await fetchInstallerCandidates(ORIGIN, 25, fetcher as never);
    expect(r).toHaveLength(1);
    const url = decodeURIComponent((fetcher.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("filter[status][_eq]=published");
    expect(url).toContain("filter[do_not_display][_eq]=false");
    expect(url).toMatch(/filter\[lat\]\[_between\]=46\.35\d+,46\.80\d+/);
    expect(url).not.toContain("purpose_text");
    const failing = vi.fn(async () => { throw new Error("x"); });
    expect(await fetchInstallerCandidates(ORIGIN, 25, failing as never)).toEqual([]);
  });
});

describe("monogram", () => {
  it.each([
    ["Di Stefano Electricité Sàrl", "DS"],
    ["AstroVolt Sàrl", "AV"],
    ["Romelec SA", "RO"],
    ["A. Peneveyre S.A.", "AP"],
    ["Société anonyme e-lec", "SA"],
  ])("%s -> %s", (name, m) => expect(monogram(name)).toBe(m));

  it("gives a stable tone per company", () => {
    expect(monogramTone("15706")).toBe(monogramTone("15706"));
    expect([0, 1, 2]).toContain(monogramTone("1"));
  });
});

describe("latestSeen", () => {
  it("returns the most recent register date, null when none", async () => {
    const { latestSeen } = await import("./installers");
    expect(latestSeen([{ seenAt: "2026-11-20T10:00:00Z" }, { seenAt: null }, { seenAt: "2026-11-21T08:00:00Z" }])).toBe("2026-11-21T08:00:00Z");
    expect(latestSeen([{ seenAt: null }])).toBeNull();
  });
});

describe("fetchInstallerCountsByCanton", () => {
  it("maps grouped counts and fills missing cantons with 0", async () => {
    const { fetchInstallerCountsByCanton } = await import("./installers");
    const fetcher = vi.fn(async () => ({ data: [{ canton: "VD", count: "364" }, { canton: "ZH", count: "9" }] }));
    expect(await fetchInstallerCountsByCanton(["VD", "NE"], fetcher as never)).toEqual({ VD: 364, NE: 0 });
  });
});
