---
name: seo-audit
description: Run technical SEO audits on easyrecharge.ch (crawl, GSC, GEO)
---

# SEO Audit

Technical SEO audits of easyrecharge.ch (Next.js, server-rendered). All run from the repo root through `npm run seo`.

## Usage

- `/seo-audit` — crawl, gsc and geo in turn
- `/seo-audit crawl` — titles, meta descriptions, h1, canonical, hreflang, alt text
- `/seo-audit gsc` — Search Console data
- `/seo-audit geo` — AI-readiness (see `/geo-audit`)

PageSpeed and the programmatic-page ("spin") audits are not ported yet; for Core Web Vitals use `npx lighthouse@12 <url> --only-categories=performance` (the keyless PageSpeed API is permanently rate-limited).

## Instructions

1. Run the requested command(s): `npm run seo -- crawl`, `npm run seo -- gsc`, `npm run seo -- geo`. Add `--dry-run` to crawl/geo to leave the Sheet untouched.
2. After each one, read its output and summarize:
   - **Crawl:** pages crawled, issues by severity, the critical ones (missing title, h1, meta description; HTTP errors).
   - **GSC:** top queries, quick wins (position 5-20, high impressions), low-CTR pages.
   - **GEO:** average score, worst pages, bot access, llms.txt.
3. When running all, end with one prioritized action list.

## Notes

- Results land in the Site Health, Score History and Issues tabs of the SEO workbook, and raw files under `seo/data/` (gitignored).
- `gsc` needs the service account added to the Search Console property; see `docs/seo.md`.
