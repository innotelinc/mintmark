# Screenshots for the App Store

Four captures, two sizes, about ten minutes on a Mac with Xcode. Everything here
is what App Store Connect asks for as of November 2026.

## The sizes

| Slot in App Store Connect | Portrait pixels | Needed? |
| --- | --- | --- |
| iPhone with Dynamic Island (medium display) | **1206 × 2622** (iPhone 18 Pro, 17 Pro, 16 Pro) or 1179 × 2556 (16, 15 Pro, 15) | **Required** — at least one |
| iPhone with Dynamic Island (large display) | **1320 × 2868** (16/17/18 Pro Max, Air, 15/14 Pro Max, 16/15 Plus) | Optional, but supply it and the 6.5" set below stops being required |
| iPhone with Face ID (large display) | 1284 × 2778 or 1242 × 2688 | Only required if you skip the large Dynamic Island set |
| iPad 13-inch | 2064 × 2752 | No — this app has `supportsTablet: false` |

So capture **two** sets: `1206 × 2622` and `1320 × 2868`. That satisfies the
required slot and the large slot, and makes the 6.5" set unnecessary. Format is
`.png`, `.jpg` or `.jpeg`, no alpha channel, 1–10 images per size per language.
Landscape is the same numbers reversed; this app is portrait-only.

## Get the app running once

```sh
cd mobile
npm install
python3 -c "import json;print('bundle', json.load(open('app.json'))['expo']['ios']['bundleIdentifier'])"
echo 'EXPO_PUBLIC_API_URL=https://mint.innotel.tech' > .env
npx expo run:ios --device "iPhone 17 Pro"     # Xcode installs it on the 1206×2622 simulator
```

`iPhone 17 Pro` is the required size; run the same command with `--device
"iPhone 17 Pro Max"` afterwards for the 1320 × 2868 set. Pointing at the live
Worker matters: an empty collection or a "no key" notice is not a screenshot.

Before each capture, tidy the status bar so it reads 9:41 with full bars:

```sh
xcrun simctl status_bar booted override --time "9:41" --batteryState charged \
  --batteryLevel 100 --cellularBars 4 --wifiBars 3
```

## The four captures

Take them in this order; the first two are the ones that appear in search results.

1. **Capture, ready state.** The coin screen with the headline, the drop area and
   both buttons visible, nothing typed and no keyboard up. This is the first
   impression, so it should look like an app that is waiting for a coin.
2. **A finished appraisal, top half.** A real coin appraised, scrolled so the
   value card and the grade scale are both on screen. Use an ordinary, clearly
   identifiable coin — a circulated silver coin reads better than something
   obscure, and its honest low value is the point of the product.
3. **A finished appraisal, reasons.** Drivers, "what to check next" and any red
   flags. This is the screen that shows the app is not a magic price oracle.
4. **Collection with three or more coins.** Appraise three coins first so the
   list has thumbnails and values in it. An empty or one-item list sells nothing.

Optional fifth: **Settings**, showing "n of 25 appraisals today" and the
server-wide bar — useful if you want the limits to be visible before someone
installs.

## Capture

Press **⌘S** in the Simulator (saves to the Desktop at device resolution), or:

```sh
xcrun simctl io booted screenshot ~/Desktop/mintmark-1-capture.png
sips -g pixelWidth -g pixelHeight ~/Desktop/mintmark-1-capture.png   # confirm the size
```

Name them in upload order: `mintmark-1-capture.png` … `mintmark-4-collection.png`,
once per device size (`-pro` suffix for the 1320×2868 set).

## What gets screenshots rejected

- Device frames, marketing text overlaid on the UI, or any image that is not the
  app itself — the raw simulator capture is the safe choice.
- A status bar showing a debug build, a VPN icon, or a carrier name like
  "Carrier"; the override above fixes it.
- Placeholder or broken states: "No key configured", an error toast, a spinner,
  an empty collection, or a photo that failed to appraise.
- Anything showing another person's data. There is no account here, so the only
  data is your own coin photos.
- Wrong pixel size — App Store Connect rejects the upload at the wrong
  resolution rather than scaling it.

## Upload

App Store Connect → **Mintmark Appraisal** → the version page → *App Previews and
Screenshots* → pick the Dynamic Island (medium) slot, drop the four PNGs in order,
then repeat for the large slot. Screenshots can be changed without a new build;
the build number does not have to move.
