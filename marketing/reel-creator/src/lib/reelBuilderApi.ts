/** Client for isolated `/api/reel-builder/*` (OpenAI translate + TTS). Never hits Soniox. */

function apiHeaders(): HeadersInit {
  const key = import.meta.env.VITE_REEL_BUILDER_API_KEY as string | undefined;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (key) h["x-reel-builder-key"] = key;
  return h;
}

export type TranslateResult = {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions: string;
  outroLine1: string;
  outroLine2: string;
  targetLanguage: string;
};

export async function translateReelScript(body: {
  targetLanguage: string;
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions?: string;
}): Promise<TranslateResult> {
  const res = await fetch("/api/reel-builder/translate", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Translate failed (${res.status})`);
  }
  return res.json() as Promise<TranslateResult>;
}

export async function synthesizeVoiceover(
  text: string,
  voice: string,
  speed = 1,
): Promise<Blob> {
  const res = await fetch("/api/reel-builder/tts", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ text, voice, speed }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `TTS failed (${res.status})`);
  }
  return res.blob();
}

export type VoiceoverPack = {
  hook: Blob;
  problem: Blob;
  solution: Blob;
  result: Blob;
  outro?: Blob;
};

export async function generateSegmentVoiceovers(
  texts: { hook: string; problem: string; solution: string; result: string; outro?: string },
  voice: string,
  speed = 1,
  onProgress?: (label: string) => void,
): Promise<VoiceoverPack> {
  const run = async (label: string, text: string) => {
    onProgress?.(label);
    if (!text.trim()) return new Blob([], { type: "audio/mpeg" });
    return synthesizeVoiceover(text, voice, speed);
  };
  const hook = await run("hook", texts.hook);
  const problem = await run("problem", texts.problem);
  const solution = await run("solution", texts.solution);
  const result = await run("result", texts.result);
  const outro = texts.outro ? await run("outro", texts.outro) : undefined;
  return { hook, problem, solution, result, outro };
}

/** Decode blob duration in seconds (0 if empty/undecodable). */
export async function measureBlobDuration(blob: Blob | undefined | null): Promise<number> {
  if (!blob || blob.size === 0) return 0;
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const d = buf.duration;
    void ctx.close();
    return d;
  } catch {
    return 0;
  }
}
