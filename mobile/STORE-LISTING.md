# App Store listing — Mintmark

Everything App Store Connect asks for, in the order it asks for it, with the
character limits that apply. Copy the blocks below verbatim; the lengths in
brackets are the real counts.

The app record is **Mintmark Appraisal**, bundle id `us.inotel.mintmark`, SKU
`mintmark`, version 1.1 on sale as `READY_FOR_SALE` with build 14 attached.

Already pushed into App Store Connect through the API, and readable back from it:

| Field | Live value |
| --- | --- |
| Name | `Mintmark Appraisal` |
| Subtitle | `Grade any coin from a photo` |
| Privacy Policy URL | `https://mint.innotel.tech/privacy` |
| Description | 1,682 characters |
| Keywords | 96 characters |
| Promotional text | 160 characters |
| Support URL | `https://mint.innotel.tech/support` |
| Marketing URL | `https://mint.innotel.tech` |
| Build | 14 (version 1.1, `READY_FOR_SALE`, the build on sale); 8 shipped with 1.0 |
| Age rating | every category answered "None" via the API |
| Categories | Reference (primary), Utilities (secondary) |

**Submitted for review** on 15 November 2026, 15:04 UTC, submission
`bf066005-f13f-4e39-9797-b8e2e9a84d05`. That submission was then cancelled to put the
composed store art in — a version in review has locked screenshot wells — which moved
the version to `DEVELOPER_REJECTED`, and it was resubmitted as
`ce109432-959e-44fe-8f6f-56eb0bc1c69e`.

**Approved and live.** Submitted on 15 November 2026 at 22:57 UTC, the version went into
review on 16 November at 19:31 UTC and came out of it at 20:21 UTC the same day — fifty
minutes in review — as `READY_FOR_SALE`. Build 8 was the build for 1.0, with both
screenshot sets holding six images. 1.1 with build 14 has since replaced it, and the app
is at:

<https://apps.apple.com/us/app/mintmark-appraisal/id6834939837>

`releaseType` is `AFTER_APPROVAL`, which releases an approved build by itself; that is what
happened here, and no manual release step was taken.

Getting there needed the App Privacy answers **published**, not just saved. Until they
were, Apple refused with `STATE_ERROR.APP_DATA_USAGES_REQUIRED` — "You must have
published answers to your app's data usages". The questionnaire is web-UI only.
Everything else submission asks for is set through the API:

| Requirement | Value |
| --- | --- |
| App content rights | `DOES_NOT_USE_THIRD_PARTY_CONTENT` — the app shows only the user's own photos |
| Copyright | `2026 Denovo Credit Corporation` |
| Price | Free, schedule `6834939837`, automatic prices worldwide |
| Review contact | Innotel Labs, `support@innotel.us`, +1 774-505-7135, no demo account |

The screenshots are uploaded and processed in both slots.

## Basics

| Field | Value |
| --- | --- |
| App name | `Mintmark Appraisal` (18/30) |
| Bundle ID | `us.inotel.mintmark` |
| SKU | `mintmark` |
| Primary language | English (U.S.) |
| Primary category | **Reference** |
| Secondary category | **Utilities** |
| Age rating | **4+** — answer "No" to every content category |
| Price | **Free**, no in-app purchases |
| Copyright | `2026 Denovo Credit Corporation` |

A name with a keyword in it ranks better than one without, if you want to change
it while the record is still editable: `Mintmark: Coin Appraisal` (24/30).

## Subtitle — 30 max

```
Grade any coin from a photo
```

[27]. An alternative if you would rather lead with the verb: `Identify, grade,
value coins` (29).

## Promotional text — 170 max

```
Point your camera at a coin: Mintmark names it, grades the wear on the 1-70 Sheldon scale, and gives a collector-market value range, with the reasons behind it.
```

[160]. Promotional text can be changed without a new build, so it is the right
place for a seasonal line.

## Keywords — 100 max, comma separated, no spaces

```
collector,numismatic,appraisal,silver,gold,penny,quarter,rare,mint,error,currency,value,identify
```

[96]. Deliberately excludes "coin" and "grade": Apple already indexes the name
and subtitle, and repeats waste the field.

## Description — 4000 max

```
Photograph a coin. Learn what collectors would pay.

Mintmark reads the front of a single coin and answers three questions: what is it, how worn is it, and what is it worth.

WHAT YOU GET

• Identification — country, denomination, design, year, mint mark and any visible variety, with a confidence figure. Details it cannot read come back empty rather than guessed.
• Grade — a Sheldon 1–70 number and the plain-English grade, judged on the wear the photo actually shows.
• Value — a collector-market range in US dollars at that grade, with what the range assumes: a dealer's price at the low end, fair retail at the high.
• The reasoning — what drives the value (key date, mintage, metal, grade, demand), what to check next to confirm it (reverse, mint mark, edge, weight), and any red flags: cleaning, polishing, damage, corrosion, artificial toning, or a cast fake.

WHY A RANGE, NOT A PRICE

One photograph cannot see the reverse, the edge, or a coin in hand. Mintmark is deliberately conservative: a worn common coin stays worth cents, and a cleaned coin is worth bullion or less, however old it is. The checks it suggests are the ones a collector would make before paying.

YOUR COLLECTION

Every appraisal is saved with its photo, so you can look back at what you have and what it was worth. Delete any coin, or all of them, whenever you like.

NO ACCOUNT, NO TRACKING

There is no sign-up. Your collection belongs to this device and is keyed to an anonymous id — no email, no password, no advertising identifiers, and nothing is used to track you across other apps.

Free to appraise. Estimates come from one photograph and are not a professional grading or an offer to buy.
```

[1,682]. Check the count after any edit; the limit is 4,000.

## What's New — 4000 max

```
1.1 brings Mintmark to iPad. The app now installs on iPad as well as iPhone, and the wider screen is used properly: capture, the collection and an appraisal each fill the room instead of stretching a phone layout. Everything else is the app you already had — one photograph in, the identification, a Sheldon grade and a collector-market range out, with the reasoning and the checks that would confirm it. Free, no account, no in-app purchases.
```

[443]. This is the copy `mobile/scripts/asc-version.mjs` writes onto version 1.1's
en-US localization; change the script and this block together so the listing and
the API write cannot disagree. 1.0 keeps "First release.", which is true of it and
would read as false next to a 1.1.

Build 14 is the build for 1.1: `BUILD_NUMBER` and `VERSION_ID` in
[`.github/workflows/asc-attach-build.yml`](../.github/workflows/asc-attach-build.yml)
point at build 14 and version `d405a608-72fb-4808-ac33-84b9a6b41fd8`, and the job
attaches it and writes the copy above in one run. Build 13 was put on the same version
the same way on 18 November 2026 (run
<https://github.com/innotelinc/mintmark/actions/runs/44347385852>); build 14 replaced it
for the release that went on sale.

That job is dispatch-only and has no submit path. 1.1 is now `READY_FOR_SALE` with
build 14 attached, so a run into it is a no-op: `mobile/scripts/asc-version.mjs` reads
the version before writing anything and, in a state where Apple holds it
(`WAITING_FOR_REVIEW`, `IN_REVIEW`, `READY_FOR_SALE` and the rest), prints
**`1.1 is READY_FOR_SALE; Apple holds this version, so there is nothing to attach or write`**
and exits 0. Runs
<https://github.com/innotelinc/mintmark/actions/runs/45362165323> (default inputs) and
<https://github.com/innotelinc/mintmark/actions/runs/45366524005> (attach and What's New
turned off) both read back `version 1.1 on IOS: READY_FOR_SALE` and `attached build: 14`
and made no `PATCH`, `POST` or `DELETE`. Writing to 1.1 again is no longer possible: the
next release gets its own version record, and `VERSION_ID` and `BUILD_NUMBER` change
with it.

## URLs

| Field | Value | Status |
| --- | --- | --- |
| Support URL | `https://mint.innotel.tech/support` | live |
| Marketing URL | `https://mint.innotel.tech` | live |
| Privacy Policy URL | `https://mint.innotel.tech/privacy` | live |

Both pages are static documents served by the Worker (`public/privacy.html` and
`public/support.html`, routed at `/privacy` and `/support`): no JavaScript, so a
reviewer on a locked-down device still sees them. A 404 in either URL is a common
rejection, which is why they are plain HTML rather than app routes.

## App Privacy — the nutrition label

"Data linked to you" is **No** throughout: the app has no account and no
identifier that could join two records to one person.

| Category | Data type | Collected | Linked to you | Used for tracking | Purpose |
| --- | --- | --- | --- | --- | --- |
| User Content | Photos or Videos | Yes | No | No | App Functionality |
| User Content | Other User Content (the optional note typed with a photo) | Yes | No | No | App Functionality |

Everything else: **not collected** — no contact info, health, financial info,
precise or coarse location, contacts, browsing or search history, purchases,
usage data, diagnostics, or sensitive information.

- **Identifiers:** not declared. The app stores a random UUID it generates itself
  (kept on the device, sent as `x-mintmark-visitor`) so a collection survives a
  reinstall; it is not the IDFA, not the IDFV, and is not shared with anyone.
  Declare *Device ID* if you would rather be conservative.
- **Tracking:** No. Therefore no App Tracking Transparency prompt and no
  `NSUserTrackingUsageDescription` in `Info.plist`.
- **Encryption:** only standard HTTPS, and `ITSAppUsesNonExemptEncryption` is
  `false`, so App Store Connect's export-compliance question is "No".
- **Third parties that see data:** the Mintmark gateway at `gateway.innotel.us`
  (analyses the photo) and Cloudflare (hosts the Worker and the D1 database that
  stores appraisals and photos).

## Privacy policy — publish this at `/privacy`

```
Mintmark privacy policy

Last updated: 15 November 2026

Mintmark appraises coins from photographs. This policy describes what happens to
your data.

What Mintmark collects

• The photograph you choose or take, and an optional note you type about the coin.
• The appraisal that comes back: identification, grade, value range and the
  reasoning.
• An anonymous id that the app generates on your device, used only to keep your
  collection separate from everyone else's.

What Mintmark does not collect

• No name, email address, phone number or account of any kind.
• No location data.
• No advertising identifier, and no tracking of you across other apps or websites.
• No analytics or crash-reporting SDKs.

Where it goes

Your photograph is sent over HTTPS to the Mintmark gateway, which passes it to a
vision model to produce the appraisal. Photographs and appraisals are stored in a
Cloudflare D1 database so your collection is still there next time you open the
app. Both are processed on our behalf; neither is sold or used for advertising.

How long it is kept

Until you delete it. "Delete all appraisals" in the app's Settings removes every
saved coin, photo and appraisal for your device immediately.

Children

Mintmark is not directed at children and collects no personal information from
anyone.

Estimates

Appraisals are estimates from a single photograph. They are not a professional
grading service, a guarantee of value, or an offer to buy or sell.

Contact

Questions about this policy: support@innotel.us
```

## App Review Information

- **Sign-in required:** No. There is no account, so no demo credentials.
- **Contact:** use the App Review contact you already have on the account.
- **Notes for the reviewer:**

```
Mintmark appraises a coin from one photograph. There is no sign-in: open the app,
tap "Take a picture" or "Choose a photo", and the appraisal appears in about ten
seconds. It needs an internet connection; the vision model runs on our server and
the app holds no API key. If the server cannot be reached, Settings → "Gateway
key and server" lets you point the app at another origin. Each device is limited
to 25 appraisals a day.
```

## Assets

| Asset | Status |
| --- | --- |
| 1024×1024 icon | `mobile/assets/icon.png` — 1024×1024, RGB, no alpha channel, ready |
| iPhone Dynamic Island (medium) `1206×2622` | **live** — 6 images, set `APP_IPHONE_61` `11d86964-5dc5-41ad-8b87-2b4b10641636` |
| iPhone Dynamic Island (large) `1320×2868` | **live** — 6 images, set `APP_IPHONE_67` `618f19e0-5388-4f50-9b5f-6f9b72d9dd04` |
| Search-results art `1206×2622` / `1320×2868` | **live** — first image in both sets, from `mobile/store-art/search-results-*.png` |
| Header art `1206×2622` / `1320×2868` | **live** — second image in both sets, from `mobile/store-art/header-*.png` |
| iPhone with Face ID (large) `1284×2778` | not needed once the large Dynamic Island set exists |
| iPad 13-inch `2064×2752` | **live, six images** — version 1.1 `d405a608-72fb-4808-ac33-84b9a6b41fd8` holds set `b0fb98a7-7077-4fd3-8af6-254e66dd479e`: the two composed pieces at 1 and 2, then `ipad-1-capture` through `ipad-4-settings`, all `COMPLETE` |
| App preview video | not needed (none for any device) |

Version 1.0 on sale is **iPhone-only**: `supportsTablet` was off, so its binary declares
one device family. Build 9, archived on 17 November 2026 with `marketing_version 1.1`
(run `44051455421`), declares both — the job's bundle check prints "the archive installs
on iPhone and iPad" — and is `VALID` in TestFlight.

Creating version 1.1 and attaching build 9 is what makes App Store Connect willing to
hold a 13-inch iPad set. It did not create one by itself: the version came up with the
two iPhone sets only, and `POST /v1/appScreenshotSets` with
`APP_IPAD_PRO_3GEN_129` was needed. The two composed pieces then uploaded into it and
both settled `COMPLETE` at 2064×2752.

Version 1.1 inherited 1.0's screenshots: both iPhone sets came up already holding their
six images, art first. The iPad set was the only empty one; it now matches them — the
two composed pieces first, then the four `ipad-*.png` captures, six images, every one
`COMPLETE` at 2064×2752 and read back from the API in that order.

The images are committed in `mobile/screenshots/out/` and were produced by
`.github/workflows/mintmark-screenshots.yml`, which builds the app for the simulator
and photographs four screens at each size; `mobile/screenshots/README.md` explains
how a run works. `mobile/SCREENSHOTS.md` is the by-hand equivalent: which screens
matter, what belongs on each, and the clean status-bar command.

In order on the product page: the composed search-results art, the composed header art,
the capture screen, the collection, an appraisal with its value range, and settings.

All six are `COMPLETE` at `1206×2622` and `1320×2868`, read back from the API after the
upload. The art is generated by `mobile/store-art/make_store_art.py` and can be dropped
in again with `.freebuff/swap_store_art.py`, which refuses to run unless the version is
in a state that accepts screenshots.

## Still to do

1. An empty review-submission draft (`39c1d92d-b8fd-4026-83e4-3e7b8ea677d6`) is still
   listed on the Version page, and only the web UI can remove it: `DELETE` answers 403
   `FORBIDDEN_ERROR` on `reviewSubmissions` in every state. Harmless, worth tidying.
2. Changing screenshots again means another pull from review — `PATCH` the submission
   with `canceled: true`, which leaves the version `DEVELOPER_REJECTED` and its wells
   open — or the next version. Once a version is approved, its wells stop accepting
   uploads and the store art has to ride a new version.

Submitting is two calls once the metadata is in place: `POST /v1/reviewSubmissionItems`
to attach the version to a draft, then `PATCH /v1/reviewSubmissions/{id}` with
`submitted: true`.

The privacy policy and support pages are published, so those two URLs can be
pasted into App Store Connect as they are.
