# InterpreterAI Marketing Reel Creator

**Video assembler only** — Brand Intro → Admin Marketing Demo recording → Brand Outro.

## Recommended workflow (no manual screen capture)

1. Start Reel Creator: `npm run dev` → http://localhost:5179  
2. Open the real Admin Marketing Demo: `/admin/demo-marketing`  
3. Click **Record** (records the phone frame at **1080×1920 / 60fps H.264**)  
4. Use the demo (Tab Audio / live session)  
5. Click **Stop** → MP4 downloads + Reel Creator opens with the file loaded  
6. Click **Export MP4** (adds Intro 1s + Outro 3s)

No fake workspace. No recreated UI. Middle segment is the captured phone frame only.

## Manual upload (fallback)

Upload a **1080×1920** MP4 if handoff/popup was blocked.

## Config

`reel.config.json` — intro/outro timing, CTA, referral, export.

Optional env: `VITE_REEL_CREATOR_URL` (default `http://localhost:5179/`).
