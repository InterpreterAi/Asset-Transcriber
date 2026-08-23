/**
 * ElevenLabs voice delivery presets — maps named acting styles to voice_settings.
 * Same preset applies to every exchange for that speaker (A / B / C).
 */

export type WorkspaceDeliveryPresetId =
  | "professional"
  | "hesitant_lep"
  | "neutral"
  | "energetic"
  | "calm"
  | "sarcastic"
  | "terrified"
  | "weak_ill"
  | "angry"
  | "warm"
  | "authoritative"
  | "whisper"
  | "excited"
  | "storytelling"
  | "confident"
  | "monotone"
  | "dramatic";

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
};

export type WorkspaceDeliveryPreset = {
  id: WorkspaceDeliveryPresetId;
  label: string;
  hint: string;
  settings: ElevenLabsVoiceSettings;
};

/** @deprecated Legacy A/B/C — mapped to presets for backward compat. */
export type LegacyWorkspaceDelivery = "A" | "B" | "C" | "default";

export const WORKSPACE_DELIVERY_PRESETS: readonly WorkspaceDeliveryPreset[] = [
  {
    id: "professional",
    label: "Professional",
    hint: "Clear US professional — doctor, lawyer, staff",
    settings: { stability: 0.58, similarity_boost: 0.84, style: 0.08, use_speaker_boost: true },
  },
  {
    id: "hesitant_lep",
    label: "Hesitant / searching",
    hint: "LEP speaker — slower, less polished, natural pauses",
    settings: { stability: 0.26, similarity_boost: 0.72, style: 0.48, use_speaker_boost: true },
  },
  {
    id: "neutral",
    label: "Neutral",
    hint: "Balanced everyday delivery",
    settings: { stability: 0.45, similarity_boost: 0.78, style: 0.22, use_speaker_boost: true },
  },
  {
    id: "energetic",
    label: "Energetic",
    hint: "Upbeat, fast-paced, high engagement",
    settings: { stability: 0.35, similarity_boost: 0.8, style: 0.72, use_speaker_boost: true },
  },
  {
    id: "excited",
    label: "Excited",
    hint: "Enthusiastic, animated pitch",
    settings: { stability: 0.28, similarity_boost: 0.76, style: 0.85, use_speaker_boost: true },
  },
  {
    id: "calm",
    label: "Calm",
    hint: "Soft, steady, reassuring",
    settings: { stability: 0.72, similarity_boost: 0.82, style: 0.06, use_speaker_boost: true },
  },
  {
    id: "warm",
    label: "Warm / friendly",
    hint: "Approachable, caring tone",
    settings: { stability: 0.52, similarity_boost: 0.8, style: 0.32, use_speaker_boost: true },
  },
  {
    id: "authoritative",
    label: "Authoritative",
    hint: "Commanding, decisive",
    settings: { stability: 0.68, similarity_boost: 0.88, style: 0.12, use_speaker_boost: true },
  },
  {
    id: "confident",
    label: "Confident",
    hint: "Assured presenter / sales",
    settings: { stability: 0.48, similarity_boost: 0.86, style: 0.38, use_speaker_boost: true },
  },
  {
    id: "storytelling",
    label: "Storytelling",
    hint: "Narrator — expressive arcs",
    settings: { stability: 0.42, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
  },
  {
    id: "sarcastic",
    label: "Sarcastic",
    hint: "Dry, ironic edge",
    settings: { stability: 0.38, similarity_boost: 0.74, style: 0.62, use_speaker_boost: true },
  },
  {
    id: "dramatic",
    label: "Dramatic",
    hint: "Theatrical emphasis",
    settings: { stability: 0.32, similarity_boost: 0.78, style: 0.78, use_speaker_boost: true },
  },
  {
    id: "terrified",
    label: "Terrified / anxious",
    hint: "Fearful patient, shaky urgency",
    settings: { stability: 0.18, similarity_boost: 0.68, style: 0.65, use_speaker_boost: true },
  },
  {
    id: "weak_ill",
    label: "Weak / unwell",
    hint: "Tired, sick, low energy",
    settings: { stability: 0.55, similarity_boost: 0.7, style: 0.42, use_speaker_boost: false },
  },
  {
    id: "angry",
    label: "Angry / frustrated",
    hint: "Irritated, tense",
    settings: { stability: 0.22, similarity_boost: 0.76, style: 0.7, use_speaker_boost: true },
  },
  {
    id: "whisper",
    label: "Whisper / hushed",
    hint: "Quiet, intimate",
    settings: { stability: 0.78, similarity_boost: 0.72, style: 0.18, use_speaker_boost: false },
  },
  {
    id: "monotone",
    label: "Monotone",
    hint: "Flat, minimal expression",
    settings: { stability: 0.82, similarity_boost: 0.88, style: 0.02, use_speaker_boost: true },
  },
] as const;

export const DEFAULT_SPEAKER_A_DELIVERY: WorkspaceDeliveryPresetId = "professional";
export const DEFAULT_SPEAKER_B_DELIVERY: WorkspaceDeliveryPresetId = "hesitant_lep";
export const DEFAULT_THIRD_SPEAKER_DELIVERY: WorkspaceDeliveryPresetId = "professional";

const PRESET_MAP = new Map(WORKSPACE_DELIVERY_PRESETS.map((p) => [p.id, p]));

export function getDeliveryPreset(id: WorkspaceDeliveryPresetId): WorkspaceDeliveryPreset {
  return PRESET_MAP.get(id) ?? PRESET_MAP.get("professional")!;
}

export function normalizeDeliveryPresetId(raw: unknown): WorkspaceDeliveryPresetId {
  if (typeof raw === "string" && PRESET_MAP.has(raw as WorkspaceDeliveryPresetId)) {
    return raw as WorkspaceDeliveryPresetId;
  }
  if (raw === "A") return "professional";
  if (raw === "B") return "hesitant_lep";
  if (raw === "C") return "professional";
  return "professional";
}

export function deliverySettingsForPreset(id: WorkspaceDeliveryPresetId): ElevenLabsVoiceSettings {
  return { ...getDeliveryPreset(id).settings };
}

/** Sample line tuned for workspace delivery preview. */
export const DELIVERY_PREVIEW_LINE =
  "I need help understanding what the doctor said about my medication.";
