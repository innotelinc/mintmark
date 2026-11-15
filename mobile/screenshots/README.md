# Screenshots

The App Store screenshots are captured by `.github/workflows/mintmark-screenshots.yml`
on a macOS runner: it builds the simulator app, boots two iPhone sizes, opens each
screen through the app's URL scheme and keeps the PNGs as an artifact. No Mac
needed, and `mobile/SCREENSHOTS.md` explains what each shot is meant to show.

Two things make this possible:

- **A prepared collection.** The workflow's build sets
  `EXPO_PUBLIC_MINTMARK_VISITOR`, so the app reads one fixed collection instead of
  making its own device id. No shipping build sets that value.
- **URL routes.** `mintmark://capture`, `mintmark://collection`,
  `mintmark://settings` and `mintmark://appraisal/<id>` open a screen directly,
  which is what `xcrun simctl openurl` clicks.

## Seeding the collection

```sh
node mobile/screenshots/seed.mjs            # against https://mint.innotel.tech
MINTMARK_API_URL=http://localhost:8787 node mobile/screenshots/seed.mjs
```

It downloads four public-domain coin photographs from Wikimedia Commons, posts
each one to `POST /api/appraisals` under the visitor id `a1b2c3d4e5f60718`, and
prints what came back. Those appraisals are real appraisals: the same model, the
same prompt and the same storage as any user's, so the screenshots show the app
doing its actual job rather than a mock.

The photos are in `fixtures/`, kept at 1280px and 200px:

| Fixture | Source | Licence |
| --- | --- | --- |
| `quarter-1944-s-*` | [Washington Quarter Silver 1944S Obverse](https://commons.wikimedia.org/wiki/File:Washington_Quarter_Silver_1944S_Obverse.png) | Public domain |
| `indian-head-1871-*` | [1871 Proof Indian Head cent obverse](https://commons.wikimedia.org/wiki/File:1871_Proof_Indian_Head_cent_obverse.jpg) | Public domain |
| `indian-head-1888-*` | [1888 Indian Head cent-obverse](https://commons.wikimedia.org/wiki/File:1888_Indian_Head_cent-obverse.jpg) | Public domain |

Each appraisal costs one call on the deployment's daily ceiling, so reseeding
repeatedly will eventually hit the 250-a-day limit; delete the seeded appraisals
when they are no longer wanted:

```sh
curl -X DELETE https://mint.innotel.tech/api/appraisals \
  -H 'x-mintmark-visitor: a1b2c3d4e5f60718'
```

## Adding a shot

Add a `mintmark://…` route in `App.tsx` and one `xcrun simctl openurl` line in the
workflow's capture step. Keep the file names `slot-N-what.png` — the size check
reads the slot from the prefix and rejects anything that is not an accepted
App Store resolution.
