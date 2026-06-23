# Trial-Hetzner streaming diagnosis (original column)

**Scope:** `plan_type === trial-hetzner` only. Translation engine (Hetzner/NLLB) is **not** the cause of English transcript chunking. This report covers Soniox STT to React DOM for the **ORIGINAL** column.

**Screenshots reference:** Side-by-side with Intercall during a business-pitch dialogue. Intercall grows text continuously; InterpreterAI stalls then injects larger chunks, especially at speaker transitions.

---

## Pipeline map (trial-hetzner)

```
Soniox WebSocket (stt-rt-v5)
  └─ ws.onmessage (use-transcription.ts)
       ├─ effectiveSpeakersForTokenBoundaries()     [speaker stabilization]
       ├─ Per-token loop:
       │    ├─ pendingSpeakerSwitchRef buffer       [blocks finals until confirmed]
       │    └─ lockedCommittedFinalOriginal += final [authority — immediate]
       ├─ morsyIsolatedVerbatimRawNfHypothesis()    [NF tail from non-finals]
       ├─ morsyUrgentVolatileHypothesisDomPaint()   [NF smoothing 220–280ms]
       ├─ nfEl.textContent = nfPaintVisible          [NF DOM — full replace]
       └─ paintMorsyUrgentCanonAppendCommittedOriginalsVisibleDom()
            └─ stepVisibleCommittedBoundaryUtf16() [165–300ms visible lag]
                 └─ projectCommittedOriginalsVisibleUtf16()  [committed DOM]
```

**Plan routing (workspace-default.tsx):**

| Setting | trial-hetzner value |
|---------|---------------------|
| `segmentBehaviorMode` | `morsy-intercall-isolated-experiment` |
| `planUsesCanonAppendWsStt` | `true` |
| `morsyUrgentAppendOnlyTranscriptDomPath` | `true` (with segment guards) |
| `basicMorsyUrgentImmediateCommittedAppend` | **`false`** (not `morsy-urgent`) |

The last row is decisive: trial-hetzner uses **visible-boundary pacing**, not immediate token append.

---

## Root cause (proven in code)

### 1. Visible committed boundary gating — primary chunking mechanism

**File:** `morsy-isolated-semantic-visible.ts` → `stepVisibleCommittedBoundaryUtf16`

**Constants:**

- `MORSY_COMMIT_VISIBLE_IDLE_BASE_MS = 165`
- `MORSY_COMMIT_VISIBLE_MAX_LAG_BEHIND_CANON_MS = 300`
- Entity-heavy tails: up to **235–295ms** idle before promotion

**Behavior:**

1. Every Soniox **final** immediately extends `lockedCommittedFinalOriginal` (authority).
2. The **visible DOM** shows only `locked.slice(0, visibleCommittedBoundary)`.
3. When new finals arrive, `quietSinceMs` resets → boundary **does not advance** while speech is still growing.
4. Boundary promotes only when:
   - **`idle_quiet`:** no canonical growth for **165ms+** (often longer for numbers/names), OR
   - **`lag_ceiling`:** visible lags authority for **300ms+** → **full backlog dumped at once**.

**Why it feels like stop typing, then chunk:**

During continuous speech, finals keep resetting the quiet clock. The UI holds back committed text until either a pause or the 300ms ceiling — then promotes the entire staged tail in one paint.

**Contrast with Intercall:** Intercall paints incrementally without this 165–300ms authority→visible lag. trial-hetzner **intentionally** decouples authority from visible committed text for non–`morsy-urgent` plans.

---

### 2. Speaker stabilization buffer — chunking at transitions

**Constants (trial-hetzner):** `FAST_SWITCH_MIN_STREAK = 2`, `FAST_SWITCH_MIN_AGE_MS = 300`

When diarization reports a new speaker, finals are **not painted** until confirmation. On confirm → new bubble → **buffered finals flushed in one write**.

Matches screenshots: `Yes.`, `You got a deal.` appear as complete short rows after handoff.

---

### 3. NF smoothing — secondary

Holds back 1–2 trailing tokens for 4–5 WS ticks or 220–280ms. Committed finals still lag via mechanism §1.

---

### 4. Layers ruled OUT for original-column chunking

| Layer | Verdict |
|-------|---------|
| Soniox upstream | Not primary visible stall |
| WebSocket batching | No client throttle |
| `finalRenderQueueRef` + 80ms flush | **Disabled** on canon-append path |
| Translation / Hetzner MT | 52ms debounce — **TRANSLATION column only** |
| React virtualization | Direct DOM text nodes |
| `morsyIsolatedVisibleNfDebounceMs` | **morsy-urgent only** |

---

## Answer

**Two stacked mechanisms on trial-hetzner:**

1. **Within a speaker turn:** `visibleCommittedBoundary` holds committed finals (up to ~300ms); then **`lag_ceiling`** promotes the whole staged tail.
2. **At speaker transitions:** `pendingSpeakerSwitchRef` blocks finals until 2-message/300ms confirmation; buffered text flushes to a new row.

Translation wait does **not** gate English originals.

---

## Capture timing evidence

### Trial-hetzner stream trace

```javascript
localStorage.setItem("interpreterai_trial_hetzner_stream_trace", "1")
// Reload, run session, Stop:
window.__trialHetznerStreamTrace.printSummary()
copy(window.__trialHetznerStreamTrace.exportRows())
```

### Canon visible trace

```javascript
localStorage.setItem("interpreterai_morsy_canon_visible_trace", "1")
```

Look for `stagingGapLockedUtf16`, `promoteReason: "lag_ceiling"`.

### STT upstream (optional)

```javascript
localStorage.setItem("interpreterai_stt_pipeline_diag", "1")
window.__interpretSttPipeline.print()
```

---

## Smallest fix (not applied — evidence first)

In `paintMorsyUrgentCanonAppendCommittedOriginalsVisibleDom`, treat `trial-hetzner` like `morsy-urgent` for committed paint:

```typescript
const immediateCommittedAppend =
  isBasicMorsyUrgentPlan(planTypeLower) ||
  planUsesTrialHetznerCleanTranslation(planTypeLower);
```

Uses existing `appendDataLockedOnly` path (~3 lines). Does not alter Soniox, speaker logic, translation, or segments.

**Component responsible:** `paintMorsyUrgentCanonAppendCommittedOriginalsVisibleDom` → `stepVisibleCommittedBoundaryUtf16`.
