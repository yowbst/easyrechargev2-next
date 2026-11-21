#!/usr/bin/env python3
"""Create the `companies` collection in Directus (Swiss electrical installers from the
commercial register). Idempotent: re-running skips whatever already exists. Additive
only: never drops or alters existing structures.

Creates: companies, and its relations companies.partner -> partners and
companies.assigned_to -> directus_users.

Requires an ADMIN token: the app's DIRECTUS_STATIC_TOKEN cannot alter the schema.

    set -a; . ./.env.local; set +a
    export ADMIN_TOKEN="$DIRECTUS_ADMIN_TOKEN"     # or any Directus admin static token
    python3 scripts/create-companies-schema.py            # dry run
    python3 scripts/create-companies-schema.py --apply    # write

Permissions are NOT set by this script. Afterwards give the role behind
DIRECTUS_STATIC_TOKEN read, create and update on `companies` (never delete),
then check with:  npm run companies -- report

See docs/companies-ingest.md for the surrounding steps.
"""
import json, os, sys, urllib.request, urllib.error

H = os.environ["DIRECTUS_URL"].rstrip("/")
TOKEN = os.environ.get("ADMIN_TOKEN") or os.environ.get("DIRECTUS_ADMIN_TOKEN")
if not TOKEN:
    sys.exit("Set ADMIN_TOKEN (or DIRECTUS_ADMIN_TOKEN) to a Directus admin static token.")
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


# ---------- field builders, same conventions as create-invoicing-schema.py ----------
def pk():
    return {"field": "id", "type": "uuid",
            "meta": {"special": ["uuid"], "interface": "input", "readonly": True, "hidden": True},
            "schema": {"is_primary_key": True, "is_nullable": False}}


def audit():
    user = {"interface": "select-dropdown-m2o", "readonly": True, "hidden": True, "width": "half",
            "options": {"template": "{{avatar}} {{first_name}} {{last_name}}"}}
    when = {"interface": "datetime", "readonly": True, "hidden": True, "width": "half",
            "options": {"relative": True}}
    return [
        {"field": "user_created", "type": "uuid", "meta": dict(user, special=["user-created"]), "schema": {}},
        {"field": "date_created", "type": "timestamp", "meta": dict(when, special=["date-created"]), "schema": {}},
        {"field": "user_updated", "type": "uuid", "meta": dict(user, special=["user-updated"]), "schema": {}},
        {"field": "date_updated", "type": "timestamp", "meta": dict(when, special=["date-updated"]), "schema": {}},
    ]


def s(field, **kw):
    """string; choices= makes it a dropdown, note= adds a hint, the rest goes to the column schema"""
    meta = {"interface": kw.pop("interface", "input")}
    if "choices" in kw:
        meta["interface"] = "select-dropdown"
        meta["options"] = {"choices": kw.pop("choices")}
    if "note" in kw:
        meta["note"] = kw.pop("note")
    schema = {"is_nullable": True}
    schema.update(kw)
    return {"field": field, "type": "string", "meta": meta, "schema": schema}


def text(field, note=None):
    meta = {"interface": "input-multiline"}
    if note:
        meta["note"] = note
    return {"field": field, "type": "text", "meta": meta, "schema": {"is_nullable": True}}


def dec(field, precision, scale, note=None):
    meta = {"interface": "input"}
    if note:
        meta["note"] = note
    return {"field": field, "type": "decimal", "meta": meta,
            "schema": {"numeric_precision": precision, "numeric_scale": scale, "is_nullable": True}}


def integer(field, note=None):
    meta = {"interface": "input"}
    if note:
        meta["note"] = note
    return {"field": field, "type": "integer", "meta": meta, "schema": {"is_nullable": True}}


def boolean(field, default=False, note=None):
    meta = {"interface": "boolean", "special": ["cast-boolean"]}
    if note:
        meta["note"] = note
    return {"field": field, "type": "boolean", "meta": meta,
            "schema": {"default_value": default, "is_nullable": False}}


def ts(field, note=None):
    meta = {"interface": "datetime"}
    if note:
        meta["note"] = note
    return {"field": field, "type": "timestamp", "meta": meta, "schema": {"is_nullable": True}}


def date(field):
    return {"field": field, "type": "date", "meta": {"interface": "datetime"}, "schema": {"is_nullable": True}}


def js(field, note=None):
    meta = {"special": ["cast-json"], "interface": "input-code", "options": {"lineWrapping": True}}
    if note:
        meta["note"] = note
    return {"field": field, "type": "json", "meta": meta, "schema": {"is_nullable": True}}


def m2o(field, template="{{id}}", note=None):
    meta = {"special": ["m2o"], "interface": "select-dropdown-m2o", "options": {"template": template}}
    if note:
        meta["note"] = note
    return {"field": field, "type": "uuid", "meta": meta, "schema": {"is_nullable": True}}


def choices(*pairs):
    return [{"text": t, "value": v} for t, v in pairs]


STATUS = choices(("Published", "published"), ("Draft", "draft"), ("Archived", "archived"))
CLASSIFICATION = choices(("Installer", "installer"), ("Inspector", "inspector"), ("Planner", "planner"),
                         ("Solar", "solar"), ("Other", "other"), ("Unclassified", "unclassified"))
LEGAL_KIND = choices(("Corporation (SA/AG)", "corporation"), ("LLC (Sàrl/GmbH)", "llc"),
                     ("Sole proprietorship", "sp"), ("General partnership", "gp"),
                     ("Cooperative", "cooperative"), ("Branch", "branch"), ("Other", "other"))
SOURCE = choices(("Company site", "company_site"), ("Google Business Profile", "google_business_profile"),
                 ("ESTI register", "esti"), ("Manual", "manual"))
WEBSITE_STATUS = choices(("Unverified", "unverified"), ("Verified", "verified"),
                         ("Unreachable", "unreachable"), ("Mismatch", "mismatch"))
ENRICHMENT = choices(("Pending", "pending"), ("Done", "done"), ("No website", "no_website"), ("Failed", "failed"))
ESTI_TYPE = choices(("Installation permit (AIB)", "AIB"), ("Control permit (AKB)", "AKB"))
ESTI_MATCH = choices(("Matched", "matched"), ("Not found", "not_found"), ("Ambiguous", "ambiguous"))
GEO_SOURCE = choices(("Postcode centroid", "postcode_centroid"), ("Manual", "manual"))
PROSPECT = choices(("None", "none"), ("To contact", "to_contact"), ("Contacted", "contacted"),
                   ("Interested", "interested"), ("Declined", "declined"),
                   ("Became partner", "became_partner"), ("Unqualified", "unqualified"))

PIPE = "Written by the pipeline."
HUMAN = "Edited by hand in Directus; the pipeline never writes it."

COMPANIES = {
    "collection": "companies",
    "meta": {
        "group": "Partners", "accountability": "all", "collapse": "open", "sort": 7,
        "archive_field": "status", "archive_value": "archived", "unarchive_value": "draft",
        "archive_app_filter": True, "display_template": "{{legal_name}} ({{canton}})",
        "note": "Swiss electrical installers from the commercial register (Zefix). "
                "Written by `npm run companies`; see docs/companies-ingest.md.",
    },
    "schema": {},
    "fields": [pk()] + audit() + [
        # Identity
        s("status", choices=STATUS, default_value="draft", is_indexed=True,
          note="Computed by the pipeline on every plan. To hide a company use do_not_display."),
        s("ehraid", is_unique=True, is_nullable=False, max_length=16, note="Register id; the natural key."),
        s("uid", max_length=12, is_indexed=True, note="CHE + 9 digits, no dots."),
        s("chid", max_length=20),
        s("register_url", max_length=255),
        # Register
        s("legal_name", max_length=255), text("purpose_text", "Purpose as registered."),
        s("purpose_hash", max_length=64, note="sha256; a different hash triggers reclassification."),
        s("legal_form_code", max_length=8), s("legal_form_kind", choices=LEGAL_KIND),
        boolean("in_liquidation", note="Name carries en liquidation / in Liquidation / en faillite."),
        s("street_address", max_length=255), s("postal_code", max_length=4, is_indexed=True),
        s("locality", max_length=255), s("canton", max_length=2, is_indexed=True), integer("bfs_id"),
        ts("register_first_seen_at"), ts("register_seen_at"),
        ts("register_gone_at", "Set when the company stopped matching (struck off, or purpose no longer an installer)."),
        # Classification
        s("classification", choices=CLASSIFICATION, default_value="unclassified", is_indexed=True, note=PIPE),
        dec("classification_confidence", 3, 2), s("classification_reason", max_length=255),
        s("classification_model", max_length=64), ts("classified_at"),
        s("classified_purpose_hash", max_length=64),
        s("classification_override", choices=CLASSIFICATION, note=HUMAN + " Wins over the model."),
        # Contacts (filled by the enrichment phase)
        s("website", max_length=255), s("website_source", choices=SOURCE), s("website_source_url", max_length=500),
        ts("website_verified_at"), s("website_status", choices=WEBSITE_STATUS, default_value="unverified"),
        ts("website_last_checked_at"), integer("website_http_status"),
        s("phone", max_length=32, note="E.164"), s("phone_source", choices=SOURCE),
        s("phone_source_url", max_length=500), ts("phone_verified_at"),
        s("email", max_length=255), s("email_source", choices=SOURCE),
        s("email_source_url", max_length=500), ts("email_verified_at"),
        s("contact_person_name", max_length=255, note="Personal data. Never rendered publicly."),
        s("contact_person_role", max_length=255), s("contact_person_source", choices=SOURCE),
        s("contact_person_source_url", max_length=500), ts("contact_person_verified_at"),
        s("enrichment_status", choices=ENRICHMENT, default_value="pending", is_indexed=True),
        ts("enriched_at"), s("enrichment_provider", max_length=64),
        # ESTI (optional lookup)
        s("esti_permit_number", max_length=64), s("esti_permit_type", choices=ESTI_TYPE), date("esti_valid_until"),
        js("esti_responsible_persons", "[{name, firstName, rate}]. Personal data."),
        ts("esti_checked_at"), s("esti_match", choices=ESTI_MATCH),
        # Partner link and geo
        m2o("partner", "{{name}}", "Matched on UID against production partners."), ts("partner_linked_at"),
        dec("lat", 9, 6), dec("lng", 9, 6), s("geo_source", choices=GEO_SOURCE),
        # Human-owned
        boolean("do_not_display", note=HUMAN + " Kill switch for public pages."),
        s("display_name", max_length=255, note=HUMAN), text("notes", HUMAN + " Internal."),
        s("prospect_status", choices=PROSPECT, default_value="none", is_indexed=True, note=HUMAN),
        date("last_contacted_at"), m2o("assigned_to", "{{first_name}} {{last_name}}", HUMAN),
        # Audit
        ts("pipeline_updated_at", "Last time the pipeline wrote this row."),
    ],
}

print(f"Directus: {H}")
print(f"Mode: {'APPLY' if APPLY else 'DRY RUN'}\n")

# ---------- 1. collection ----------
name = COMPANIES["collection"]
if exists_collection(name):
    print(f"collection {name}: already exists, skipping")
else:
    print(f"collection {name}: {len(COMPANIES['fields'])} fields")
    do(f"create {name}", "POST", "/collections", COMPANIES)

# ---------- 2. relations ----------
print("\nrelations:")
existing_rel = {}
code, res = call("GET", "/relations")
if code == 200:
    for r in res.get("data", []):
        existing_rel[(r["collection"], r["field"])] = r


def relation(coll, field, related):
    if (coll, field) in existing_rel:
        print(f"  exists   {coll}.{field} -> {related}")
        return
    body = {"collection": coll, "field": field, "related_collection": related,
            "meta": {"sort_field": None}, "schema": {"on_delete": "SET NULL"}}
    do(f"{coll}.{field} -> {related}", "POST", "/relations", body)


relation("companies", "partner", "partners")
relation("companies", "assigned_to", "directus_users")

print("\ndone. Next: grant the DIRECTUS_STATIC_TOKEN role read, create and update on `companies`.")
