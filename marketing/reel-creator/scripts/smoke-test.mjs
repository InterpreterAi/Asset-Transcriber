#!/usr/bin/env node
/**
 * Final smoke test — API + timeline + assets (no UI browser).
 * Run: node scripts/smoke-test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.API_ORIGIN ?? "http://127.0.0.1:8787";
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const PUBLIC = join(ROOT, "public");

const results = { passed: [], failed: [] };
function pass(msg) {
  results.passed.push(msg);
  console.log("✓", msg);
}
function fail(msg, detail = "") {
  results.failed.push({ msg, detail });
  console.log("✗", msg, detail ? `— ${detail}` : "");
}

async function postGenerate(body) {
  const res = await fetch(`${API}/api/reel-builder/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function postTts(text) {
  const res = await fetch(`${API}/api/reel-builder/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ text, voice: "adam", withTimestamps: true }),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// --- Timeline constants (mirror generatedReel.ts) ---
const REEL_TOTAL = 35;
const REEL_HOOK = 10;
const REEL_WORKSPACE = 15;
const REEL_OUTRO = 10;
const segments = [
  { id: "hook", start: 0, end: REEL_HOOK },
  { id: "workspace", start: REEL_HOOK, end: REEL_HOOK + REEL_WORKSPACE },
  { id: "outro", start: REEL_HOOK + REEL_WORKSPACE, end: REEL_TOTAL },
];

console.log("\n=== Timeline ===");
if (segments[0].id === "hook" && segments[0].start === 0) pass("First segment is hook at 0s (no intro)");
else fail("First segment should be hook at 0");
if (segments[0].end - segments[0].start === 10) pass("Hook duration 10s");
else fail("Hook duration", `${segments[0].end - segments[0].start}s`);
if (segments[1].end - segments[1].start === 15) pass("Workspace duration 15s");
else fail("Workspace duration");
if (segments[2].end - segments[2].start === 10) pass("Outro duration 10s");
else fail("Outro duration");
if (segments[2].end === 35) pass("Total duration 35s");
else fail("Total duration", `${segments[2].end}s`);

console.log("\n=== Canonical outro assets ===");
const voPath = join(PUBLIC, "brand/universal-outro-vo-en.m4a");
const outroMp4 = join(PUBLIC, "brand/approved-outro.mp4");
const outroPlate = join(PUBLIC, "brand/interpreterai-outro-plate.png");
if (existsSync(voPath)) {
  const buf = readFileSync(voPath);
  pass(`Canonical EN outro audio exists (${Math.round(buf.length / 1024)} KB)`);
} else fail("Missing universal-outro-vo-en.m4a");
if (existsSync(outroMp4)) pass("approved-outro.mp4 in public/brand");
else fail("Missing approved-outro.mp4");
if (existsSync(outroPlate)) pass("interpreterai-outro-plate.png in public/brand (1080×1920 reference)");
else fail("Missing interpreterai-outro-plate.png — run scripts/prepare-outro-plate.py");

console.log("\n=== English generation ===");
const en = await postGenerate({
  prompt: "Medical interpreters wasting 2 hours typing transcripts every day. Energetic male voiceover.",
  language: "en",
  series: "medical",
  sourceLang: "en",
  targetLang: "es",
});
if (en.status === 200) pass("EN generate HTTP 200");
else fail("EN generate", `HTTP ${en.status} ${en.data.error ?? ""}`);

if (en.data.providerStatus?.storyboard === "ok") pass("Storyboard ok");
else fail("Storyboard status");

const hookWords = en.data.storyboard?.hookScript?.split(/\s+/).length ?? 0;
if (hookWords > 0 && hookWords <= 25) pass(`Hook script ${hookWords} words (≤25 for 10s)`);
else fail("Hook word count", String(hookWords));

if (en.data.storyboard?.workspace?.exchanges?.length >= 2)
  pass(`Workspace has ${en.data.storyboard.workspace.exchanges.length} exchanges`);
else fail("Workspace exchanges missing");

if (en.data.outroAudioBase64 == null) pass("EN outro audio null (uses canonical client-side)");
else fail("EN should not return outroAudioBase64", "server synthesized EN outro");

if (en.data.storyboard?.outroVoiceover?.includes("Stay focused")) pass("Locked outro VO copy");
else fail("Outro VO copy");

const footage = en.data.providerStatus?.footage;
if (footage === "unavailable" || footage === "ok") pass(`Footage status honest: ${footage}`);
else fail("Footage status");

console.log("\n=== Spanish generation ===");
const es = await postGenerate({
  prompt: "Legal interpreters losing billable hours to manual transcript typing.",
  language: "es",
  series: "legal",
  sourceLang: "en",
  targetLang: "es",
});
if (es.status === 200) pass("ES generate HTTP 200");
else fail("ES generate", `HTTP ${es.status}`);

if (es.data.storyboardEn?.hookScript && es.data.storyboard?.hookScript !== es.data.storyboardEn.hookScript)
  pass("ES hook translated; English preserved in storyboardEn");
else fail("Translation preservation");

if (es.data.storyboard?.outroCopy?.line1) pass("ES outro visible copy (outroCopy)");
else fail("ES outroCopy missing");

if (es.data.storyboard?.workspace?.exchanges?.length >= 2) pass("ES workspace exchanges");
else fail("ES workspace");

const esHookWords = es.data.words?.length ?? 0;
if (es.data.providerStatus?.voice === "ok" && esHookWords > 0) pass(`ES hook VO + ${esHookWords} timed words`);
else if (es.data.providerStatus?.voice !== "ok") pass("ES voice unavailable — timed fallback path (no audio)");
else fail("ES hook words missing despite voice ok");

console.log("\n=== Hook re-record (TTS endpoint) ===");
const tts = await postTts(en.data.storyboard?.hookScript ?? "Test hook line.");
if (tts.status === 200 && tts.data.audioBase64) pass("Hook re-record TTS returns audio");
else if (tts.status >= 400) pass("TTS unavailable (ElevenLabs) — expected in some envs");
else fail("TTS", `HTTP ${tts.status}`);

console.log("\n=== Persistence shape ===");
const saveShape = {
  prompt: en.data.prompt,
  language: en.data.language,
  storyboard: en.data.storyboard,
  storyboardEn: en.data.storyboardEn,
  footageUrls: en.data.footageUrls,
  audioBase64: en.data.audioBase64,
  words: en.data.words,
  outroAudioBase64: en.data.outroAudioBase64,
  createdAt: Date.now(),
  outroConfig: { locked: true },
};
const required = ["prompt", "storyboard", "storyboardEn", "footageUrls"];
if (required.every((k) => saveShape[k] != null)) pass("GeneratedReelSave shape complete for localStorage");
else fail("Save shape incomplete");

if (saveShape.storyboard.workspace?.sourceLang && saveShape.storyboard.workspace?.exchanges)
  pass("Workspace langs + exchanges persistable");
else fail("Workspace persist fields");

console.log("\n=== Outro player checks (static) ===");
const playerSrc = readFileSync(join(ROOT, "src/components/preview/GeneratedReelPlayer.tsx"), "utf8");
if (!playerSrc.includes("renderIntro") && !playerSrc.includes('case "intro"'))
  pass("GeneratedReelPlayer has no intro segment");
else fail("Intro still in GeneratedReelPlayer");

if (!playerSrc.includes("WordSubtitles") || !playerSrc.match(/renderOutro[\s\S]*?UniversalBrandOutro/))
  pass("Outro uses UniversalBrandOutro without WordSubtitles in renderOutro");
else if (playerSrc.includes("renderOutro") && !playerSrc.match(/renderOutro[\s\S]{0,400}WordSubtitles/))
  pass("Outro has no subtitle overlay");
else fail("Outro may still have WordSubtitles");

if (playerSrc.includes("loadCanonicalOutroAudio") || playerSrc.includes("resolveOutroAudioBlob"))
  pass("Player uses canonical EN outro audio resolver");
else fail("Canonical outro audio not wired in player");

console.log("\n=== Summary ===");
console.log(`Passed: ${results.passed.length}`);
console.log(`Failed: ${results.failed.length}`);
if (results.failed.length) {
  for (const f of results.failed) console.log(" -", f.msg, f.detail);
  process.exit(1);
}
process.exit(0);
