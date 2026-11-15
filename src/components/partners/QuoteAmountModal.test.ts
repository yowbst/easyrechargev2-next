import { describe, expect, it } from "vitest";
import { parseQuotedAmount } from "./QuoteAmountModal";

describe("parseQuotedAmount", () => {
  it("accepts Swiss ways of writing a whole amount", () => {
    expect(parseQuotedAmount("2450")).toBe(2450);
    expect(parseQuotedAmount("2'450")).toBe(2450);
    expect(parseQuotedAmount("2’450")).toBe(2450);
    expect(parseQuotedAmount(" 2 450 ")).toBe(2450);
    expect(parseQuotedAmount("2450.-")).toBe(2450);
  });

  it("refuses decimals, text, zero and amounts over 100'000", () => {
    for (const bad of ["", "abc", "2450.50", "2,5", "0", "-100", "100001", "CHF 2450"]) {
      expect(parseQuotedAmount(bad)).toBeNull();
    }
  });
});
