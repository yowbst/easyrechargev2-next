# Solar offer roadmap: cross-sell add-ons and solarcharge.ch

Status: direction agreed 2026-11-14. Not yet specified, and not ready to build. Each phase below gets its own spec.
The first phase, battery visibility on easyrecharge.ch, is specified in issue #11.

## Why

- easyRecharge earns money per Lead dispatched to Partners.
- The charger (ECP) brings the traffic, through SEO on vehicles, the blog and "borne de recharge", and through a homepage that converts. None of that may suffer.
- The solar battery has been live since 2026-10-03 with no real Leads yet. Photovoltaic panels (PV) are the next product.
- Goal: grow the solar products and capture as many billable Leads per visitor as possible.

## Decisions so far

**The two sites**
- **easyrecharge.ch stays charger-first.**
  - The hero, mini-quote and header CTA stay charger-only.
  - Solar products get discreet entry points: a menu item and a homepage section (issue #11).
- **solarcharge.ch becomes the battery + PV brand**, aiming to rank over time for "batterie solaire" and "panneaux solaires".
  - It is served from this same repo, Directus and Vercel project.
  - It is not a separate platform.
- **One product, one home domain.**
  - Battery and PV pages are indexed only on solarcharge.ch.
  - Charger, vehicle and blog pages are indexed only on easyrecharge.ch.
  - Content is never duplicated, which avoids Google splitting or filtering the two versions.
  - Legal pages may exist on both domains, with `noindex` on one of them.

**Funnels**
- **The battery and PV funnels are served on solarcharge.ch** for visitors who land there.
  - Attribution cookies, cookie consent and PostHog identity are all tied to one domain.
  - A hop between domains in the middle of the journey would lose the ad-click data and show the cookie banner a second time.
- **easyrecharge.ch keeps its own copy of the battery funnel** for its menu, homepage section and add-ons. That copy becomes `noindex` once solarcharge.ch is live.
- **easyrecharge.ch links to solarcharge.ch from the footer.** This passes authority without adding a hop to the journey.

**Back office**
- **Dispatch to Partners and billing are shared across both sites.** It is one engine: the products registry, `partner_products`, dispatch, the Partner CRM and invoicing. A Lead's site is a property of the Lead.

**Brand**
- **solarcharge has no brand assets yet.** A wordmark and palette will be proposed from the easyRecharge design system, for Yoan to approve.

## Phases

### 1. Battery visibility on easyrecharge.ch

Issue #11.

### 2. Cross-sell add-ons between products

This generalizes the battery add-on that is already live in the charger funnel (flag `quote-battery-addon`). It keeps the same rules:
- the explicit opt-in is the consent, and a Lead without it cannot be invoiced;
- one linked Lead per product, dispatched and billed separately;
- `origin` and `linked_submission` are set on each submission.

Target network:

| Funnel | Offers as add-on |
|---|---|
| Charger | battery (owner or PPE, with panels, no battery) and PV (owner or PPE, no panels) |
| Battery | charger |
| PV | battery and charger |

- **New product `pv`.**
  - A short PV quote form (about 4 questions plus contact details) and the add-ons create PV Leads.
  - They are stored but not dispatched until PV Partners are signed; the "not dispatchable" behaviour goes through a category rule.
  - The opt-in wording must not promise a Partner quote yet. This is a legal point for Yoan.
- **Open points:**
  - Can one visitor take several add-ons at once, for example a charger visitor with no panels taking PV and battery together?
  - Which charger questions does the battery funnel need to ask for its charger add-on?
  - How should add-on eligibility be expressed generically (a matrix per product pair rather than ad-hoc code)?
- Code note: adding a product means filling about 10 `Record<Product, …>` maps; the checklist is the header comment of `src/lib/products.ts`. `funnelRouteFor` throws for a product that has no funnel route.

### 3. solarcharge.ch

From the code survey of 2026-11-14 (to size the spec):

**Host and SEO**
- Nothing in the code depends on the host today. About 15 files copy `SITE_URL`.
- `getSiteUrl()` in `src/lib/seo/resolver.ts` is the natural place to make it depend on the brand.
- The `isProduction` checks in `src/app/layout.tsx` and `src/app/robots.ts` would mark solarcharge.ch `noindex`.

**Routing**
- Add a host rewrite in `src/proxy.ts`, which has no host logic today.
- The `/` → `/fr` redirect and the WordPress redirects in `next.config.ts` need host conditions. The existing `has: host` rules in `next.config.ts` `headers()` are guarded by `noindex-hosts.test.ts`; extend those to cover the new host.

**Directus**
- Add a `site` field on `pages`, filtered in `fetchPageRegistry`, `fetchPage` and the sitemap's `getCmsEntries`.
- The solar home needs its own `route_id`.
- `site_settings` is a singleton (nav, footer, ads IDs). It needs one record per site.

**Branding, SEO output and analytics**
- The logo and brand name are written directly into the code in `Header.tsx`, `Footer.tsx` and `jsonLd.ts`; the root metadata also contains charger wording.
- Each host needs its own sitemap and robots.txt, plus Google Ads and ChatGPT pixel checks for the second domain.
- Cookies and consent are set per domain, which is fine because the whole journey stays on one host.

**Partners**
- Partner e-mails and CRM links can stay on easyrecharge.ch.
- Open point: which brand Partners see on solarcharge.ch Leads.

**Migration**
- Battery URLs on easyrecharge.ch get 301 redirects to solarcharge.ch, except the copy that easyRecharge's own entry points and the add-on still use.
- Ship the redirects in the same deploy as any slug change. In October, a slug rename went out without its redirects and the old URLs returned 404 for three weeks.
