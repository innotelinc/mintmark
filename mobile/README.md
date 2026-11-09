# Mintmark for iOS

The native app: photograph the front of a coin, get its identification, grade
and collector-market value range. It talks to the Worker in the repository root
(`/api/*`) and holds no gateway key — the key stays on the server.

## Run it locally

```sh
cd mobile
npm install
npx expo start          # scan the QR with Expo Go, or press i for a simulator
```

The app needs the Worker's address. Either set `EXPO_PUBLIC_API_URL` in
`mobile/.env` (see `.env.example`), or leave it empty and paste the address on
the first screen — it is stored on the device.

## TestFlight, from GitHub

No Mac and no EAS account: `.github/workflows/mintmark-ios.yml` runs on a macOS
runner, generates the Xcode project, archives it, and uploads the `.ipa` to
TestFlight with the App Store Connect API key.

Bundle id: **us.inotel.mintmark**. It is fixed once the App Store Connect app
record exists, so change it in `app.json` before the first upload if you want
another one.

### 1. One-time, in App Store Connect and Apple Developer

1. **Create the app record.** App Store Connect → Apps → **+** → New App.
   Platform **iOS**, name **Mintmark**, bundle ID **us.inotel.mintmark** (register
   it first under Certificates, Identifiers & Profiles → Identifiers if it is not
   listed), SKU `mintmark`. The upload is rejected without this record.
2. **API key.** Users and Access → Integrations → App Store Connect API → **+**,
   name `mintmark-ci`, role **App Manager**. Copy the **Key ID** and **Issuer
   ID** and download `AuthKey_XXXXXXXXXX.p8` (only downloadable once).
3. **Distribution certificate.** Export the team's Apple Distribution
   certificate and key from Keychain Access as a password-protected `.p12`, then
   `base64` it. The workflow imports it into a throwaway keychain; because it
   reuses one identity, runs never consume the team's certificate limit.
4. **Team ID.** Apple Developer → Membership → Team ID (10 characters).

### 2. Add the secrets and the API origin to the repository

The same names the estate already uses for Sage:

```sh
gh secret set APPLE_TEAM_ID        --body "TEAMID"
gh secret set ASC_KEY_ID           --body "KEYID"
gh secret set ASC_ISSUER_ID        --body "ISSUER-UUID"
gh secret set ASC_PRIVATE_KEY      < AuthKey_XXXXXXXXXX.p8
gh secret set IOS_DIST_P12         < distribution.p12.base64
gh secret set IOS_DIST_P12_PASSWORD --body "P12-PASSWORD"

gh variable set MINTMARK_API_URL --body "https://your-worker.workers.dev"
```

`MINTMARK_API_URL` must be a live `https` origin: the address is compiled into
the app, and the workflow verifies it reached the JavaScript bundle.

### 3. Build

Actions → **Mintmark iOS TestFlight** → Run workflow, or push a tag:

```sh
git tag mintmark-ios-v0.1.0 && git push origin mintmark-ios-v0.1.0
```

The build shows up in TestFlight once Apple processes it (usually a few
minutes). Add yourself to an internal testing group, then install through the
TestFlight app. The archive and `.ipa` are kept as a workflow artifact for 14
days.

`marketing_version` (default `1.0`) sets `CFBundleShortVersionString`;
`CFBundleVersion` is the GitHub run number, so every run supersedes the last.

### What the workflow does

`expo prebuild` writes `ios/` from `app.json` (bundle id, permissions, icon),
`pod install` resolves the native modules, `xcodebuild archive` signs with the
imported identity plus automatic provisioning, `-exportArchive` produces the
`.ipa`, and `altool --upload-app` uploads it. Before exporting, it checks the
built bundle for the icon, the JS bundle, the camera permission and the baked
API origin, so a broken build fails in minutes instead of being rejected by
Apple after upload.

## Where things are

- `App.tsx`: the tab shell (Appraise, Collection, Settings) and the Admin route.
- `src/screens/Capture.tsx`: camera or library, then the appraise call.
- `src/screens/AppraisalScreen.tsx`: value card, grade scale, drivers, checks,
  red flags, delete.
- `src/api.ts`: the `/api` client, React Query hooks and the stored server
  address. `src/photo.ts`: camera permissions and the downscale to JPEG data
  URLs under 2 MB. `src/types.ts`: a mirror of `src/shared/types.ts`.
- `scripts/make-icon.mjs`: regenerates `assets/icon.png` with no image tools.

## Notes

- The app has no accounts: the collection is scoped by the server's hash of the
  device's IP address, exactly like the web app. TestFlight testers on the same
  network share a collection.
- `ITSAppUsesNonExemptEncryption` is `false`, so uploads skip the compliance
  question.
