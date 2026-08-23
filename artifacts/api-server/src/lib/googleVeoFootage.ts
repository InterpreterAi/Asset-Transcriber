/**
 * Google AI (Gemini) Veo hook footage — same slot as Pexels per clip.
 * Requires GOOGLE_AI_API_KEY + billing on the Gemini API (Veo is paid preview).
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_VEO_MODEL = "veo-3.1-generate-preview";
const FALLBACK_VEO_MODEL = "veo-3.1-fast-generate-preview";
const POLL_MS = 8_000;
const MAX_POLL_MS = 180_000;

export type FootageProviderId = "pexels" | "google_veo";

export function getGoogleAiApiKey(): string | null {
  return (
    process.env.GOOGLE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_AI_PRO_API_KEY?.trim() ||
    null
  );
}

export function veoModelId(): string {
  return process.env.GOOGLE_VEO_MODEL?.trim() || DEFAULT_VEO_MODEL;
}

/** Models to try in order — fast preview may not be on all keys/plans. */
export function veoModelCandidates(): string[] {
  const primary = veoModelId();
  return [primary, FALLBACK_VEO_MODEL, "veo-3.1-generate-preview"].filter(
    (m, i, arr) => arr.indexOf(m) === i,
  );
}

export function veoCacheDir(): string {
  // Stable beside api-server dist/ (not cwd — dev may start from repo root).
  const primary = resolve(MODULE_DIR, "..", ".cache", "veo-footage");
  const legacy = resolve(process.cwd(), ".cache", "veo-footage");
  const dir = existsSync(primary) || !existsSync(legacy) ? primary : legacy;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function isSafeVeoFootageFilename(name: string): boolean {
  return /^veo-[a-f0-9]{16}\.mp4$/.test(name);
}

export function veoFootageFilePath(filename: string): string | null {
  const safe = basename(filename);
  if (!isSafeVeoFootageFilename(safe)) return null;
  const abs = resolve(veoCacheDir(), safe);
  return existsSync(abs) ? abs : null;
}

/** Relative URL — works through Vite /api proxy in dev. */
export function veoFootagePublicUrl(filename: string): string {
  return `/api/reel-builder/footage/${filename}`;
}

export function buildVeoPrompt(scenario: string, seriesContext: string): string {
  const scene = scenario.trim();
  const ctx = seriesContext.trim() || "professional cinematic";
  return [
    scene,
    "Vertical portrait 9:16 smartphone social reel b-roll.",
    ctx,
    "Realistic, stable camera, shallow depth of field.",
    "No on-screen text, no logos, no subtitles, no watermarks.",
  ]
    .filter(Boolean)
    .join(" ");
}

type GeminiError = { error?: { message?: string; code?: number; status?: string } };

async function startVeoJob(apiKey: string, prompt: string, model: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/${model}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: 4,
          sampleCount: 1,
        },
      }),
    },
  );
  const data = (await res.json()) as GeminiError & { name?: string };
  if (!res.ok) {
    const msg = data.error?.message ?? `Veo start failed (${res.status})`;
    throw new Error(msg);
  }
  if (!data.name) throw new Error("Veo returned no operation name");
  return data.name;
}

async function pollVeoOperation(apiKey: string, operationName: string): Promise<unknown> {
  const opPath = operationName.replace(/^https?:\/\/[^/]+\/v1beta\//, "");
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${GEMINI_BASE}/${opPath}?key=${encodeURIComponent(apiKey)}`);
    const data = (await res.json()) as GeminiError & {
      done?: boolean;
      error?: { message?: string };
      response?: unknown;
    };
    if (!res.ok) {
      throw new Error(data.error?.message ?? `Veo poll failed (${res.status})`);
    }
    if (data.done) {
      if (data.error) throw new Error(data.error.message ?? "Veo operation failed");
      return data.response ?? data;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("Google Veo timed out (3 min). Try again or use Pexels.");
}

function collectVideoRefs(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRefs(item, out);
    return out;
  }
  const o = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") {
      if (k === "uri" || k === "fileUri" || k === "name" || k === "videoUri") {
        if (v.includes("files/") || v.endsWith(".mp4")) out.push(v);
      }
    } else {
      collectVideoRefs(v, out);
    }
  }
  return out;
}

function normalizeFileRef(ref: string): string {
  const m = ref.match(/files\/[A-Za-z0-9_-]+/);
  if (m) return m[0]!;
  return ref.replace(/^https?:\/\/[^/]+\/v1beta\//, "");
}

async function downloadGeminiVideoFile(apiKey: string, fileRef: string): Promise<Buffer> {
  const filePath = normalizeFileRef(fileRef);
  const urls = [
    `${GEMINI_BASE}/${filePath}:download?alt=media&key=${encodeURIComponent(apiKey)}`,
    `${GEMINI_BASE}/${filePath}?alt=media&key=${encodeURIComponent(apiKey)}`,
  ];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10_000) return buf;
  }
  throw new Error("Could not download Veo video file from Gemini");
}

function cacheFilenameForPrompt(prompt: string): string {
  const hash = createHash("sha256").update(prompt).digest("hex").slice(0, 16);
  return `veo-${hash}.mp4`;
}

/**
 * Veo downloads often have moov after mdat — move it upfront and drop audio
 * (hook preview is muted). Makes `<video>` + blob playback reliable in browsers.
 */
export function optimizeVeoMp4ForWeb(filePath: string): void {
  const tmp = `${filePath}.web.mp4`;
  try {
    const result = spawnSync(
      "ffmpeg",
      ["-y", "-i", filePath, "-c:v", "copy", "-an", "-movflags", "+faststart", tmp],
      { stdio: "pipe" },
    );
    if (result.status !== 0 || !existsSync(tmp)) return;
    renameSync(tmp, filePath);
  } catch {
    if (existsSync(tmp)) {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}

/** One-time upgrade for legacy cache entries saved before web remux. */
export function ensureVeoMp4WebReady(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const fd = openSync(filePath, "r");
    const head = Buffer.alloc(65536);
    const n = readSync(fd, head, 0, head.length, 0);
    closeSync(fd);
    const slice = head.subarray(0, n);
    if (slice.includes(Buffer.from("moov"))) return;
    if (slice.includes(Buffer.from("mdat"))) {
      optimizeVeoMp4ForWeb(filePath);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Generate one portrait clip for a hook scenario. Returns public API path or null.
 */
export async function generateGoogleVeoFootage(
  apiKey: string,
  scenario: string,
  seriesContext: string,
): Promise<string | null> {
  const prompt = buildVeoPrompt(scenario, seriesContext);
  const filename = cacheFilenameForPrompt(prompt);
  const cached = join(veoCacheDir(), filename);
  if (existsSync(cached)) {
    return veoFootagePublicUrl(filename);
  }

  const models = veoModelCandidates();

  let lastErr: Error | null = null;
  for (const model of models) {
    try {
      const opName = await startVeoJob(apiKey, prompt, model);
      const response = await pollVeoOperation(apiKey, opName);
      const refs = collectVideoRefs(response);
      if (refs.length === 0) {
        throw new Error("Veo finished but returned no video file");
      }
      const bytes = await downloadGeminiVideoFile(apiKey, refs[0]!);
      writeFileSync(cached, bytes);
      optimizeVeoMp4ForWeb(cached);
      return veoFootagePublicUrl(filename);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message.toLowerCase();
      if (msg.includes("not found") || msg.includes("not supported")) continue;
      throw lastErr;
    }
  }
  if (lastErr) throw lastErr;
  return null;
}
