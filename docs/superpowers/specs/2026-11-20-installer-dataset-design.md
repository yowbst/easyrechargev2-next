# Installer dataset from the commercial register: design

Date: 2026-11-20. Status: Phase 1 built, Phase 2 and 3 designed. Runbook: `docs/companies-ingest.md`.

## Intent

Know which companies install electrical systems in Switzerland, for two reasons. First, to
find installers to sell leads to in cantons where no partner is active (ZH, BE, AG, SG and
others; only VD, VS, FR, GE and NE are served). Second, to show real nearby installers on the
commune subsidies pages as local proof for visitors and search engines.

## Goals

- A queryable dataset of installer candidates for all of Switzerland, refreshed monthly.
- A sales list that exports to Attio and can be queried from claude.ai.
- Ingestion and storage first. Display on pages later, behind a canton gate.

## Non-goals

- Becoming a public installer directory. Pages show a handful of nearby companies, not one page per company.
- Automated outreach. The dataset holds follow-up status; a human does the contacting.
- Bulk crawling of the ESTI permit register (its robots.txt disallows it).

## Anti-goals

- Publishing a wrong or stale company on a page. Hence a publish rule that defaults to draft, a human override, and a kill switch.
- Personal data of sole proprietors or contact persons leaking into other tools or onto pages.
- Losing the human edits (prospect status, overrides) to a refresh. The pipeline never writes those fields.

## Approaches considered

| Question | Options | Chosen, and why |
|---|---|---|
| Register source | Zefix REST API (account by e-mail, no purpose filter) / LINDAS SPARQL (open, filterable by purpose text) | LINDAS. No account, and the purpose text is the only activity signal. |
| Which companies to store | Installers only / every candidate | Every candidate, as draft with its classification. A wrong label can then be overridden by hand and the diff stays stable. |
| Classification vendor | Gemini developer API (new key) / DataForSEO Gemini scraper (already integrated) | DataForSEO. One vendor already in use. Falls back to the developer API if replies are not parseable. |
| Postcode coordinates | Field on `localities` / generated dataset file | Generated file from swisstopo. No schema change and no 8,000 patches. |
| ESTI permit register | Scrape / ask for an export / skip | Deferred (owner, 2026-11-21). robots.txt disallows crawling and Bright Data refuses the host as Government. Preferred route is an extract requested from ESTI; the Directus fields are ready. |
| Refresh | Cron / manual with review | Manual monthly with a plan file, like the vehicle pipeline. Automate only the read-only parts later. |
| Prospect workflow | Directus only / Attio sync / CSV handoff | Directus is the source of truth, CSV export is the handoff, MCP tool for quick questions. No Attio integration in v1. |

## Decisions that came from the owner

- Names of companies, sole proprietors included, may appear on pages: they are public register data. Source line required: "Source : registre du commerce (Zefix)". An opt-out sentence goes with it.
- Non-partners show name, address and distance only. Partners also show phone, website and a badge.
- Selection: partners first, then SA and Sàrl before sole proprietorships, then distance; radius 5, 10, 25 km until at least 3; at most 5.
- Canton gate in Directus `global_config.installers.cantons`, VD first, VS/FR/GE/NE as control, kill criterion a 15 % drop in quote rate over 3 to 4 weeks.
- Branches are separate rows.

## Constraints

- The Directus static token cannot change schema; the admin token creates it once and is never used for a run.
- DataForSEO prompts are capped at 2,000 characters, which sets about 6 purposes per call.
- The register graph has no status field and no contacts.

## Phases

1. **Ingestion and storage (built).** Schema, postcode dataset, fetch, normalize, classify, plan, apply, report, export, MCP tools.
2. **Contact enrichment.** Bake-off first on 30 VD installers between four DataForSEO sources: Google Business Profile info, Google organic SERP with AI Overview, Google AI Mode, Gemini scraper. Winner rule: cheapest with at least 90 % phone accuracy and 80 % website coverage. Then verify every value against the company's own website through the Bright Data proxy and store it with source and date. Rejected candidates stay on disk, never in Directus.
3. **Nearby installers block** on `LocalitySubsidiesPage`, with JSON-LD, tracking and the canton gate.

## Left to the builder

Prompt tuning after the first full classification run; index choices for the Phase 3 query; wording of the opt-out sentence.
