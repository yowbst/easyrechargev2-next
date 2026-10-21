import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/directus", () => ({ directusFetch: vi.fn() }));
vi.mock("@/lib/directus-storage", () => ({ getEnvironment: () => "development" }));

const { resolveLinkedForPartner } = await import("./partner-dashboard-queries");

const card = (id: string) => ({ submission: { id } });

describe("resolveLinkedForPartner", () => {
  it("links both requests when the partner holds both", () => {
    const links = new Map([["ecp1", "bat1"], ["bat1", "ecp1"]]);
    const out = resolveLinkedForPartner([card("ecp1"), card("bat1")], links);
    expect(out.map((c) => c.linkedSubmissionId)).toEqual(["bat1", "ecp1"]);
  });

  it("hides a link to a request another partner holds", () => {
    const links = new Map([["ecp1", "bat1"]]);
    expect(resolveLinkedForPartner([card("ecp1")], links)[0].linkedSubmissionId).toBeNull();
  });

  it("leaves unlinked cards without a link", () => {
    expect(resolveLinkedForPartner([card("x"), { submission: null }], new Map())[1].linkedSubmissionId).toBeNull();
  });
});
