/** Bundled vertical hook b-roll — checked before remote footage URLs. */
export const LOCAL_HOOK_BROLL = "/media/hook-broll.mp4";

export type HookFootageProvider = "pexels" | "google_veo";

export type HookFootageSource = "local" | "pexels" | "google_veo" | "none";

/** HTTP(S) Pexels URLs or api-server Veo cache paths. */
export function isPlayableFootageUrl(u: string): boolean {
  return u.startsWith("http") || u.startsWith("/api/reel-builder/footage/");
}

/** True only when hook-broll.mp4 is a real video (Vite SPA fallback returns 200 HTML). */
async function localHookBrollAvailable(): Promise<boolean> {
  try {
    const res = await fetch(LOCAL_HOOK_BROLL, { method: "HEAD" });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("application/json")) return false;
    if (ct.includes("video") || ct.includes("octet-stream")) return true;
    const len = Number(res.headers.get("content-length") ?? 0);
    return len > 50_000;
  } catch {
    return false;
  }
}

export function detectFootageSource(
  urls: string[],
  provider?: HookFootageProvider,
): HookFootageSource {
  const playable = urls.filter(isPlayableFootageUrl);
  if (playable.length === 0) return "none";
  if (
    provider === "google_veo" ||
    playable.some((u) => u.includes("/api/reel-builder/footage/veo-"))
  ) {
    return "google_veo";
  }
  return "pexels";
}

/** Prefer local hook-broll.mp4, then server/Pexels/Veo URLs. */
export async function resolveHookFootageUrls(
  remoteUrls: string[],
  provider?: HookFootageProvider,
): Promise<{ urls: string[]; source: HookFootageSource }> {
  if (await localHookBrollAvailable()) {
    return { urls: [LOCAL_HOOK_BROLL], source: "local" };
  }
  const remote = remoteUrls.filter(isPlayableFootageUrl);
  if (remote.length > 0) {
    return { urls: remote, source: detectFootageSource(remote, provider) };
  }
  return { urls: [], source: "none" };
}

export function hookFootageLabel(source: HookFootageSource): string {
  if (source === "local") return "Footage · local b-roll";
  if (source === "pexels") return "Footage · Pexels";
  if (source === "google_veo") return "Footage · Google AI (Veo)";
  return "Footage unavailable — animated fallback";
}

export function hookFootageProviderLabel(provider: HookFootageProvider): string {
  return provider === "google_veo" ? "Google AI (Veo)" : "Pexels";
}

/** User-facing message when Veo/Pexels footage generation fails. */
export function formatFootageProviderError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("prepayment") || lower.includes("credits are depleted")) {
    return "Google Veo prepay credits are empty. In Google AI Studio → your project → Billing, add prepaid credits (Gemini API uses prepay for Veo). Then regenerate.";
  }
  if (lower.includes("quota") || lower.includes("billing") || lower.includes("rate limit")) {
    return "Google Veo billing/quota issue on your Gemini API key. Check Google AI Studio → Billing, or switch to Pexels for instant stock footage.";
  }
  if (lower.includes("timed out")) {
    return "Google Veo timed out — each clip can take 1–3 minutes. Try again or use Pexels.";
  }
  return msg.trim() || "Footage generation failed.";
}
