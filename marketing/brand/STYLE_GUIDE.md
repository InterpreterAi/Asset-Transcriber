# InterpreterAI Marketing Style Guide

**Location:** `/marketing/brand/` only.  
Do not import these components into the production transcription app.

Assets live in `assets/`. Reference React components live in `components/`.

## Logo (exact files — do not redraw)

| File | Use |
|---|---|
| `assets/interpreterai-mark-*.svg/png` | App icon, favicon source, intro sting |
| `assets/interpreterai-logo-*.svg/png` | Wordmark for intros/outros/end cards |

- Prefer the provided files as-is
- Do not recolor the bolt, replace the type, or recreate the mark in code
- Dark assets → dark UI / video grades  
- Light assets → light UI  

## Official Brand Intro / Outro

Reference components: `components/BrandIntro.tsx`, `components/BrandOutro.tsx`.  
These are for reel tooling — not wired into `/admin/demo-marketing` or production.

## Colors

| Token | Hex | Role |
|---|---|---|
| Primary | `#2563EB` | CTAs, light-theme accent |
| Accent | `#22D3EE` | Dark-theme accent |
| LIVE | `#DC2626` | Recording badge only |
| Night | `#02050B` | Dark canvas |
| Night panel | `#0B1220` | Dark cards |

See `tokens.ts`.
