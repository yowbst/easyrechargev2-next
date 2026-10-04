import { describe, expect, it } from "vitest";
import { CONTACT, clampToFirstIncomplete, firstBlockingStep, stepSequence } from "./navigation";

const steps = [
  { id: "housing" },
  { id: "pv", skip: (d: Record<string, unknown>) => d.solarEquipment === "none" },
  { id: "consumption", skip: (d: Record<string, unknown>) => d.solarEquipment === "none" },
];

describe("stepSequence", () => {
  it("ends the product steps with the contact step — no welcome, no finalize", () => {
    expect(stepSequence(steps, {})).toEqual(["housing", "pv", "consumption", CONTACT]);
  });

  it("drops skipped steps and brings them back when the answer changes", () => {
    expect(stepSequence(steps, { solarEquipment: "none" })).toEqual(["housing", CONTACT]);
    expect(stepSequence(steps, { solarEquipment: "exists" })).toEqual(["housing", "pv", "consumption", CONTACT]);
  });
});

describe("clampToFirstIncomplete", () => {
  const seq = ["housing", "pv", CONTACT];

  it("lands a deep link on the first step that still misses an answer", () => {
    const missing = (id: string) => (id === "pv" ? "pvPower" : null);
    expect(clampToFirstIncomplete(seq, CONTACT, missing)).toBe("pv");
  });

  it("honours the requested step when everything before it is answered", () => {
    expect(clampToFirstIncomplete(seq, CONTACT, () => null)).toBe(CONTACT);
  });

  it("starts at the first question for an unknown or absent step", () => {
    expect(clampToFirstIncomplete(seq, "parking", () => null)).toBe("housing");
    expect(clampToFirstIncomplete(seq, null, () => null)).toBe("housing");
    // The old welcome / finalize URLs land on the first question, then on contact.
    expect(clampToFirstIncomplete(seq, "welcome", () => null)).toBe("housing");
  });
});

describe("firstBlockingStep", () => {
  const noExit = () => false;

  it("finds the PV step left empty after switching solar back on (browser history)", () => {
    const seq = stepSequence(steps, { housingStatus: "owner", solarEquipment: "exists" });
    const missing = (id: string) => (id === "pv" ? "pvPower" : null);
    expect(firstBlockingStep(seq, missing, noExit)).toBe("pv");
  });

  it("stops at an exit step (tenant), even when every answer is there", () => {
    expect(firstBlockingStep(["housing", "pv", CONTACT], () => null, (id) => id === "housing")).toBe("housing");
  });

  it("returns the earliest blocking step, and null when everything is complete", () => {
    const seq = ["housing", "pv", CONTACT];
    expect(firstBlockingStep(seq, (id) => (id === CONTACT ? "email" : null), (id) => id === "pv")).toBe("pv");
    expect(firstBlockingStep(seq, () => null, noExit)).toBeNull();
  });
});
