import { describe, expect, it } from "vitest";
import { canTransition } from "./invoice";

describe("canTransition", () => {
  it("allows the happy path", () => {
    expect(canTransition("issued", "sent")).toBe(true);
    expect(canTransition("sent", "paid")).toBe(true);
    expect(canTransition("sent", "disputed")).toBe(true);
    expect(canTransition("disputed", "sent")).toBe(true);
  });

  it("allows cancelling anything not yet paid", () => {
    expect(canTransition("issued", "cancelled")).toBe(true);
    expect(canTransition("sent", "cancelled")).toBe(true);
    expect(canTransition("disputed", "cancelled")).toBe(true);
  });

  it("treats paid and cancelled as terminal", () => {
    expect(canTransition("paid", "sent")).toBe(false);
    expect(canTransition("paid", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "issued")).toBe(false);
  });

  it("refuses skipping straight from issued to paid", () => {
    expect(canTransition("issued", "paid")).toBe(false);
  });

  it("refuses a no-op transition", () => {
    expect(canTransition("sent", "sent")).toBe(false);
  });
});
