# InterpreterAI Marketing Style Guide

Compact brand kit for reels, demos, and overlays.  
Assets live in `public/brand/`. React components live in `src/brand/`.

## Logo

| File | Use |
|---|---|
| `interpreterai-mark-*.svg/png` | App icon, avatar, intro sting |
| `interpreterai-logo-*.svg/png` | Wordmark for intros/outros/end cards |

- **Dark assets** → navy/cyan on dark UI or video grades  
- **Light assets** → blue on white / light UI  
- Prefer **SVG** in product UI; use **PNG** for editors (CapCut, Premiere)  
- Clear space: keep ≥ 0.5× mark width around the logo  
- Don’t recolor the bolt, add drop shadows, or stretch the mark

```tsx
import { BrandLogo } from "@/brand";

<BrandLogo theme="dark" variant="mark" />
<BrandLogo theme="light" variant="wordmark" format="png" />
```

## Colors

| Token | Hex | Role |
|---|---|---|
| Primary | `#2563EB` | CTAs, light-theme accent |
| Accent | `#22D3EE` | Dark-theme accent / LIVE-adjacent cyan |
| LIVE | `#DC2626` | Recording badge only |
| Ink | `#0F172A` | Light-theme text |
| Paper | `#F8FAFC` | Light surfaces |
| Night | `#02050B` | Dark canvas |
| Night panel | `#0B1220` | Dark cards / phone chrome |

Import from `@/brand`:

```ts
import { brandColors } from "@/brand";
```

## Typography

- **UI / overlays:** system stack (`SF Pro Display` / Inter / Segoe)  
- **Mono (timers, codes):** JetBrains Mono  
- Headlines: semibold, tight tracking  
- Lower-thirds: title 15–16px semibold; eyebrow 11px uppercase accent

## Spacing & radius

- Base grid: **4 / 8 / 12 / 16 / 24 / 40** (`brandSpacing`)  
- Phone frame radius: **26**  
- Pills / LIVE: **999**  
- Cards / lower-third: **12–16**

## Motion components

| Component | Purpose |
|---|---|
| `BrandIntro` | Opening sting (mark → wordmark → tagline) |
| `BrandOutro` | End card with CTA / URL |
| `LowerThird` | Captions like “Medical Interpretation” |
| `LiveBadge` | Red LIVE (+ optional timer) |
| `BrandTransition` | Fade / slide / scale / wipe / soft-pop |

CSS class names (for non-React timelines): see `styles/brand-motion.css`  
(`brand-fade-in`, `brand-slide-up`, `brand-scale-in`, …).

### Quick usage

```tsx
import { AnimatePresence } from "framer-motion";
import { BrandIntro, BrandOutro, LowerThird, LiveBadge, BrandTransition } from "@/brand";
import "@/brand/styles/brand-motion.css";

<AnimatePresence>
  {phase === "intro" && <BrandIntro theme="dark" onComplete={goMain} />}
</AnimatePresence>

<LiveBadge active={isLive} timer="1:24" />
<LowerThird title="Medical Interpretation" subtitle="InterpreterAI" theme="dark" />
<BrandTransition name="slideUp">…</BrandTransition>
```

## Do / Don’t

**Do**
- Keep Original | Translation as the product language (not EN/AR labels in chrome)
- Use red LIVE only while a session is active
- Prefer cyan accent on dark grades; primary blue on light

**Don’t**
- Use purple glow / generic AI gradients
- Place busy badges over the transcript columns
- Replace the bolt with another icon in official assets
