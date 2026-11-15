import * as cheerio from "cheerio";
import type { Issue } from "./geo-analysis";

export interface PageSeo {
  issues: Issue[];
  links: string[];
  title: string;
  description: string;
}

/**
 * Technical on-page checks for one HTML page: title, meta description, h1,
 * canonical, hreflang, image alt text. Also returns internal links so the
 * caller can keep crawling. Pure: no I/O.
 */
export function analyzePageSeo(url: string, html: string, siteUrl: string, stamp: string): PageSeo {
  const $ = cheerio.load(html);
  const issues: Issue[] = [];
  const add = (issue_type: string, severity: Issue["severity"], details: string) =>
    issues.push({ url, issue_type, severity, details, date_found: stamp, status: "open" });

  const title = $("title").text().trim();
  if (!title) add("missing_title", "critical", "No <title> tag");
  else if (title.length > 60) add("title_too_long", "warning", `Title is ${title.length} chars (max 60)`);

  const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
  if (!description) add("missing_meta_description", "critical", "No meta description");
  else if (description.length > 160)
    add("meta_description_too_long", "warning", `Meta description is ${description.length} chars (max 160)`);

  const h1Count = $("h1").length;
  if (h1Count === 0) add("missing_h1", "critical", "No H1 tag");
  else if (h1Count > 1) add("multiple_h1", "warning", `${h1Count} H1 tags found`);

  if (!$('link[rel="canonical"]').attr("href")) add("missing_canonical", "warning", "No canonical tag");
  if ($('link[rel="alternate"][hreflang]').length === 0) add("missing_hreflang", "warning", "No hreflang tags (fr/de site)");

  const noAlt = $("img").filter((_, el) => !$(el).attr("alt")?.trim()).length;
  if (noAlt > 0) add("missing_alt_text", "warning", `${noAlt} images without alt text`);

  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const resolved = new URL(href, url).href;
      if (resolved.startsWith(siteUrl)) links.add(resolved.split("#")[0].split("?")[0]);
    } catch {
      // Unparseable href: not a crawlable link.
    }
  });

  return { issues, links: [...links], title, description };
}

/** Issue types the crawl owns, so a re-run can auto-resolve the ones no longer found. */
export const CRAWL_ISSUE_TYPES = [
  "missing_title", "title_too_long", "missing_meta_description", "meta_description_too_long",
  "missing_h1", "multiple_h1", "missing_canonical", "missing_hreflang", "missing_alt_text", "redirect",
];
