import { describe, expect, it } from "vitest";
import { CONTACT, FINALIZE, WELCOME, clampToFirstIncomplete, firstBlockingStep, stepSequence } from "./navigation";

const steps = [
  { id: "housing" },
  { id: "pv", skip: (d: Record<string, unknown>) => d.solarEquipment === "none" },
  { id: "consumption", skip: (d: Record<string, unknown>) => d.solarEquipment === "none" },
];

describe("stepSequence", () => {
  it("frames the product steps with welcome, contact and finalize", () => {
    expect(stepSequence(steps, {})).toEqual([WELCOME, "housing", "pv", "consumption", CONTACT, FINALIZE]);
  });

  it("drops skipped steps and brings them back when the answer changes (Review Focus 1)", () => {
    expect(stepSequence(steps, { solarEquipment: "none" })).toEqual([WELCOME, "housing", CONTACT, FINALIZE]);
    expect(stepSequence(steps, { solarEquipment: "exists" })).toEqual([WELCOME, "housing", "pv", "consumption", CONTACT, FINALIZE]);
  });
});

describe("clampToFirstIncomplete", () => {
  const seq = [WELCOME, "housing", "pv", CONTACT, FINALIZE];

  it("lands a deep link on the first step that still misses an answer", () => {
    const missing = (id: string) => (id === "pv" ? "pvPower" : null);
    expect(clampToFirstIncomplete(seq, FINALIZE, missing)).toBe("pv");
  });

  it("honours the requested step when everything before it is answered", () => {
    expect(clampToFirstIncomplete(seq, CONTACT, () => null)).toBe(CONTACT);
  });

  it("starts at welcome for an unknown or absent step", () => {
    expect(clampToFirstIncomplete(seq, "parking", () => null)).toBe(WELCOME);
    expect(clampToFirstIncomplete(seq, null, () => null)).toBe(WELCOME);
  });
});

describe("firstBlockingStep", () => {
  const noExit = () => false;

  it("finds the PV step left empty after switching solar back on (browser history)", () => {
    const data = { housingStatus: "owner", solarEquipment: "exists" };
    const seq = stepSequence(steps, data);
    const missing = (id: string) => (id === "pv" ? "pvPower" : null);
    expect(firstBlockingStep(seq, missing, noExit)).toBe("pv");
  });

  it("stops at an exit step (tenant), even when every answer is there", () => {
    const seq = [WELCOME, "housing", "pv", CONTACT, FINALIZE];
    expect(firstBlockingStep(seq, () => null, (id) => id === "housing")).toBe("housing");
  });

  it("returns the earliest blocking step in sequence order", () => {
    const seq = [WELCOME, "housing", "pv", CONTACT, FINALIZE];
    const missing = (id: string) => (id === CONTACT ? "email" : null);
    expect(firstBlockingStep(seq, missing, (id) => id === "pv")).toBe("pv");
  });

  it("never blocks on welcome, and returns null when everything is complete", () => {
    const seq = [WELCOME, "housing", CONTACT, FINALIZE];
    expect(firstBlockingStep(seq, (id) => (id === WELCOME ? "x" : null), noExit)).toBeNull();
  });
});
