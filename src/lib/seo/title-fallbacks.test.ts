import { describe, expect, it } from "vitest";
import { extractItemSEO, mergeItemOverTemplate, normalizeTitle, pickFittingTitle } from "./resolver";

const fieldMap = (name: string) => ({ name });

describe("pickFittingTitle", () => {
  const candidates = ["{f:name} : temps de recharge et borne", "{f:name} : recharge à domicile", "{f:name}"];

  it("keeps the most specific title when it fits", () => {
    expect(pickFittingTitle(candidates, fieldMap("Peugeot e-2008 54 kWh (MY24)"))).toBe(
      "Peugeot e-2008 54 kWh (MY24) : temps de recharge et borne",
    );
  });

  it("steps down to a shorter variant for a long name", () => {
    const name = "Tesla Model Y Long Range AWD (MY25)"; // 35 chars: 64 with the long suffix, 57 with the short one
    expect(pickFittingTitle(candidates, fieldMap(name))).toBe(`${name} : recharge à domicile`);
  });

  it("falls back to the bare name, and never needs an ellipsis", () => {
    const name = "Nissan Ariya e-4ORCE 87kWh - 320 kW Nismo (MY22-25)"; // 51 chars
    const title = pickFittingTitle(candidates, fieldMap(name))!;
    expect(title).toBe(name);
    expect(normalizeTitle(title)).not.toContain("…");
  });

  it("returns the last candidate when nothing fits, and skips empty ones", () => {
    const long = "x".repeat(70);
    expect(pickFittingTitle([undefined, "{f:name} : a", "{f:name}"], fieldMap(long))).toBe(long);
    expect(pickFittingTitle([], fieldMap("A"))).toBeUndefined();
  });

  it("keeps today's behaviour when the template has no fallbacks", () => {
    expect(pickFittingTitle(["{f:name} | easyRecharge"], fieldMap("Kia EV3"))).toBe("Kia EV3 | easyRecharge");
  });
});

describe("title fallbacks from Directus", () => {
  it("reads title_fallbacks and drops blanks", () => {
    const seo = extractItemSEO({ title: "{f:name} : long", title_fallbacks: ["{f:name} : short", " ", 3, "{f:name}"] });
    expect(seo?.titleFallbacks).toEqual(["{f:name} : short", "{f:name}"]);
  });

  it("omits the key when there are none", () => {
    expect(extractItemSEO({ title: "T" })).not.toHaveProperty("titleFallbacks");
  });

  it("keeps the template's fallbacks unless the item sets its own title", () => {
    const template = { title: "{f:name} : long", titleFallbacks: ["{f:name}"] };
    expect(mergeItemOverTemplate({ description: "d" }, template)?.titleFallbacks).toEqual(["{f:name}"]);
    expect(mergeItemOverTemplate({ title: "Own title" }, template)?.titleFallbacks).toBeUndefined();
  });
});
