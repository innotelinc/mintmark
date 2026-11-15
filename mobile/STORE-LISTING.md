# App Store listing — Mintmark

Everything App Store Connect asks for, in the order it asks for it, with the
character limits that apply. Copy the blocks below verbatim; the lengths in
brackets are the real counts.

The app record is **Mintmark Appraisal**, bundle id `us.inotel.mintmark`, SKU
`mintmark`, version 1.0 in *Prepare for Submission*.

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
| Build | 8 (version 1.0) attached to the version |
| Age rating | every category answered "None" via the API |
| Categories | Reference (primary), Utilities (secondary) |

Submission is refused until two things exist that no API can supply: **screenshots**
(`appScreenshotSets` is empty) and the **App Privacy questionnaire**, which is
web-UI only.

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
First release.
```

The build number is set by CI, so this text is the only thing to update per
release.

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
| iPhone 6.9" screenshots (1320×2868) | **missing** — required |
| iPhone 6.5" screenshots (1284×2778) | **missing** — required |
| App preview video | not needed |

Screenshots to take, in order: the capture screen with a coin in frame, an
appraisal showing the value card and the grade scale, the drivers and red flags
section, and the collection list.

## Still to do before submitting

1. Take and upload the two screenshot sizes (the only hard blocker left).
2. Fill in App Privacy → Data Types in the web UI using the table above; the API
   does not expose it.
3. Delete the two empty review-submission drafts the API attempts left behind
   (Version page → the submission panel), which cannot be deleted through the API
   in `READY_FOR_REVIEW`.

The privacy policy and support pages are published, so those two URLs can be
pasted into App Store Connect as they are.
