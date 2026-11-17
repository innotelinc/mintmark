# Mintmark in the Innotel Platform Stack

**Role: product app (Reference/Utilities, iOS + web)**

This page declares Mintmark's role in the
[**Innotel Platform Stack**](https://github.com/innotelinc/innotel-platform-stack) —
the canonical single-responsibility architecture. The stack is defined in exactly
one place; this page links the product to it and states what it owns, consumes,
provides, and explicitly does not own.

## Owns

- **The appraisal itself** — the appraiser's instructions, the JSON response
  schema, and the server-side validation/clamping of a model reply
  (`src/shared/config.ts`, `src/worker/vision.ts`).
- **Collections** — one appraisal with its photo and thumbnail, scoped to an
  anonymous visitor id (signed cookie in a browser, a stored device id in the
  native build). No accounts, no cross-visitor reads.
- **The product surfaces** — `mint.innotel.tech` (web app, `/privacy`,
  `/support`), the iPhone app *Mintmark Appraisal* on the App Store, and the
  landing page at `innotelinc.github.io/mintmark`.
- **Its own runtime** — the `mintmark-web` compose stack on `192.168.1.113`
  (`compose.selfhost.yml`, image built from `Dockerfile.selfhost`), with SQLite
  in `/root/mintmark-data` as the only state.

## Provides

- **An appraisal API** (`POST /api/appraisals`) used by both the web app and the
  native app — one implementation, one prompt, one value range.
- **A worked example of the product standard** — README shape, Unity theme,
  attribution guards, Pages landing page and a reproducible deployment, in a
  repository small enough to read end to end.

## Consumes

- **Magnate (Revenue)** — the vision call is billed through a Mintmark key sold
  by Magnate; the app itself holds no provider key.
- **The gateway** (`gateway.innotel.us`, an OmniRoute `/v1` surface) — verifies
  the key, bills it, and routes the request to a vision model.
- **NPM Edge** — proxy host 325 fronts `mint.innotel.tech` → `192.168.1.113:8930`
  and holds its Let's Encrypt certificate.
- **Cerulean (Trust)** — DNS for `mint.innotel.tech`; Cerulean's estate checks
  hold the door's target as a pin (`edge-vhost-targets.tsv`), so a drifted or
  dark door fails a check instead of reaching a reviewer.
- **Cerulean Vault (secrets)** — the estate posture for secret material. This
  install keeps its one secret (`MINTMARK_API_KEY`) in
  `/root/mintmark-web.env` on the host, mode 600, never in the repository;
  moving it to Vault is a deployment change, not a code change.

## Explicitly does NOT own

- **Identity** — there is no sign-in and no session to own. The only cookie is
  an anonymous HMAC-signed id.
- **Secrets (Cerulean Vault)** — the key is read from the environment at boot.
- **DNS/TLS (Cerulean, NPM Edge)** — the name and its certificate are the edge's.
- **Billing (Magnate)** — plans, keys and invoicing live in Magnate; Mintmark
  only spends a key.

## Service map (Mintmark-owned)

| Component | Technology | Job |
|---|---|---|
| Web app | Vite + React + Hono worker | Capture, collection, settings, admin |
| Appraisal engine | Vision model via gateway | Identify, grade, value, list checks |
| Store | D1 in the managed deployment; SQLite via `server/selfhost.mjs` | Appraisals, settings, usage counts |
| iPhone app | Expo / React Native | Same flow, native camera |
| Landing page | Static HTML + Unity theme | `innotelinc.github.io/mintmark` |
| Deployment | Docker compose + NPM Edge | `mint.innotel.tech` |

## In the ecosystem

| Flow | Path |
|---|---|
| Revenue | Magnate sells Mintmark keys → gateway bills the vision call |
| Edge | Cerulean DNS → NPM Edge (host 325) → `192.168.1.113:8930` |
| Secrets | Host env file (`/root/mintmark-web.env`) → container env; Cerulean Vault where the install uses it |
| Checks | `check-edge-vhost-targets.py` / `check-edge-vhost-pins.py` on the edge |
| Source of truth | This repository's `docs/stack.md` points back to the Innotel Platform Stack |

Back to the canonical definition: the
[Innotel Platform Stack](https://github.com/innotelinc/innotel-platform-stack).
