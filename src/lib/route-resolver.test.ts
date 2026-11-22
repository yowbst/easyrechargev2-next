import { describe, expect, it, vi } from "vitest";
import type { PageRegistryEntry } from "./directus-queries";

vi.mock("./directus-queries", () => ({
  fetchPageRegistry: vi.fn(async () => [
    { id: "quote", slugs: { fr: "demande-devis", de: "offertenanfrage" } },
    { id: "quote-battery", slugs: { fr: "devis-batterie-solaire", de: "offerte-solarbatterie" } },
    { id: "contact", slugs: { fr: "contact", de: "kontakt" } },
    { id: "installation", slugs: { fr: "installation-borne-de-recharge", de: "installation-ladestation" } },
  ] as unknown as PageRegistryEntry[]),
}));

const UUID = "0b5e1f3c-1234-4abc-9def-0123456789ab";

describe("funnel routes", () => {
  it("resolves both funnel pages with their product", async () => {
    const { resolveSlugRoute } = await import("./route-resolver");
    expect(await resolveSlugRoute("demande-devis", "fr")).toMatchObject({ type: "quote", product: "ecp" });
    expect(await resolveSlugRoute("offerte-solarbatterie", "de")).toMatchObject({ type: "quote", product: "battery" });
    expect(await resolveSlugRoute("contact", "fr")).toMatchObject({ type: "contact" });
  });

  it("resolves the battery confirmation and submission pages", async () => {
    const { resolveSub1Route } = await import("./route-resolver");
    expect(await resolveSub1Route("devis-batterie-solaire", "confirmation", "fr")).toMatchObject({ type: "quote-success", product: "battery" });
    expect(await resolveSub1Route("devis-batterie-solaire", UUID, "fr")).toMatchObject({ type: "quote-submission", submissionId: UUID });
    expect(await resolveSub1Route("demande-devis", "confirmation", "fr")).toMatchObject({ type: "quote-success", product: "ecp" });
  });
});

describe("canton installation pages", () => {
  it("resolves the five served cantons in French", async () => {
    const { resolveSub1Route } = await import("./route-resolver");
    for (const [slug, code] of [["vaud", "VD"], ["valais", "VS"], ["fribourg", "FR"], ["geneve", "GE"], ["neuchatel", "NE"]]) {
      expect(await resolveSub1Route("installation-borne-de-recharge", slug, "fr")).toMatchObject({ type: "installation-canton", cantonSlug: slug, cantonCode: code });
    }
  });

  it("returns null for other cantons, German pages and prototype keys", async () => {
    const { resolveSub1Route } = await import("./route-resolver");
    expect(await resolveSub1Route("installation-borne-de-recharge", "zurich", "fr")).toBeNull();
    expect(await resolveSub1Route("installation-borne-de-recharge", "constructor", "fr")).toBeNull();
    expect(await resolveSub1Route("installation-ladestation", "waadt", "de")).toBeNull();
    expect(await resolveSub1Route("installation-ladestation", "vaud", "de")).toBeNull();
  });
});
