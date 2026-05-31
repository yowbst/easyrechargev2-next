# Production n8n on Railway — Design

**Date:** 2026-05-31
**Status:** Approved (design)
**Scope:** Stand up a production-ready, single-owner n8n instance on Railway at `n8n.easyrecharge.ch`. Migration of existing Make scenarios is explicitly out of scope and handled as separate future work.

## Goal

A production-ready n8n instance running on Railway that:
- Loads over HTTPS at `n8n.easyrecharge.ch`
- Persists workflows, credentials, and the owner account across redeploys
- Generates webhook URLs on the custom domain (so webhook-triggered workflows are usable)
- Is backed up and recoverable

## Approach

Use Railway's **official n8n template** (one-click marketplace deploy). Chosen over a custom-Dockerfile-in-repo or self-managed Docker Compose because the goal is speed-to-running for a single owner; the template provisions n8n + managed Postgres + a persistent volume with sane defaults, leaving only domain, encryption key, and webhook config to set explicitly.

## Architecture

Two Railway services in a single Railway project:

```
Railway Project: "n8n"
├── n8n service        (n8n Docker image, listens on Railway's $PORT)
│   └── Volume          → /home/node/.n8n  (persists encryption key, local settings)
└── Postgres service   (managed; stores workflows, execution history, credentials)
```

- **Postgres, not SQLite** — production persistence. Provisioned by the template.
- **Single instance, regular execution mode** — no Redis / queue workers. Sufficient for current scope; queue mode is deferred until execution volume requires it.

## Critical: the encryption key

n8n encrypts all stored credentials with `N8N_ENCRYPTION_KEY`. If the key changes or is regenerated, every saved credential becomes unreadable and must be re-entered.

Mitigation:
- Set `N8N_ENCRYPTION_KEY` explicitly as a Railway variable (do not depend on ephemeral auto-generation).
- Store a copy in a password manager / secrets vault, offline from Railway.

## Environment variables

The template provisions database connection vars automatically. The following are set or verified to enable the custom domain, webhooks, and code nodes:

| Variable | Value | Purpose |
|---|---|---|
| `N8N_ENCRYPTION_KEY` | generated, saved offline | credential encryption |
| `N8N_HOST` | `n8n.easyrecharge.ch` | canonical hostname |
| `N8N_PROTOCOL` | `https` | correct links / secure cookies |
| `WEBHOOK_URL` | `https://n8n.easyrecharge.ch/` | base URL baked into every generated webhook |
| `PORT` / `N8N_PORT` | Railway's `$PORT` | listen where Railway routes traffic |
| `GENERIC_TIMEZONE` | `Europe/Zurich` | correct cron / schedule timing |
| `N8N_RUNNERS_ENABLED` | `true` | required for code nodes |

## Domain + DNS

Custom subdomain: **`n8n.easyrecharge.ch`**.

1. Add the custom domain to the n8n service in Railway.
2. Railway returns a CNAME target.
3. Create a CNAME record `n8n` → Railway target at the easyrecharge.ch DNS provider.
4. Railway auto-provisions TLS once DNS resolves.
5. Confirm `N8N_HOST` and `WEBHOOK_URL` point at the custom domain.

## Security

Single-owner instance:
- Create the n8n **owner account** (email + password) immediately on first load, before the instance is left publicly reachable.
- HTTPS enforced via Railway-provisioned TLS on the custom domain.
- No additional reverse-proxy auth layer required at this scope.

## Backups & hygiene

- Enable Railway Postgres backups.
- Establish a periodic `pg_dump` (manual initially; automatable later) for Railway-independent restore.
- Keep `N8N_ENCRYPTION_KEY` backed up offline.

## Verification (definition of done)

1. `https://n8n.easyrecharge.ch` serves the n8n UI over valid HTTPS.
2. Owner account created; login works.
3. A test workflow with a **Webhook trigger** generates a URL on the custom domain; hitting it with `curl` records an execution in history.
4. After a service redeploy, workflows, the owner account, and the test webhook all survive (confirms persistence + stable encryption key).

## Out of scope

- Migrating Make scenarios to n8n
- Queue mode / dedicated workers / Redis
- Multi-user accounts / RBAC (requires n8n license registration)
