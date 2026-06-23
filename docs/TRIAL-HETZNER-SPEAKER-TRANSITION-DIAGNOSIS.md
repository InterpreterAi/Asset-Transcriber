# Trial-Hetzner speaker-transition diagnosis

**Scope:** `plan_type === trial-hetzner`. Visible-boundary fix is **done** — within-bubble streaming works. Remaining chunking occurs at **speaker / language / fast back-and-forth** boundaries.

**Status:** Diagnosis + instrumentation only. **No behavior changes.**

---

## How to capture logs

```javascript
localStorage.setItem("interpreterai_trial_hetzner_speaker_trace", "1")
// optional: keep stream trace too
localStorage.setItem("interpreterai_trial_hetzner_stream_trace", "1")
```

Reload → run same dialogue as Intercall side-by-side → Stop:

```javascript
window.__trialHetznerSpeakerTrace.printAll()
copy(JSON.stringify(window.__trialHetznerSpeakerTrace.getSwitches(), null, 2))
```

Each switch emits:

| Field | Meaning |
|-------|---------|
| `speaker_change_detected` | ms since session start — pending stabilization begins |
| `first_token_time` | first token (NF or final) from new speaker while pending |
| `first_final_time` | first **final** buffered (not painted to new row) |
| `speaker_confirm_time` | FAST_SWITCH gate satisfied |
| `new_row_created_time` | `createBubble()` for new speaker |
| `first_visible_paint_time` | first committed chars in new row DOM |
| `buffering_duration_ms` | `first_visible_paint − stabilization_begin` |
| `ms_to_first_visible` | `first_visible_paint − first_token_time` |
| `buffered_chars` / `buffered_tokens` | text held off-row before first paint |

---

## Code path (trial-hetzner)

All production workspace tiers using `morsy-intercall-isolated-experiment` enable **`useMorsyUrgentSpeakerGate`** (`segmentModeUsesStabilizedSonioxSpeakerPivot`).

When Soniox reports a **different** `speaker_id`:

```
ws.onmessage token loop
  └─ !sameSpeaker(sid, currentSpeakerRef.current)
       └─ useMorsyUrgentSpeakerGate === true
            ├─ handledByPendingSwitchLogic = true
            ├─ pendingSpeakerSwitchRef = { sid, messageStreak, firstMs, bufferedFinalText: "" }
            ├─ finals → bufferedFinalText ONLY (not locked, not DOM)
            └─ continue  ← skips normal per-token final append + paint for this token

Confirm when:
  messageStreak >= FAST_SWITCH_MIN_STREAK (2)
  OR (nowMs - firstMs >= FAST_SWITCH_MIN_AGE_MS (300) AND streak >= 1)

On confirm:
  closeActiveSegmentBoundary("speaker_change")  ← old row finalized
  createBubble(newSpeaker)                       ← NEW row created HERE
  lockedCommittedFinalOriginal += bufferedFinalText  ← chunk flush
  paintMorsyUrgentCanonAppendCommittedOriginalsVisibleDom  ← first visible chars
```

**There is no new row and no committed paint until confirm completes.**

Constants (`use-transcription.ts`):

```744:748:artifacts/transcription-app/src/hooks/use-transcription.ts
const FAST_SWITCH_MIN_STREAK = 2;
const FAST_SWITCH_MIN_AGE_MS = 300;
const MORSY_SEMANTIC_ISO_FAST_SWITCH_MIN_STREAK = 3;  // morsy-urgent only
const MORSY_SEMANTIC_ISO_FAST_SWITCH_MIN_AGE_MS = 520;
```

trial-hetzner uses **2 messages** or **300ms** (not semantic ISO UX — that is morsy-urgent only).

---

## Fast back-and-forth / language flicker

### Abandoned pending → flush to **old** row

If the **current** speaker also appears in the same WS frame while pending streak < 3:

```8266:8299:artifacts/transcription-app/src/hooks/use-transcription.ts
if (pendingAfter && pendingAfter.messageStreak < pendingFlushMax && currentSpeakerSeenInMessage) {
  // bufferedFinalText appended to activeBubbleRef (OLD speaker row!)
  pendingSpeakerSwitchRef.current = null;
}
```

This explains some back-and-forth: new-speaker audio is **buffered**, then **discarded onto the previous row** when diarization flickers — no new row, chunk appears on wrong speaker line.

### effectiveSpeakersForTokenBoundaries

Soniox diarization collapses ephemeral runs (<3 tokens, <28 chars) sandwiched between same speaker. Fast code-switch / language change can still trigger pending stabilization when raw speaker flips before collapse.

---

## NF during pending (visual mismatch)

While `handledByPendingSwitchLogic` blocks **committed finals**, the **NF span** on the **old row** is still updated later in the same WS frame from **all** tokens (including new speaker NF via `tailSpk`). User may see partial NF activity on the stale row while committed text waits for confirm + new row.

---

## Answers

### A) Is text intentionally buffered until speaker confirmation?

**Yes.** Finals from the new speaker go to `pendingSpeakerSwitchRef.bufferedFinalText`. The token loop hits `handledByPendingSwitchLogic → continue`, so they never reach `lockedCommittedFinalOriginal` or DOM until confirm.

```8129:8218:artifacts/transcription-app/src/hooks/use-transcription.ts
ps.bufferedFinalText += t.text;  // buffer only
// ...
if (handledByPendingSwitchLogic) { continue; }  // no incremental paint
```

Design intent: avoid spurious rows from diarization flicker (A→B→A noise).

### B) Are finals arriving continuously while the UI is waiting?

**Yes.** Soniox keeps sending finals; they accumulate in `bufferedFinalText`. The active row may still show the **previous** speaker (or NF tail on old row). **No row exists yet** for the new speaker until `createBubble` after confirm.

Logs: `first_final_time` < `speaker_confirm_time` with growing `buffered_chars` across WS frames.

### C) How many milliseconds before first character in the new row?

**Theoretical minimum:** one Soniox WS message boundary (~50–150ms typical) for streak=2 path, or **300ms** for age-only path.

**Measured (expect from traces):**

| Path | Typical delay |
|------|----------------|
| Streak confirm (2nd WS frame) | ~100–400ms + 1 paint frame |
| Age confirm (300ms timer) | **≥300ms** + paint frame |
| Fast back-and-forth abandon | No new row; chunk on old row at variable timing |

`ms_to_first_visible` in logs = **first token → first committed char in new row** (primary Intercall gap metric).

### D) Could a new row open immediately and grow incrementally while confirmation continues?

**Yes, architecturally.** Current code **deliberately does the opposite**:

1. Row creation is **gated after** confirm (`createBubble` only inside `if (speakerConfirmed)`).
2. All buffered finals are **flushed in one write** to the new row’s `lockedCommittedFinalOriginal`.
3. With immediate-append fix, that flush paints as one chunk (not word-by-word history).

Intercall-style behavior would require: **create row on first new-speaker token**, append incrementally, optionally merge/close if pending is abandoned — **without changing FAST_SWITCH constants**, only reordering when row opens vs when buffer drains.

---

## Why Intercall feels different

| | Intercall (inferred) | trial-hetzner (current) |
|--|----------------------|---------------------------|
| New speaker detected | Row opens quickly | Row waits for FAST_SWITCH |
| Finals during handoff | Paint into active/new row | Buffer off-DOM |
| First visible text | Incremental | Chunk after 300ms or 2nd frame |
| Fast A↔B | Likely single row or fast pivot | Buffer + abandon-to-old-row |

---

## Component responsible

| Mechanism | Location |
|-----------|----------|
| Intentional final buffering | `pendingSpeakerSwitchRef.bufferedFinalText` |
| Block incremental paint | `handledByPendingSwitchLogic` + `continue` |
| Confirm gate | `FAST_SWITCH_MIN_STREAK`, `FAST_SWITCH_MIN_AGE_MS` |
| Delayed row creation | `createBubble()` only after `speakerConfirmed` |
| Chunk flush | `lockedCommittedFinalOriginal += confirm.bufferedFinalText` post-confirm |
| Abandon path | `buildWs/pending_speaker_flush` → old row |

**Not involved:** visibleCommittedBoundary (fixed), translation debounce, Hetzner MT.

---

## Next step (after log capture)

Run the same Shark Tank / back-and-forth clip with trace enabled. Compare `buffering_duration_ms` and `buffered_chars` per switch against Intercall video timestamps. Only then design a minimal fix (likely: **early row open + incremental buffer drain**, not removing FAST_SWITCH entirely).
