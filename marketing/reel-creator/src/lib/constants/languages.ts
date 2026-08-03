/** 62 target languages for Reel Creator localization (marketing tool only). */

export type ReelLanguage = {
  readonly code: string;
  readonly label: string;
};

/** Canonical English outro slogan (line1 / line2). */
export const DEFAULT_OUTRO_SLOGAN = {
  line1: "Stay focused on the conversation.",
  line2: "We'll handle the words.",
} as const;

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

export type VoiceActorId = "onyx" | "nova" | "alloy" | "echo";

export const VOICE_ACTORS: readonly { id: VoiceActorId; label: string }[] = [
  { id: "onyx", label: "Onyx — Deep / Professional (Male)" },
  { id: "nova", label: "Nova — Warm / Energetic (Female)" },
  { id: "alloy", label: "Alloy — Balanced / Neutral" },
  { id: "echo", label: "Echo — Smooth / Clear" },
] as const;

export type MusicBedId =
  | "subtle_ambient"
  | "medical_urgency"
  | "legal_calm"
  | "conference_pulse"
  | "hopeful_growth"
  | "none";

export const MUSIC_BEDS: readonly { id: MusicBedId; label: string; file: string | null }[] = [
  { id: "subtle_ambient", label: "Subtle Ambient Tech", file: "/audio/music/subtle_ambient.wav" },
  { id: "medical_urgency", label: "Medical Urgency", file: "/audio/music/medical_urgency.wav" },
  { id: "legal_calm", label: "Legal Calm", file: "/audio/music/legal_calm.wav" },
  { id: "conference_pulse", label: "Conference Pulse", file: "/audio/music/conference_pulse.wav" },
  { id: "hopeful_growth", label: "Hopeful Growth", file: "/audio/music/hopeful_growth.wav" },
  { id: "none", label: "No background music", file: null },
] as const;

/** Short sonic logo played when InterpreterAI branding appears (intro / outro). */
export const BRAND_STING_URL = "/audio/music/brand_sting.wav";

export type ProblemVisual = "stock_broll" | "none";
export type SolutionVisual = "workspace_demo" | "none";
