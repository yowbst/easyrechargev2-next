---
name: seo-fix-priorities
description: Read the Issues tab and rank open issues by SEO impact
---

# SEO Fix Priorities

Rank open issues by impact.

## Instructions

1. Read the Issues tab: `npm run seo -- sheet read issues`.
2. Keep rows with status `open`.
3. Prioritize:
   - critical severity first (missing title/h1/meta description, 5xx);
   - pages with the most impressions (cross-reference `npm run seo -- sheet read performance`);
   - quick wins (a missing meta description is a five-minute fix).
4. Group by category (crawl, geo) and present a numbered list: the issue, the URL, why it matters, the suggested fix.
5. Ask which fix to tackle.
