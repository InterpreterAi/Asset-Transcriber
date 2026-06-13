# InterpreterAI Cinematic Website v2.0
## Complete Creative Direction, Content Mapping & Production Specification

**Status:** Pre-implementation baseline mapped from `main` @ `b2a8cb94`  
**Benchmark:** Reference reels — not SaaS landing templates  
**Constraint:** Same business message, product, pricing, trust signals — new delivery only

---

## 1. Content Mapping (Every Existing Message → New Storyboard)

### Legend
| Symbol | Meaning |
|--------|---------|
| **KEEP** | Existing copy preserved verbatim (or split across beats) |
| **FRAME** | Spec cinematic headline — wraps preserved copy |
| **DEMO** | New live-workspace dialogue (product demonstration only) |
| **LINK** | CTA / nav — unchanged label, new placement |
| **LEGAL** | Compliance prose — footer micro-panel, not a chapter |

---

### Chapter 1 — THE PROBLEM

| Beat | Source (current site) | New placement | Treatment |
|------|----------------------|---------------|-----------|
| DEMO | — | Doctor speaks first line | New Maria medical script (speech-chunk reveal) |
| DEMO | — | Spanish translation to patient | Chunk reveal, listening pulse between turns |
| FRAME | — | Post-demo headline | **"Communication should never be the barrier."** (spec) |
| KEEP | Hero eyebrow: *"Professional interpreter infrastructure"* | Subtle label above workspace, first 3s | Small caps, glass |
| LINK | Hero: *"No credit card required to start."* | Below workspace, Ch1 end | Whisper text |

**Removed from Ch1:** Hero laptop duplicate workspace, floating caption cards, full-width hero H1 (moves to Ch3/Ch9).

---

### Chapter 2 — THE CONVERSATION

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| DEMO | — | Patient Spanish + EN translation | Continues same workspace (no remount) |
| DEMO | — | Doctor pain-scale exchange | Same workspace, scroll-driven |
| KEEP | Product scroll `#product` eyebrow: *"Product"* | Micro label during zoom | Fades at zoom-out |
| KEEP | Product title: *"Your live session workspace"* | Ch2 zoom caption | Appears as workspace enlarges |
| KEEP | Product subtitle (full paragraph) | Ch2 side copy or VO-style caption | Glass panel, scroll-linked |
| KEEP | *"See captions and translation build live"* + subcopy | Absorbed into Ch2 — no separate section | Single narrative beat |

**Removed:** `MarketingScrollDialogueSection` #product (360vh pin), standalone live demo section.

---

### Chapter 3 — INTERPRETERAI

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| FRAME | Spec: *"Every conversation passes through understanding."* | Chapter headline | Primary |
| KEEP | Hero H1: *"Real-Time Support for Professional Interpreters"* | Subhead or secondary line | Gradient text |
| KEEP | Hero subhead (36 languages, OPI/VRI) | Subheadline under FRAME | Verbatim |
| KEEP | Hero workflow pills: *Hear & capture · Live captions · Translation assist* | Three glass chips below core visual | No cards |
| KEEP | How-it-works step 1 title + body | Stream annotation 1 | *"Live captions appear"* + body |
| KEEP | How-it-works step 2 title + body | Stream annotation 2 | *"Translation assistance updates in real time"* + body |

**Visual:** Conversation lines detach → intelligence core (first InterpreterAI brand moment).

---

### Chapter 4 — LANGUAGES

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| FRAME | Spec: *"36+ languages. One conversation."* | Chapter headline | Use **36+** (pricing-copy canonical) |
| KEEP | Coverage eyebrow: *"Coverage"* | Eyebrow | |
| KEEP | *"31 Supported Languages"* → **reconcile to 36+** in headline; body kept | Subhead uses merged count | Body: *"Built for multilingual interpretation workflows across medical, customer support, and remote communication environments."* |
| KEEP | Capability: *"31 Supported Languages"* card body | Stream fragment EN | Orbit as conversation shards |
| KEEP | How-it-works step 4: *"Multilingual coverage"* + body | Stream annotation | |
| KEEP | `PRICING_SHARED_FEATURES`: *"36+ supported languages"* | Pricing-adjacent proof | Woven in streams |
| KEEP | Globe orbit codes EN ES FR AR ZH PT DE JA | Conversation fragments in those langs | Not badge pills |

**Removed:** Standalone globe section, capability language card grid.

---

### Chapter 5 — REAL-WORLD USES

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| FRAME | Spec: *"Where communication matters most."* | Chapter headline | |
| KEEP | Solutions eyebrow: *"Solutions"* | Eyebrow | |
| KEEP | Solutions title: *"OPI & VRI workflows"* | Node cluster label | |
| KEEP | Solutions subtitle (full paragraph) | Narration panel | Verbatim |
| KEEP | OPI card title + body | Hospital / call-center node flash | |
| KEEP | VRI card title + body | Remote business node flash | |
| KEEP | Capability: *"OPI & VRI Ready"* (both instances) | Node labels | |
| KEEP | Legal dialogue lines (`LEGAL_DIALOGUE`) | Law firm node conversation flash | Scroll-timed, not pinned section |
| KEEP | Medical dialogue remainder | Hospital node | Already shown Ch1–2 |

**Removed:** Solutions scroll pin (305vh), OPI/VRI card grid, capability grid, how-it-works grid.

| Capability card | Maps to node |
|-----------------|--------------|
| Real-Time Captions | Medical node |
| Translation Assistance | All nodes |
| Interpreter Workflow Support | Call center node |
| Privacy-Focused Infrastructure | Government node |

---

### Chapter 6 — TRUST

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| FRAME | Spec: *"Trust built into every conversation."* | Chapter headline | |
| KEEP | Landing lock title: *"Trusted operations"* | Eyebrow | |
| KEEP | Landing lock intro | Subhead | Verbatim |
| KEEP | All 6 `trustItems` titles + descriptions | Secure pathway indicators | No lock SVG, no stock shields |
| KEEP | Security page hero subhead (HIPAA-focused…) | Trust narration line | |
| KEEP | Security pillars (7) — merge with landing 6 | Extended indicator list on `/security` only; landing shows 6 | |
| KEEP | Privacy highlights (6 cards) — key phrases | Micro-labels on secure streams | Full cards stay on `/privacy` |
| LINK | Hero: *"View Security & Privacy"* | Available from Ch6 + Ch9 | |

**Removed:** `MarketingSecurityLockReveal` duplicate on landing, isolated security white section.

---

### Chapter 7 — SCALE

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| FRAME | Spec: *"Built for every stage of growth."* | Chapter headline | |
| KEEP | Enterprise title: *"Enterprise-friendly posture"* | Scale tier label (enterprise) | |
| KEEP | Enterprise body paragraph | Subhead | Verbatim |
| KEEP | Enterprise bullets (3) | Scale visualization labels | |
| KEEP | Product dev eyebrow: *"Product development"* | Independent tier label | |
| KEEP | *"Built With Interpreter Feedback"* | Mid-scale beat | |
| KEEP | Product dev body | Sub copy | |
| KEEP | Timeline 3 steps (labels + details) | Scale progression annotations | |
| KEEP | Footer tagline: *"Professional infrastructure for real-time interpreter support…"* | Scale epilogue | |

**Removed:** Standalone enterprise card section, timeline white section, testimonial marquee.

---

### Chapter 8 — PRICING

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| KEEP | Pricing page H1: *"Calm, transparent plans"* | Eyebrow | |
| KEEP | Pricing page intro paragraph | Subhead | Verbatim |
| KEEP | All 3 plans: name, price, tagline, features | Illuminated network tiers | Glass, not white cards |
| KEEP | *"Most popular"* badge | Professional tier | |
| KEEP | `PRICING_SHARED_FEATURES` + section title | Below tiers in environment | |
| KEEP | Full `PRICING_COMPARISON_ROWS` (10 rows) | Expandable glass table | Scroll or tap |
| KEEP | Pricing footnote (OPI/VRI compliance…) | Micro copy under table | |
| KEEP | Landing *"Transparent pricing"* + subcopy | Ch8 intro lines | Merged |
| LINK | *"Start free trial"* (×3) | Per tier | `/signup` |
| LINK | Terms trial: 7-day, 120 min/day | Signup subtitle + tier footnote | |

**Removed:** Isolated landing pricing CTA block.

---

### Chapter 9 — FINAL MOMENT

| Beat | Source | New placement | Treatment |
|------|--------|---------------|-----------|
| FRAME | Spec: *"Every Conversation. Any Language."* | Finale headline | |
| KEEP | Hero H1 (alternate composition) | Reinforcement | |
| KEEP | Hero subhead | Finale subhead | |
| LINK | *"Start Free Trial"* | Primary CTA | `/signup` |
| LINK | *"View Security & Privacy"* | Secondary CTA | `/security` |
| LEGAL | Notice: *"InterpreterAI is a professional support tool…"* | Single-line glass strip below CTAs | Not full section |
| LINK | Nav/footer items | Persistent nav + minimal footer | |

**Removed:** Testimonials section entirely from home (quotes available for future optional beat).

---

### Preserved on Satellite Pages (not home chapters)

| Page | Content | v2 treatment |
|------|---------|--------------|
| `/pricing` | Full page | Redirect or mirror Ch8; same `pricing-copy.ts` |
| `/security` | Full trust center | Cinematic dark shell; Ch6 content expanded |
| `/privacy` | Full policy prose | Light-readable article inside dark chrome |
| `/terms` | Full terms + subscription prices | Same |
| `/login` `/signup` | Forms + sidebar copy | Dark cinematic shell; **remove sidebar workspace demo** |
| Nav | All 8 items | Glass sticky nav |
| Footer | 3 columns | Collapsed to Ch9 minimal links |

---

### Testimonials → Deprioritized

15 `MARKETING_TESTIMONIALS` quotes: **not in v2 home scroll**. Optional: single rotating quote in Ch7 scale beat (future). Inventory preserved in `marketing-testimonials.ts`.

---

## 2. Scene Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CinematicEnvironment (fixed: bg, volumetric lights, grain)   │
├─────────────────────────────────────────────────────────────┤
│ CinematicNav (sticky glass)                                  │
├─────────────────────────────────────────────────────────────┤
│ CinematicScrollRoot (single scroll context)                  │
│  ├─ Ch01 Problem      [0.00 – 0.12] scroll progress          │
│  ├─ Ch02 Conversation [0.12 – 0.28]                          │
│  ├─ Ch03 InterpreterAI[0.28 – 0.38]                          │
│  ├─ Ch04 Languages    [0.38 – 0.48]                          │
│  ├─ Ch05 Use Cases    [0.48 – 0.58]                          │
│  ├─ Ch06 Trust        [0.58 – 0.68]                          │
│  ├─ Ch07 Scale        [0.68 – 0.78]                          │
│  ├─ Ch08 Pricing      [0.78 – 0.92]                          │
│  └─ Ch09 Finale       [0.92 – 1.00]                          │
├─────────────────────────────────────────────────────────────┤
│ CinematicWorkspaceLayer (sticky 0–0.28, then morphs out)     │
├─────────────────────────────────────────────────────────────┤
│ CinematicFooter (minimal, Ch9+)                              │
└─────────────────────────────────────────────────────────────┘
```

**Scene heights (target, not pin-bloat):**

| Chapter | Scroll height | Sticky behavior |
|---------|---------------|-----------------|
| Ch1 | 100vh | Workspace centered, small |
| Ch2 | 120vh | Workspace scales up |
| Ch3–9 | 80–100vh each | Copy + environment morphs |

**Total:** ~750–850vh (vs current ~1200vh+ with 665vh empty pin travel)

---

## 3. Component Architecture

```
src/components/cinematic-v2/
├── CinematicLanding.tsx          # Orchestrator
├── CinematicEnvironment.tsx      # Global visual system
├── CinematicNav.tsx              # Nav (wraps MarketingNav patterns)
├── CinematicChapter.tsx          # Section wrapper + progress slot
├── CinematicCopyBlock.tsx        # Headline / subhead / eyebrow
├── CinematicStoryContext.tsx     # Shared scroll progress + workspace state
├── data/
│   ├── cinematic-content.ts      # ALL preserved marketing strings
│   ├── cinematic-dialogue.ts     # Ch1–2 demo script only
│   └── cinematic-chapters.ts     # Chapter metadata + progress ranges
├── workspace/
│   ├── CinematicWorkspace.tsx    # ONE workspace instance
│   ├── WorkspaceTurn.tsx         # Single exchange row
│   └── workspace-reveal.ts       # Chunk + word reveal math
├── chapters/
│   ├── Chapter01Problem.tsx
│   ├── Chapter02Conversation.tsx
│   ├── Chapter03InterpreterAI.tsx
│   ├── Chapter04Languages.tsx
│   ├── Chapter05UseCases.tsx
│   ├── Chapter06Trust.tsx
│   ├── Chapter07Scale.tsx
│   ├── Chapter08Pricing.tsx
│   └── Chapter09Finale.tsx
└── motion/
    ├── cinematic-motion.ts
    └── useCinematicScroll.ts
```

---

## 4. Motion Architecture

| Layer | Tool | Purpose |
|-------|------|---------|
| Scroll progress | Framer `useScroll` on `CinematicScrollRoot` | Master 0–1 timeline |
| Workspace reveal | `useTransform` + motion values | GPU transforms only |
| Chapter copy | `whileInView` + opacity | Lightweight |
| Intelligence core | CSS + Framer scale/opacity | Ch3 morph |
| Language streams | `translate3d` + opacity stagger | Ch4 |
| Network nodes | Scale + line SVG stroke-dashoffset | Ch5–7 |
| Finale collapse | `useTransform` convergence to center | Ch9 |
| Reduced motion | `prefers-reduced-motion` | Static fallbacks |

**No:** particle systems, ScrollTrigger (phase 1), character-by-character typing.

**Yes:** speech-chunk reveals (phrase boundaries), listening pulse, word-lagged translation.

---

## 5. Transition Architecture

| From → To | Transition |
|-----------|------------|
| Ch1 → Ch2 | Workspace scale 0.85→1.0, camera `translateY` |
| Ch2 → Ch3 | Lines detach (opacity), core glow fades in |
| Ch3 → Ch4 | Core emits streams, radial burst |
| Ch4 → Ch5 | Streams connect to node graph |
| Ch5 → Ch6 | Graph edges gain secure sheath glow |
| Ch6 → Ch7 | Node count multiplies |
| Ch7 → Ch8 | Graph dims, pricing pillars illuminate |
| Ch8 → Ch9 | Collapse all → logo resolve |

Crossfade: environment hue constant; only accent intensity shifts.

---

## 6. Asset List

| Asset | Type | Notes |
|-------|------|-------|
| Doctor avatar | SVG inline | Clinician stripe blue |
| Patient avatar | SVG inline | Patient stripe amber |
| Intelligence core | CSS radial + SVG ring | No bitmap |
| Network graph | SVG paths | Procedural |
| Language shards | Text fragments | From content map |
| Workspace chrome | CSS (existing tokens) | Match product |
| Film grain | CSS overlay 2% opacity | Optional |
| Logo | Text + Zap icon | Existing brand |

**No new image files required for MVP.**

---

## 7. Interaction Map

| User action | Response |
|-------------|----------|
| Scroll | Master timeline advances; workspace turns reveal |
| Nav Product | Scroll to Ch2 workspace beat |
| Nav Solutions | Scroll to Ch5 |
| Nav Enterprise | Scroll to Ch7 |
| Nav Pricing | Scroll to Ch8 |
| Start Free Trial | `/signup` |
| View Security | `/security` |
| Pricing tier CTA | `/signup` |
| Comparison table | Horizontal scroll on mobile |
| Reduced motion | All beats instant, no marquee |

---

## 8. Implementation Plan

### Phase A — Foundation (current sprint)
- [x] Spec + content map (this document)
- [ ] `cinematic-content.ts` + `cinematic-dialogue.ts`
- [ ] `CinematicEnvironment` + `CinematicStoryContext`
- [ ] `CinematicWorkspace` (chunk reveal, single instance)
- [ ] Ch1 + Ch2 scroll scenes
- [ ] Wire `landing.tsx` → `CinematicLanding`

### Phase B — Story middle
- [ ] Ch3 intelligence core morph
- [ ] Ch4 language streams
- [ ] Ch5 node graph + use-case flashes

### Phase C — Trust, scale, money
- [ ] Ch6 secure pathways
- [ ] Ch7 scale visualization
- [ ] Ch8 pricing in environment + comparison table

### Phase D — Finale & satellites
- [ ] Ch9 collapse + logo
- [ ] `/security` `/pricing` cinematic shells
- [ ] Auth pages: remove duplicate workspace

### Phase E — Polish
- [ ] 60fps audit, reduced motion
- [ ] Mobile chapter compression
- [ ] Remove deprecated marketing components from home

---

## 9. Demo Script (Ch1–2 only — not marketing copy)

Separate from preserved sales copy. Product demonstration dialogue:

1. **EN (doctor):** "Good morning Maria. Before we begin, can you tell me when the symptoms first started?"
2. **ES (patient receives):** "Buenos días María. Antes de comenzar, ¿puede decirme cuándo comenzaron los síntomas?"
3. **ES (patient):** "Comenzaron hace aproximadamente tres semanas y han empeorado gradualmente."
4. **EN (doctor receives):** "They started approximately three weeks ago and have gradually become worse."
5. **EN (doctor):** "On a scale from one to ten, how severe is the pain?"
6. **ES (patient):** "Diría que alrededor de siete."
7. **EN (doctor receives):** "I would say around seven."

Illustrative disclaimer retained: *"Illustrative interface — not a live session."*
