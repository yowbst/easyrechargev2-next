import { describe, it, expect } from "vitest";
import { capSubmissionData, isValueTooLongError } from "./directus-storage";

describe("isValueTooLongError", () => {
  it("matches the Directus oversized-value 400", () => {
    const err = new Error(
      'Directus 400: {"errors":[{"message":"Value \\"[object Object]\\" for field \\"data\\" is too long."}]}',
    );
    expect(isValueTooLongError(err)).toBe(true);
  });

  it("ignores other 400s and non-length errors", () => {
    expect(isValueTooLongError(new Error("Directus 400: field required"))).toBe(false);
    expect(isValueTooLongError(new Error("Directus 500: too long"))).toBe(false);
    expect(isValueTooLongError(undefined)).toBe(false);
  });
});

describe("capSubmissionData", () => {
  const bigField = "x".repeat(5000);
  const data = {
    housingStatus: "owner",
    postalCode: "1201",
    locality: "Genève",
    canton: "GE",
    notes: bigField,
  };

  it("shrinks the payload to fit the limit", () => {
    const capped = capSubmissionData(data, 500);
    expect(JSON.stringify(capped).length).toBeLessThanOrEqual(500);
  });

  it("flags truncation and records the original size", () => {
    const capped = capSubmissionData(data, 500);
    expect(capped._truncated).toBe(true);
    expect(capped._original_size).toBe(JSON.stringify(data).length);
  });

  it("preserves short fields verbatim, truncating only long ones", () => {
    const capped = capSubmissionData(data, 500);
    expect(capped.canton).toBe("GE");
    expect(capped.postalCode).toBe("1201");
    expect(String(capped.notes)).toContain("…[truncated]");
    expect(String(capped.notes).length).toBeLessThan(bigField.length);
  });

  it("returns a guaranteed-tiny payload when the limit is too small to fit any field", () => {
    const capped = capSubmissionData(data, 10);
    expect(capped._truncated).toBe(true);
    expect(capped._note).toBeTypeOf("string");
    expect(capped._original_size).toBe(JSON.stringify(data).length);
  });

  it("leaves an already-small payload structurally intact", () => {
    const small = { canton: "VD", postalCode: "1000" };
    const capped = capSubmissionData(small, 500);
    expect(capped.canton).toBe("VD");
    expect(capped.postalCode).toBe("1000");
    expect(capped._truncated).toBe(true);
  });
});
