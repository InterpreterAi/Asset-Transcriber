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
- Primary host configuration is locked in code/env as documented in `hetzner-translate.ts` (Hetzner IP stack); segment routing picks **:5001 / :5002** workers when not in legacy single-stack emergency.

### 3.1 Trial outbound concurrency (`hetzner-translate.ts`)

- Plans `trial-libre` and `trial-hetzner` pass through **`TrialOutboundGate`** (`TRIAL_HETZNER_MAX_CONCURRENT`, default **2**).
- Other machine plans do not acquire this gate.

### 3.2 Session-aware routing (`transcription.ts` → `mtRoutingOpts`)

- When the user has a resolvable **open session** owned by them, `translateBasicProfessional` receives `{ sessionId, planType: effectivePlanTypeResolved }`.
- Otherwise `{ planType }` only (no sticky reservation key).

---

## 4. Hetzner core router (`hetzner-core-router.ts`)

**Lanes:** **CORE1…CORE4** = HTTP bases from `HETZNER_CORE1_TRANSLATE_BASE` … `HETZNER_CORE4_TRANSLATE_BASE` (typically `:5001`/`:5002` per Hetzner host).  
**Two-lane mode (default):** `NUM_SLOTS = 2` — same reservation semantics as the original router (first two paid claim lanes 1–2; overflow paid → CORE1; trials only on idle slots).  
**Four-lane mode:** set **`HETZNER_FOUR_LANE_ROUTER=1`** (or `true`/`yes`) **and** non-empty **`HETZNER_CORE3_TRANSLATE_BASE`** + **`HETZNER_CORE4_TRANSLATE_BASE`**. If the flag is set but CORE3/CORE4 are missing, the process logs a warning and **falls back to 2 slots**.  
**Rollback:** unset `HETZNER_FOUR_LANE_ROUTER` or set `0` → **2-slot** behavior without redeploying older code.  
**Emergency:** `HETZNER_USE_LEGACY_SINGLE_STACK=1` collapses all lanes to one legacy base — **no reservation semantics**.  
**Temporary verification:** `HETZNER_ROUTER_ALLOC_DEBUG=1` emits structured **`hetzner_router_select_debug`** on every `selectHetznerCoreRoute` outcome (session id, paid vs trial role, lane, `selectedBaseUrl`, `NUM_SLOTS`, four-lane env flag, CORE3/CORE4 env defined, full `laneToBase`). High volume — enable briefly on the API service only, then unset.  
**Temporary manual pin:** Admin **`POST /api/admin/session/:sessionId/hetzner-core-override`** with JSON **`{ "lane": null }`** (Auto) or **`{ "lane": 1..4 }`**. Stored **in-memory** on the API process (`Map<sessionId, { lane, userEmail }>`); cleared on **`unregisterSessionForCoreRouting`** (session stop / terminate / stale cleanup). While pinned, **`selectHetznerCoreRoute`** returns that lane **before** sticky/automatic allocation and logs **`hetzner_manual_override`** (session id, lane, base URL, email, plan type). After POST, the API runs **`selectHetznerCoreRoute(planType, sessionId)`** once so reservations/`hetzner_route_selected` align immediately on that instance. **Multi-instance:** each replica has its own map — use one API instance or accept divergence until a DB-backed pin exists.  
**Structured route log:** every **`finishSelect`** emits **`hetzner_route_selected`** with `sessionId`, `userEmail` (from translate hint or manual map), `planType`, `selectedLane`, `selectedBaseUrl`, `manualOverride`, `numSlots`, `decision`.

### 4.1 Who is “paid” for **core pinning** only?

`isPaidMachinePlanType(planType)` is **`true`** only for:

- `basic-libre`, `professional-libre`, **`platinum-libre`**

Note: **`platinum-libre`** users normally **translate on OpenAI** (`planUsesMachineTranslationStack` is false). They still **match** this helper if a call ever passes that string into the router (e.g. diagnostics). **`platinum`** (no `-libre`) is **not** “paid” for this router — those users use OpenAI and typically never hit Hetzner for segments.

### 4.2 Session-full path (`sessionId > 0`)

1. **Sticky lane** in `sessionToLane` if still valid; else invalidate and re-allocate.
2. **Paid (`isPaidMachinePlanType`):** `allocatePaid`
   - **Four lanes:** exclusive slots are claimed in lane order **`1 → 3 → 4 → 2`** (slot indices `0,2,3,1`) so the **second** paid typically lands on **`HETZNER_CORE3_TRANSLATE_BASE`** (second physical host :5001) before **`CORE2`** on the first host — spreads CPU across hosts when `CORE1/CORE2` share host A and `CORE3/CORE4` share host B.
   - **Two lanes:** claim lanes **1 then 2** in order (unchanged).
   - If **all** exclusive slots are filled, **next paid** → **overflow on CORE1** (lane 1).
3. **Trial (not paid by router definition):** `allocateTrial`
   - Use the **first idle** slot (no exclusive paid owner) in order **`2 → 3 → 4 → 1`** (four-lane): **Core2 first**, then second physical host (**3, 4**), then **Core1**; two-lane **`2 → 1`**.
   - **If every slot has an exclusive paid owner:** **no** trial placement; throws **`HETZNER_TRIAL_ALL_CORES_RESERVED_FOR_PAID`** (logged as warning). Trial MT then fails before HTTP; `transcription.ts` MT catch returns **503** `LIBRETRANSLATE_FAILED` like other Hetzner errors.

**Two-slot matrix (unchanged when four-lane off):**

| Exclusive paid sessions on cores | Trial Hetzner (with session id) |
|----------------------------------|----------------------------------|
| 0 | Trials may use CORE1 and/or CORE2 (idle slots). |
| 1 | One core reserved for that paid; **trials only on the other idle core**. |
| 2 | **No** trial routing to either core; **no** trial fallback onto CORE2 next to second paid. |

**Four-slot mode:** same rules with four idle slots; trials blocked only when **four** exclusives are claimed.

### 4.3 Anonymous path (`sessionId` absent / invalid)

Used by:

- `translatePlainMachine` without opts (e.g. **`POST /translate`** in `routes/translate.ts`, **English leak repair**),
- Any call where `routingHint.sessionId` is missing.

Behavior:

- If `planType` is **paid** per `isPaidMachinePlanType` → **CORE1** (no slot claim).
- Else **trial-like anonymous:** first idle slot in trial scan order **`2 → 3 → 4 → 1`** (four-lane) or **`2 → 1`** (two-lane); else fallback **lane `NUM_SLOTS`**.

This path does **not** throw when all slots are paid-owned; it is **not** a trial **session** reservation. Session-based trial blocking applies when `sessionId` is passed through `allocateTrial`.

### 4.4 Lifecycle

- `unregisterSessionForCoreRouting(sessionId)` on session close, stale sweep, startup cleanup — releases slot ownership and trial sets for that session.

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
| Hetzner core reservation (2- or 4-lane) | `artifacts/api-server/src/lib/hetzner-core-router.ts` |
| Public machine translate route (anonymous router) | `artifacts/api-server/src/routes/translate.ts` |
| Leak repair machine calls | `artifacts/api-server/src/lib/english-domain-leak-repair.ts` |
| Cursor rule / product name | `.cursor/rules/translation-tier-scope.mdc` |
| Memory / 2-lane deploy notes | `deploy/MEMORY-BUDGET-2LANE.md`, `deploy/hetzner-core-pinning/README.md` |

---

## 7. Updating this snapshot

After intentional routing or plan-matrix changes, bump the **Saved** date and **`HEAD`** hash, and align with tag **`final-boss-3`** policy from the workspace rule.
