---
name: keyword-discover
description: Discover keywords for a topic using GSC data and Google Autocomplete
---

# Keyword Discovery

Find keywords for a topic and add them to the Keywords Master tab.

## Usage

`/keyword-discover <topic>` — e.g. `/keyword-discover borne de recharge maison`

## Instructions

1. Run `npm run seo -- keywords discover "<topic>"`. It merges the latest GSC queries (run `npm run seo -- gsc` first) with Google Autocomplete (Swiss French) for prefix/suffix variations of the topic.
2. Read the new rows: `npm run seo -- sheet read keywordsMaster` and keep `status` = `new`.
3. Present the number found, the sources, and the top terms by GSC impressions.
4. Suggest `/keyword-cluster` to group them, or another seed topic.
