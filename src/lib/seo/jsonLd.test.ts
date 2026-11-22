import { describe, expect, it } from "vitest";
import { buildElectricianItemList, buildInstallationService, buildOrganization, resolveSameAs, wrapInGraph } from "./jsonLd";

describe("resolveSameAs", () => {
  it("keeps real profiles and drops bare platform homepages", () => {
    expect(
      resolveSameAs(undefined, [
        { url: "https://www.linkedin.com/company/easyrecharge" },
        { url: "https://x.com" },
        { url: "https://facebook.com/" },
        { url: "" },
        { url: null },
      ]),
    ).toEqual(["https://www.linkedin.com/company/easyrecharge"]);
  });

  it("merges configured profiles first and de-duplicates", () => {
    expect(
      resolveSameAs(
        { same_as: ["https://www.linkedin.com/company/easyrecharge", "https://g.page/r/abc"] },
        [{ url: "https://www.linkedin.com/company/easyrecharge" }],
      ),
    ).toEqual(["https://www.linkedin.com/company/easyrecharge", "https://g.page/r/abc"]);
  });

  it("ignores malformed URLs", () => {
    expect(resolveSameAs({ same_as: ["not a url"] }, [])).toEqual([]);
  });
});

describe("buildOrganization", () => {
  const logoUrl = "https://easyrecharge.ch/og-default.webp";

  it("stays minimal when no organization config exists", () => {
    const org = buildOrganization({ logoUrl });
    expect(org.sameAs).toEqual([]);
    expect(org).not.toHaveProperty("address");
    expect(org).not.toHaveProperty("contactPoint");
    expect(org).not.toHaveProperty("telephone");
    expect(org.areaServed).toEqual({ "@type": "Country", name: "CH" });
  });

  it("emits address and identifier, and a contactPoint only with a phone", () => {
    const withoutPhone = buildOrganization({
      logoUrl,
      organization: {
        uid: "CHE-397.088.419",
        address: { street: "Ch. de Sorécot 33", postal_code: "1033", locality: "Cheseaux-sur-Lausanne", region: "VD" },
      },
    });
    expect(withoutPhone.identifier).toBe("CHE-397.088.419");
    expect(withoutPhone.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "Ch. de Sorécot 33",
      postalCode: "1033",
      addressCountry: "CH",
    });
    expect(withoutPhone).not.toHaveProperty("contactPoint");

    const withPhone = buildOrganization({ logoUrl, organization: { telephone: "+41 21 000 00 00" } });
    expect(withPhone.contactPoint).toMatchObject({ telephone: "+41 21 000 00 00", areaServed: "CH" });
  });
});

describe("wrapInGraph", () => {
  it("drops null entries", () => {
    expect(wrapInGraph({ "@type": "A" }, null)["@graph"]).toEqual([{ "@type": "A" }]);
  });
});

describe("buildElectricianItemList", () => {
  it("lists electricians with address and UID, never contact fields", () => {
    const list = buildElectricianItemList("Électriciens près de Cheseaux", [
      { name: "Romelec SA", street: "Chemin du Village 6", postalCode: "1032", locality: "Romanel-sur-Lausanne", uid: "CHE-101.234.567" },
      { name: "X Sàrl", street: null, postalCode: null, locality: null, uid: "" },
    ]) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(list.numberOfItems).toBe(2);
    const first = list.itemListElement[0];
    expect(first).toMatchObject({ position: 1, item: { "@type": "Electrician", name: "Romelec SA" } });
    expect(first.item.address).toEqual({ "@type": "PostalAddress", addressCountry: "CH", streetAddress: "Chemin du Village 6", postalCode: "1032", addressLocality: "Romanel-sur-Lausanne" });
    expect(first.item.identifier.value).toBe("CHE-101.234.567");
    expect(list.itemListElement[1].item.identifier).toBeUndefined();
    const json = JSON.stringify(list);
    expect(json).not.toMatch(/telephone|"url"|geo|email/);
  });

  it("returns null for an empty list", () => {
    expect(buildElectricianItemList("x", [])).toBeNull();
  });
});

describe("buildInstallationService", () => {
  it("serves the canton as an AdministrativeArea", () => {
    const s = buildInstallationService({ name: "n", description: "d", cantonName: "Vaud", url: "https://easyrecharge.ch/fr/x/vaud" });
    expect(s).toMatchObject({ "@type": "Service", areaServed: { "@type": "AdministrativeArea", name: "Vaud" }, provider: { name: "easyRecharge" } });
  });
});
