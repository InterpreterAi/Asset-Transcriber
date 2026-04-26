# InterpreterAI Vertical Promo (Remotion)

This composition renders a `1080x1920` vertical promo with the exact timing blocks requested.

## 1) Place media files

Copy these files into `public/`:

- `screen_record.mov`
- `voiceover.mp3`
- optional: `music.mp3`

Final expected paths:

- `artifacts/promo-video/public/screen_record.mov`
- `artifacts/promo-video/public/voiceover.mp3`
- `artifacts/promo-video/public/music.mp3` (optional)

## 2) Install deps

From repo root:

```bash
pnpm install
```

## 3) Preview

```bash
pnpm --filter @workspace/promo-video dev
```

## 4) Render final MP4

```bash
pnpm --filter @workspace/promo-video render
```

Output:

- `artifacts/promo-video/promo_final.mp4`

## Timing map (30fps, 900 frames / 30s)

- `0–3s` (0..89): problem overlay
- `3–6s` (90..179): Tab Audio ON highlight
- `6–12s` (180..359): live transcript/translation phase
- `12–18s` (360..539): speaker-separated overlays
- `18–22s` (540..659): bidirectional overlays
- `22–25s` (660..749): glossary consistency overlay
- `25–30s` (750..899): CTA end screen
