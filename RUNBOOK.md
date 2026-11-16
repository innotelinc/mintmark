# mintmark-web runbook

The Mintmark site (`https://mint.innotel.tech`) runs on our own box, not on a managed
host. Everything below is on `192.168.1.113`.

## Where things are

| What | Path |
| --- | --- |
| Code (clone of `innotelinc/mintmark`, branch `main`) | `/root/mintmark-web` |
| Environment (`MINTMARK_API_KEY`, `MINTMARK_DATA`, mode 600, never in the repo) | `/root/mintmark-web.env` |
| Data — the only state, SQLite | `/root/mintmark-data/mintmark.sqlite` (mounted at `/data`) |
| Compose definition | `/root/mintmark-web/compose.selfhost.yml` |
| Container | `mintmark-web`, image `mintmark-web:local`, `restart: unless-stopped` |
| Listen | container `8080` → host `8930` |
| Door | edge (NPM) proxy host **325**: `mint.innotel.tech` → `http://192.168.1.113:8930`, Let's Encrypt cert 154, no advanced config |

Handy alias for the rest of this page, on `.113` inside `/root/mintmark-web`:

```sh
C="docker compose -f compose.selfhost.yml --env-file /root/mintmark-web.env"
```

## Rebuild and deploy

```sh
ssh -i ~/.ssh/telno_deploy root@192.168.1.113
cd /root/mintmark-web
git fetch origin main && git reset --hard origin/main
$C build                      # build first: the old container keeps serving meanwhile
$C up -d                      # swap; ~5 s of downtime
$C ps                         # expect: mintmark-web ... Up (healthy)
```

`--build` on `up -d` does the same in one step, but builds while the site is down.
A rebuild never touches `/root/mintmark-data`, so appraisals survive it.

## Check it

```sh
$C ps
$C logs --tail 50 web
curl -fsS https://mint.innotel.tech/api/health
curl -fsS https://mint.innotel.tech/api/state      # requireKey:false, keySource:"env"
for u in / /privacy /support; do curl -s -o /dev/null -w "$u %{http_code}\n" "https://mint.innotel.tech$u"; done
```

The container's healthcheck hits `/api/health` every 30 s; `Up (unhealthy)` means the
worker is not answering on `8080` and `$C logs web` will say why.

## Rotate the gateway key

Edit `MINTMARK_API_KEY` in `/root/mintmark-web.env`, then `$C up -d` — the container is
recreated with the new value and the volume is kept. A key pasted into `/admin` lives in
the database instead and wins over the environment; it is cleared there, not here.

## Back up the data

```sh
$C stop web
tar czf /root/mintmark-data-$(date +%F).tgz -C /root mintmark-data
$C start web
```

Stopping first is what makes the copy consistent (WAL). The file holds every appraisal
and any key pasted into `/admin`.

## Roll back

- **Code:** `git reset --hard <previous sha>` in `/root/mintmark-web`, then `$C build && $C up -d`.
  `git log --oneline -5` shows what to go back to; the image tag is fixed at `local`, so
  the checkout is the version.
- **Data:** `$C stop web`, untar the backup over `/root/mintmark-data`, `$C start web`.
- **Whole site, back to the managed host:** republish the Freebuff *preview* environment
  for site `3f7c1a52-9d84-4e6b-b1f7-6c2a5d8e0b43`, then set host 325 back to
  `https://site-14e683b8ff8e42ea8147b66b91f8a10a.freebuff.page` **with**
  `proxy_set_header Host site-14e683b8ff8e42ea8147b66b91f8a10a.freebuff.page` in the
  advanced config — that origin refuses any other name with a 403, which is exactly the
  failure of 2026-11-16. The app's baked URL is the friendly name, so iOS needs no change
  either way.

## Things to know

- `.113` is an unprivileged LXC with **no swap**, shared with Coolify. The stack is small
  (190 MB image, idle RSS ~60 MB) but this is the box's ceiling, not the site's.
- `mint.innotel.tech` is pinned in the estate's `scripts/edge-vhost-targets.tsv` on the
  edge, so `check-edge-vhost-targets.py` fails if `192.168.1.113:8930` stops answering or
  if NPM's row drifts from the pin.
- The old Freebuff deployment is unpublished but kept (its D1 database and secrets are
  intact); nothing points at it.
