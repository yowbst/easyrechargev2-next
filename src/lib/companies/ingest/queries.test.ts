import { describe, expect, it } from "vitest";
import { fetchAllCmsCompanies, fetchPartnerUids } from "./queries";
import type { CmsCompany } from "./types";

describe("fetchAllCmsCompanies", () => {
  it("pages until a short page", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), ehraid: String(i) }) as CmsCompany);
    const paths: string[] = [];
    const rows = await fetchAllCmsCompanies((async (path: string) => {
      paths.push(path);
      return { data: paths.length === 1 ? page(500) : page(3) };
    }) as never);
    expect(rows).toHaveLength(503);
    expect(paths[1]).toContain("offset=500");
  });
});

describe("fetchPartnerUids", () => {
  it("asks only for id and uid of production partners and normalises the UID", async () => {
    let asked = "";
    const map = await fetchPartnerUids((async (path: string) => {
      asked = path;
      return { data: [{ id: "p1", uid: "CHE-107.036.057" }, { id: "p2", uid: null }, { id: "p3", uid: "junk" }] };
    }) as never);
    expect(asked).toContain("fields=id,uid");
    expect(asked).toContain("environment");
    expect(asked).toContain("production");
    expect([...map.entries()]).toEqual([["CHE107036057", "p1"]]);
  });
});
