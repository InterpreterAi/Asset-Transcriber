/**
 * Pexels footage diversity — never reuse video IDs within a reel;
 * alternate visual compositions; distinct search intents per scene.
 */

export type FootageComposition =
  | "close_up_face"
  | "hands_desk"
  | "over_shoulder"
  | "wide_office"
  | "laptop_tech"
  | "speaking"
  | "listening"
  | "environment";

export type FootageSelectionStatus = "ok" | "footage_needed" | "product_recording";

export type PexelsVideoFile = {
  link?: string;
  width?: number;
  height?: number;
  file_type?: string;
  quality?: string;
};

export type PexelsVideo = {
  id?: number;
  duration?: number;
  video_files?: PexelsVideoFile[];
  url?: string;
};

export type FootageSceneMetadata = {
  sceneId: string;
  footageType: "pexels" | "product_recording" | "none";
  searchQueries: string[];
  pexelsVideoId?: number;
  sourceUrl?: string;
  composition?: FootageComposition;
  stockDurationSec?: number;
  status: FootageSelectionStatus;
};

export type FootageDiversityContext = {
  usedPexelsIds: Set<number>;
  usedSourceUrls: Set<string>;
  lastComposition?: FootageComposition;
  sceneIndex: number;
};

const COMPOSITION_ROTATION: FootageComposition[] = [
  "close_up_face",
  "hands_desk",
  "over_shoulder",
  "wide_office",
  "laptop_tech",
  "speaking",
  "listening",
  "environment",
];

const COMPOSITION_HINTS: Record<FootageComposition, string> = {
  close_up_face: "close-up face portrait vertical 9:16",
  hands_desk: "hands typing desk notes vertical smartphone",
  over_shoulder: "over the shoulder laptop screen vertical",
  wide_office: "wide office professional environment vertical b-roll",
  laptop_tech: "laptop technology screen vertical cinematic",
  speaking: "person speaking video call vertical portrait",
  listening: "person listening attentively headset vertical",
  environment: "office corridor ambient environmental vertical b-roll",
};

const COMPOSITION_KEYWORDS: Array<{ composition: FootageComposition; pattern: RegExp }> = [
  { composition: "close_up_face", pattern: /\b(close[- ]?up|face|portrait|headshot)\b/i },
  { composition: "hands_desk", pattern: /\b(hands?|typing|notes|desk|keyboard|writing)\b/i },
  { composition: "over_shoulder", pattern: /\b(over[- ]?the[- ]?shoulder|shoulder|behind)\b/i },
  { composition: "wide_office", pattern: /\b(wide|office|corridor|room|environment)\b/i },
  { composition: "laptop_tech", pattern: /\b(laptop|screen|technology|monitor|computer)\b/i },
  { composition: "speaking", pattern: /\b(speaking|talking|presenting|explaining)\b/i },
  { composition: "listening", pattern: /\b(listening|attentive|hearing|focused)\b/i },
  { composition: "environment", pattern: /\b(ambient|establishing|b-roll|background)\b/i },
];

const PRODUCT_RECORDING_MARKERS =
  /\bPRODUCT_SCREEN_RECORDING\b|\bproduct screen recording\b|\breal workspace footage\b|\binterpreterai workspace\b|\buse the real workspace\b/i;

const SERIES_CONTEXT: Record<string, string> = {
  medical: "hospital clinic healthcare",
  legal: "courtroom legal attorney deposition",
  conference: "business conference keynote",
  immigration: "immigration office interview documents",
  education: "classroom teacher student campus",
};

export function isProductScreenRecording(scenario: string): boolean {
  return PRODUCT_RECORDING_MARKERS.test(scenario);
}

/** Strip product-recording directives — stock query is the remainder. */
export function extractStockQueryFromScenario(scenario: string): string {
  return scenario
    .replace(/PRODUCT_SCREEN_RECORDING/gi, "")
    .replace(/\buse (the )?real workspace footage\b/gi, "")
    .replace(/\binterpreterai workspace\b/gi, "")
    .replace(/\bpexels only for[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferComposition(scenario: string): FootageComposition {
  for (const { composition, pattern } of COMPOSITION_KEYWORDS) {
    if (pattern.test(scenario)) return composition;
  }
  return "speaking";
}

export function pickAlternateComposition(
  preferred: FootageComposition,
  last?: FootageComposition,
): FootageComposition {
  if (!last || preferred !== last) return preferred;
  const idx = COMPOSITION_ROTATION.indexOf(preferred);
  const next = COMPOSITION_ROTATION[(idx + 1) % COMPOSITION_ROTATION.length]!;
  return next === last
    ? COMPOSITION_ROTATION[(idx + 2) % COMPOSITION_ROTATION.length]!
    : next;
}

export function createFootageDiversityContext(): FootageDiversityContext {
  return {
    usedPexelsIds: new Set(),
    usedSourceUrls: new Set(),
    sceneIndex: 0,
  };
}

/** Build several distinct Pexels search intents for one scene. */
export function buildSearchQueryVariants(
  scenario: string,
  clipIndex: number,
  series: string,
  targetComposition: FootageComposition,
): string[] {
  const stockQuery = extractStockQueryFromScenario(scenario) || scenario.trim();
  const ctx = SERIES_CONTEXT[series] ?? "professional office business";
  const hint = COMPOSITION_HINTS[targetComposition];
  const variants = [
    `${stockQuery} ${hint} vertical portrait 9:16 cinematic`,
    `${hint} ${stockQuery} vertical 9:16`,
    `${stockQuery} vertical portrait 9:16 ${ctx}`,
    `${hint} ${ctx} vertical smartphone b-roll`,
    `vertical portrait 9:16 ${stockQuery}`,
  ];
  const seen = new Set<string>();
  return variants.filter((q) => {
    const key = q.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linkLooksUhd(link: string): boolean {
  return /uhd_|2160_4096|4096/i.test(link);
}

function linkLooksHdPortrait(link: string): boolean {
  return /hd_1080_1920|1080_1920/i.test(link);
}

function bestFileForVideo(video: PexelsVideo): { link: string; score: number } | null {
  let best: { link: string; score: number } | null = null;
  for (const f of video.video_files ?? []) {
    if (typeof f.link !== "string" || !(f.file_type ?? "").includes("mp4")) continue;
    if (linkLooksUhd(f.link)) continue;
    const w = f.width ?? 0;
    const h = f.height ?? 0;
    if (h <= w || h > 1920) continue;
    let score = h;
    if (w === 1080 && h === 1920) score += 5000;
    if (linkLooksHdPortrait(f.link)) score += 2000;
    if (w <= 720) score -= 500;
    if (!best || score > best.score) best = { link: f.link, score };
  }
  return best;
}

function compositionDistance(a: FootageComposition, b?: FootageComposition): number {
  if (!b) return 10;
  if (a === b) return 0;
  const ia = COMPOSITION_ROTATION.indexOf(a);
  const ib = COMPOSITION_ROTATION.indexOf(b);
  return Math.abs(ia - ib);
}

export type PexelsCandidate = {
  videoId: number;
  link: string;
  composition: FootageComposition;
  score: number;
  stockDurationSec?: number;
};

/** Rank Pexels results — exclude used IDs/URLs; prefer composition diversity. */
export function rankPexelsCandidates(
  videos: PexelsVideo[],
  ctx: FootageDiversityContext,
  targetComposition: FootageComposition,
  scenario: string,
  minDurationSec = 0,
): PexelsCandidate[] {
  const candidates: PexelsCandidate[] = [];
  const scenarioLower = scenario.toLowerCase();
  const minDur = Math.max(0, minDurationSec);

  for (const video of videos) {
    const stockDurationSec =
      typeof video.duration === "number" && video.duration > 0 ? video.duration : undefined;
    if (stockDurationSec != null && stockDurationSec > 25) continue;
    const videoId = typeof video.id === "number" ? video.id : undefined;
    if (videoId != null && ctx.usedPexelsIds.has(videoId)) continue;

    const file = bestFileForVideo(video);
    if (!file) continue;
    if (ctx.usedSourceUrls.has(file.link)) continue;

    const inferred = inferComposition(scenario);
    let score = file.score;
    score += compositionDistance(inferred, ctx.lastComposition) * 400;
    score += compositionDistance(targetComposition, ctx.lastComposition) * 600;
    if (inferred === targetComposition) score += 800;

    if (minDur > 0 && stockDurationSec != null) {
      if (stockDurationSec >= minDur) {
        score += 2500 + Math.min(800, (stockDurationSec - minDur) * 120);
      } else {
        score -= 1800 + (minDur - stockDurationSec) * 220;
      }
    } else if (stockDurationSec != null) {
      score += Math.min(600, stockDurationSec * 40);
    }

    // Light relevance boost from scenario keywords in video url/id (proxy for tags)
    const urlHint = `${video.url ?? ""} ${videoId ?? ""}`.toLowerCase();
    for (const word of scenarioLower.split(/\s+/).filter((w) => w.length > 4).slice(0, 6)) {
      if (urlHint.includes(word)) score += 50;
    }

    candidates.push({
      videoId: videoId ?? hashLinkToId(file.link),
      link: file.link,
      composition: inferred,
      score,
      stockDurationSec,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function hashLinkToId(link: string): number {
  let h = 0;
  for (let i = 0; i < link.length; i++) h = (h * 31 + link.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function markCandidateUsed(ctx: FootageDiversityContext, candidate: PexelsCandidate): void {
  ctx.usedPexelsIds.add(candidate.videoId);
  ctx.usedSourceUrls.add(candidate.link);
  ctx.lastComposition = candidate.composition;
  ctx.sceneIndex += 1;
}

export function pickBestUnusedCandidate(
  videos: PexelsVideo[],
  ctx: FootageDiversityContext,
  scenario: string,
  minDurationSec = 0,
): PexelsCandidate | null {
  const preferred = inferComposition(scenario);
  const target = pickAlternateComposition(preferred, ctx.lastComposition);
  const ranked = rankPexelsCandidates(videos, ctx, target, scenario, minDurationSec);
  if (minDurationSec > 0) {
    const longEnough = ranked.find(
      (c) => c.stockDurationSec == null || c.stockDurationSec >= minDurationSec * 0.92,
    );
    if (longEnough) return longEnough;
  }
  return ranked[0] ?? null;
}
