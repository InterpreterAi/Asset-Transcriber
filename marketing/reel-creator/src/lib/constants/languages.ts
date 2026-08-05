/** 62 target languages + audio/voice catalogs for Reel Creator (marketing only). */

export type ReelLanguage = {
  readonly code: string;
  readonly label: string;
};

export {
  DEFAULT_OUTRO_SLOGAN,
  defaultOutroVoiceText,
  lockedOutroVoiceText,
  UNIVERSAL_OUTRO_EN,
  BRAND_LOCKED,
} from "@/lib/universalBrandOutro";

export const REEL_LANGUAGES: readonly ReelLanguage[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh-CN", label: "Mandarin" },
  { code: "zh-TW", label: "Cantonese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "hi", label: "Hindi" },
  { code: "vi", label: "Vietnamese" },
  { code: "tl", label: "Tagalog" },
  { code: "th", label: "Thai" },
  { code: "uk", label: "Ukrainian" },
  { code: "el", label: "Greek" },
  { code: "he", label: "Hebrew" },
  { code: "id", label: "Indonesian" },
  { code: "ms", label: "Malay" },
  { code: "hu", label: "Hungarian" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "sv", label: "Swedish" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "nb", label: "Norwegian" },
  { code: "sw", label: "Swahili" },
  { code: "am", label: "Amharic" },
  { code: "bn", label: "Bengali" },
  { code: "gu", label: "Gujarati" },
  { code: "pa", label: "Punjabi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "mr", label: "Marathi" },
  { code: "ur", label: "Urdu" },
  { code: "fa", label: "Persian" },
  { code: "ps", label: "Pashto" },
  { code: "ku", label: "Kurdish" },
  { code: "sk", label: "Slovak" },
  { code: "bg", label: "Bulgarian" },
  { code: "hr", label: "Croatian" },
  { code: "sr", label: "Serbian" },
  { code: "sl", label: "Slovenian" },
  { code: "lt", label: "Lithuanian" },
  { code: "lv", label: "Latvian" },
  { code: "et", label: "Estonian" },
  { code: "is", label: "Icelandic" },
  { code: "sq", label: "Albanian" },
  { code: "mk", label: "Macedonian" },
  { code: "ga", label: "Irish" },
  { code: "cy", label: "Welsh" },
  { code: "mt", label: "Maltese" },
  { code: "ca", label: "Catalan" },
  { code: "eu", label: "Basque" },
  { code: "gl", label: "Galician" },
] as const;

export const REEL_LANGUAGE_COUNT = REEL_LANGUAGES.length;

const RTL_CODES = new Set(["ar", "he", "ur", "fa", "ps", "ku"]);

export function isRtlLanguage(code: string): boolean {
  return RTL_CODES.has(code);
}

export function reelLanguageLabel(code: string): string {
  return REEL_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Premier ElevenLabs commercial voices (mapped server-side to voice_id). */
export type VoiceActorId = "adam" | "rachel" | "antoni" | "josh" | "bella";

export const VOICE_ACTORS: readonly {
  id: VoiceActorId;
  label: string;
  elevenLabsId: string;
}[] = [
  {
    id: "adam",
    label: "Adam — Deep, Professional Commercial (Male)",
    elevenLabsId: "pNInz6obpgDQGcFmaJgB",
  },
  {
    id: "rachel",
    label: "Rachel — Energetic Tech & Brand (Female)",
    elevenLabsId: "21m00Tcm4TlvDq8ikWAM",
  },
  {
    id: "antoni",
    label: "Antoni — Natural Tech Presenter (Male)",
    elevenLabsId: "ErXwobaYiN019PkySvjV",
  },
  {
    id: "josh",
    label: "Josh — Deep Hype Commercial (Male)",
    elevenLabsId: "TxGEqnHWrfWFTfGW9XjX",
  },
  {
    id: "bella",
    label: "Bella — Smooth Conversational (Female)",
    elevenLabsId: "EXAVITQu4vr4xnSDxMaL",
  },
] as const;

const LEGACY_VOICE_MAP: Record<string, VoiceActorId> = {
  onyx: "adam",
  nova: "rachel",
  alloy: "antoni",
  echo: "antoni",
  fable: "josh",
  shimmer: "bella",
};

export function normalizeVoiceActorId(raw: unknown): VoiceActorId {
  if (typeof raw === "string") {
    if (VOICE_ACTORS.some((v) => v.id === raw)) return raw as VoiceActorId;
    if (raw in LEGACY_VOICE_MAP) return LEGACY_VOICE_MAP[raw]!;
  }
  return "rachel";
}

export type VoiceSpeedId = "1" | "1.15" | "1.25";

export const VOICE_SPEEDS: readonly { id: VoiceSpeedId; label: string; value: number }[] = [
  { id: "1", label: "1.0× Natural", value: 1 },
  { id: "1.15", label: "1.15× Punchy", value: 1.15 },
  { id: "1.25", label: "1.25× Energetic", value: 1.25 },
] as const;

export type MusicCategoryId =
  | "apple_minimal"
  | "stripe_cyber"
  | "nike_energy"
  | "tiktok_viral"
  | "corporate_cinematic"
  | "medical_vertical"
  | "none";

export const MUSIC_CATEGORIES: readonly { id: MusicCategoryId; label: string }[] = [
  { id: "apple_minimal", label: "Apple / Minimal Tech" },
  { id: "stripe_cyber", label: "Stripe / Cyber Pulse" },
  { id: "nike_energy", label: "Nike / High Energy" },
  { id: "tiktok_viral", label: "TikTok / Viral Reel Beats" },
  { id: "corporate_cinematic", label: "Corporate / Cinematic Drama" },
  { id: "medical_vertical", label: "Medical / Vertical" },
  { id: "none", label: "No Music" },
] as const;

export type MusicBedId =
  | "saas_tech_driving"
  | "cinematic_cyber"
  | "deep_corporate"
  | "modern_minimal_trap"
  | "upbeat_innovation"
  | "apple_minimal_tech"
  | "stripe_futuristic_beat"
  | "urgent_er_alarm"
  | "dramatic_legal_synth"
  | "high_energy_hype"
  | "subtle_ambient"
  | "nike_drive_pulse"
  | "viral_trend_beat"
  | "corporate_trailer_swell"
  | "none";

export type MusicBed = {
  id: MusicBedId;
  label: string;
  category: MusicCategoryId;
  file: string | null;
};

export const MUSIC_BEDS: readonly MusicBed[] = [
  { id: "apple_minimal_tech", label: "Apple Minimal Pulse", category: "apple_minimal", file: "/audio/music/apple_minimal_tech.wav" },
  { id: "subtle_ambient", label: "Subtle Ambient Tech", category: "apple_minimal", file: "/audio/music/subtle_ambient.wav" },
  { id: "modern_minimal_trap", label: "Modern Minimal Trap", category: "apple_minimal", file: "/audio/music/modern_minimal_trap.wav" },
  { id: "stripe_futuristic_beat", label: "Stripe Electro Ambient", category: "stripe_cyber", file: "/audio/music/stripe_futuristic_beat.wav" },
  { id: "cinematic_cyber", label: "Cinematic Cyber Tension", category: "stripe_cyber", file: "/audio/music/cinematic_cyber.wav" },
  { id: "saas_tech_driving", label: "SaaS Tech Driving Pulse", category: "stripe_cyber", file: "/audio/music/saas_tech_driving.wav" },
  { id: "nike_drive_pulse", label: "Nike Drive Pulse", category: "nike_energy", file: "/audio/music/nike_drive_pulse.wav" },
  { id: "upbeat_innovation", label: "Upbeat Innovation", category: "nike_energy", file: "/audio/music/upbeat_innovation.wav" },
  { id: "high_energy_hype", label: "Viral TikTok/Reel Hype", category: "tiktok_viral", file: "/audio/music/high_energy_hype.wav" },
  { id: "viral_trend_beat", label: "Viral Trend Beat", category: "tiktok_viral", file: "/audio/music/viral_trend_beat.wav" },
  { id: "deep_corporate", label: "Deep Corporate Ambient", category: "corporate_cinematic", file: "/audio/music/deep_corporate.wav" },
  { id: "dramatic_legal_synth", label: "Legal Studio Ambient", category: "corporate_cinematic", file: "/audio/music/dramatic_legal_synth.wav" },
  { id: "corporate_trailer_swell", label: "Corporate Trailer Swell", category: "corporate_cinematic", file: "/audio/music/corporate_trailer_swell.wav" },
  { id: "urgent_er_alarm", label: "Medical ER Pulse", category: "medical_vertical", file: "/audio/music/urgent_er_alarm.wav" },
  { id: "none", label: "No background music", category: "none", file: null },
] as const;

export function musicBedsByCategory(): { category: (typeof MUSIC_CATEGORIES)[number]; beds: MusicBed[] }[] {
  return MUSIC_CATEGORIES.map((category) => ({
    category,
    beds: MUSIC_BEDS.filter((b) => b.category === category.id) as MusicBed[],
  })).filter((g) => g.beds.length > 0);
}

export type BrandToneId =
  | "minimal_chime"
  | "deep_thud"
  | "futuristic_swoosh"
  | "corporate_glass_chime"
  | "apple_synth_rise"
  | "subtle_woosh"
  | "pulsing_bass_hit"
  | "minimal_bell"
  | "soft_click_confirm"
  | "airy_shimmer"
  | "brand_whoosh_down"
  | "crisp_notification"
  | "cinematic_hit"
  | "digital_blip"
  | "warm_pad_sting"
  | "none";

export type BrandTone = {
  id: BrandToneId;
  label: string;
  file: string | null;
};

export const BRAND_TONES: readonly BrandTone[] = [
  { id: "minimal_chime", label: "Minimal Tech Chime", file: "/audio/music/brand_minimal_chime.wav" },
  { id: "corporate_glass_chime", label: "Corporate Glass Chime", file: "/audio/music/brand_corporate_glass_chime.wav" },
  { id: "apple_synth_rise", label: "Apple Synth Rise", file: "/audio/music/brand_apple_synth_rise.wav" },
  { id: "minimal_bell", label: "Minimal Bell", file: "/audio/music/brand_minimal_bell.wav" },
  { id: "airy_shimmer", label: "Airy Shimmer", file: "/audio/music/brand_airy_shimmer.wav" },
  { id: "soft_click_confirm", label: "Soft Click Confirm", file: "/audio/music/brand_soft_click_confirm.wav" },
  { id: "crisp_notification", label: "Crisp Notification", file: "/audio/music/brand_crisp_notification.wav" },
  { id: "digital_blip", label: "Digital Blip", file: "/audio/music/brand_digital_blip.wav" },
  { id: "subtle_woosh", label: "Subtle Woosh", file: "/audio/music/brand_subtle_woosh.wav" },
  { id: "futuristic_swoosh", label: "Futuristic Swoosh", file: "/audio/music/brand_futuristic_swoosh.wav" },
  { id: "brand_whoosh_down", label: "Brand Whoosh Down", file: "/audio/music/brand_whoosh_down.wav" },
  { id: "deep_thud", label: "Deep Bass Thud", file: "/audio/music/brand_deep_thud.wav" },
  { id: "pulsing_bass_hit", label: "Pulsing Bass Hit", file: "/audio/music/brand_pulsing_bass_hit.wav" },
  { id: "cinematic_hit", label: "Cinematic Hit", file: "/audio/music/brand_cinematic_hit.wav" },
  { id: "warm_pad_sting", label: "Warm Pad Sting", file: "/audio/music/brand_warm_pad_sting.wav" },
  { id: "none", label: "No Brand Tone", file: null },
] as const;

export const ALL_MUSIC_BED_IDS = MUSIC_BEDS.map((m) => m.id) as MusicBedId[];
export const ALL_BRAND_TONE_IDS = BRAND_TONES.map((t) => t.id) as BrandToneId[];

/** @deprecated prefer BRAND_TONES */
export const BRAND_STING_URL = "/audio/music/brand_minimal_chime.wav";

export type ProblemVisual = "stock_broll" | "none";
export type SolutionVisual = "workspace_demo" | "none";
