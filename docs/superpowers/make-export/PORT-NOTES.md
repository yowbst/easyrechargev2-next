# Make → n8n port: "eR | P / Demande de devis" (scenario 3542973)

**Source:** Make scenario `3542973` (team 1287306), blueprint in `scenario-3542973-blueprint.json`.
**Target:** n8n workflow `eR | P / Demande de devis (ported)` — id `WZHx7LkHMUGwNnAC` on `n8n.easyrecharge.ch`.
**Status:** Built, **inactive** (isolation — not wired to live traffic). 26 nodes.

## Module → node mapping (1-for-1)

| Make module | n8n node(s) |
|---|---|
| `gateway:CustomWebHook` (eR \| Demande devis) | **Webhook** `POST /webhook/er-quote-request` |
| `util:SetVariables` #46 | **Set Vars** (isTest, isDispatchable, email, ref, request_url, partner_* folded in) |
| `attio:makeAnApiCall` #47 (Create Deal, PUT) | **Attio - Create Deal** (HTTP, Attio cred) |
| `attio:assertAPerson` #49 (Create Person) | **Attio - Create Person** (HTTP, PUT people/records) |
| `phonenumber:ParseNumber` #52 (filter: phone exists) | **IF phone?** → **Parse Phone** (Code) |
| `attio:assertAPerson` #53 (filter: e164 exists) | **IF e164?** → **Attio - Add phone** (HTTP) |
| `SetVariables` #56 (filter: dispatchable) + routers #55/#57/#58/#76/#69/#63 | **IF dispatchable?** + **Lang (dispatch)** / **Lang (no partner)** Switch + **IF not test?** / **IF gclid?** |
| `email:ActionSendEmail` #59/#77/#80 (fr/de/en client, dispatch) | **Email Conf FR/DE/EN** (Gmail) |
| `bulkgate:SendTransactional` #60/#79/#81 | **SMS FR/DE/EN** (HTTP → BulkGate) |
| `email:ActionSendEmail` #61 (filter: isTest=false) | **Email Partner [NEW]** (Gmail) |
| `attio:makeAnApiCall` #62 (PATCH dispatched_to) | **Attio - Set dispatched_to** (HTTP) |
| `google-ads-conversions:uploadAClickConversion` #64 (filter: gclid exists & !contains test) | **IF gclid?** → **Google Ads - Upload Conversion** (HTTP) |
| `email:ActionSendEmail` #65/#71/#74 (fr/de/en no-partner) | **Email NoPartner FR/DE/EN** (Gmail) |
| `slack:CreateMessage` #67 (channel: requests) | **Slack - New lead** (HTTP → chat.postMessage) |

## Routing logic preserved
- `isDispatchable` = canton ∈ {VD, GE, VS, Valais, FR} (NE/JU/else → false) — Make `switch`.
- `isTest` = email contains "yoan.basset"/"easyrecharge.ch" OR environment ≠ "production".
- Dispatchable → client confirmation (lang) + SMS, partner `[NEW]` email (if !test), Attio `dispatched_to` PATCH, Google Ads conversion (if gclid present & not test).
- Not dispatchable → "no partner in your region" email (lang).
- Slack notification fires on every lead.

## Faithful adaptations (Make abstractions with no native n8n node)
- **Partner variables** (`partner_display_name`, `partner_dispatch_email`, `partner_dedup_rate`) computed in **Set Vars** (derived from canton) so they're available to the Slack branch without cross-route dependency. Behaviour identical.
- **Phone parsing**: Make's libphonenumber module → **Code** node best-effort E.164 normalisation (strips non-digits, defaults CH +41). Verify against edge cases.
- **Attio**: no native node — rebuilt as HTTP `PUT/PATCH api.attio.com` with the assert-record payload shape (`{data:{values:{…}}}`, `matching_attribute` query). Verify attribute slugs (`email_addresses`, `primary_location`, `associated_deals`, `utm_*`) match the Attio schema.
- **Slack**: sent via HTTP `chat.postMessage` with the original block kit JSON (channel `#requests`).

## Credentials
- ✅ **Attio** — `httpHeaderAuth` cred `p2YQGCqzno6V7Yt9` wired to all 4 Attio nodes.
- ✅ **Gmail** — cred `Rzvaj46At7DeIsSB` wired to all 7 email nodes.
- ⚠️ **BulkGate** — SMS nodes have placeholder `<BULKGATE_APP_ID>` / `<BULKGATE_APP_TOKEN>` in the body; fill them.
- ⚠️ **Google Ads** — node is an HTTP scaffold; needs OAuth2 + developer-token header + correct API version.
- ⚠️ **Slack** — `chat.postMessage` needs a Bearer bot-token credential and a real channel ID.

## Testing safely
Workflow is inactive by design. Before any live test, use a lead with `isTest=true` (e.g. an `@easyrecharge.ch` email) so the partner `[NEW]` email is skipped, and be aware Attio Create Deal/Person write to the **real** Attio workspace.
