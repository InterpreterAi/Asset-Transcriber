# InterpreterAI Brand Pack

Permanent, reusable marketing branding system.

**Location only:** `/marketing/brand`  
**Does not** modify production workspace, Marketing Demo UI, or logos.

## One import

```tsx
import { BrandPack } from "../../marketing/brand";
// or named:
import { BrandIntro, BrandOutro, LowerThird, LanguageBadge, CtaCard } from "../../marketing/brand";
```

Requires `framer-motion` in the host project. Logo files are the existing ones in `assets/` (also mirrored at app `public/brand/` for `/brand/...` URLs).

## Components

| Component | Duration / notes |
|-----------|------------------|
| `BrandIntro` | **1.0s** · fade + soft scale · `transparent` supported |
| `BrandOutro` | **3.0s** · large CTA · Reels safe area · referral URL |
| `LowerThird` | Presets: medical, legal, insurance, emergency911, pharmacy, hospital, mentalHealth, immigration, banking, travel |
| `LanguageBadge` | Any of **62** langs via `from` / `to` · quick picks EN→ES … EN→IT |
| `CtaCard` | Logo · site · referral · trial · 62 languages |
| `BrandLogo` | Existing SVG/PNG only — never redraws |

## Quick usage

```tsx
<BrandPack.Intro transparent onComplete={goMain} />
<BrandPack.LanguageBadge from="en" to="ar" />
<BrandPack.LowerThird preset="medical" />
<BrandPack.Outro />
<BrandPack.CtaCard />
```

Change language for any reel:

```tsx
<LanguageBadge from="en" to="hi" />
<LanguageBadge from="es" to="pt" />
{/* or */}
formatLangBadge("en", "uk") // "EN→UK"
```

## Assets

Exact files in `assets/` — do not regenerate or replace:

- `interpreterai-mark-*.svg/png`
- `interpreterai-logo-*.svg/png`

## Not included

- No Record Mode
- No production UI wiring
- No new logo generation
