---
name: geo-audit
description: Run a GEO (Generative Engine Optimization) audit on easyrecharge.ch
---

# GEO Audit

Audit easyrecharge.ch for AI visibility: is the content readable and citable by ChatGPT, Perplexity, Gemini and Google AI Overviews.

## Usage

`/geo-audit`

## Instructions

1. Run `npm run seo -- geo` (add `--dry-run` to skip the Google Sheet, `--url <page>` for one page).
2. Read the report: `seo/data/audits/<date>-geo-audit.json`.
3. Summarize:
   - **Site level:** are OAI-SearchBot, PerplexityBot, Google-Extended, ClaudeBot, ChatGPT-User, Amazonbot allowed in robots.txt; does `/llms.txt` exist.
   - **Per page (worst scores first):** JSON-LD types (BlogPosting, FAQPage, Person, ...), paragraphs of 2-3 sentences, question-format H2s, direct 40-60 word answers under H2s, days since update (flag > 90), author (a Person, not the Organization fallback), FAQ, citation density.
4. Report the average score, the worst 5 pages and the top issue types.
5. Recommend 3-5 actions by impact: unblock AI bots (if blocked), add llms.txt, assign a real author on posts that fall back to the Organization, refresh stale posts (`/content-refresh`), add question H2s and direct answers, add FAQ sections.

## Notes

- The audit reads JSON-LD from `@graph`, so a page that emits BlogPosting + Person + FAQPage is credited for all three. Trust "no schema" only after checking the page source.
- Only articles are checked for an author; the home page and landing pages are not.
- Blog posts come from the live `/sitemap/blog.xml`, French only.
