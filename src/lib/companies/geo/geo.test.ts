import { describe, expect, it } from "vitest";
import { MIN_ROWS, parsePostcodeCsv, renderDatasetModule } from "./build-dataset";
import { haversineKm } from "./distance";
import { lookupPostcode } from "./postcode-coords";
import { POSTCODE_COORDS } from "@/shared/swiss-postcode-coordinates";

const CSV = `﻿Ortschaftsname;PLZ4;Zusatzziffer;ZIP_ID;Gemeindename;BFS-Nr;Kantonskürzel;Adressenanteil;E;N;Sprache;Validity
Lausanne 25;1000;25;125;Lausanne;5586;VD;100 %;6.68226;46.55959;fr;2008-07-01
Lausanne 26;1000;26;126;Lausanne;5586;VD;100 %;6.69593;46.55457;fr;2008-07-01
Lausanne;1004;00;151;Lausanne;5586;VD;100 %;6.61865;46.52829;fr;2008-07-01
Cheseaux-sur-Lausanne;1033;00;180;Cheseaux-sur-Lausanne;5582;VD;92.34 %;6.60514;46.58535;fr;2008-07-01
Romanel;1033;00;181;Romanel;5583;VD;7.66 %;6.60512;46.58537;fr;2008-07-01
`;

describe("parsePostcodeCsv", () => {
  const { rows, table } = parsePostcodeCsv(CSV);

  it("reads past the byte order mark and maps E to longitude, N to latitude", () => {
    expect(rows).toBe(5);
    expect(table["1004"]).toEqual([46.52829, 6.61865]);
  });

  it("averages a postcode's rows", () => {
    expect(table["1033"][0]).toBeCloseTo(46.58536, 4);
  });

  it("adds Zusatzziffer keys only where a postcode has several", () => {
    expect(table["100025"]).toEqual([46.55959, 6.68226]);
    expect(table["100026"]).toBeDefined();
    expect(table["100400"]).toBeUndefined();
    expect(table["103300"]).toBeUndefined();
  });

  it("fails loudly when a column is missing", () => {
    expect(() => parsePostcodeCsv("a;b\n1;2")).toThrow(/column "PLZ4"/);
  });

  it("renders a TypeScript module", () => {
    const src = renderDatasetModule(table, "2026-11-20");
    expect(src).toContain("GENERATED");
    expect(src).toContain('"1004": [46.52829, 6.61865],');
  });

  it("has a sane minimum row threshold", () => {
    expect(MIN_ROWS).toBeGreaterThan(1000);
  });
});

describe("lookupPostcode", () => {
  const table = { "1000": [46.55, 6.69], "100025": [46.5596, 6.6823], "1033": [46.58, 6.6] } as const;

  it("prefers the exact postcode + additional digit", () => {
    expect(lookupPostcode("1000", 25, table)).toEqual([46.5596, 6.6823]);
    expect(lookupPostcode("1000", "25", table)).toEqual([46.5596, 6.6823]);
  });

  it("falls back to the postcode mean, then to null", () => {
    expect(lookupPostcode("1000", 99, table)).toEqual([46.55, 6.69]);
    expect(lookupPostcode("1033", undefined, table)).toEqual([46.58, 6.6]);
    expect(lookupPostcode("9999", undefined, table)).toBeNull();
  });

  it("resolves real postcodes from the generated dataset", () => {
    expect(POSTCODE_COORDS["1033"]).toBeDefined();
    expect(lookupPostcode("1033")).not.toBeNull();
    expect(lookupPostcode("1000", 25)).not.toBeNull();
  });
});

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm([46.5, 6.6], [46.5, 6.6])).toBe(0);
  });

  it("puts Lausanne and Geneva about 51 km apart", () => {
    const d = haversineKm([46.5197, 6.6323], [46.2044, 6.1432]);
    expect(d).toBeGreaterThan(48);
    expect(d).toBeLessThan(54);
  });

  it("is symmetric", () => {
    const a: [number, number] = [47.37, 8.54];
    const b: [number, number] = [46.95, 7.45];
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9);
  });
});
