<div align="center">

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

# 🪙 Mintmark — Coin Appraisal

**Photograph the front of a coin and get an appraisal: what it is, how worn it is, and what a collector would pay — with the reasons and the checks that would confirm it.**
One photo in, one careful dealer's answer out: identification, a Sheldon grade,
a collector-market value range, the drivers behind it, visible red flags, and what
to photograph next. Live in the browser at `mint.innotel.tech` and on the App Store
as **Mintmark Appraisal**.

[![CI](https://github.com/innotelinc/mintmark/actions/workflows/ci.yml/badge.svg)](https://github.com/innotelinc/mintmark/actions/workflows/ci.yml)
[![Theme: Unity](https://img.shields.io/badge/theme-Unity-6366f1)](https://github.com/innotelinc/innotel-platform-stack/blob/main/standards/unity/README.md)
[![App Store](https://img.shields.io/badge/App%20Store-live-0b7a3b?logo=apple&logoColor=white)](https://apps.apple.com/us/app/mintmark-appraisal/id6834939837)
[![Version](https://img.shields.io/badge/version-1.0.0%20(build%208)-informational)](#the-iphone-app)

</div>

---

## Why Mintmark

| Problem | Mintmark answer |
| --- | --- |
| Coin apps flatter the coin and quote a catalogue headline | The appraiser is told to be conservative: a worn common coin comes back worth cents, and empty fields instead of a guessed date or mint mark |
| A price with no reasoning is unfalsifiable | Every appraisal carries its drivers, its red flags, and 2–4 concrete things to photograph next |
| Grading needs photos of surfaces nobody sends | It grades what the obverse actually shows, and says what the photo cannot prove |
| "Sign up to see your results" | No account, no sign-in, no in-app purchase; a collection is keyed to an anonymous id |
| Photos disappearing into someone else's model account | The vision key stays server-side and the call goes through the estate's own gateway |

> **About Mintmark** — a coin appraisal from a single photo, for collectors and for
> people who found a coin in a drawer. It identifies the coin, grades it on the
> Sheldon 1–70 scale, and returns a collector-market value range in USD with the
> reasoning attached — on the web at **`mint.innotel.tech`** and as a free iPhone
> app. **Landing page:** [innotelinc.github.io/mintmark](https://innotelinc.github.io/mintmark/)

---

## About me

I am **Darnel Hunter**, and I build the Innotel platform behind these products:
identity, storage, billing, media, mail and the edge that fronts them. Mintmark is
one of the products on top of it, and the smallest complete one — a real appraisal
engine, a collection, a privacy page and a native app, with no account system to
hide behind.

I write software the way I would want to inherit it: the standard spelled out in
one place, the theme shared rather than reinvented per project, the deployment
reproducible from a compose file, and the docs honest about what a check did and
did not verify. This repository follows that pattern — the estate's README shape,
the [Unity theme](https://github.com/innotelinc/innotel-platform-stack/blob/main/standards/unity/README.md),
the attribution guards, a Pages landing page, and `compose.selfhost.yml` for the
box that serves it.

- Website: **[mint.innotel.tech](https://mint.innotel.tech)** — the app itself
- This page: [innotelinc.github.io/mintmark](https://innotelinc.github.io/mintmark/)
- App Store: [Mintmark Appraisal](https://apps.apple.com/us/app/mintmark-appraisal/id6834939837)
- Projects: [github.com/innotelinc](https://github.com/innotelinc)
- Support: [support@innotel.us](mailto:support@innotel.us) · [mint.innotel.tech/support](https://mint.innotel.tech/support)

The one rule specific to Mintmark: **it must never flatter a coin.**

## ✨ Features

- **Identification** — country, denomination, design, year, mint mark and visible
  variety, with empty fields where the photo does not show a detail.
- **Grade** — Sheldon 1–70 plus the adjectival name, judged on the photograph.
- **Value range** — collector-market USD at that grade, low and high, clamped
  server-side (`low ≤ high`, no value when the coin is unidentified).
- **Drivers, red flags, next checks** — the value's components, visible cleaning
  or damage or a cast fake, and what to photograph next.
- **A collection** — every appraisal with its photo and thumbnail, per anonymous
  visitor id; delete one or all.
- **Web and native from one API** — the Vite/React app and the Expo iOS app call
  the same `/api/appraisals`.
- **The key never reaches a browser** — pasted into `/admin` (stored in the
  database) or set as `MINTMARK_API_KEY`; only a mask like `sk-…80ad` is ever sent
  to a client.

## How an appraisal works

1. The browser scales the photo down (long edge 1280px, JPEG) and sends it plus
   an optional note to `POST /api/appraisals`.
2. The Worker checks the image and the visitor's daily limit, then posts the
   photo to the Mintmark gateway (an OmniRoute `/v1` endpoint) asking for
   schema-constrained JSON, so the reply is an object rather than prose.
3. The reply is validated and clamped server-side (confidence 0–1, grade 1–70,
   low ≤ high, no value when unidentified) before it is stored.
4. The appraisal, its photo and a thumbnail go into the store, scoped to that
   visitor's anonymous id — a signed cookie in a browser, the id a native build
   keeps on the device. Only a successful appraisal counts against the limit.

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
settings, and they live in the database so changing them needs no redeploy:

- **Gateway key** — pasted, checked against `GET /v1/models` before it is saved,
  then stored server-side. Only a mask like `sk-…80ad` is ever sent to a browser.
  Remove it again with **Remove key**.
- **Require a gateway key** — on by default: appraisals are blocked, with a
  setup notice, until a key exists. Turned off, the app lets anyone press
  Appraise; with no key the gateway call fails with its own message.
- **Model and gateway URL** — read-only; set by `MINTMARK_MODEL` and
  `MINTMARK_BASE_URL`.

There is no authentication in front of `/admin`, because the app has no
accounts. Run it for personal use, or put the site behind the estate's SSO if it
should not be public.

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
- In a hosted or self-hosted deployment, set `MINTMARK_API_KEY` in the
  environment or paste the key in `/admin` after the first deploy. A key saved in
  the panel wins over the environment variable.
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

## Hosting it on our own box

Live: **https://mint.innotel.tech**, served from `192.168.1.113:8930` behind the
innotel edge. The worker is unchanged; `server/selfhost.mjs` supplies the two
bindings Cloudflare used to (static `ASSETS` over `dist/client`, and `DB` as a
SQLite file under `/data`), so nothing in `src/worker` knows the difference.

On the box, `compose.selfhost.yml` declares the whole thing, so bringing it up
(or rebuilding it) is one command rather than a remembered `docker run`:

```sh
export MINTMARK_API_KEY="$MINTMARK_API_KEY" MINTMARK_DATA=/root/mintmark-data
docker compose -f compose.selfhost.yml up -d --build
```

Keep the key in the host environment or an untracked `--env-file`, never in the
compose file. `MINTMARK_PORT` defaults to 8930 and `MINTMARK_DATA` to `./data`.
Rebuilds, key rotation, backups and rollback are in [RUNBOOK.md](RUNBOOK.md).

The edge holds one proxy host for `mint.innotel.tech` → `http://192.168.1.113:8930`
with its Let's Encrypt certificate, and no Host rewrite is needed because the
origin serves that name itself. A fresh database seeds `require_key = 0`, matching
the free appraisals the hosted deployment offered; a key pasted into `/admin` still
wins over the environment. Rebuild and `docker restart mintmark-web` to ship a change.

The name is also pinned in the estate's `scripts/edge-vhost-targets.tsv` on the
edge, so `check-edge-vhost-targets.py` fails if the box stops answering and
`check-edge-vhost-pins.py` fails if the proxy row drifts from the pin.

## The iPhone app

*Mintmark Appraisal* is **live on the App Store** — free, no accounts, no in-app
purchases:

<https://apps.apple.com/us/app/mintmark-appraisal/id6834939837>

| | |
| --- | --- |
| App Store name | `Mintmark Appraisal` |
| Bundle id / SKU | `us.inotel.mintmark` / `mintmark` |
| Version / build | **1.0.0 / 8** (approved 16 November 2026, on sale the same day) |
| Categories | Reference (primary), Utilities (secondary) |
| Privacy / support / marketing URLs | `mint.innotel.tech/privacy`, `/support`, `mint.innotel.tech` |

`mobile/` is a native Expo app with the same flow: camera or photo library, the
same appraisal screen, the same `/api` endpoints. It holds no gateway key.

It is built and shipped to TestFlight by GitHub Actions on a macOS runner — no
Mac and no EAS account needed. `mobile/README.md` has the one-time App Store
Connect setup, the repository secrets and the build command.

```sh
gh workflow run mintmark-ios.yml -R innotelinc/mintmark
```

Builds call the deployed Worker through `MINTMARK_API_URL`; the app's Settings
screen can still point a build at another server at runtime.

The icon and splash are drawn procedurally by `mobile/scripts/make-icon.mjs`
(no image dependencies): a struck brass coin with a milled edge and an embossed
M on ink, lit from the upper left. Rerun it after changing the mark, and keep
`public/favicon.svg` in step for the web tab.

### Moving the signing secrets between repositories

GitHub never reveals a stored secret, so the Apple values already held in
`innotelinc/sage` cannot be read out or copied by hand. `scripts/apple-secrets-copy.yml`
is a one-shot workflow to drop into sage: it reads the six values there and writes
them into `innotelinc/mintmark` with a fine-grained token, printing only names and
lengths. See its header for the three setup steps.

## Documentation

| Doc | What it covers |
| --- | --- |
| [docs/stack.md](docs/stack.md) | Mintmark's role in the Innotel Platform Stack — owns / provides / consumes |
| [RUNBOOK.md](RUNBOOK.md) | Operating the `mintmark-web` stack: rebuild, key rotation, backups, rollback |
| [mobile/README.md](mobile/README.md) | iOS build, App Store Connect setup, repository secrets |
| [mobile/STORE-LISTING.md](mobile/STORE-LISTING.md) | The App Store listing copy, limits and submission record |
| [Landing page](https://innotelinc.github.io/mintmark/) | `web/landing/` — the Unity-themed project page |

## Repo layout

```
mintmark/
├── src/                      # The web app: shared config, worker routes, React pages
├── server/selfhost.mjs       # Node adapter: D1 + static ASSETS bindings for our own box
├── compose.selfhost.yml      # The deployment (declared, not remembered)
├── Dockerfile.selfhost       # Image: build the site, run it under Node
├── web/landing/              # Static GitHub Pages landing page + Unity theme
├── mobile/                   # Expo iOS app, store listing, icon scripts
├── docs/                     # Architecture and stack role
├── .github/workflows/        # CI, attribution guard, Pages, iOS build, screenshots
├── .githooks/                # Attribution guard (commit-msg, pre-commit, guard-lib)
└── .env.example              # Environment template
```

## What this is not

One photo of the obverse cannot prove authenticity, metal, weight or grade. The
app says so on every result: ranges widen when the model is unsure, common worn
coins come back worth cents, and it suggests what to photograph next. It is not
a professional grading and not an offer to buy.

## Security notes

There is no sign-in and no session: the only cookie is an anonymous
HMAC-signed id that keys a visitor's own collection and daily allowance, so
there is nothing cross-site to ride on. Mutations that announce an `Origin` must
match the site's own origin or its public name (`PUBLIC_ORIGINS` in
`src/worker/http.ts`). Queries are scoped by that id, never by an id from the
client, and no raw address is stored. The Worker only accepts JPEG/PNG/WebP data
URLs under 2 MB, caps the note at 240 characters, allows one appraisal in flight
per visitor, and answers with `Cache-Control: private, no-store`. Keys are stored
server-side and only ever leave the Worker towards the gateway; `MINTMARK_API_KEY`
lives in the host environment (`/root/mintmark-web.env`, mode 600) and is never
committed.

## License

Mintmark is licensed under the MIT License. See [LICENSE](LICENSE) for the full text.

*Mintmark — coin appraisal from a photo. © 2026 Innotel Inc.*

## 🏛️ Platform stack

Mintmark is a product app in the
[**Innotel Platform Stack**](https://github.com/innotelinc/innotel-platform-stack) —
the canonical single-responsibility architecture where Authentik owns identity,
Cerulean Vault owns secrets, Cerulean owns trust, ONYX owns storage, Magnate owns
revenue, NPM Edge owns the edge, and every other platform is a business function
that consumes them. See [docs/stack.md](docs/stack.md) for this product's
owns/consumes boundaries.
