---
name: seo-performance
description: Fetch latest GSC data and flag performance trends
---

# SEO Performance Review

Fetch fresh Search Console data and analyze trends.

## Usage

`/seo-performance`

## Instructions

1. Run `npm run seo -- gsc`.
2. Read the Performance tab to compare with earlier pulls: `npm run seo -- sheet read performance` (rows are appended per run, so group by `date`).
3. Present:
   - **Overall:** clicks, impressions, average position against the previous pull.
   - **Growing and declining pages.**
   - **Quick wins:** keywords ranking 5-20 with high impressions.
   - **CTR opportunities:** pages with high impressions and CTR under 3%.
4. For each, one concrete action: declining page -> update content; low CTR -> rewrite title/meta; quick-win keyword -> optimize the existing page or write a new one.
5. Cross-check with PostHog (Acquisition dashboard): a query with impressions but no quote starts is traffic that does not convert.
