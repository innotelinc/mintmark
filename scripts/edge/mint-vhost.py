"""Give the mint.innotel.tech proxy host a Host header the managed edge accepts.

NPM renders a proxy host with `include conf.d/include/proxy.conf` inside
`location /`, and that include sets `Host $host`; a server-level override loses
to it, so the request reached the edge announcing mint.innotel.tech and the edge
answered 403. This expands the include in place with only the Host line
rewritten to the edge hostname, pins the upstream TLS name, and reloads nginx
behind `nginx -t` with an automatic restore.

Idempotent: run it again after changing proxy host 325 in the NPM UI, because
NPM rewrites the file. `python3 mint-vhost.py` on the edge box.
"""
import pathlib, re, subprocess, sys, time

C = "cerulean-npm"
CONF = "/data/nginx/proxy_host/325.conf"
INCLUDE = "/etc/nginx/conf.d/include/proxy.conf"
UPSTREAM = "site-14e683b8ff8e42ea8147b66b91f8a10a.freebuff.page"
MARK = "# mint: Host pinned to the managed edge"

def run(*args, check=True):
    proc = subprocess.run(args, capture_output=True, text=True)
    if check and proc.returncode != 0:
        print(proc.stdout, proc.stderr)
        raise SystemExit("failed: " + " ".join(args))
    return proc

conf = run("docker", "exec", C, "cat", CONF).stdout
if MARK in conf:
    print("already patched - nothing to do")
    raise SystemExit(0)

include = run("docker", "exec", C, "cat", INCLUDE).stdout
new_host = f"proxy_set_header Host {UPSTREAM};"
include, count = re.subn(r"^proxy_set_header\s+Host\s+\$host;\s*$", new_host,
                         include, flags=re.M)
if count != 1:
    raise SystemExit(f"expected one Host line in the include, found {count}")

extra = [
    "    proxy_set_header X-Forwarded-Host $host;",
    f"    proxy_ssl_name {UPSTREAM};",
    "    proxy_ssl_server_name on;",
    "    proxy_read_timeout 180s;",
    "    proxy_send_timeout 180s;",
    "    client_max_body_size 32m;",
    "    " + MARK,
]

target = "    include conf.d/include/proxy.conf;"
if conf.count(target) != 1:
    raise SystemExit("unexpected include count in the vhost")

expanded = "\n".join(("    " + line) if line.strip() else line
                     for line in include.rstrip("\n").split("\n"))
conf = conf.replace(target, expanded + "\n" + "\n".join(extra))

# The API call wrote the same intent at server level, where it is ignored.
block = re.compile(
    r"\nproxy_set_header Host " + re.escape(UPSTREAM) + r";\n"
    r"proxy_set_header X-Forwarded-Host \$host;\n"
    r"proxy_set_header X-Forwarded-Proto \$scheme;\n"
    r"proxy_ssl_name " + re.escape(UPSTREAM) + r";\n"
    r"proxy_ssl_server_name on;\n"
    r"proxy_read_timeout 180s;\n"
    r"proxy_send_timeout 180s;\n"
    r"client_max_body_size 32m;\n")
conf, removed = block.subn("\n", conf)
print("server-level block removed:", removed)

backup = pathlib.Path("/root/edge-vhost-bak-mint-" + time.strftime("%Y%m%d-%H%M%S"))
backup.mkdir(parents=True, exist_ok=True)
local = pathlib.Path("/tmp/mint-325.conf")
local.write_text(conf, encoding="utf-8")
run("docker", "cp", f"{C}:{CONF}", str(backup / "325.conf"))
run("docker", "cp", str(local), f"{C}:{CONF}")
print("backup:", backup / "325.conf")

test = run("docker", "exec", C, "nginx", "-t", check=False)
if test.returncode != 0:
    run("docker", "cp", str(backup / "325.conf"), f"{C}:{CONF}")
    print("nginx -t failed, restored the original:\n" + test.stderr[-800:])
    raise SystemExit(1)

run("docker", "exec", C, "nginx", "-s", "reload")
print("nginx test ok, reloaded")
