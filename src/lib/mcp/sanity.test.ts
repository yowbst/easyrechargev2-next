import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/form-hygiene";

describe("vitest setup", () => {
  it("resolves @/ alias against existing code", () => {
    expect(normalizeName("jean dupont")).toBe("Jean Dupont");
  });
});
