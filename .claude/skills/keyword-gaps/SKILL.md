---
name: keyword-gaps
description: Analyze content gaps by comparing keyword clusters vs existing content
---

# Keyword Gap Analysis

Find clusters that have keywords but no published content.

## Usage

`/keyword-gaps`

## Instructions

1. Run `npm run seo -- keywords gaps`.
2. Review the clusters with no content and the under-served ones (published on under 30% of terms).
3. Rank by opportunity (impressions, keyword count), then cross-check with PostHog: a gap only matters if its topic leads to quote starts. Landing-page families on the Acquisition dashboard show which kinds of page convert.
4. For the top 5 gaps, propose a specific article, then add the chosen ones to the Content Calendar tab (`npm run seo -- sheet upsert contentCalendar target_keyword <json-file>`).
5. Suggest `/content-brief <keyword>` for the first one.
