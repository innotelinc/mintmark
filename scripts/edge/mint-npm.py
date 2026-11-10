"""Serve Mintmark at `mint.innotel.tech` through the cerulean NPM edge.

The managed Workers edge holds a certificate for its own hostname only and
answers that hostname only, so the public name is terminated here: NPM carries
the Let's Encrypt certificate for mint.innotel.tech and proxies upstream to the
edge hostname. Run `mint-vhost.py` afterwards: the Host pin has to live inside
`location /`, which NPM's advanced config does not reach.

Dry run by default; `--apply` writes the certificate and proxy host.
"""
import json, subprocess, sys, urllib.error, urllib.request

APPLY = "--apply" in sys.argv
DOMAIN = "mint.innotel.tech"
UPSTREAM = "site-14e683b8ff8e42ea8147b66b91f8a10a.freebuff.page"
UPSTREAM_PORT = 443
BASE = "http://192.168.1.71:81"

def env(key):
    out = subprocess.run(["grep", "-h", "^" + key + "=",
                          "/usr/src/projects/complete/1-primary/cerulean/.env"],
                         capture_output=True, text=True).stdout.strip()
    return out.split("=", 1)[1].strip().strip('"').strip("'") if "=" in out else ""

def call(path, method="GET", body=None, token=None, timeout=600):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:800])
        raise

def upstream_reachable():
    try:
        with urllib.request.urlopen(f"https://{UPSTREAM}/api/state", timeout=25) as r:
            return r.status, r.headers.get("content-type")
    except Exception as e:
        return "error", str(e)

print("upstream:", upstream_reachable())
token = call("/api/tokens", "POST",
             {"identity": env("NPM_ADMIN_EMAIL"), "secret": env("NPM_ADMIN_PASSWORD")})["token"]
hosts = call("/api/nginx/proxy-hosts", token=token) or []
certs = call("/api/nginx/certificates", token=token) or []
existing = next((h for h in hosts
                 if DOMAIN in [str(d).lower() for d in (h.get("domain_names") or [])]), None)
cert = next((c for c in certs
             if DOMAIN in [str(d).lower() for d in (c.get("domain_names") or [])]), None)
print("proxy host:", existing["id"] if existing else "absent",
      "| certificate:", cert["id"] if cert else "absent")

if not APPLY:
    print("dry run - nothing written")
    raise SystemExit(0)

if not cert:
    email = env("ACME_EMAIL") or env("NPM_EMAIL") or "admin@innotel.us"
    print("requesting certificate as", email)
    made = call("/api/nginx/certificates", "POST",
                {"provider": "letsencrypt", "nice_name": DOMAIN, "domain_names": [DOMAIN],
                 "meta": {"dns_challenge": False, "key_type": "rsa"}}, token=token)
    cert = call(f"/api/nginx/certificates/{made['id']}", token=token)
    print("issued certificate", cert["id"], "expires", cert.get("expires_on"))

body = {
    "domain_names": [DOMAIN],
    "forward_scheme": "https",
    "forward_host": UPSTREAM,
    "forward_port": UPSTREAM_PORT,
    "access_list_id": 0,
    "certificate_id": cert["id"],
    "ssl_forced": True,
    "http2_support": True,
    "allow_websocket_upgrade": True,
    "caching_enabled": False,
    "block_exploits": False,
    "meta": {"letsencrypt_agree": True, "dns_challenge": False},
    "locations": [],
    "enabled": True,
}

if existing:
    call(f"/api/nginx/proxy-hosts/{existing['id']}", "PUT", body, token=token)
    host_id = existing["id"]
    print("updated proxy host", host_id)
else:
    made = call("/api/nginx/proxy-hosts", "POST", body, token=token)
    host_id = made["id"]
    print("created proxy host", host_id, made["domain_names"], "->",
          made["forward_scheme"], made["forward_host"], made["forward_port"])

now = call(f"/api/nginx/proxy-hosts/{host_id}", token=token)
print(json.dumps({k: now.get(k) for k in
                  ("id", "domain_names", "forward_host", "forward_port", "certificate_id",
                   "ssl_forced", "http2_support", "enabled")}, indent=1))
