# InterpreterAI Marketing Content Library

**Distributor / sales / creators source pack:** [`MARKETING_SOURCE_PACK.md`](./MARKETING_SOURCE_PACK.md) — slogan, CTA, monthly pricing, reel structure, brand rules, study links.

Official demo scenarios and brand kit for reels.

**Content / brand kit only — never wire into the production app UI.**  
(No Record Mode, intro/outro overlays, or brand components in the application.)

- Scenarios: `01_medical/` … `10_travel/`
- **Brand Pack** (one import): `brand/` → `import { BrandPack } from "./brand"`
- **Reel Builder**: `reel-creator/` → full reel builder at http://localhost:5179  
  Uses real InterpreterAI logos from `brand/assets` (copied to `reel-creator/public/brand`).

See `brand/README.md` and `reel-creator/README.md`.

## Scenarios

| Folder | Domain | Typical pair for first cut |
|--------|--------|----------------------------|
| `01_medical/` | Outpatient / PCP | EN ↔ ES |
| `02_legal/` | Attorney–client | EN ↔ ES |
| `03_insurance/` | Claims adjuster | EN ↔ ES |
| `04_911/` | Emergency dispatch | EN ↔ ES |
| `05_pharmacy/` | Retail pharmacy | EN ↔ ES |
| `06_hospital/` | ED / inpatient | EN ↔ ES |
| `07_mental_health/` | Behavioral health | EN ↔ ES |
| `08_immigration/` | Asylum / USCIS-style | EN ↔ ES |
| `09_banking/` | Branch / fraud | EN ↔ ES |
| `10_travel/` | Airline / rebooking | EN ↔ ES |

Each folder includes the same language set (`dialogue_en.txt`, `dialogue_es.txt`, `dialogue_ar.txt`, `dialogue_zh.txt`) so the same scenario can be cut for Spanish, Arabic, or Chinese reels.

## File roles

| File | Purpose |
|------|---------|
| `script.md` | Scenario setup, roles, full turn order |
| `dialogue_*.txt` | Speakable lines only (one speaker language per file) |
| `recording_notes.md` | Who starts, pauses, overlaps, when InterpreterAI should shine |

## Timing

Target spoken length: **15–25 seconds** per scenario at natural call pace (not rushed marketing voiceover).
