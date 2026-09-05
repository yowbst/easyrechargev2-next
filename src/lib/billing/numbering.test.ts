import { describe, expect, it } from "vitest";
import { buildInvoiceNumber } from "./numbering";

describe("buildInvoiceNumber", () => {
  it("builds CODE-YYYYMM for the first issuance", () => {
    expect(buildInvoiceNumber("EME", "2026-07")).toBe("EME-202607");
    expect(buildInvoiceNumber("EME", "2026-07", 1)).toBe("EME-202607");
  });

  it("suffixes re-issuances with their rank", () => {
    expect(buildInvoiceNumber("EME", "2026-07", 2)).toBe("EME-202607-R2");
    expect(buildInvoiceNumber("EME", "2026-07", 3)).toBe("EME-202607-R3");
  });

  it("uppercases and trims the code", () => {
    expect(buildInvoiceNumber("  eme ", "2026-07")).toBe("EME-202607");
  });

  it("refuses a missing code rather than guessing one", () => {
    expect(() => buildInvoiceNumber("", "2026-07")).toThrow("missing_invoice_code");
    expect(() => buildInvoiceNumber("   ", "2026-07")).toThrow("missing_invoice_code");
  });

  it("rejects a malformed month", () => {
    expect(() => buildInvoiceNumber("EME", "2026-7")).toThrow("invalid_month");
  });
});
