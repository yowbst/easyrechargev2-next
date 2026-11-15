---
name: content-brief
description: Generate a content brief for a target keyword
---

# Content Brief

Create a brief for an article targeting a keyword.

## Usage

`/content-brief <keyword>` — e.g. `/content-brief installer borne recharge maison suisse`

## Instructions

1. Look the keyword up in Keywords Master (`npm run seo -- sheet read keywordsMaster`) for cluster, intent, volume, position.
2. Analyze the top 5-10 SERP results (web search): topics, heading structure, angle, and what easyrecharge.ch could add that they do not.
3. Find internal-link opportunities with the MCP tool `list_blog_posts`, and check which existing posts convert (PostHog Acquisition dashboard).
4. Write the brief to `seo/content/briefs/<slug>.md`:

```markdown
# Content Brief: <Title>

## Target
- Primary keyword / secondary keywords / search intent / target word count

## SERP Analysis
- Competitor angles; gaps to exploit

## Outline
- H1: <title>
- H2: <question format: "Comment...?", "Combien...?"> + key points

## Internal Links
- <existing post title> (URL). Use {r:routeId} for CMS pages, a plain URL for posts.

## Unique Angle
Why this is different for Swiss homeowners considering a charger

## Takeaways (3 bullets) / Expert Advice (1 paragraph)

## GEO
- 3-5 Swiss sources (OFEN, SuisseEnergie, TCS, Electrosuisse); 1 statistic per 150-200 words
- Question H2s, a 40-60 word direct answer under each, a TL;DR, a table if useful
- FAQ: 3-5 questions, 75-150 words each
- Author: a named Person
```

5. Every figure in the brief needs a source; if there is none, drop the claim rather than keep it.
6. Set the Content Calendar row to `brief` and show the brief for feedback before drafting.
