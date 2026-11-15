# Store art

Two composed App Store images, one set per iPhone slot:

| File | Slot | Use |
| --- | --- | --- |
| `header-1206x2622.png` | `APP_IPHONE_61` | product-page opener |
| `header-1320x2868.png` | `APP_IPHONE_67` | |
| `search-results-1206x2622.png` | `APP_IPHONE_61` | first position, for search |
| `search-results-1320x2868.png` | `APP_IPHONE_67` | |

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

Copy is set in `main()`; type sizes are fractions of the canvas width, so both slots
stay optically matched. Two numbers come from the screenshots rather than taste:

- the search cut ends 45px past the last dark row of the value card, found by probing a
  column inside the card's left padding, so the panel edge falls in cream;
- both panels start below the status bar (`160px` at 1206 wide) so no clock or Dynamic
  Island is sliced.

The script asserts every output is RGB at the exact slot size and that no copy overruns
its band. App Store Connect rejects a screenshot with an alpha channel, so keep the RGB
conversion if you edit it.

## Adding them to the listing

A version in review cannot change its screenshots. These go in when the version is
editable again: the `APP_IPHONE_61` and `APP_IPHONE_67` sets in
`mobile/STORE-LISTING.md` list the ids to target. To replace the opener, delete the
first image in a set and upload one of these, or append and reorder in App Store Connect.
