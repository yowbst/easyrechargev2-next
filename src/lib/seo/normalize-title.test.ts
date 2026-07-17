import { describe, expect, it } from "vitest";
import { normalizeTitle } from "./resolver";

describe("normalizeTitle", () => {
  it("appends the brand suffix to short titles", () => {
    expect(normalizeTitle("Mentions légales")).toBe(
      "Mentions légales | easyRecharge",
    );
  });

  it("strips an existing brand suffix before normalizing", () => {
    expect(normalizeTitle("Mentions légales | easyRecharge")).toBe(
      "Mentions légales | easyRecharge",
    );
  });

  it("keeps long titles whole (≤60) instead of ellipsis-truncating for the brand", () => {
    // 56 chars — previously became "Installation borne de recharge en Suisse |… | easyRecharge"
    const t = "Installation borne de recharge en Suisse | Devis gratuit";
    expect(normalizeTitle(t)).toBe(t);
    expect(normalizeTitle(t).length).toBeLessThanOrEqual(60);
  });

  it("word-boundary truncates titles over 60 chars", () => {
    const long =
      "Guide complet pour installer une borne de recharge dans une copropriété en Suisse romande";
    const out = normalizeTitle(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("easyRecharge");
  });
});
