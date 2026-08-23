/** ElevenLabs voice slug → voice_id (mirrors marketing/reel-creator voiceActors.ts). */

type VoiceMap = {
  elevenLabsId: string;
  openai: "onyx" | "nova" | "alloy" | "echo" | "fable" | "shimmer";
};

const O = {
  onyx: "onyx",
  nova: "nova",
  alloy: "alloy",
  echo: "echo",
  fable: "fable",
  shimmer: "shimmer",
} as const;

function v(elevenLabsId: string, openai: keyof typeof O = "nova"): VoiceMap {
  return { elevenLabsId, openai: O[openai] };
}

export const ELEVEN_VOICES: Record<string, VoiceMap> = {
  rachel: v("21m00Tcm4TlvDq8ikWAM", "nova"),
  adam: v("pNInz6obpgDQGcFmaJgB", "onyx"),
  aria: v("9BWtsMINqrJLrRacOk9x", "nova"),
  jessica: v("cgSgspJ2msm6clMCkdW9", "nova"),
  laura: v("FGY2WhTYpPnrIDTdsKH5", "nova"),
  freya: v("jsCqWAovK2LkecY7zXl4", "shimmer"),
  mimi: v("zrHiDhphv9ZnVXBqCLjz", "shimmer"),
  nicole: v("piTKgcLEGmPE4e6mEKli", "shimmer"),
  lily: v("pFZP5JQG7iQjIQuC4Bku", "nova"),
  bella: v("EXAVITQu4vr4xnSDxMaL", "shimmer"),
  elli: v("MF3mGyEYCl7XYWbV9V6O", "shimmer"),
  emily: v("LcfcDJNUP1GQjkzn1xUU", "shimmer"),
  dorothy: v("ThT5KcBeYPX3keUQqHPh", "nova"),
  grace: v("oWAxZDx7w5VEj9dCyT07", "shimmer"),
  gigi: v("jBpfuIE2acCO8z3wKNLl", "shimmer"),
  charlotte: v("XB0fDUnXU5powFXDhCwa", "nova"),
  matilda: v("XrExE9yKIg1WjnnlVkGX", "shimmer"),
  liam: v("TX3LPaxmHKxFdv7VOQHJ", "onyx"),
  will: v("bIHbv24MWmeRgasZH58o", "onyx"),
  josh: v("TxGEqnHWrfWFTfGW9XjX", "onyx"),
  brian: v("nPczCjzI2devNBz1zQrb", "onyx"),
  eric: v("cjVigY5qzO86Huf0OWal", "onyx"),
  sam: v("yoZ06aMxZJJ28mfd3POQ", "onyx"),
  jessie: v("t0jbNlBVZ17f02VDIeMI", "onyx"),
  antoni: v("ErXwobaYiN019PkySvjV", "echo"),
  charlie: v("IKne3meq5aSn9XLyUdCD", "onyx"),
  dave: v("CYw3kZ02Hs0563khs1Fj", "onyx"),
  daniel: v("onwK4e9ZLuTAKqWW03F9", "onyx"),
  drew: v("29vD33N1CtxCmqQRPOHJ", "onyx"),
  paul: v("5Q0t7uMcjvnDisy1TS7k", "onyx"),
  bill: v("pqHfZKP75CvOlQylNhV4", "onyx"),
  roger: v("CwhRBWXzGAHq8TQ4Fs17", "onyx"),
  callum: v("N2lVS1w4EtoT3dr4eOWO", "onyx"),
  clyde: v("2EiwWnXFnvU5JabPnv8n", "onyx"),
  fin: v("D38z5RcWu1voky8WS1ja", "onyx"),
  jeremy: v("bVMeCyTHy58xNoL7hTEd", "onyx"),
  harry: v("SOYHLrjzK2X1ezoPC6cr", "onyx"),
  ethan: v("g5qiaLWHcIcBkqLuX640", "onyx"),
  patrick: v("ODq5zmih8GrVes37Dizd", "onyx"),
  james: v("EkK5I93UQWFDigLMpZcX", "onyx"),
  george: v("JBFqnCBsd6RMkjVDRZzb", "onyx"),
  michael: v("flq6f7yk4E4fJM5XTYuZ", "onyx"),
  giovanni: v("zcAOhNBS3c14rBihA8pP", "onyx"),
  river: v("SAWy7570XJyXuSyN6Zq0", "nova"),
  onyx: v("pNInz6obpgDQGcFmaJgB", "onyx"),
  nova: v("21m00Tcm4TlvDq8ikWAM", "nova"),
  alloy: v("ErXwobaYiN019PkySvjV", "alloy"),
  echo: v("ErXwobaYiN019PkySvjV", "echo"),
  fable: v("TxGEqnHWrfWFTfGW9XjX", "fable"),
  shimmer: v("EXAVITQu4vr4xnSDxMaL", "shimmer"),
};

export function parseWorkspaceDelivery(raw: unknown): import("./reel-tts-text.js").WorkspaceTtsDelivery {
  if (typeof raw !== "string" || !raw.trim()) return "default";
  const v = raw.trim();
  const upper = v.toUpperCase();
  if (upper === "A" || upper === "B" || upper === "C") return upper as "A" | "B" | "C";
  return v.toLowerCase() as import("./reel-tts-text.js").WorkspaceTtsDelivery;
}
