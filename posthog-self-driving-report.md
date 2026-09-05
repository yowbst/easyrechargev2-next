# PostHog Self-driving Setup Report

**Date:** 2026-07-20  
**Project:** eR PROD (id: 103083)  
**Run by:** Yoan Basset

## Summary

PostHog Self-driving has been configured for easyRecharge. Session replay, error tracking, support, and the scout gate are now wired as signal sources. A lean three-scout troop (general + web-analytics + web-vitals) is running. Findings will start appearing in your [Self-driving inbox](https://eu.posthog.com/project/103083/inbox) within ~30 minutes.

---

## AI Data Processing

**Status:** Approved — organization-level AI data processing consent was confirmed before this run started.

---

## GitHub

| Item | Status |
|---|---|
| GitHub App integration | **Connected during this run** (integration id: 72125, account: yowbst) |

Self-driving can now investigate findings against the repository code and open fix PRs.

---

## Products Enabled

The `products-enable` API tool was not available with the current MCP scopes. However, all three products are confirmed active from live data:

| Product | Status | Notes |
|---|---|---|
| Session Replay | **Active** (confirmed — recordings present) | `disable_session_recording: true` in `PostHogProvider.tsx` is intentional — recording starts manually via `startSessionRecording()` after a 5 s delay. No code change made. |
| Error Tracking | **Active** (confirmed — issues present) | `capture_exceptions: true` in `PostHogProvider.tsx`. Server-side capture via `posthog-node` in API routes. |
| Support (Conversations) | **Enabled via source row** | No inbound channel connected yet — tickets will only arrive once a channel (email / inbox / Slack) is linked. See follow-ups. |

---

## Signal Sources

| source_product | source_type | Action | Source config id |
|---|---|---|---|
| `signals_scout` | `cross_source_issue` | **On by default** — no row needed; scout findings reach inbox automatically | — |
| `error_tracking` | `issue_created` | **Enabled** (new) | 019f7def-5b7f-7f25-8efa-f7c425270846 |
| `error_tracking` | `issue_reopened` | **Enabled** (new) | 019f7def-6091-7513-83ee-030d901ff1a2 |
| `error_tracking` | `issue_spiking` | **Enabled** (new) | 019f7def-646b-70d8-8b6b-e14b3006b406 |
| `session_replay` | `session_analysis_cluster` | **Enabled** (new, sample_rate: 0.1) | 019f7def-8069-7ebf-8493-3665329c93ca |
| `conversations` | `ticket` | **Enabled** (new, dormant until channel connected) | 019f7def-6944-7522-a2ed-5abf749ed977 |
| `logs` | — | **Skipped** — not a v1 responder |  |
| `llm_analytics` | — | **Skipped** — internal-only, not a user-facing responder | |

---

## Connected Tools

| Tool | Status |
|---|---|
| GitHub Issues | Not used (not selected) |
| Linear | **Selected but no source detected (dormant)** — responder row enabled (id: 019f7df0-7078-738c-8147-f1df4a502374); user skipped the OAuth step. Dormant until the warehouse source is connected. See follow-ups. |
| Zendesk | Not used (not selected) |
| pganalyze | Not used (not selected) |
| Jira | Not used (not selected) |

---

## Scout Troop

**Active (3):**

| Scout | Reason enabled |
|---|---|
| `signals-scout-general` | Always on — cross-product correlations and surfaces no specialist covers |
| `signals-scout-web-analytics` | Primary surface: web/marketing site with per-channel session volume, attribution breakage, landing-page health |
| `signals-scout-web-vitals` | `capture_performance: true` is set in `PostHogProvider.tsx`; LCP optimization is an active workstream (recent fixes shipped 2026-07-17) |

**Disabled (23) — one-line reason each:**

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native `error_tracking` source (issue_created / reopened / spiking) |
| `signals-scout-session-replay` | Covered by native `session_replay` source (session_analysis_cluster) |
| `signals-scout-ai-observability` | No LLM usage or `$ai_*` events in this project |
| `signals-scout-anomaly-detection` | Not selected — keeping troop small |
| `signals-scout-apm` | No OpenTelemetry / distributed tracing configured |
| `signals-scout-csp-violations` | No CSP reporting configured |
| `signals-scout-customer-analytics` | B2C marketplace — no group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations or batch exports in use |
| `signals-scout-data-warehouse` | No external data warehouse sources connected |
| `signals-scout-experiments` | No active A/B experiments |
| `signals-scout-feature-flags` | No active feature flag usage confirmed |
| `signals-scout-health-checks` | Not selected — keeping troop small |
| `signals-scout-inbox-validation` | Fresh setup — no resolved reports to validate yet |
| `signals-scout-ingestion-warnings` | Not selected — keeping troop small |
| `signals-scout-insight-alerts` | Not selected — keeping troop small |
| `signals-scout-logs` | Console logs captured (`captureConsoleLogs: true`) but logs is not a v1 signal source; re-enable if you use the logs product actively |
| `signals-scout-mcp-tool-calls` | Not a primary surface for this project |
| `signals-scout-observability-gaps` | Not selected — keeping troop small |
| `signals-scout-product-analytics` | Not selected — web-analytics + web-vitals are the top-two picks |
| `signals-scout-replay-vision` | No Replay Vision scanners configured |
| `signals-scout-revenue-analytics` | No payment SDK or revenue tracking |
| `signals-scout-skills-store` | Not selected — keeping troop small |
| `signals-scout-surveys` | No surveys in use (0 surveys found) |

---

## Custom Scouts

**Gap analysis performed:**

| Candidate surface | Verdict | Filter that ruled it out |
|---|---|---|
| Quote funnel step regression (`quote_step_viewed`, `quote_step_completed`, `quote_submitted`) | **Proposed — user declined** | User chose to keep the built-in troop |
| Attribution / ad conversion health | Ruled out | Partially covered by `signals-scout-web-analytics` (per-channel session volume, attribution breakage) |
| Blog/SEO content engagement | Ruled out | Covered by `signals-scout-web-analytics` (landing-page health, bounce) |
| Error tracking / CMS proxy errors | Ruled out | Covered by native `error_tracking` source |

**Custom scouts created:** none.

**Noise escape hatch:** if any scout turns out noisy, set `emit: false` on its config row in PostHog → Settings → Self-driving to switch it to dry-run (it still runs but files nothing).

---

## Follow-ups

- [ ] **Connect a Support inbound channel** — the Conversations product is on but tickets only arrive once an email, inbox, or Slack channel is connected. Go to PostHog → Settings → Support to add one.
- [ ] **Connect Linear warehouse source** — you selected Linear but skipped the OAuth step. To activate the dormant responder, open `https://eu.posthog.com/api/environments/103083/integrations/authorize?kind=linear` in your browser, approve access, then confirm the connection in PostHog → [Data pipeline → Sources](https://eu.posthog.com/project/103083/pipeline/new/source).
- [ ] **Enable products via project admin** — `products-enable` was unavailable with the current MCP scopes. Session Replay and Error Tracking are confirmed active, but verify Support (Conversations) is fully toggled on in PostHog → Settings → Products if tickets don't appear after connecting a channel.
- [ ] **Re-enable `signals-scout-logs`** — console logs are captured (`captureConsoleLogs: true`, service: `easyrecharge-web`). If you want the logs scout to watch for emerging error patterns, enable it in PostHog → Settings → Self-driving.
- [ ] **Re-enable `signals-scout-product-analytics`** — if you build out funnel or retention insights in PostHog, this scout will watch their derived rates for regressions. Enable it then.
- [ ] **Consider re-adding the quote funnel custom scout** — you declined it during setup; you can revisit by re-running the Self-driving setup skill or creating a `signals-scout-quote-funnel` skill manually. It would watch `quote_step_completed` completion rates per step vs. a rolling baseline.

---

## What Happens Next

The scout coordinator picks up the new configs within ~30 minutes. Scouts will run on their 24-hour interval and file validated findings as reports. Immediately-actionable findings can kick off coding tasks from the inbox. Check your inbox at: **https://eu.posthog.com/project/103083/inbox**
