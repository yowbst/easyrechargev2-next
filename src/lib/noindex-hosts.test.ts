import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * Non-production hosts (staging.easyrecharge.ch, *.vercel.app previews) must
 * send X-Robots-Tag: noindex so search engines never index duplicate content.
 * The production apex easyrecharge.ch must NOT receive the header, or the
 * whole site would drop out of Google. These tests evaluate the next.config
 * `headers()` host conditions the same way Next.js does (anchored regex on
 * the `has: [{ type: "host" }]` value).
 */

type HeaderRule = {
  source: string;
  has?: { type: string; value?: string }[];
  headers: { key: string; value: string }[];
};

async function noindexHostPatterns(): Promise<string[]> {
  const rules = (await nextConfig.headers!()) as HeaderRule[];
  return rules
    .filter((rule) =>
      rule.headers.some(
        (h) => h.key === "X-Robots-Tag" && h.value.includes("noindex"),
      ),
    )
    .flatMap((rule) => rule.has ?? [])
    .filter((cond) => cond.type === "host" && cond.value)
    .map((cond) => cond.value!);
}

// Next.js compiles `has` values as anchored regexes.
function hostMatchesAnyPattern(host: string, patterns: string[]): boolean {
  return patterns.some((p) => new RegExp(`^${p}$`).test(host));
}

describe("noindex host headers", () => {
  it("sends noindex on staging and vercel preview hosts", async () => {
    const patterns = await noindexHostPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(hostMatchesAnyPattern("staging.easyrecharge.ch", patterns)).toBe(true);
    expect(
      hostMatchesAnyPattern("easyrechargev2-next-git-staging-yoan.vercel.app", patterns),
    ).toBe(true);
    expect(hostMatchesAnyPattern("easyrechargev2-next.vercel.app", patterns)).toBe(true);
  });

  it("never sends noindex on the production apex", async () => {
    const patterns = await noindexHostPatterns();
    expect(hostMatchesAnyPattern("easyrecharge.ch", patterns)).toBe(false);
    expect(hostMatchesAnyPattern("www.easyrecharge.ch", patterns)).toBe(false);
    // Every noindex rule must carry a host condition — a rule without one
    // would apply to ALL hosts, including production.
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    for (const rule of rules) {
      const isNoindex = rule.headers.some(
        (h) => h.key === "X-Robots-Tag" && h.value.includes("noindex"),
      );
      if (isNoindex) {
        expect(rule.has?.some((c) => c.type === "host")).toBe(true);
      }
    }
  });
});
