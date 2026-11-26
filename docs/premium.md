# Mintmark Pro — the paid tier, and what submission needs

Mintmark stays free: 25 appraisals a day, the same identification, grade, value
range and collection. **Mintmark Pro** is an optional auto-renewable subscription
bought through Apple's in-app purchase, and it does one thing — raises the daily
allowance to 100. Nothing is taken out of the free app to make Pro look better.

This document is the plan of record for the 1.2 release: what exists in code, what
has to be created in App Store Connect, and the exact steps that turn this build
into something Apple reviews.

## What is built

| Layer | Where | What it does |
| --- | --- | --- |
| Products | `src/shared/config.ts`, `mobile/src/config.ts` | The two ids below, and the Pro limit |
| Entitlements | `src/worker/db.ts` | `entitlements` table: one row per visitor, expiry in ms |
| Verification | `src/worker/appstore.ts` | App Store Server API lookup, signed with the ASC key |
| Plan | `src/worker/plan.ts` | `pro` while `expires_at > now`, otherwise `free` |
| Routes | `src/worker/routes/billing.ts` | `GET /api/billing`, `POST /api/billing/verify` |
| Gating | `src/worker/routes/appraisals.ts`, `state.ts` | Limit comes from the plan; `/api/state` carries `plan` |
| StoreKit | `mobile/src/purchases.ts` | expo-iap: offers, purchase, restore, finish, manage |
| Paywall | `mobile/src/screens/Paywall.tsx` | Benefits, prices from the App Store, restore, legal links |
| Entry points | `mobile/src/screens/Settings.tsx`, `Capture.tsx` | Pro row, and an upsell when the day's allowance is gone |

The server is the only authority. The app sends the transaction id it got from
StoreKit; the Worker asks Apple, checks the bundle id, product id, revocation and
expiry, then writes the entitlement. `GET /api/state` returns the tier and the
limit the server will enforce, so a patched client can lie about everything except
what it is allowed to do.

## Products to create in App Store Connect

One subscription group, **Mintmark Pro**, with two auto-renewable subscriptions.
Both unlock the same entitlement; the yearly one is the better deal. Prices are
the US starting points — Apple's price points and local currency equivalents apply.

| Product id | Reference name | Duration | US price | Free trial |
| --- | --- | --- | --- | --- |
| `us.inotel.mintmark.pro.monthly` | Mintmark Pro Monthly | 1 month | $3.99 | none |
| `us.inotel.mintmark.pro.yearly` | Mintmark Pro Yearly | 1 year | $24.99 | none |

Deliberately not offered, for now: a lifetime unlock (needs a non-consumable and a
second entitlement shape), a family plan, and a student price. Each adds review
surface without adding an appraisal.

For each product, App Store Connect requires a localized display name and
description (≤ 45 and ≤ 80 characters) and a review screenshot:

- Display name: `Mintmark Pro`
- Description: `100 coin appraisals a day instead of 25. Everything else stays free.`
- Review screenshot: the paywall (`mobile/screenshots` describes how captures are
  produced; a paywall capture needs a sandbox account that owns the products).

The subscription group needs its own localized name (`Mintmark Pro`) and the
"Subscription Group Display Name" shown on the manage-subscriptions sheet.

## Server configuration

Set these on the host (or in the deployment's secrets). All three are one App Store
Connect API key with the **App Manager** role; no client secret exists.

```sh
APPLE_ISSUER_ID=...        # Users and Access → Integrations → App Store Connect API
APPLE_KEY_ID=...           # the key's 10-character id
APPLE_PRIVATE_KEY=...      # the whole .p8 block, newlines included
# APPLE_ENVIRONMENT=sandbox  # only when the server should try TestFlight first
```

Without them, `POST /api/billing/verify` answers 503
`billing_unconfigured` and the app stays free; no appraisal breaks. A TestFlight
build buys in the sandbox, an App Store build in production, so the Worker tries
production and falls back to the sandbox on a 404. Sourcing the host env file and
running `./setup.sh --doctor` does not test billing — check it with:

```sh
curl -fsS https://mint.innotel.tech/api/billing     # {"plan":{"tier":"free",...}}
```

## Before you archive 1.2

1. `mobile/app.json` → `version` `1.2.0`, and the TestFlight job's
   `marketing_version` input `1.2`.
2. `src/shared/config.ts` → `APP_VERSION` / `APP_BUILD` in step with it (they are
   only labels on the site, but they are meant to match).
3. `store.json` → the new version record's `version`, `versionId`, `build` and
   `whatsNew`, once App Store Connect has created the version. There is no 1.2
   record yet, so those ids cannot be invented here; the store-state check will
   fail until they are real.
4. App Store Connect → **App Information → In-App Purchases** must show both
   products as *Ready to Submit*, and 1.2's submission must include them, or the
   paywall ships with nothing to buy.
5. The app's privacy answers gain one row: **Purchases → Purchase History**,
   *collected: yes, linked to you: no, tracking: no, purpose: App Functionality*
   (the transaction id is stored server-side against the anonymous device id).
6. Review notes: state that the app is free, that Pro is optional, and give the
   sandbox account used for the review screenshot — Apple tests IAP with it.

## What was verified, and what was not

- `npm run typecheck` (Worker) and `npx tsc --noEmit` (mobile) pass.
- The limit path is covered by the code: `/api/state` and `POST /api/appraisals`
  both read the plan, and an expired or missing entitlement falls back to 25.
- **Not verified here:** a real StoreKit purchase, the App Store Server API call
  with a live key, `expo prebuild` with `expo-iap` autolinked, and any upload or
  submission. Those need a macOS runner and your Apple account; none of it was
  run or claimed.
