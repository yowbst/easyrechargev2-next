# Installation service page — `/fr/installation-borne-de-recharge`

SEO landing page targeting "installation borne de recharge" queries
(pos. 14–18, ~600 monthly impressions across variants, no dedicated page).

## Status

- **Code: shipped.** `src/components/InstallationServicePage.tsx` renders the
  page (H1, question-form H2s, price table with live charger-catalog bounds,
  FAQ with FAQPage JSON-LD, GetQuote CTA). The route case in
  `src/app/[lang]/[slug]/page.tsx` activates for the Directus page with
  `route_id: "installation"`. Verified rendering locally with the payload
  below: 913 words, FAQPage schema valid, all internal links resolve.
- **Directus page: NOT created.** The app's `DIRECTUS_STATIC_TOKEN` role has
  update-only permissions (no create on `pages`/`pages_translations`), so the
  page must be created by an admin.

## Step 1 — create the page (admin)

Option A (API, with an **admin** token):

```bash
curl -X POST "$DIRECTUS_URL/items/pages" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d @docs/installation-page.payload.json
```

Option B (Directus UI): create a page with `status: published`,
`route_id: installation`, `type: app`, and copy the two translations
(fr-FR slug `installation-borne-de-recharge`, de-DE slug
`installation-ladestation`) from `docs/installation-page.payload.json` —
including the `seo` and `content` JSON fields verbatim.

The page appears on the site within the ISR window (≤1h) or on the next
deploy. The sitemap picks it up automatically via the page registry.

## Step 2 — internal links (after the page exists)

These are `update` operations (the app token can do them — or ask Claude to
run them once the page is created):

1. **Footer quick links** (covers the homepage + all pages): add an item to
   the `footer_quick_links` navigation pointing to the new page
   (fr: "Installation de borne de recharge", de: "Installation Ladestation").
   NOTE: creating a `navigation_items` row also needs admin/create rights —
   alternatively add the link from the Directus UI.
2. **Blog articles** (contextual links to `/fr/installation-borne-de-recharge`):
   - `combien-coute-linstallation-dune-borne-de-recharge-electrique`
   - `quel-electricien-est-competent-pour-installer-une-borne-de-recharge`
   - `pourquoi-installer-une-borne-de-recharge-a-domicile-quels-sont-les-avantages`
   Add a sentence near the top or in the conclusion, e.g.
   « easyRecharge organise votre [installation de borne de recharge](/fr/installation-borne-de-recharge)
   à prix fixe, partout en Suisse romande. »
