---
name: content-draft
description: Write an article draft from a content brief
---

# Article Drafting

Write a full draft from an approved brief.

## Usage

`/content-draft <brief-filename>` — e.g. `/content-draft installer-borne-recharge-maison.md`

## Instructions

1. Read `seo/content/briefs/<filename>`.
2. Write the article (informative, practical, trustworthy; Swiss-French audience; prices in CHF; cantonal context where relevant):
   - `title` (primary keyword), `slug`, `body` (HTML, proper H2/H3, keyword in the first paragraph and at least one H2), `takeaways` (3 bullets, HTML list), `expert_advice` (1 paragraph, HTML).
   - Internal links: `{r:routeId}` for CMS pages (never a hardcoded `/fr/...`), plain URLs for posts.
3. GEO rules: a TL;DR block first; paragraphs of 2-3 sentences; conclusion before evidence; comparison tables for data; one sourced statistic per 150-200 words (OFEN, SuisseEnergie, TCS, Electrosuisse); at least one attributed expert quote; question-format H2s; a "Questions fréquentes" section of 3-5 answers of 75-150 words. No keyword stuffing.
4. Do not state a figure, price or legal point you cannot source. Flag every number and legal statement for the author to verify before publication.
5. Save to `seo/content/drafts/<slug>.md` with frontmatter (title, slug, author, categoryKey, tags, seo.title <= 60 chars, seo.description <= 160 chars) and sections `## BODY`, `## TAKEAWAYS`, `## EXPERT_ADVICE`, `## FAQ` (JSON array of `{question, answer}`).
6. No `## SCHEMA` block: the site builds BlogPosting and FAQPage JSON-LD itself from the post's author and `faq_json`. Only add custom JSON-LD when the post needs a type the site does not emit (a duplicate FAQPage is avoided automatically).
7. Set the Content Calendar row to `draft`. The author reviews and approves before anything is published.

## Publishing

Create the post in Directus with the MCP tool `directus_create_item` on `blog_posts` with `status: "draft"` (inspect `directus_fields blog_posts` and an existing post first for the translation structure). The user publishes it manually.
