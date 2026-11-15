---
name: content-refresh
description: Identify stale content and prioritize articles for refresh
---

# Content Refresh

Find published posts untouched for more than 90 days and rank them by traffic.

## Usage

`/content-refresh`

## Instructions

1. Run `npm run seo -- freshness` (add `--dry-run` to skip the Sheet; without it the stale posts are written to the Content Calendar as `[REFRESH]` rows, ranked by GSC impressions when the Performance tab is filled).
2. Present: total published, stale count, and the top 10 candidates with title, days since update and impressions.
3. Weigh impressions against conversion: PostHog's Acquisition dashboard ("Top landing pages that start quotes") shows which posts start quotes. Refresh those first, even with few impressions.
4. For the top 3, suggest concrete refreshes: current statistics and sources, a FAQ if missing, question-format H2s, a real author (a Person) in Directus, then saving in Directus so `date_updated` moves.
5. Ask which to refresh, then `/content-brief <keyword>` for each.

A post's date is Directus `date_updated`: any save resets it, so do not "refresh" by re-saving unchanged content.
