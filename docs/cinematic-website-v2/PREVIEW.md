# Cinematic v2 — Chapter Preview Index

Re-capture after changes:

```bash
cd artifacts/transcription-app && npm run build && npm run serve -- --port 4173
node docs/cinematic-website-v2/capture-chapters.mjs
```

Scroll is driven by `#app-scroll`. One dominant message per chapter; workspace position is chapter-specific.

| Chapter | File | Scroll % | What you should see |
|---------|------|----------|---------------------|
| 1 — Hero | `01-problem.png` | 4.5% | 5-second clarity headline, centered large workspace |
| 2 — Conversation | `02-conversation.png` | 14% | Auto-playing workspace, workflow caption below |
| 3 — Product | `03-interpreterai.png` | 25% | Capability pillars left, workspace right |
| 4 — Languages | `04-languages.png` | 35% | Translated phrase bubbles (no lang codes), workspace left |
| 5 — Testimonials | `05-testimonials.png` | 45% | Interactive quotes left, workspace right |
| 6 — Trust | `06-trust.png` | 55% | Security & Privacy architecture left, workspace right |
| 7 — Enterprise | `07-scale.png` | 65% | Network + enterprise copy, workspace left |
| 8 — Pricing | `08-pricing.png` | 78% | Workspace upper, pricing cards below |
| 9 — Finale | `09-finale.png` | 93% | Workspace gone, logo + CTAs |

## Story order

Hero → Conversation → Product → Languages → Interpreter Feedback → Security & Privacy → Enterprise → Pricing → Finale

## Trust Center

`/security` is the unified Security & Privacy page. `/privacy` redirects to `/security#privacy-policy`.
