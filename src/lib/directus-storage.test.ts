import { beforeEach, describe, expect, it, vi } from "vitest";

const directusFetch = vi.fn();
vi.mock("./directus", () => ({
  directusFetch: (...args: unknown[]) => directusFetch(...args),
}));

import { storage } from "./directus-storage";

describe("createFormSubmission", () => {
  beforeEach(() => {
    directusFetch.mockReset();
    directusFetch.mockResolvedValue({ data: { id: "sub-1" } });
  });

  it("caps fields to their column limits so Postgres does not reject the insert", async () => {
    // Real-world failure: Google Ads landing URLs carry utm_* + gclid query
    // strings well past the 255-char column limit (PostHog issue 019f793a-…).
    // location_params is a text column (cap 2000); location_path is varchar(255).
    const longParams = "utm_source=google&utm_medium=cpc&gclid=" + "x".repeat(400);
    const longPath = "/fr/" + "a".repeat(300);

    await storage.createFormSubmission({
      session: "sess-1",
      user: null,
      form_type: "mini-quote-form",
      location_route: "home",
      location_path: longPath,
      location_params: longParams,
      data: { housingStatus: "owner", postalCode: "1806" },
    });

    const [path, init] = directusFetch.mock.calls[0];
    expect(path).toBe("/items/form_submissions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.location_params).toBe(longParams); // under 2000 → preserved in full
    expect(body.location_path.length).toBe(255);
    expect(body.data).toEqual({ housingStatus: "owner", postalCode: "1806" });
  });

  it("still caps location_params at 2000 chars", async () => {
    await storage.createFormSubmission({
      session: "sess-1",
      user: null,
      form_type: "quote",
      location_params: "q=" + "y".repeat(3000),
      data: {},
    });

    const body = JSON.parse((directusFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.location_params.length).toBe(2000);
  });

  it("keeps null location fields as null", async () => {
    await storage.createFormSubmission({
      session: "sess-1",
      user: null,
      form_type: "contact",
      location_path: null,
      location_params: null,
      data: {},
    });

    const body = JSON.parse((directusFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.location_path).toBeNull();
    expect(body.location_params).toBeNull();
  });
});
