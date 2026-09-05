#!/usr/bin/env python3
"""Create the partner-invoicing schema in Directus. Idempotent: re-running skips
whatever already exists. Additive only — never drops or alters existing structures.

Creates: partner_invoices, partner_invoice_lines, their relations (including the
`lines` O2M alias), partners.invoice_code and partner_dispatches.invoice.

Requires an ADMIN token — the app's DIRECTUS_STATIC_TOKEN cannot alter the schema.

    set -a; . ./.env.local; set +a
    export ADMIN_TOKEN=<a Directus admin static token>
    python3 scripts/create-invoicing-schema.py            # dry run
    python3 scripts/create-invoicing-schema.py --apply    # write

Then verify:
    npx tsx --env-file=.env.local scripts/verify-invoicing-schema.ts

See docs/operations/partner-invoicing-rollout.md for the surrounding steps —
notably that permissions and the EME invoice_code value are NOT set by this script.
"""
import json, os, sys, urllib.request, urllib.error

H = os.environ["DIRECTUS_URL"].rstrip("/")
TOKEN = os.environ["ADMIN_TOKEN"]
APPLY = "--apply" in sys.argv

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

def exists_collection(name):
    return call("GET", f"/collections/{name}")[0] == 200

def exists_field(coll, field):
    return call("GET", f"/fields/{coll}/{field}")[0] == 200

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

# ---------- field builders, matching partner_dispatches conventions ----------
def pk():
    return {"field": "id", "type": "uuid",
            "meta": {"special": ["uuid"], "interface": "input", "readonly": True, "hidden": True},
            "schema": {"is_primary_key": True, "is_nullable": False}}

def audit():
    return [
        {"field": "user_created", "type": "uuid",
         "meta": {"special": ["user-created"], "interface": "select-dropdown-m2o", "readonly": True,
                  "hidden": True, "width": "half", "options": {"template": "{{avatar}} {{first_name}} {{last_name}}"}},
         "schema": {}},
        {"field": "date_created", "type": "timestamp",
         "meta": {"special": ["date-created"], "interface": "datetime", "readonly": True,
                  "hidden": True, "width": "half", "options": {"relative": True}},
         "schema": {}},
        {"field": "user_updated", "type": "uuid",
         "meta": {"special": ["user-updated"], "interface": "select-dropdown-m2o", "readonly": True,
                  "hidden": True, "width": "half", "options": {"template": "{{avatar}} {{first_name}} {{last_name}}"}},
         "schema": {}},
        {"field": "date_updated", "type": "timestamp",
         "meta": {"special": ["date-updated"], "interface": "datetime", "readonly": True,
                  "hidden": True, "width": "half", "options": {"relative": True}},
         "schema": {}},
    ]

def s(field, **kw):
    """string"""
    meta = {"interface": kw.pop("interface", "input")}
    if "choices" in kw:
        meta["interface"] = "select-dropdown"
        meta["options"] = {"choices": kw.pop("choices")}
    if "note" in kw: meta["note"] = kw.pop("note")
    schema = {"is_nullable": True}
    schema.update(kw)
    return {"field": field, "type": "string", "meta": meta, "schema": schema}

def dec(field, precision=10, scale=2, default=None, note=None):
    meta = {"interface": "input"}
    if note: meta["note"] = note
    return {"field": field, "type": "decimal",
            "meta": meta,
            "schema": {"numeric_precision": precision, "numeric_scale": scale,
                       "default_value": default, "is_nullable": True}}

def integer(field, default=None, note=None):
    meta = {"interface": "input"}
    if note: meta["note"] = note
    return {"field": field, "type": "integer", "meta": meta,
            "schema": {"default_value": default, "is_nullable": True}}

def ts(field):
    return {"field": field, "type": "timestamp", "meta": {"interface": "datetime"},
            "schema": {"is_nullable": True}}

def date(field):
    return {"field": field, "type": "date", "meta": {"interface": "datetime"},
            "schema": {"is_nullable": True}}

def js(field, default, note=None):
    meta = {"special": ["cast-json"], "interface": "input-code", "options": {"lineWrapping": True}}
    if note: meta["note"] = note
    return {"field": field, "type": "json", "meta": meta,
            "schema": {"default_value": default, "is_nullable": True}}

def m2o(field, template="{{id}}", note=None):
    meta = {"special": ["m2o"], "interface": "select-dropdown-m2o", "options": {"template": template}}
    if note: meta["note"] = note
    return {"field": field, "type": "uuid", "meta": meta, "schema": {"is_nullable": True}}

ENV_CHOICES = [{"text": "DEV", "value": "development"},
               {"text": "STAGING", "value": "staging"},
               {"text": "PROD", "value": "production"}]

STATUS_CHOICES = [{"text": "Issued", "value": "issued"},
                  {"text": "Sent", "value": "sent"},
                  {"text": "Disputed", "value": "disputed"},
                  {"text": "Paid", "value": "paid"},
                  {"text": "Cancelled", "value": "cancelled"}]

KIND_CHOICES = [{"text": "Lead", "value": "lead"},
                {"text": "Adjustment", "value": "adjustment"}]

INVOICES = {
    "collection": "partner_invoices",
    "meta": {"group": "Partners", "accountability": "all", "collapse": "open",
             "sort": 5, "archive_app_filter": True,
             "note": "Frozen invoice for one partner and one month. Created by issueInvoice()."},
    "schema": {},
    "fields": [pk()] + audit() + [
        s("number", is_unique=True, max_length=32, note="e.g. EME-202607. Unique. A cancelled invoice keeps its number."),
        integer("version", default=1, note="Bumped each time the document is regenerated."),
        dict(s("status", choices=STATUS_CHOICES), **{}),
        m2o("partner", "{{name}}"),
        s("period_month", max_length=7, note="YYYY-MM — the dispatch month this invoice bills."),
        date("period_start"), date("period_end"),
        ts("issued_at"), ts("due_at"), ts("sent_at"), ts("paid_at"),
        integer("payment_terms_days", default=21),
        s("currency", max_length=3, default_value="CHF"),
        dec("subtotal_chf"), dec("adjustment_chf"), dec("total_chf"),
        dec("vat_rate", precision=5, scale=2, default="0", note="Dormant until VAT registration."),
        dec("vat_chf", default="0"),
        js("issuer_snapshot", None, "Frozen at issue — do not re-read live company data."),
        js("debtor_snapshot", None, "Frozen at issue — do not re-read live partner data."),
        s("doc_url"), s("doc_file_id"),
        js("doc_versions", [], "[{version, doc_url, doc_file_id, generated_at}] — never overwritten."),
        js("events", [], "[{at, actor, type, note}] — the partner back-and-forth."),
        {"field": "notes", "type": "text", "meta": {"interface": "input-multiline",
         "note": "Internal. Never rendered on the document."}, "schema": {"is_nullable": True}},
        s("environment", choices=ENV_CHOICES),
    ],
}

LINES = {
    "collection": "partner_invoice_lines",
    "meta": {"group": "Partners", "accountability": "all", "collapse": "open",
             "sort": 6, "hidden": True,
             "note": "One line per billed lead (or an adjustment). Values are COPIED from the dispatch so the invoice never moves when the ledger moves."},
    "schema": {},
    "fields": [pk()] + audit() + [
        m2o("invoice", "{{number}}"),
        m2o("dispatch", "{{id}}", "Null for a lead billed without a ledger row, and for adjustments."),
        s("kind", choices=KIND_CHOICES, default_value="lead"),
        s("label", max_length=255, note="P / NAME / NPA Locality / YYYY-MM-DD"),
        s("description", max_length=255),
        integer("quantity", default=1),
        dec("unit_price_chf"), dec("amount_chf"),
        integer("sort"),
        ts("dispatched_at"),
        s("canton", max_length=8), s("postal_code", max_length=16),
        s("locality", max_length=255), s("last_name", max_length=255),
        s("lead_category", max_length=64), s("product", max_length=64),
    ],
}

print(f"Directus: {H}")
print(f"Mode: {'APPLY' if APPLY else 'DRY RUN'}\n")

# ---------- 1-2. collections ----------
for spec in (INVOICES, LINES):
    name = spec["collection"]
    if exists_collection(name):
        print(f"collection {name}: already exists, skipping")
    else:
        print(f"collection {name}:")
        do(f"create {name}", "POST", "/collections", spec)

# ---------- 3. relations + the `lines` O2M alias ----------
print("\nrelations:")
existing_rel = {}
code, res = call("GET", "/relations")
if code == 200:
    for r in res.get("data", []):
        existing_rel[(r["collection"], r["field"])] = r

def relation(coll, field, related, one_field=None, label=None):
    key = (coll, field)
    if key in existing_rel:
        print(f"  exists   {coll}.{field} -> {related}")
        return
    body = {"collection": coll, "field": field, "related_collection": related,
            "meta": {"sort_field": None}, "schema": {"on_delete": "SET NULL"}}
    if one_field:
        body["meta"]["one_field"] = one_field
    do(label or f"{coll}.{field} -> {related}", "POST", "/relations", body)

relation("partner_invoices", "partner", "partners")
relation("partner_invoice_lines", "invoice", "partner_invoices", one_field="lines",
         label="partner_invoice_lines.invoice -> partner_invoices (creates the `lines` O2M alias)")
relation("partner_invoice_lines", "dispatch", "partner_dispatches")

# ---------- 4. partners.invoice_code ----------
print("\npartners.invoice_code:")
if exists_field("partners", "invoice_code"):
    print("  exists")
else:
    do("create partners.invoice_code", "POST", "/fields/partners",
       {"field": "invoice_code", "type": "string",
        "meta": {"interface": "input", "note": "Uppercase short code used in the invoice number, e.g. EME -> EME-202607. Required to issue an invoice."},
        "schema": {"max_length": 8, "is_nullable": True}})

# ---------- 5. partner_dispatches.invoice ----------
print("\npartner_dispatches.invoice:")
if exists_field("partner_dispatches", "invoice"):
    print("  exists")
else:
    ok = do("create partner_dispatches.invoice", "POST", "/fields/partner_dispatches",
            {"field": "invoice", "type": "uuid",
             "meta": {"special": ["m2o"], "interface": "select-dropdown-m2o",
                      "options": {"template": "{{number}}"},
                      "note": "Set at issue; cleared when the invoice is cancelled. Non-null means already billed."},
             "schema": {"is_nullable": True}})
    if ok and APPLY:
        relation("partner_dispatches", "invoice", "partner_invoices")

print("\ndone.")
