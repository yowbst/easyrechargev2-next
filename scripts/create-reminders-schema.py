#!/usr/bin/env python3
"""Create the partner-reminders log in Directus. Idempotent: re-running skips
whatever already exists. Additive only — never drops or alters existing structures.

Creates: partner_dispatch_reminders, its relation to partner_dispatches, and
read + create permissions for the "Backend (Server Token)" policy (the app's
DIRECTUS_STATIC_TOKEN), which the reminders cron needs to read and write its log.

Requires an ADMIN token — the app's DIRECTUS_STATIC_TOKEN cannot alter the schema.

    set -a; . ./.env.local; set +a
    python3 scripts/create-reminders-schema.py            # dry run
    python3 scripts/create-reminders-schema.py --apply    # write

See docs/operations/partner-dispatch.md, "E-mail actions and reminders".
"""
import json, os, sys, urllib.request, urllib.error

H = os.environ["DIRECTUS_URL"].rstrip("/")
TOKEN = os.environ.get("ADMIN_TOKEN") or os.environ["DIRECTUS_ADMIN_TOKEN"]
APPLY = "--apply" in sys.argv
COLLECTION = "partner_dispatch_reminders"
POLICY_NAME = "Backend (Server Token)"

def call(method, path, body=None):
    req = urllib.request.Request(
        H + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

def do(label, method, path, body):
    if not APPLY:
        print(f"  [dry-run] {label}")
        return True
    code, res = call(method, path, body)
    if code in (200, 204):
        print(f"  OK       {label}")
        return True
    print(f"  FAILED   {label} -> {code} {json.dumps(res)[:300]}")
    return False

ENV_CHOICES = [
    {"text": "DEV", "value": "development"},
    {"text": "STAGING", "value": "staging"},
    {"text": "PROD", "value": "production"},
]

# ---------- 1. collection ----------
print(f"{COLLECTION}:")
if call("GET", f"/collections/{COLLECTION}")[0] == 200:
    print("  exists")
else:
    do(f"create {COLLECTION}", "POST", "/collections", {
        "collection": COLLECTION,
        "meta": {
            "icon": "notifications",
            "note": "One row per partner reminder e-mail (reminder_due event). Written by /api/cron/dispatch-reminders; keeps reruns idempotent.",
            "group": "Partners",
            "accountability": "all",
            "display_template": "{{rule_key}} · {{status}}",
        },
        "schema": {},
        "fields": [
            {"field": "id", "type": "uuid",
             "meta": {"special": ["uuid"], "interface": "input", "readonly": True, "hidden": True},
             "schema": {"is_primary_key": True, "length": 36, "has_auto_increment": False}},
            {"field": "dispatch", "type": "uuid",
             "meta": {"interface": "select-dropdown-m2o", "special": ["m2o"], "required": True,
                      "options": {"template": "{{id}}"}},
             "schema": {"is_nullable": False}},
            {"field": "rule_key", "type": "string",
             "meta": {"interface": "input", "required": True,
                      "note": "Rule key from global_config.dispatch.reminders.rules"},
             "schema": {"is_nullable": False}},
            {"field": "stage", "type": "string", "meta": {"interface": "input"}, "schema": {}},
            {"field": "stage_entered_at", "type": "dateTime",
             "meta": {"interface": "datetime",
                      "note": "Copy of the dispatch's stage_entered_at when the reminder was sent"},
             "schema": {}},
            {"field": "sent_at", "type": "dateTime", "meta": {"interface": "datetime"}, "schema": {}},
            {"field": "status", "type": "string",
             "meta": {"interface": "select-dropdown", "options": {"choices": [
                 {"text": "Sent", "value": "sent"}, {"text": "Failed", "value": "failed"}]}},
             "schema": {}},
            {"field": "environment", "type": "string",
             "meta": {"interface": "select-dropdown", "options": {"choices": ENV_CHOICES}},
             "schema": {}},
        ],
    })

# ---------- 2. relation ----------
print("\nrelation:")
code, res = call("GET", f"/relations/{COLLECTION}")
if code == 200 and any(r.get("field") == "dispatch" for r in res.get("data", [])):
    print(f"  exists   {COLLECTION}.dispatch -> partner_dispatches")
else:
    # A log row has no meaning without its dispatch.
    do(f"{COLLECTION}.dispatch -> partner_dispatches", "POST", "/relations", {
        "collection": COLLECTION, "field": "dispatch", "related_collection": "partner_dispatches",
        "meta": {"sort_field": None}, "schema": {"on_delete": "CASCADE"},
    })

# ---------- 3. permissions ----------
print(f"\npermissions ({POLICY_NAME}):")
code, res = call("GET", "/policies?fields=id,name&limit=-1")
policy = next((p for p in res.get("data", []) if p.get("name") == POLICY_NAME), None)
if not policy:
    print(f"  FAILED   policy {POLICY_NAME!r} not found — grant read + create by hand")
    sys.exit(1)
code, res = call("GET", f"/permissions?filter[policy][_eq]={policy['id']}&filter[collection][_eq]={COLLECTION}&fields=action&limit=-1")
have = {p["action"] for p in res.get("data", [])} if code == 200 else set()
for action in ("read", "create"):
    if action in have:
        print(f"  exists   {action}")
    else:
        do(f"{action} on {COLLECTION}", "POST", "/permissions", {
            "policy": policy["id"], "collection": COLLECTION, "action": action,
            "fields": ["*"], "permissions": {}, "validation": {},
        })

if not APPLY:
    print("\nDry run only. Re-run with --apply to write.")
