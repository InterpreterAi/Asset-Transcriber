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

export async function synthesizeVoiceover(text: string, voice: string): Promise<Blob> {
  const res = await fetch("/api/reel-builder/tts", {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({ text, voice }),
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
  onProgress?: (label: string) => void,
): Promise<VoiceoverPack> {
  const run = async (label: string, text: string) => {
    onProgress?.(label);
    if (!text.trim()) return new Blob([], { type: "audio/mpeg" });
    return synthesizeVoiceover(text, voice);
  };
  const hook = await run("hook", texts.hook);
  const problem = await run("problem", texts.problem);
  const solution = await run("solution", texts.solution);
  const result = await run("result", texts.result);
  const outro = texts.outro ? await run("outro", texts.outro) : undefined;
  return { hook, problem, solution, result, outro };
}
