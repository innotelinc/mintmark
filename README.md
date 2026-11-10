# Mintmark

Photograph the front of a coin and get an appraisal: what it is, how worn it
is, and what a collector would pay — with the reasons and the checks that would
confirm it.

It runs on Freebuff Sites with D1 for the collection. There is no sign-in: the
app is open, and each visitor's coins are kept under an anonymous id, so a
collection survives a change of address and two phones do not share one.
The vision key stays on the server, pasted in the admin panel or set as an
environment variable.

## How an appraisal works

1. The browser scales the photo down (long edge 1280px, JPEG) and sends it plus
   an optional note to `POST /api/appraisals`.
2. The Worker checks the image and the visitor's daily limit, then posts the
   photo to the Mintmark gateway (an OmniRoute `/v1` endpoint) asking for
   schema-constrained JSON, so the reply is an object rather than prose.
3. The reply is validated and clamped server-side (confidence 0–1, grade 1–70,
   low ≤ high, no value when unidentified) before it is stored.
4. The appraisal, its photo and a thumbnail go into D1, scoped to that visitor's
   anonymous id — a signed cookie in a browser, the id a native build keeps on
   the device. Only a successful appraisal counts against the daily limit.

## Run it

```sh
npm install
npm run dev        # http://localhost:5173 with local D1 (Miniflare)
npm run build      # dist/client (assets) + dist/mintmark/index.js (Worker)
```

Open the app, then `/admin`, and paste a Mintmark key. Without a key the capture
page explains what is missing; the app unlocks on its own once a key is saved.

## Admin

`/admin` (also the key icon at the bottom of the sidebar) holds the deployment's
settings, and they live in D1 so changing them needs no redeploy:

- **Gateway key** — pasted, checked against `GET /v1/models` before it is saved,
  then stored server-side. Only a mask like `sk-…80ad` is ever sent to a browser.
  Remove it again with **Remove key**.
- **Require a gateway key** — on by default: appraisals are blocked, with a
  setup notice, until a key exists. Turned off, the app lets anyone press
  Appraise; with no key the gateway call fails with its own message.
- **Model and gateway URL** — read-only; set by `MINTMARK_MODEL` and
  `MINTMARK_BASE_URL`.

There is no authentication in front of `/admin`, because the app has no
accounts. Deploy it for personal use, or put the site behind Cloudflare Access
if it should not be public.

## The gateway and its key

Photos are read by the OmniRoute gateway at `https://gateway.innotel.us/v1`, an
OpenAI-compatible surface. The app holds no provider key: it sends a **Mintmark
key** (sold through Magnate) as `Authorization: Bearer …`, and the gateway
verifies it, bills it, and routes the request to a vision model.

- Never ask for the key in chat, print it, log it, commit it, or put it in
  browser code. The app only ever tells the browser whether a key is set.
- Locally it lives in `.env` (see `.env.example`), which Git ignores and
  Wrangler reads. Do not add a `.dev.vars` file: when one exists, Wrangler stops
  reading `.env`.
- On Freebuff Sites, set `MINTMARK_API_KEY` in Sites → Secrets as a fallback, or
  paste the key in `/admin` after the first deploy. A key saved in the panel
  wins over the environment variable.
- `MINTMARK_MODEL` picks the model. Ids take the form `<provider>/<model>`.

**The catalogue is not the routing table.** `GET /v1/models` lists far more ids
than the deployment actually serves, so a listed id can still fail:

```sh
curl https://gateway.innotel.us/v1/models -H "Authorization: Bearer $MINTMARK_API_KEY"
```

The pinned default, `gemini/gemini-3-flash-preview`, was verified against a real
key: it reads a photo and answers strict `response_format: json_schema` in about
two seconds. `gemini/gemini-3.6-flash`, `gemini/gemini-4-argon` and
`gemini/gemini-3.1-pro-preview` are listed but answer *"not available in the
active live catalog"*; `gemini/gemini-2.5-flash` accepts the photo but rejects
JSON mode. If you change the model, check it with a real photo first.

Structured output is provider-dependent, so the Worker asks for `json_schema`
first, retries with `json_object`, and finally sends the prompt alone — the
reply is validated and clamped either way. An appraisal costs one vision call
and nothing when the gateway refuses a request; `DAILY_APPRAISAL_LIMIT` of 25
per visitor per day caps the spend, and `DAILY_DEPLOYMENT_LIMIT` (250) is the
ceiling across everyone — the identity is anonymous, so a client can always earn
a fresh allowance by clearing its cookie.

## Deploy to Freebuff Sites

Live: **https://mint.innotel.tech** (published preview environment). The site's
own origin remains
`https://site-14e683b8ff8e42ea8147b66b91f8a10a.freebuff.page`, and the friendly
name is served through the innotel edge (see below). D1 `DB` and the
`MINTMARK_API_KEY` secret are attached to the site, and the repository variable
`MINTMARK_API_URL` in `innotelinc/mintmark` points at the friendly name, so iOS
builds bake in the same origin.

1. `sites_create`, then `sites_add_storage` for D1 named `DB`.
2. `npm run build`, then `sites_deploy` with `deploy.json`.
3. Attach the key with Sites → Secrets (`MINTMARK_API_KEY`), then deploy once
   more: a secret reaches the running Worker only with a new version. Pasting
   the key in `/admin` instead needs no redeploy, because it lives in D1.

### The public name

The managed edge answers its own hostname only and holds no certificate for
foreign names, so `mint.innotel.tech` is terminated on the innotel edge rather
than attached to the site:

- `mint.innotel.tech` is a `CNAME` to `innotel.tech` in Technitium, the same
  shape as `gateway.telno.services`.
- Nginx Proxy Manager (proxy host 325) holds the Let's Encrypt certificate and
  forwards to the site origin with `Host` and `proxy_ssl_name` pinned to it. The
  pinned `Host` has to sit inside `location /`: NPM re-includes
  `conf.d/include/proxy.conf` there, which sets `Host $host` and wins over a
  server-level override.
- The browser therefore announces `https://mint.innotel.tech` while the Worker
  sees its own origin, so that name is listed in `PUBLIC_ORIGINS` in
  `src/worker/http.ts`. Changing it needs a rebuild and a deploy; a mutation
  from an unlisted origin is still refused with 403.
- Proxied traffic reaches the Worker from the edge's address, so identity cannot
  come from it: browsers are given a signed cookie and native builds send their
  stored device id. The address hash is only the fallback for a client that
  presents neither.

`scripts/edge/` holds the idempotent scripts for this: `mint-dns.py`
(Technitium; dry run unless given `--apply`), `mint-npm.py --apply` (certificate
and proxy host) and `mint-vhost.py` (the `Host` pin — re-run it after editing
that host in the NPM UI, which rewrites the file).

## Where things are

- `src/shared/config.ts`: name, the appraiser's instructions, the JSON schema,
  the gateway URL and default model, `DAILY_APPRAISAL_LIMIT` and the size caps.
- `src/worker/vision.ts`: the gateway request, error mapping, the key check, and
  the validation/clamping of the reply (`normalize`). `gateway.ts` resolves which
  key and model to use; `visitor.ts` decides who is asking (signed cookie, device
  id, or address hash) and `http.ts` holds the same-origin guard.
- `src/worker/routes/appraisals.ts`: create, list, read, delete one and delete
  all. `routes/state.ts` serves `/api/state`; `routes/admin.ts` saves the key and
  the access toggle. `db.ts` owns the schema (created on first request), the
  settings table and the usage count.
- `src/app/pages/Capture.tsx`: drop zone, camera, paste, note and the appraise
  button. `Admin.tsx`: key and access. `Settings.tsx`: usage, connections and
  delete-everything. `AppraisalView.tsx`: the value card, grade scale, drivers,
  checks and red flags.
- `src/app/lib/image.ts`: the client-side downscale. `lib/api.ts`: queries and
  mutations. `components/Shell.tsx`: the collection sidebar.
- `src/styles.css`: warm paper, ink and brass tokens, plus `.label-caps` (small
  museum labels) and `.coin-photo` (the table the coin sits on).

## What this is not

One photo of the obverse cannot prove authenticity, metal, weight or grade. The
app says so on every result: ranges widen when the model is unsure, common worn
coins come back worth cents, and it suggests what to photograph next. It is not
a professional grading and not an offer to buy.

## iOS app

`mobile/` is a native Expo app with the same flow: camera or photo library,
the same appraisal screen, the same `/api` endpoints. It holds no gateway key.

It is built and shipped to TestFlight by GitHub Actions on a macOS runner — no
Mac and no EAS account needed. `mobile/README.md` has the one-time App Store
Connect setup, the repository secrets and the build command.

```sh
gh workflow run mintmark-ios.yml -R innotelinc/mintmark
```

Builds call the deployed Worker through `MINTMARK_API_URL`; the app's Settings
screen can still point a build at another server at runtime.

## Security notes

There is no sign-in and no session: the only cookie is an anonymous
HMAC-signed id that keys a visitor's own collection and daily allowance, so
there is nothing cross-site to ride on. Mutations that announce an `Origin` must
match the site's own origin or its public name (`PUBLIC_ORIGINS` in
`src/worker/http.ts`). Queries are scoped by that id, never by an id from the
client, and no raw address is stored. The Worker only accepts JPEG/PNG/WebP data URLs under 2 MB,
caps the note at 240 characters, allows one appraisal in flight per visitor, and
answers with `Cache-Control: private, no-store`. Keys are stored in D1 and only
ever leave the Worker towards the gateway.
