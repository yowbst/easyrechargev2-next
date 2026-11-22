import { describe, expect, it } from "vitest";
import {
  cleanStreet,
  formatUid,
  isInLiquidation,
  legalFormKind,
  normalizeUid,
  purposeHash,
  toCleanCompany,
} from "./normalize";
import type { RawCompany } from "./types";

describe("UID", () => {
  it.each([
    ["CHE-107.036.057", "CHE107036057"],
    ["che 107 036 057", "CHE107036057"],
    ["CHE107036057", "CHE107036057"],
    [" CHE-107.036.057 ", "CHE107036057"],
  ])("normalises %s", (raw, want) => expect(normalizeUid(raw)).toBe(want));

  it.each(["", null, undefined, "CHE-12.345", "ABC107036057", "CHE-107.036.05A"])(
    "rejects %j",
    (raw) => expect(normalizeUid(raw)).toBeNull(),
  );

  it("formats for display and returns empty for junk", () => {
    expect(formatUid("CHE107036057")).toBe("CHE-107.036.057");
    expect(formatUid("junk")).toBe("");
    expect(formatUid(null)).toBe("");
  });
});

describe("cleanStreet", () => {
  it("joins multi-line addresses on one line", () => {
    expect(cleanStreet("c/o Daniel Schären\nSeilerweg 54")).toBe("c/o Daniel Schären, Seilerweg 54");
  });

  it("drops a literal null line and stray whitespace", () => {
    expect(cleanStreet("null\nWägitalstrasse 42")).toBe("Wägitalstrasse 42");
    expect(cleanStreet("  Rue  du  Collège   26 ")).toBe("Rue du Collège 26");
  });

  it("returns null when nothing is left", () => {
    expect(cleanStreet("null")).toBeNull();
    expect(cleanStreet(" \n ")).toBeNull();
    expect(cleanStreet(null)).toBeNull();
    expect(cleanStreet("")).toBeNull();
  });
});

describe("legalFormKind", () => {
  it.each([
    ["0101", "sp"],
    ["0103", "gp"],
    ["0104", "gp"],
    ["0106", "corporation"],
    ["0107", "llc"],
    ["0108", "cooperative"],
    ["0151", "branch"],
    ["0111", "branch"],
    ["0109", "other"],
    [null, "other"],
  ])("%s -> %s", (code, kind) => expect(legalFormKind(code)).toBe(kind));
});

describe("isInLiquidation", () => {
  it.each([
    "Noverraz & Pitteloud S.A. en liquidation",
    "Muster AG in Liquidation",
    "Rossi Sagl in liquidazione",
    "Dupont Sàrl en faillite",
    "Muster GmbH in Konkurs",
    "Marti Elektro AG in Liq.",
    "Dupont Sàrl en liq.",
    "Elektrizitäts AG EAGB in Nachlassliquidation",
  ])("flags %s", (name) => expect(isInLiquidation(name)).toBe(true));

  it.each(["Liquidation Experts SA", "Electricité Dupont Sàrl", "Faillite Conseil SA", "Liquid Elektro AG", "Liqui Moly Service GmbH"])(
    "does not flag %s",
    (name) => expect(isInLiquidation(name)).toBe(false),
  );
});

describe("purposeHash", () => {
  it("is stable under whitespace and Unicode form changes", () => {
    const a = purposeHash("installations  électriques\n et téléphoniques");
    const b = purposeHash("installations électriques et téléphoniques ");
    const decomposed = purposeHash("installations électriques et téléphoniques");
    expect(a).toBe(b);
    expect(decomposed).toBe(b);
  });

  it("changes when the wording changes", () => {
    expect(purposeHash("installations électriques")).not.toBe(purposeHash("installations sanitaires"));
  });
});

describe("toCleanCompany", () => {
  const raw: RawCompany = {
    ehraid: "15706",
    uid: "CHE-107.036.057",
    chid: "CH55000774120",
    legalName: " Baumberger & Fils S.A. en liquidation ",
    purpose: "installations électriques",
    legalFormCode: "0106",
    street: "Chemin du Test 1",
    postalCode: "1004",
    locality: "Lausanne",
    canton: "VD",
    bfsId: 5586,
  };

  it("derives the Directus fields and geocodes from the postcode", () => {
    const c = toCleanCompany(raw, (plz) => (plz === "1004" ? [46.52829, 6.61865] : null));
    expect(c).toMatchObject({
      ehraid: "15706",
      uid: "CHE107036057",
      legal_name: "Baumberger & Fils S.A. en liquidation",
      legal_form_kind: "corporation",
      in_liquidation: true,
      canton: "VD",
      bfs_id: 5586,
      lat: 46.52829,
      lng: 6.61865,
      geo_source: "postcode_centroid",
      register_url: "https://register.ld.admin.ch/zefix/company/15706",
    });
    expect(c.purpose_hash).toHaveLength(64);
  });

  it("leaves coordinates null when the postcode is unknown", () => {
    const c = toCleanCompany({ ...raw, postalCode: "9999" }, () => null);
    expect(c.lat).toBeNull();
    expect(c.geo_source).toBeNull();
  });
});
