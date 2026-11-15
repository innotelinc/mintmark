#!/usr/bin/env python3
"""Compose Mintmark's App Store header and search-results art.

Both pieces are built from a real capture in mobile/screenshots/out/, pasted at 1:1.
The captures are already the exact slot size (1206x2622 and 1320x2868), so nothing is
scaled and no text lands on the app's own type: the headline sits on a cream gradient
band above the screenshot, coloured to melt into the app's background.

    python3 mobile/store-art/make_store_art.py

Writes header-<slot>.png and search-results-<slot>.png next to this file, RGB with no
alpha channel (App Store Connect rejects alpha).
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SHOTS = ROOT.parent / "screenshots" / "out"

# Sampled from the capture: the app paints #F5F1E8 behind its cards, #FFFDF8 on them,
# #1A1712 for text and a bronze for the eyebrow and icons.
CREAM = (245, 241, 232)
INK = (26, 23, 18)
MUTED = (110, 101, 86)
BRONZE = (140, 107, 51)
BAND_TOP = (233, 225, 207)

SANS = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
SANS_REG = [
    "C:/Windows/Fonts/segoeui.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
SERIF = [
    "C:/Windows/Fonts/georgiab.ttf",
    "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]


def font(paths: list[str], size: int) -> ImageFont.FreeTypeFont:
    for path in paths:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise SystemExit(f"no usable font among {paths}")


def tracked(draw: ImageDraw.ImageDraw, xy, text: str, fnt, fill, spacing: float):
    """Draw text with letter spacing, the way the app sets its eyebrow labels."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x


def gradient_band(w: int, h: int) -> Image.Image:
    band = Image.new("RGB", (1, h))
    px = band.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(BAND_TOP, CREAM))
    return band.resize((w, h), Image.BILINEAR)


def rounded_top(img: Image.Image, radius: int) -> Image.Image:
    """Round the top two corners, filling the cut with cream rather than alpha."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h + radius), radius=radius, fill=255)
    out = Image.new("RGB", (w, h), CREAM)
    out.paste(img, (0, 0), mask)
    return out


def dark_block_span(shot: Image.Image, threshold: int = 170) -> tuple[int, int] | None:
    """Vertical span of the widest dark block, i.e. the value card on the appraisal screen.

    A row counts as dark when most of its width is dark, which ignores the text inside
    the card and the ink below it.
    """
    w, h = shot.size
    px = shot.load()
    # One probe column inside the card's left padding: right of the card edge, left of
    # its text, so neither the label nor the big number can break the run.
    x = round(w * 0.062)
    rows = [y for y in range(h) if sum(px[x, y]) < threshold]
    if not rows:
        return None
    best = (rows[0], rows[0])
    start = prev = rows[0]
    for y in rows[1:]:
        if y - prev > 4:
            if prev - start > best[1] - best[0]:
                best = (start, prev)
            start = y
        prev = y
    if prev - start > best[1] - best[0]:
        best = (start, prev)
    return best


def soft_shadow(w: int, h: int, radius: int, blur: int, strength: int = 46) -> Image.Image:
    layer = Image.new("L", (w, h + radius * 2), 0)
    ImageDraw.Draw(layer).rounded_rectangle(
        (0, radius, w - 1, h + radius - 1), radius=radius, fill=strength
    )
    return layer.filter(ImageFilter.GaussianBlur(blur))


def compose(
    slot: str,
    capture: str,
    size: tuple[int, int],
    region: tuple[int, int],
    band_h: int,
    eyebrow: str,
    headline: list[str],
    deck: list[str] | None,
    fade: bool,
) -> Image.Image:
    w, h = size
    shot = Image.open(SHOTS / f"{slot}-{capture}.png").convert("RGB")
    if shot.size != size:
        raise SystemExit(f"{slot}-{capture}.png is {shot.size}, expected {size}")

    canvas = Image.new("RGB", (w, h), CREAM)
    canvas.paste(gradient_band(w, band_h), (0, 0))
    panel = shot.crop((0, region[0], w, region[1]))
    panel = rounded_top(panel, round(w * 0.046))

    top = h - panel.height
    shadow = soft_shadow(panel.width, panel.height, round(w * 0.046), round(w * 0.014))
    shade = Image.new("RGB", canvas.size, (58, 48, 34))
    shade_mask = Image.new("L", canvas.size, 0)
    shade_mask.paste(shadow, (0, top - round(w * 0.046)))
    canvas.paste(shade, (0, 0), shade_mask)

    text = ImageDraw.Draw(canvas)
    margin = round(w * 0.083)
    rule_y = round(band_h * 0.085)
    text.rectangle(
        (margin, rule_y, margin + round(w * 0.070), rule_y + max(3, round(h * 0.0017))),
        fill=BRONZE,
    )

    brand_y = rule_y + round(band_h * 0.075)
    brand = font(SANS, round(w * 0.0275))
    tracked(text, (margin, brand_y), eyebrow, brand, BRONZE, round(w * 0.0075))

    y = brand_y + round(brand.size * 1.5)
    head = font(SERIF, round(w * 0.0925 if deck else w * 0.108))
    for line in headline:
        text.text((margin, y), line, font=head, fill=INK)
        y += round(head.size * 1.10)

    if deck:
        y += round(band_h * 0.020)
        body = font(SANS_REG, round(w * 0.0305))
        for line in deck:
            text.text((margin, y), line, font=body, fill=MUTED)
            y += round(body.size * 1.42)

    if y > band_h - round(h * 0.012):
        raise SystemExit(f"{slot}: copy overruns the {band_h}px band by {y - band_h}px")

    canvas.paste(panel, (0, top))

    if fade:
        fade_h = round(h * 0.10)
        fade = Image.new("L", (w, fade_h), 0)
        fpx = fade.load()
        for yy in range(fade_h):
            fpx_row = round(255 * (yy / max(fade_h - 1, 1)) ** 1.6)
            for xx in range(w):
                fpx[xx, yy] = fpx_row
        canvas.paste(Image.new("RGB", (w, fade_h), CREAM), (0, h - fade_h), fade)

    return canvas


def main() -> None:
    # region = which rows of the capture show: the header starts below the app's own
    # headline so the two do not compete, the search piece keeps the coin and the value.
    units = [
        ("medium", (1206, 2622)),
        ("large", (1320, 2868)),
    ]
    for slot, size in units:
        k = size[1] / 2622

        header = compose(
            slot=slot,
            capture="1-capture",
            size=size,
            region=(round(760 * k), size[1]),
            band_h=round(760 * k),
            eyebrow="COIN APPRAISAL",
            headline=["What is this", "coin worth?"],
            deck=["One photograph. An identification, a grade,", "and a collector-market value range."],
            fade=False,
        )
        header.save(ROOT / f"header-{size[0]}x{size[1]}.png", optimize=True)

        # Cut the appraisal capture where its dark value card ends: the card's last row
        # lands on the app's cream background, which is this canvas's cream too, so the
        # panel's bottom edge disappears instead of slicing a card or fading out.
        shot = Image.open(SHOTS / f"{slot}-3-appraisal.png").convert("RGB")
        span = dark_block_span(shot)
        if not span:
            raise SystemExit(f"{slot}: could not find the value card to cut at")
        # Past the probe's last dark row the card still rounds off for ~25px; adding
        # 45px puts the cut in the cream below the card, where the seam cannot show.
        bottom = min(shot.size[1], span[1] + round(45 * k))
        top = round(160 * k)  # just below the status bar, so no sliced clock or island

        search = compose(
            slot=slot,
            capture="3-appraisal",
            size=size,
            region=(top, bottom),
            band_h=size[1] - (bottom - top),
            eyebrow="MINTMARK",
            headline=["Grade any coin", "from a photo"],
            deck=None,
            fade=False,
        )
        print(f"{slot}: value card {span[0]}-{span[1]}, panel rows {top}-{bottom}")
        search.save(ROOT / f"search-results-{size[0]}x{size[1]}.png", optimize=True)

        for img in (header, search):
            assert img.mode == "RGB" and img.size == size, (img.mode, img.size)
        print(f"{slot}: header and search-results {size[0]}x{size[1]} written")


if __name__ == "__main__":
    main()
