# Trial-hetzner provisional row experiment

**Status:** Implemented behind localStorage flag.

## Enable

```javascript
localStorage.setItem("interpreterai_trial_hetzner_provisional_row", "1")
// Full page reload, then Start on trial-hetzner account
```

## Trace events (console)

- `provisional_open` — first new-speaker token, row created immediately
- `provisional_first_paint` — first committed char in provisional row
- `provisional_confirm` — FAST_SWITCH confirmed, old row finalized
- `provisional_rollback` — false switch, text merged back to old row

Also works with `interpreterai_trial_hetzner_speaker_trace=1` for full speaker-switch timeline.

## V1 scope

- **Originals column only** — incremental typing in new speaker row within first WS frame
- **No live translation** on provisional rows until confirm
- **FAST_SWITCH unchanged** — confirm/rollback logic preserved

See architecture details below.

---


## 1. What creates a row today?

| Piece | File | Function / location |
|-------|------|---------------------|
| DOM row (orig + trans columns, speaker tag) | `use-transcription.ts` | `createBubble()` ~7276–7471 |
| Per-segment state | same | `BubbleTransState` + `activeBubbleStateRef` inside `createBubble` |
| Segment registry | same | `segmentStateByIdRef.set(segmentId, state)` |
| Active pointers | same | `activeBubbleRef`, `activeBubbleNFRef`, `activeBubbleStateRef` |
| Row close / finalize | same | `closeActiveSegmentBoundary()` → `finalizeLiveBubble()` → `softFinalize()` ~7641–7631 |
| Speaker-switch trigger | same | `ws.onmessage` token loop ~8126–8248 |
| Pending buffer | same | `pendingSpeakerSwitchRef` `{ sid, messageStreak, firstMs, bufferedFinalText }` |
| Row creation on confirm | same | `closeActiveSegmentBoundary` then `createBubble(sid)` then `locked += bufferedFinalText` |
| Abandon flush | same | ~8314–8360 — buffer → **old** row, clear pending |

**Only `createBubble()` constructs transcript rows.** No other module creates bubbles.

**Workspace wiring:** `workspace-default.tsx` sets `segmentBehaviorMode: "morsy-intercall-isolated-experiment"` for all `planUsesCanonAppendWsStt` plans including trial-hetzner.

---

## 2. Smallest code path to open a provisional row on first new-speaker token

### Feature gate (new)

```typescript
// trial-hetzner-provisional-row.ts
export function trialHetznerProvisionalRowExperimentEnabled(): boolean {
  return planUsesTrialHetznerCleanTranslation(planType) &&
    localStorage.getItem("interpreterai_trial_hetzner_provisional_row") === "1";
}
```

Optional: `useTranscription({ experimentTrialHetznerProvisionalRow: true })` from workspace for admin toggle.

### Single entry point (new helper in `use-transcription.ts`)

```typescript
function openProvisionalSpeakerRow(pendingSid: string, nowMs: number): void
```

**Call site:** Inside the existing `!sameSpeaker(sid, currentSpeakerRef.current)` branch, **when `pendingSpeakerSwitchRef` is first created** (currently ~8131), **only if** experiment enabled and `!pending.provisionalOpened`:

1. Stash current active into `pendingSpeakerSwitchRef`:
   - `previousBubbleRef`, `previousBubbleStateRef`, `previousNfRef`
   - `previousSpeakerId` (= `currentSpeakerRef.current` — unchanged until confirm)
2. `createBubble(pendingSid)` — active refs now point at **provisional** row
3. Set `pending.provisionalOpened = true`
4. **Do not** call `closeActiveSegmentBoundary`
5. **Do not** update `currentSpeakerRef` yet (confirmation still pending)

**Lines touched:** ~15 lines added at pending creation; ~0 changes to `createBubble` itself.

### Critical follow-up in same token loop

Today after pending opens:

```typescript
handledByPendingSwitchLogic = true;
// ...
if (handledByPendingSwitchLogic) { continue; }  // blocks ALL paint
```

**Experiment change:** When `provisionalOpened`:

- Keep streak / age / `bufferedFinalText` bookkeeping **or** retire buffer in favor of direct append
- **Remove `continue`** for tokens where `sid === pending.sid` — fall through to normal final-append + end-of-frame NF/paint on **active (= provisional)**
- For tokens where `sameSpeaker(sid, currentSpeakerRef)` (old speaker): route to **stashed previous** refs OR ignore (see risks)

**Smallest diff:** ~40 lines in `ws.onmessage` token loop + ~60 lines for three helpers (`openProvisional`, `commitProvisional`, `rollbackProvisional`).

---

## 3. Can `bufferedFinalText` drain incrementally?

**Yes.** Two equivalent approaches:

| Approach | Description |
|----------|-------------|
| **A. Eliminate buffer** | After `openProvisionalSpeakerRow`, stop writing `bufferedFinalText`; use existing per-token path (`lockedCommittedFinalOriginal += piece` + `paintMorsyUrgentCanonAppendCommittedOriginalsVisibleDom(..., canonImmediateCommittedAppend)`) on active provisional refs. |
| **B. Drain buffer each frame** | Keep appending to `bufferedFinalText` for metrics, mirror each append to provisional `locked` + paint immediately. Redundant — prefer **A**. |

On **confirm:** `createBubble` is **skipped** (row exists); run `commitProvisionalSpeakerRow()`:

- Finalize + `isClosed` on **stashed previous** segment only (extract `closeSegmentForRefs(previous*)` from `closeActiveSegmentBoundary`)
- `currentSpeakerRef = pending.sid`
- Clear `pendingSpeakerSwitchRef`
- Active already = provisional → no flush chunk

On **abandon** (`currentSpeakerSeenInMessage` path ~8321): `rollbackProvisionalSpeakerRow()`:

- Append provisional `lockedCommittedFinalOriginal` onto previous `locked` + paint previous (immediate append)
- Remove provisional DOM row (`row.parentElement.removeChild(row)`)
- Restore `activeBubbleRef/State/NF` from stashed previous
- Mark provisional segment `isClosed`, delete from `segmentStateByIdRef`
- Abort provisional `liveTranslationAbort`
- Clear pending

---

## 4. Risks

### Diarization flicker (A→B→A)

| Risk | Mitigation |
|------|------------|
| Provisional row flashes then merges back | Expected for false switches; FAST_SWITCH still decides. UX: brief row appears/disappears — acceptable for experiment. |
| User sees two rows during 300ms pending | **Desired** — matches Intercall typing feel. |

### Duplicate text

| Risk | Mitigation |
|------|------------|
| Rollback merge appends text already partially on old row | Track `provisionalLockedAtOpen` snapshot; merge only **delta** since open, or full provisional locked if old row received nothing during pending. |
| Confirm + incremental append double-count | On confirm, **do not** re-flush `bufferedFinalText` — already on provisional. |
| `rollEnqueueForSegment` replay | Use same segmentId for provisional throughout pending; no roll on confirm. |

### Row merge rollback

| Risk | Mitigation |
|------|------------|
| Orphan DOM nodes | Rollback must remove full grid `row`, not just span |
| `segmentStateByIdRef` leak | Delete provisional segmentId on rollback |
| `adminSegmentRowIndexRef` wrong line | Defer admin snapshot for provisional until confirm; or delete provisional admin line on rollback |
| Scroll jump | Call existing `scrollPanelFnRef` after rollback |

### Translation alignment

| Risk | Mitigation |
|------|------------|
| `dispatchTranslation` uses `activeBubbleStateRef` — live translate hits **provisional** during pending | **Highest risk.** Options: (1) suppress live translate on provisional until confirm; (2) allow translate on provisional, on rollback **discard** provisional translation and re-dispatch merged source on old row; (3) hold translate on previous, start fresh on confirm. **Recommend (1) for v1 experiment** — originals-only typing parity first. |
| `segmentSourceLang` lock on wrong row | Provisional gets its own `BubbleTransState`; rollback aborts in-flight |
| Arabic column empty then jumps | Accept for experiment; document as known limitation |
| `softFinalize` on previous while provisional translating | Finalize previous on confirm only; block previous live translate via `isClosed` on stash |

### Old-speaker tokens during pending

| Risk | Mitigation |
|------|------------|
| Old speaker continues talking during B-pending | `currentSpeakerSeenInMessage` triggers **abandon** today — must call **rollback**, not flush buffer to wrong row. **Replace** abandon path when provisional experiment on. |
| NF from old speaker paints on provisional NF span | End-of-frame NF uses `activeBubbleNFRef` (= provisional). Split NF paint: if pending + provisional, compute NF from tokens filtered to `pending.sid` only for provisional span; keep previous NF frozen on stashed refs. **~20 lines** in canon NF block. |

---

## 5. Smallest implementation plan

### Phase 0 — Flag + helpers (no behavior change)

- [ ] `trial-hetzner-provisional-row.ts` — gate + types extending pending ref
- [ ] Extend `pendingSpeakerSwitchRef` type with optional `provisionalOpened`, `previousBubbleRef`, `previousBubbleStateRef`, `previousNfRef`, `previousRowEl`

### Phase 1 — Open provisional (~80 LOC)

- [ ] `openProvisionalSpeakerRow()` at first pending creation
- [ ] When `provisionalOpened`: skip `continue` for `sid === pending.sid`; run normal final append + paint on active
- [ ] Split NF paint to provisional-only tokens when pending

### Phase 2 — Confirm path (~40 LOC)

- [ ] `commitProvisionalSpeakerRow()` — finalize previous refs only, set `currentSpeakerRef`, clear pending
- [ ] Remove duplicate `createBubble` + buffer flush on confirm when provisional open

### Phase 3 — Rollback path (~60 LOC)

- [ ] Replace abandon flush (~8321) with `rollbackProvisionalSpeakerRow()` when experiment on
- [ ] Merge locked text → previous, remove provisional DOM, restore active refs

### Phase 4 — Translation guard (~25 LOC)

- [ ] `dispatchTranslation` early return if `pendingSpeakerSwitchRef.provisionalOpened && !confirmed` (live only; allow final after confirm)
- [ ] Or: pass `segmentIdLock` only after confirm

### Phase 5 — Instrumentation

- [ ] Extend `trial-hetzner-speaker-transition-trace.ts` with `provisional_open`, `provisional_commit`, `provisional_rollback` events

### Verification

1. Enable: `localStorage.setItem("interpreterai_trial_hetzner_provisional_row", "1")`
2. Same Shark Tank clip — new speaker row should show text within **one WS frame**, not 300ms
3. Force flicker (fast A↔B) — row should appear then merge back without duplicate chars
4. Compare side-by-side with Intercall video

### Files touched (estimated)

| File | Change |
|------|--------|
| `use-transcription.ts` | Main experiment (~150 LOC net) |
| `trial-hetzner-provisional-row.ts` | New gate (~30 LOC) |
| `trial-hetzner-speaker-transition-trace.ts` | 3 event types (~40 LOC) |
| `workspace-default.tsx` | Optional admin toggle (~10 LOC) |
| `docs/TRIAL-HETZNER-PROVISIONAL-ROW-PLAN.md` | This doc |

**Not touched:** `createBubble` structure, FAST_SWITCH constants, `effectiveSpeakersForTokenBoundaries`, translation server, Hetzner, `canonImmediateCommittedAppend`.

---

## Architecture diagram

```
Today:
  new speaker → pending → buffer → [300ms/2 frames] → close old → create row → chunk flush

Experiment:
  new speaker → pending + openProvisionalRow (immediate)
              → incremental finals → provisional row (typing)
              → [FAST_SWITCH still running]
                    ├─ confirm → finalize old row, keep provisional (now canonical)
                    └─ abandon → merge provisional → old row, delete provisional DOM
```

---

## Answer summary

| Question | Answer |
|----------|--------|
| **1. Row creation** | `createBubble()` only; triggered on confirm today (~8215) |
| **2. Smallest open path** | `openProvisionalSpeakerRow()` at first `pendingSpeakerSwitchRef` creation (~8131) |
| **3. Incremental drain** | Yes — stop using buffer; use existing final append + immediate paint on provisional active refs |
| **4. Risks** | Flicker flash (acceptable), duplicate on rollback (delta merge), translation misalignment (suppress live MT on provisional v1), old-speaker NF routing |
| **5. Plan** | ~150 LOC in `use-transcription.ts`, flag-gated, 3 helpers, replace abandon path, defer translation until confirm |
