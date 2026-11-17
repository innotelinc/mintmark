# Store art

Two composed App Store images, one set per slot — two iPhone sizes and the 13-inch
iPad the app now installs on:

| File | Slot | Use |
| --- | --- | --- |
| `header-1206x2622.png` | `APP_IPHONE_61` | product-page opener |
| `header-1320x2868.png` | `APP_IPHONE_67` | |
| `header-2064x2752.png` | `APP_IPAD_PRO_3GEN_129` | |
| `search-results-1206x2622.png` | `APP_IPHONE_61` | first position, for search |
| `search-results-1320x2868.png` | `APP_IPHONE_67` | |
| `search-results-2064x2752.png` | `APP_IPAD_PRO_3GEN_129` | |

They are built from `mobile/screenshots/out/`, the real simulator captures, pasted at
1:1 — the captures are already the exact slot size, so nothing is upscaled and no
marketing text is drawn over the app's own UI. The headline sits on a cream gradient
band above the screenshot, coloured to run into the app's `#F5F1E8` background, so the
seam is invisible.

The two differ by job:

- **header** opens the product page. It shows the capture screen from below the app's own
  headline down to the tab bar, under "What is this coin worth?" and a one-line deck.
- **search-results** is for the small thumbnail in App Store search: five large words,
  then the appraisal with its `$550 – $900` value card, cut where that card ends. It is
  also the better first position on the product page if search impressions matter more
  than the page's opening.

## Regenerating

```sh
python3 mobile/store-art/make_store_art.py     # needs Pillow
```

Copy is set in `main()`; type sizes are fractions of the canvas width, so all three
slots stay optically matched. Two numbers come from the screenshots rather than taste:

- the search cut ends 45px past the last dark row of the value card, found by probing a
  column inside the card's left padding, so the panel edge falls in cream;
- both panels start below the status bar (`160px` at 1206 wide) so no clock or Dynamic
  Island is sliced.

### The iPad slot is not the iPhone layout at a bigger size

The app lays out as a 560pt centred column on a 13-inch iPad, so the capture has its
headline at row 400 and its drop zone at row 470 — higher up the canvas than on a phone,
where the same content sits at row 760. Two numbers therefore differ per slot:

- **band**: the copy fills 760 rows on a phone but 900 on the iPad, because type is set
  in proportion to the 2064px width and would overrun a shorter band.
- **source**: the row the panel starts at. On a phone that is the band; on the iPad it
  is 470, so the panel opens on the drop zone instead of starting wherever the band
  ends and cutting the card in half.

The iPad panel therefore takes its own window into the capture rather than running to
the bottom of the screen, and the art's lower third is the app's own empty column
background. That is what the iPad screen genuinely looks like with a photo not yet
chosen; if a fuller opener is wanted later, the appraisal capture fills the height and
would only need a `source` and `band` of its own.

`search-results-2064x2752.png` ends on the deepest cream gap that still leaves a band
for the five words, because the iPad appraisal screen keeps going below its value card:
the iPhone cut is the dark card itself, which does not exist on this screen.

The script asserts every output is RGB at the exact slot size and that no copy overruns
its band. App Store Connect rejects a screenshot with an alpha channel, so keep the RGB
conversion if you edit it.

## Adding them to the listing

A version in review cannot change its screenshots. These go in when the version is
editable again: the slot ids in `mobile/STORE-LISTING.md` are the ones to target, and
`.freebuff/swap_store_art.py` uploads a slot's pair in the right order (search-results
first, then header).

The iPad slot does not exist on the store until a build that declares the iPad family is
attached to a version: 1.0 on sale is iPhone-only. The two iPad files are ready, so they
go in with the first tablet build. To replace the opener, delete the
first image in a set and upload one of these, or append and reorder in App Store Connect.
