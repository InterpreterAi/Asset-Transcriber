#!/usr/bin/env python3
"""Resize reference outro to 1080×1920 and build background plate for phrase-sync reveals."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT.parent / "brand" / "assets"
DEFAULT_REF = (
    Path.home()
    / ".cursor/projects/Users-moresea-Downloads-Asset-Transcriber/assets/IMG_7301-f4129623-7947-4c80-9f2d-3342d19b6dd7.png"
)
OUT = BRAND / "interpreterai-outro-plate.png"
OUT_BG = BRAND / "interpreterai-outro-plate-bg.png"
STAGE_W = 1080
STAGE_H = 1920

REGIONS = {
    "brandIcon": (395, 318, 290, 290),
    "brandWordmark": (120, 598, 840, 95),
    "line1": (80, 698, 920, 52),
    "line2": (80, 748, 920, 48),
    "languagesLine": (48, 818, 984, 44),
    "ctaHeadline": (248, 898, 584, 88),
    "ctaSubline": (160, 998, 760, 40),
    "url": (180, 1058, 720, 42),
    "qr": (858, 1168, 152, 152),
}


def expand(box: tuple[int, int, int, int], pad: int, w: int, h: int) -> tuple[int, int, int, int]:
    x, y, bw, bh = box
    return (max(0, x - pad), max(0, y - pad), min(w - x + pad, bw + 2 * pad), min(h - y + pad, bh + 2 * pad))


def main() -> int:
    ref = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REF
    if not ref.exists():
        print(f"Missing reference: {ref}", file=sys.stderr)
        return 1

    img = Image.open(ref).convert("RGB")
    sw, sh = img.size
    scale = max(STAGE_W / sw, STAGE_H / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - STAGE_W) // 2
    top = (nh - STAGE_H) // 2
    plate = resized.crop((left, top, left + STAGE_W, top + STAGE_H))
    plate.save(OUT, optimize=True)

    bg = plate.copy()
    for box in REGIONS.values():
        x, y, w, h = expand(box, 10, STAGE_W, STAGE_H)
        crop = plate.crop((x, y, x + w, y + h))
        blurred = crop.filter(ImageFilter.GaussianBlur(radius=22))
        bg.paste(blurred, (x, y))
    bg.save(OUT_BG, optimize=True)

    print(f"Wrote {OUT} and {OUT_BG} ({STAGE_W}×{STAGE_H}) from {ref.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
