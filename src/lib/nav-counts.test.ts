import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("./directus", () => ({ directusFetch: fetchMock, DIRECTUS_DEFAULT_LOCALE: "fr-FR" }));

afterEach(() => fetchMock.mockReset());

const layout = (navCounts?: Record<string, number>) => ({
  data: { header_config: { show_theme_toggle: true, ...(navCounts ? { nav_counts: navCounts } : {}) } },
});

function respond(counts: { vehicles?: number | Error; blog?: number | Error }, navCounts?: Record<string, number>) {
  fetchMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/items/site_settings")) return layout(navCounts);
    const value = path.startsWith("/items/vehicles") ? counts.vehicles : counts.blog;
    if (value instanceof Error) throw value;
    return { data: [{ count: { id: String(value) } }] };
  });
}

describe("fetchLayout nav counts", () => {
  it("replaces the Directus numbers with live published counts", async () => {
    respond({ vehicles: 830, blog: 4 }, { "header-vehicles": 530, "header-blog": 23 });
    const { fetchLayout } = await import("./directus-queries");
    const result = await fetchLayout("de-DE");

    expect(result?.header_config.nav_counts).toEqual({ "header-vehicles": 830, "header-blog": 4 });
    expect(result?.header_config.show_theme_toggle).toBe(true);
    const blogQuery = decodeURIComponent(fetchMock.mock.calls.find(([p]) => p.startsWith("/items/blog_posts"))![0]);
    expect(blogQuery).toContain("filter[status][_eq]=published");
    expect(blogQuery).toContain("filter[translations][languages_code][_eq]=de-DE");
  });

  it("keeps the Directus number when a count fails", async () => {
    respond({ vehicles: new Error("down"), blog: 28 }, { "header-vehicles": 530, "header-blog": 23 });
    const { fetchLayout } = await import("./directus-queries");
    expect((await fetchLayout("fr-FR"))?.header_config.nav_counts).toEqual({ "header-vehicles": 530, "header-blog": 28 });
  });

  it("shows no count where Directus configures none", async () => {
    respond({ vehicles: 830, blog: 28 });
    const { fetchLayout } = await import("./directus-queries");
    expect((await fetchLayout("fr-FR"))?.header_config.nav_counts).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
