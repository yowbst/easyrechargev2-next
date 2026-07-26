import { describe, it, expect } from "vitest";
import { serializeQuoteDraft, parseQuoteDraft, QUOTE_DRAFT_TTL_MS } from "./quoteDraft";

describe("quoteDraft", () => {
  const NOW = 1_800_000_000_000;

  it("round-trips form data", () => {
    const data = { firstName: "A", electricalLineDistance: 10, acceptTerms: true };
    const parsed = parseQuoteDraft(serializeQuoteDraft(data, NOW), NOW + 1000);
    expect(parsed).toMatchObject({ firstName: "A", electricalLineDistance: 10 });
  });

  it("never restores acceptTerms", () => {
    const parsed = parseQuoteDraft(serializeQuoteDraft({ acceptTerms: true }, NOW), NOW);
    expect(parsed?.acceptTerms).toBeUndefined();
  });

  it("expires after the TTL", () => {
    const raw = serializeQuoteDraft({ firstName: "A" }, NOW);
    expect(parseQuoteDraft(raw, NOW + QUOTE_DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("tolerates garbage input", () => {
    expect(parseQuoteDraft(null, NOW)).toBeNull();
    expect(parseQuoteDraft("not json", NOW)).toBeNull();
    expect(parseQuoteDraft('{"v":99,"t":1,"data":{}}', NOW)).toBeNull();
  });
});
