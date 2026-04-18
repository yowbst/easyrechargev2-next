"""Populate slug field on all localities in Directus."""
import json, re, unicodedata, urllib.request, os, time

DIRECTUS_URL = os.environ["DIRECTUS_URL"]
TOKEN = os.environ["DIRECTUS_STATIC_TOKEN"]

def slugify(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def api_get(path):
    req = urllib.request.Request(
        f"{DIRECTUS_URL}{path}",
        headers={"Authorization": f"Bearer {TOKEN}"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def api_patch(loc_id, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{DIRECTUS_URL}/items/localities/{loc_id}",
        data=body, method="PATCH",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status

# Fetch all localities in batches
print("Fetching all localities...")
all_locs = []
offset = 0
while True:
    url = f"/items/localities?fields=id,postal_code,name,slug&limit=100&offset={offset}"
    result = api_get(url)
    items = result.get("data", [])
    if not items:
        break
    all_locs.extend(items)
    offset += 100
    time.sleep(0.5)

print(f"Fetched {len(all_locs)} localities")
need_update = [loc for loc in all_locs if not loc.get("slug")]
print(f"{len(need_update)} need slugs")

# Build slugs, handle duplicates
seen = {}
updates = []
for loc in need_update:
    slug = f"{loc['postal_code']}-{slugify(loc['name'])}"
    if slug in seen:
        seen[slug] += 1
        slug = f"{slug}-{seen[slug]}"
    else:
        seen[slug] = 1
    updates.append((loc["id"], slug))

print(f"\nUpdating {len(updates)} localities (~3/sec)...")
errors = 0
for i, (loc_id, slug) in enumerate(updates):
    try:
        api_patch(loc_id, {"slug": slug})
    except Exception as e:
        print(f"  ERROR {loc_id}: {e}")
        errors += 1
        time.sleep(2)  # back off on error

    if (i + 1) % 100 == 0:
        print(f"  {i + 1}/{len(updates)} done")
    time.sleep(0.3)

print(f"\nDone! Updated {len(updates) - errors}/{len(updates)}. {errors} errors.")
