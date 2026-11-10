"""Publish `mint.innotel.tech` the way `gateway.telno.services` is published.

Mintmark runs on a managed edge that answers only on its own hostname, so the
public name is a CNAME to this zone's apex, which carries the address of the
cerulean NPM edge. A change of address then moves every service at once.

Dry run by default; `--apply` writes the record.
"""
import json, sys, urllib.parse, urllib.request

ENV = "/usr/src/projects/complete/1-primary/cerulean/.env"
APPLY = "--apply" in sys.argv
ZONE = "innotel.tech"
DOMAIN = f"mint.{ZONE}"

env = {}
for raw in open(ENV, encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    env.setdefault(k.strip(), v.strip().strip('"').strip("'"))

url = env["TECHNITIUM_URL"].rstrip("/")
q = urllib.parse.urlencode({"user": env.get("TECHNITIUM_USER") or "admin",
                            "pass": env.get("TECHNITIUM_ADMIN_PASSWORD", ""),
                            "includeInfo": "false"})
login = json.loads(urllib.request.urlopen(
    urllib.request.Request(f"{url}/api/user/login?{q}", data=b"", method="POST"),
    timeout=20).read().decode())
token = login.get("token")
if not token:
    raise SystemExit(f"login failed: {login.get('status')} {login.get('errorMessage')}")

def api(path, **params):
    full = f"{url}/api/{path}?" + urllib.parse.urlencode({"token": token, **params})
    return json.loads(urllib.request.urlopen(full, timeout=25).read().decode())

def records():
    # Ask at the name itself: querying the apex lists only the apex's records,
    # which makes an existing CNAME look absent and invites a duplicate.
    body = api("zones/records/get", domain=DOMAIN, zone=ZONE)
    return [r for r in (body.get("response") or {}).get("records") or []
            if str(r.get("name", "")).rstrip(".").lower() == DOMAIN]

def show(tag, rows):
    print(tag, [(r.get("type"),
                 (r.get("rData") or {}).get("cname") or (r.get("rData") or {}).get("ipAddress"),
                 r.get("ttl")) for r in rows])

before = records()
show("existing:", before)

if any(r.get("type") in ("CNAME", "A", "AAAA") for r in before):
    print("already published - nothing to do")
    raise SystemExit(0)

if not APPLY:
    print(f"dry run - would add CNAME {DOMAIN} -> {ZONE} ttl 300")
    raise SystemExit(0)

added = api("zones/records/add", domain=DOMAIN, zone=ZONE, type="CNAME", cname=ZONE, ttl="300")
error = added.get("errorMessage") or ""
if added.get("status") != "ok" and "exist" not in error.lower():
    raise SystemExit(f"add failed: {added.get('status')} {error}")
print("add:", added.get("status"), error)
show("after:", records())
