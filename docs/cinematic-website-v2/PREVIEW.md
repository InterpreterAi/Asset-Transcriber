# Cinematic v2 — Chapter Preview Index

Generated for design review **before commit**. Re-capture after changes:

```bash
cd artifacts/transcription-app && npm run build && npm run serve -- --port 4173
# In another terminal (with playwright available):
node docs/cinematic-website-v2/capture-chapters.mjs
```

Scroll is driven by `#app-scroll` (App shell). The capture script sets `scrollTop` on that element using the 820vh track height.

| Chapter | File | Scroll progress | What you should see |
|---------|------|-----------------|---------------------|
| 1 — The Problem | `01-problem.png` | 6% | Small workspace, doctor speaking, Ch1 headline |
| 2 — The Conversation | `02-conversation.png` | 20% | Enlarged workspace, multi-turn dialogue, product copy |
| 3 — InterpreterAI | `03-interpreterai.png` | 33% | Workspace + intelligence core glow, Ch3 copy left |
| 4 — Languages | `04-languages.png` | 43% | Dialogue-derived stream fragments, Ch4 copy right |
| 5 — Real-World Uses | `05-uses.png` | 53% | Network nodes emerging, Ch5 headline top |
| 6 — Trust | `06-trust.png` | 63% | Secure pathway glow on network, trust bullets |
| 7 — Scale | `07-scale.png` | 73% | Expanded node cluster, enterprise copy |
| 8 — Pricing | `08-pricing.png` | 84% | Network pricing nodes + tier cards |
| 9 — Final Moment | `09-finale.png` | 96% | Collapse + InterpreterAI logo + CTAs |

## Architecture (Phases B–E)

- **Single sticky canvas** — workspace never unmounts; scales/morphs with scroll
- **One scroll track** — 820vh (no 360vh+ pin dead zones)
- **Turn phases** — speak → listening pause → word-by-word translation
- **Network layer** — use cases, trust, scale, pricing emerge from workspace center
- **Streams** — fragments from `CINEMATIC_MARIA_DIALOGUE`, not decorative particles

## Known polish still open

- Finer reel-grade easing on network line draw
- Mobile overlay repositioning
- Auth/satellite pages cinematic shell (Phase D — not in this pass)
- Remove legacy marketing chapter components from bundle tree-shake audit
