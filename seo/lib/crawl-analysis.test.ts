import { describe, expect, it } from "vitest";
import { analyzePageSeo } from "./crawl-analysis";

const SITE = "https://easyrecharge.ch";
const types = (html: string) => analyzePageSeo(`${SITE}/fr/p`, html, SITE, "2026-11-15").issues.map((i) => i.issue_type);

const good = `<html><head><title>Borne de recharge</title>
  <meta name="description" content="Une description correcte.">
  <link rel="canonical" href="${SITE}/fr/p">
  <link rel="alternate" hreflang="de" href="${SITE}/de/p"></head>
  <body><h1>Titre</h1><img src="a.png" alt="une borne"></body></html>`;

describe("analyzePageSeo", () => {
  it("raises nothing on a complete page", () => {
    expect(types(good)).toEqual([]);
  });

  it("reports every missing basic", () => {
    expect(types("<html><body><img src='a.png'></body></html>")).toEqual([
      "missing_title", "missing_meta_description", "missing_h1", "missing_canonical", "missing_hreflang", "missing_alt_text",
    ]);
  });

  it("flags long titles, long descriptions and multiple h1", () => {
    const html = good
      .replace("Borne de recharge", "x".repeat(61))
      .replace("Une description correcte.", "y".repeat(161))
      .replace("<h1>Titre</h1>", "<h1>A</h1><h1>B</h1>");
    expect(types(html)).toEqual(["title_too_long", "meta_description_too_long", "multiple_h1"]);
  });

  it("collects only internal links, without fragments or query strings", () => {
    const html = `<body><a href="/fr/a?x=1#top">a</a><a href="https://other.ch/b">b</a>
      <a href="mailto:a@b.ch">m</a><a href="#s">s</a><a href="${SITE}/fr/c">c</a></body>`;
    expect(analyzePageSeo(`${SITE}/fr/p`, html, SITE, "d").links).toEqual([`${SITE}/fr/a`, `${SITE}/fr/c`]);
  });
});
