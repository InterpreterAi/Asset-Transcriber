# InterpreterAI Reel Builder

Standalone marketing reel builder (62 languages, OpenAI translate + TTS).

**Isolation:** OpenAI is only used via `/api/reel-builder/*` on the api-server. This tool never touches workspace Soniox transcription/translation.

## Run

1. Start api-server with `ELEVENLABS_API_KEY` (preferred for TTS) and/or `OPENAI_API_KEY` (translate + TTS fallback). Proxied at `/api/reel-builder`.
2. Reel creator:

```bash
cd marketing/reel-creator
npm install
npm run dev
```

→ http://localhost:5179/builder

Optional: copy `.env.example` → `.env` for `VITE_API_ORIGIN` / `VITE_REEL_BUILDER_API_KEY`.

## Features

- Target language picker (62 codes in `src/lib/constants/languages.ts`)
- **Translate Script** → `gpt-4o-mini` (segments + outro slogan)
- **Generate VO** → OpenAI `tts-1` (onyx / nova / alloy / echo)
- Background music beds in `public/audio/music/` (~15%, ducked under VO)
- Problem `stock_broll` overlays + Solution `workspace_demo` (admin demo MP4 handoff)
- RTL canvas for Arabic / Hebrew / Urdu / Persian / Pashto / Kurdish
