---
name: seo-dashboard
description: Show a summary of the SEO workbook status
---

# SEO Dashboard

Summarize the SEO workbook (Google Sheets).

## Usage

`/seo-dashboard`

## Instructions

1. Read the tabs you need with `npm run seo -- sheet read <tab>`: `keywordsMaster`, `contentCalendar`, `topicClusters`, `performance`, `siteHealth`, `scoreHistory`, `issues`, `aiCitations`.
2. Summarize:
   - **Keywords:** total and by status (new / clustered / targeted / published).
   - **Content Calendar:** articles by status.
   - **Topic clusters:** total and gaps.
   - **Site Health:** GEO score and crawl status per page.
   - **Score History:** are scores improving?
   - **Issues:** open ones by category and severity.
   - **Performance:** the latest GSC snapshot.
   - **AI Citations:** the latest monthly check (how often easyRecharge is cited, by engine).
3. Point to the next action: unclustered keywords -> `/keyword-cluster`; gaps -> `/keyword-gaps`; open critical issues -> `/seo-fix-priorities`; GSC data older than 7 days -> `/seo-audit gsc`; low GEO scores -> `/geo-audit`; stale posts -> `/content-refresh`.
4. For traffic and quote conversion by channel and landing page, use the PostHog Acquisition dashboard, not this workbook.
