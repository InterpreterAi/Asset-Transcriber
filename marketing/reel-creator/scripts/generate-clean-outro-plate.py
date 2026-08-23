#!/usr/bin/env python3
"""
Build universal-outro-plate-clean.png and outro-brand-lockup.png from approved-outro.mp4.

The lockup sprite is RGBA (logo icon + 3D wordmark). The plate is solid black for the starfield outro.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT.parent / "brand" / "assets"
SRC_VIDEO = BRAND / "approved-outro.mp4"
OUT_PNG = BRAND / "universal-outro-plate-clean.png"
LOCKUP_PNG = BRAND / "outro-brand-lockup.png"
ICON_PNG = BRAND / "outro-brand-icon.png"
TMP_FRAME = ROOT / ".tmp-outro-hold.png"

STAGE_W = 1080
STAGE_H = 1920

LOCKUP_BOX = (140, 580, 940, 1100)


def extract_hold_frame() -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            "9.5",
            "-i",
            str(SRC_VIDEO),
            "-frames:v",
            "1",
            str(TMP_FRAME),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def extract_transparent_lockup(frame: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = frame.crop(box).convert("RGBA")
    rgb = crop.convert("RGB")
    bg = rgb.filter(ImageFilter.GaussianBlur(radius=38))
    px_c = rgb.load()
    px_b = bg.load()
    px_out = crop.load()
    w, h = crop.size

    for y in range(h):
        for x in range(w):
            o = px_c[x, y]
            b = px_b[x, y]
            diff = sum(abs(o[i] - b[i]) for i in range(3))
            if diff < 12:
                alpha = 0
            elif diff < 35:
                alpha = int((diff - 12) / 23 * 200)
            else:
                alpha = 255
            px_out[x, y] = (o[0], o[1], o[2], alpha)

    return crop


def main() -> int:
    if not SRC_VIDEO.exists():
        print(f"Missing source video: {SRC_VIDEO}", file=sys.stderr)
        return 1
    extract_hold_frame()
    img = Image.open(TMP_FRAME).convert("RGB")
    if img.size != (STAGE_W, STAGE_H):
        img = img.resize((STAGE_W, STAGE_H), Image.Resampling.LANCZOS)

    Image.new("RGB", (STAGE_W, STAGE_H), (0, 0, 0)).save(OUT_PNG, optimize=True)

    lockup = extract_transparent_lockup(img, LOCKUP_BOX)
    lockup.save(LOCKUP_PNG, optimize=True)

    icon = lockup.crop((0, 0, 336, lockup.height))
    icon = icon.crop(icon.getbbox() or (0, 0, 336, lockup.height))
    icon.save(ICON_PNG, optimize=True)

    TMP_FRAME.unlink(missing_ok=True)
    print(f"Wrote {OUT_PNG}, {LOCKUP_PNG}, {ICON_PNG} (RGBA)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
