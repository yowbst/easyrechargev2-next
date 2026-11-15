---
name: keyword-import-ads
description: Import a Google Ads search terms or Keyword Planner export into Keywords Master
---

# Import Google Ads Data

Import a Search terms report (UTF-8 CSV) or a Keyword Planner download (UTF-16 TSV) into Keywords Master.

## Usage

`/keyword-import-ads <path>` — e.g. `/keyword-import-ads seo/data/keyword-planner-2026-07.csv`

## Instructions

1. Check the file exists.
2. Preview without writing: `npm run seo -- keywords import-ads "<path>" --dry-run` (rows parsed, valid keywords, first five).
3. Import: `npm run seo -- keywords import-ads "<path>"`.
4. Report parsed / valid / updated / new, and suggest `/keyword-cluster` if many new terms are unclustered.

Keyword Planner volumes are ranges for low-volume terms; treat them as orders of magnitude.
