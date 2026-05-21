# Translation engines — full behavior snapshot

**Saved:** 2026-05-07  
**Repository baseline:** `HEAD` = `e8321e72` (includes trial Hetzner blocking when both cores are paid-exclusive). Product freeze tag: **`final-boss-3`** (move the tag on intentional freezes).

This document is a **read-only operational map** of how **OpenAI** and **Hetzner (Libre/machine)** translation interact today. Authoritative implementation lives in the cited paths.

---

## 1. Single entry: `POST /translate` (`transcription.ts`)

- **Authenticated user** drives **everything**: engine choice is from DB `plan_type` (with PayPal lag override), never from client flags.
- **Transcription** (STT) is unchanged across tiers (browser → Soniox); this file is **translation only**.

### 1.1 Effective plan for routing (`usage.ts`)

- `effectivePlanTypeForTranslation(user)`  
  When `subscription_status === "active"` and `subscription_plan` is `basic` | `professional` | `platinum` | `unlimited` but `plan_type` is still trial-like (webhook lag), translation uses a **synthetic** effective plan:
  - `trial-libre` + paid subscription → `basic-libre`, `professional-libre`, `platinum`, or `unlimited` as appropriate.
  - Legacy OpenAI trial labels + paid → `*-openai` or `sp` fallback.
- Otherwise effective plan = normalized `plan_type` (default thinking: `trial-libre`).

### 1.2 Machine vs OpenAI switch (`planUsesMachineTranslationStack`)

Defined in `usage.ts`. **`false`** (use **OpenAI** interpreter stack in `transcription.ts`) when `plan_type` (after effectiveness) is one of:

| Values using OpenAI stack |
|---------------------------|
| `trial`, `trial-openai`, `morsy-urgent`, `legacy2` |
| `platinum`, `platinum-libre`, `unlimited` |

**Everything else** → **`true`** (Libre / **machine** stack: `basic-pro-translate.ts` → `hetzner-translate.ts`).

### 1.3 OpenAI override inside `/translate` (`transcription.ts`)

- `forcedOpenAiPlan = planLower.includes("openai")`  
  If the effective plan string contains **`openai`**, **`useMachineTranslation` is forced false** so labeled OpenAI plans never hit Hetzner for normal translation, even if `planUsesMachineTranslationStack` were ever inconsistent.
- Final: `useMachineTranslation = forcedOpenAiPlan ? false : prefersMachineStack`.

---

## 2. Final Boss 3 · OpenAI stack

**When:** `useMachineTranslation === false`.

**Where:** `artifacts/api-server/src/routes/transcription.ts` — `callOpenAI`, interpreter glossaries (TERM\_\*), prompts, retries, cost hooks.

**Characteristics (behavioral, not prompt text):**

- Full interpreter pipeline: protected terms, interpreter JSON glossary placeholders, numbers, then model.
- Requires OpenAI configuration (`isOpenAiConfigured()`); otherwise **503** `TRANSLATION_NOT_CONFIGURED`.
- **No Hetzner core reservation** — this path does not call `selectHetznerCoreRoute`.
- **Leak repair** (when enabled): can still use **machine** HTTP via `translatePlainMachine` without `sessionId` for isolated repair calls (`english-domain-leak-repair.ts`) — **read-only** router tail (see §4.3).

**Typical `plan_type` segments:** Platinum, Unlimited, `platinum-libre` (OpenAI), legacy `trial` / `trial-openai`, plus any plan string containing `openai`.

---

## 3. Final Boss 3 · Libre / Hetzner stack

**When:** `useMachineTranslation === true`.

**Where:**

- `artifacts/api-server/src/lib/basic-pro-translate.ts` — expand `NUM_*` → digits, delegate to Hetzner.
- `artifacts/api-server/src/lib/hetzner-translate.ts` — HTTP to LibreTranslate-compatible `/translate`, **core selection**, trial concurrency gate.

**Characteristics:**

- Skips built-in interpreter TERM\_\* glossary mask for speed; personal glossary strict pass only on **final** segments when the user has entries (`transcription.ts` MT block).
- One POST per segment through `callHetznerTranslate` (unless internal retries).
- **`hetzner_mt_outbound_request`** log line fires **immediately before** each outbound `axios.post`: `sessionId`, `userEmail`, `planType`, `selectedLane`, `selectedBaseUrl` (router raw), `effectiveBaseForHttp`, **`finalPostUrl`** (exact wire URL), `fallbackToConfiguredPrimary`, optional **`railwayReplicaId`** / **`hostname`** for multi-instance correlation.
- Primary host configuration is locked in code/env as documented in `hetzner-translate.ts` (Hetzner IP stack); segment routing picks **:5001 / :5002** workers when not in legacy single-stack emergency.

### 3.1 Trial outbound concurrency (`hetzner-translate.ts`)

- Plans `trial-libre` and `trial-hetzner` pass through **`TrialOutboundGate`** (`TRIAL_HETZNER_MAX_CONCURRENT`, default **2**).
- Other machine plans do not acquire this gate.

### 3.2 Session-aware routing (`transcription.ts` → `mtRoutingOpts`)

- When the user has a resolvable **open session** owned by them, `translateBasicProfessional` receives `{ sessionId, planType: effectivePlanTypeResolved, userEmail }`.
- Otherwise `{ planType }` only (no sticky reservation key).

---

## 4. Hetzner core router (`hetzner-core-router.ts`)

**Lanes:** **CORE1…CORE4** = HTTP bases from `HETZNER_CORE1_TRANSLATE_BASE` … `HETZNER_CORE4_TRANSLATE_BASE` (typically `:5001`/`:5002` per Hetzner host).  
**Two-lane mode (default):** `NUM_SLOTS = 2` — same reservation semantics as the original router (first two paid claim lanes 1–2; overflow paid → CORE1; trials only on idle slots).  
**Four-lane mode:** set **`HETZNER_FOUR_LANE_ROUTER=1`** (or `true`/`yes`) **and** non-empty **`HETZNER_CORE3_TRANSLATE_BASE`** + **`HETZNER_CORE4_TRANSLATE_BASE`**. If the flag is set but CORE3/CORE4 are missing, the process logs a warning and **falls back to 2 slots**.  
**Rollback:** unset `HETZNER_FOUR_LANE_ROUTER` or set `0` → **2-slot** behavior without redeploying older code.  
**Emergency:** `HETZNER_USE_LEGACY_SINGLE_STACK=1` collapses all lanes to one legacy base — **no reservation semantics**.  
**Temporary verification:** `HETZNER_ROUTER_ALLOC_DEBUG=1` emits structured **`hetzner_router_select_debug`** on allocator/routing decisions (session id, role, lane, `selectedBaseUrl`, `NUM_SLOTS`, four-lane env flag, CORE3/CORE4 env defined, full `laneToBase`). High volume — enable briefly on the API service only, then unset.  
**Temporary manual pin:** Admin **`POST /api/admin/session/:sessionId/hetzner-core-override`** with JSON **`{ "lane": null }`** (**clears** `sessions.hetzner_mt_manual_lane` → Auto) or **`{ "lane": 1..4 }`** (**sets** manual lane in **Postgres**). Effective outbound lane for MT is **`hetzner_mt_manual_lane ?? hetzner_mt_assigned_lane`** (`effectiveMtLane`). All replicas read the same row.

### 4.1 Who is “paid” for **core pinning** only?

`isPaidMachinePlanType(planType)` is **`true`** only for:

- `basic-libre`, `professional-libre`, **`platinum-libre`**

Note: **`platinum-libre`** users normally **translate on OpenAI** (`planUsesMachineTranslationStack` is false). They still **match** this helper if a call ever passes that string into the router (e.g. diagnostics). **`platinum`** (no `-libre`) is **not** “paid” for this router — those users use OpenAI and typically never hit Hetzner for segments.

### 4.2 Session lane assignment (**AUTO** vs manual)

For open interpreter sessions that use MT, **`sessions.hetzner_mt_assigned_lane`** is set **once** at session creation (`assignHetznerMtLaneForNewSessionInTx`), replaying other open sessions through `allocatePaid` / `allocateTrial`. Every **`POST …/translate`** reads the lane from Postgres — **sticky for the session** until manual lane changes.

1. **Paid (`allocatePaid`):** first **exclusive** empty slot fills in **`1 → 2 → 3 → 4`** when **`NUM_SLOTS = 4`** (same sequential style as **`1→2`** in two-slot mode, with cores **3–4 only as extra capacity**). When all exclusives are taken, overflow paid routes to **lane 1**.
2. **Trial (`allocateTrial`):** prefer slots that have **no** exclusive paid owner, scanned **`2 → 1 → 3 → 4`** (two-slot pattern **`2→1`** extended). If **every** slot already has an exclusive paid owner, a **second pass multiplexes**: trials share workers (Libre still accepts concurrent `/translate` HTTP). **Session-bound trials are no longer refused** solely because all cores are exclusively claimed.

**Two-slot matrix (`NUM_SLOTS = 2`, unchanged):**

| Exclusive paid placements | Trial preference |
|---------------------------|------------------|
| 0 | Trials may use CORE2-first scan, then CORE1 if idle (`2→1`). |
| 1 | Trials prefer the **idle** lane (paid’s peer). |
| 2 | Trials **multiplex** on second allocator pass — same Libre workers, concurrent HTTP. |

**Four-slot (`NUM_SLOTS = 4`):** Same idea with lanes **3–4** appended after **sequential paid fill** (**`1→2→3→4`**) for exclusives.

### 4.3 Anonymous path (`sessionId` absent / invalid)

Used by **`POST /translate`**, **`translatePlainMachine`** without routing opts (`routes/translate.ts`, optional leak paths), etc.

Behavior:

- If `planType` is **paid** per `isPaidMachinePlanType` → **lane 1**.
- Else **trial-like anonymous:** deterministic scan **`2→1→3→4`** (implementation returns the **first** lane in that list immediately — occupancy is **not** consulted on this path; it is **not** the same allocator as sticky sessions).

This path does **not** simulate DB slot reservation. Interpreter MT always passes **`sessionId`** and uses **§4.2**.

### 4.4 Lifecycle

Lane columns are scoped to **`sessions`** rows; **`clearSessionHetznerRoutingColumns`** exists for cleanup when wired from session teardown.

---


## 5. Plan → engine quick reference

| User segment | Typical `plan_type` | Engine |
|--------------|---------------------|--------|
| Default signup | `trial-libre` | Machine / Hetzner |
| Paid Basic / Prof (Libre billing) | `basic-libre`, `professional-libre` (+ legacy basic/prof variants that still use MT) | Machine / Hetzner |
| Platinum / Unlimited | `platinum`, `unlimited`, `platinum-libre` | OpenAI |
| Legacy OpenAI trial | `trial`, `trial-openai` | OpenAI |
| Disabled / special | `morsy-urgent`, `legacy2` | Translation disabled (`translationEnabledForUser`) |

PayPal **`subscription_plan`** remains `basic` | `professional` | `platinum` for billing; **`plan_type`** after activation is the Libre/OpenAI routing identity above (cancel often returns user toward `trial-libre` + inactive).

---

## 6. Related files (checklist)

| Concern | File |
|---------|------|
| Engine switch + OpenAI path | `artifacts/api-server/src/routes/transcription.ts` |
| `planUsesMachineTranslationStack`, effective plan | `artifacts/api-server/src/lib/usage.ts` |
| MT wrapper | `artifacts/api-server/src/lib/basic-pro-translate.ts` |
| Hetzner HTTP + trial gate | `artifacts/api-server/src/lib/hetzner-translate.ts` |
| Hetzner lane URL table + boot logs | `artifacts/api-server/src/lib/hetzner-core-router.ts` |
| Hetzner slot allocation (AUTO `1→2→3→4` / idle scan `2→1→3→4`) | `artifacts/api-server/src/lib/hetzner-slot-allocator.ts` |
| DB lane assign / sticky `sessions.*` lane columns | `artifacts/api-server/src/lib/hetzner-mt-db-routing.ts` |
| Public machine translate route (anonymous router) | `artifacts/api-server/src/routes/translate.ts` |
| Leak repair machine calls | `artifacts/api-server/src/lib/english-domain-leak-repair.ts` |
| Cursor rule / product name | `.cursor/rules/translation-tier-scope.mdc` |
| Memory / 2-lane deploy notes | `deploy/MEMORY-BUDGET-2LANE.md`, `deploy/hetzner-core-pinning/README.md` |

---

## 7. Updating this snapshot

After intentional routing or plan-matrix changes, bump the **Saved** date and **`HEAD`** hash, and align with tag **`final-boss-3`** policy from the workspace rule.
