# Screenshots

The App Store screenshots are captured by `.github/workflows/mintmark-screenshots.yml`
on a macOS runner: it builds the simulator app, boots two iPhone sizes, walks each
one through four screens and keeps the PNGs as an artifact. No Mac needed, and
`mobile/SCREENSHOTS.md` explains what each shot is meant to show.

Two things make this possible:

- **A prepared collection.** The workflow's build sets
  `EXPO_PUBLIC_MINTMARK_VISITOR`, so the app reads one fixed collection instead of
  making its own device id. No shipping build sets that value.
- **A capture script file.** With `EXPO_PUBLIC_MINTMARK_CAPTURE` set, the app polls
  `Documents/capture-screen.json` once a second and shows whatever screen that file
  names. The workflow writes the file on the simulator's disk between shots, so one
  launch produces all four images. Nothing else works on a headless simulator:
  `xcrun simctl openurl` raises iOS's own "Open in Mintmark?" dialog over the app,
  `setTimeout` chains are coalesced and fire at once, and launch arguments are often
  dropped when the launch quietly attaches to the copy that is already running.
  Neither variable is set in a shipping build.

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
repeatedly will eventually hit the deployment ceiling in `DAILY_DEPLOYMENT_LIMIT`
(2,500 a day, the shared one in `src/shared/config.ts`); delete the seeded appraisals
when they are no longer wanted:

```sh
curl -X DELETE https://mint.innotel.tech/api/appraisals \
  -H 'x-mintmark-visitor: a1b2c3d4e5f60718'
```

## Adding a shot

Add the screen to the switch in `useCaptureScript` in `App.tsx`, then one `ask` line
in the workflow's capture step. Keep the file names `slot-N-what.png` — the size
check reads the slot from the prefix and rejects anything that is not an accepted
App Store resolution.

The images are committed in `out/`, so a fresh run is only needed to refresh them:
`gh workflow run mintmark-screenshots.yml -R innotelinc/mintmark` takes about
fifteen minutes, then `gh run download <id> -R innotelinc/mintmark -n
mintmark-screenshots -D mobile/screenshots/out`.
