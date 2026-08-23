/**
 * Saved brand outro presets — full canonical config in localStorage.
 */

import type { TimedWord } from "@/lib/kineticCaptions";
import {
  defaultOutroLayerDocument,
  migrateOutroLayerDocument,
  syncLayerTextFromCopy,
  type OutroLayerDocument,
} from "@/lib/outroLayerLayout";
import {
  buildCanonicalOutroVoiceover,
  buildStudioOutroCopy,
  normalizeOutroVoiceover,
  UNIVERSAL_OUTRO_EN,
  type UniversalOutroCopy,
} from "@/lib/universalBrandOutro";
import {
  buildOutroPhraseTimings,
  buildOutroVoiceoverFromPhrases,
  estimateOutroVoDurationSec,
  normalizeOutroPhraseMuted,
  normalizeOutroVoPhrases,
  outroSpokenPhrases,
  type OutroPhraseTiming,
} from "@/lib/outroVoPacing";

export const SAVED_OUTRO_PRESETS_KEY = "interpreterai_saved_outro_presets";
export const PENDING_OUTRO_PRESET_KEY = "interpreterai_pending_outro_preset_id";

/** Default outro applied to every new Creative Studio commercial. */
export const DEFAULT_STUDIO_OUTRO_PRESET_NAME = "Outro 8/9/2026";

const MAX_PRESETS = 32;

export type SavedOutroPresetFields = {
  outroLine1: string;
  outroLine2: string;
  outroCtaHeadline: string;
  outroLanguagesLine: string;
  outroVoiceover: string;
  outroVoPhrases?: string[];
  outroPhraseMuted?: boolean[];
  outroPhraseGapSec: number;
  outroMinHoldSec: number;
  outroDurationSec: number;
  outroLayout: OutroLayerDocument;
  outroCopyEn: UniversalOutroCopy;
  outroPhraseTimings?: OutroPhraseTiming[];
  outroWords?: TimedWord[];
};

export type SavedOutroPreset = SavedOutroPresetFields & {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

function defaultCanonicalVoiceover(): string {
  return buildCanonicalOutroVoiceover();
}

function canonicalOutroFields(): SavedOutroPresetFields {
  const voiceover = defaultCanonicalVoiceover();
  const copy = buildStudioOutroCopy({
    line1: UNIVERSAL_OUTRO_EN.line1,
    line2: UNIVERSAL_OUTRO_EN.line2,
    ctaHeadline: UNIVERSAL_OUTRO_EN.ctaHeadline,
    languagesLine: UNIVERSAL_OUTRO_EN.languagesLine,
    voiceover,
  });
  return {
    outroLine1: UNIVERSAL_OUTRO_EN.line1,
    outroLine2: UNIVERSAL_OUTRO_EN.line2,
    outroCtaHeadline: UNIVERSAL_OUTRO_EN.ctaHeadline,
    outroLanguagesLine: UNIVERSAL_OUTRO_EN.languagesLine,
    outroVoiceover: voiceover,
    outroVoPhrases: outroSpokenPhrases(voiceover),
    outroPhraseGapSec: 0,
    outroMinHoldSec: 0,
    outroDurationSec: estimateOutroVoDurationSec(voiceover),
    outroLayout: defaultOutroLayerDocument(copy),
    outroCopyEn: copy,
    outroPhraseTimings: buildOutroPhraseTimings(voiceover, []),
  };
}

function normalizePreset(raw: unknown): SavedOutroPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SavedOutroPreset>;
  if (!r.id || !r.name) return null;

  const defaults = canonicalOutroFields();
  const voiceRaw = typeof r.outroVoiceover === "string" ? r.outroVoiceover : defaults.outroVoiceover;
  const voiceover = buildOutroVoiceoverFromPhrases(
    normalizeOutroVoPhrases(
      Array.isArray(r.outroVoPhrases) ? r.outroVoPhrases : undefined,
      normalizeOutroVoiceover(voiceRaw),
    ),
  );

  const copy = buildStudioOutroCopy({
    line1: typeof r.outroLine1 === "string" ? r.outroLine1 : defaults.outroLine1,
    line2: typeof r.outroLine2 === "string" ? r.outroLine2 : defaults.outroLine2,
    ctaHeadline:
      typeof r.outroCtaHeadline === "string" ? r.outroCtaHeadline : defaults.outroCtaHeadline,
    languagesLine:
      typeof r.outroLanguagesLine === "string" ? r.outroLanguagesLine : defaults.outroLanguagesLine,
    voiceover,
  });

  const layout = migrateOutroLayerDocument(
    r.outroLayout ?? syncLayerTextFromCopy(defaultOutroLayerDocument(copy), copy),
  );

  const outroCopyEn =
    r.outroCopyEn && typeof r.outroCopyEn === "object"
      ? (r.outroCopyEn as UniversalOutroCopy)
      : copy;

  const outroWords = Array.isArray(r.outroWords) ? (r.outroWords as TimedWord[]) : undefined;
  const outroPhraseTimings =
    Array.isArray(r.outroPhraseTimings) && r.outroPhraseTimings.length > 0
      ? (r.outroPhraseTimings as OutroPhraseTiming[])
      : buildOutroPhraseTimings(voiceover, outroWords ?? []);

  return {
    id: r.id,
    name: r.name.trim() || "Untitled outro",
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(),
    outroLine1: copy.line1,
    outroLine2: copy.line2,
    outroCtaHeadline: copy.ctaHeadline,
    outroLanguagesLine: copy.languagesLine ?? defaults.outroLanguagesLine,
    outroVoiceover: voiceover,
    outroVoPhrases: normalizeOutroVoPhrases(
      Array.isArray(r.outroVoPhrases) ? r.outroVoPhrases : undefined,
      voiceover,
    ),
    outroPhraseMuted: normalizeOutroPhraseMuted(
      Array.isArray(r.outroPhraseMuted) ? r.outroPhraseMuted : undefined,
    ),
    outroPhraseGapSec:
      typeof r.outroPhraseGapSec === "number" ? r.outroPhraseGapSec : defaults.outroPhraseGapSec,
    outroMinHoldSec: 0,
    outroDurationSec:
      typeof r.outroDurationSec === "number" && r.outroDurationSec > 0
        ? r.outroDurationSec
        : estimateOutroVoDurationSec(voiceover),
    outroLayout: layout,
    outroCopyEn,
    outroPhraseTimings,
    outroWords,
  };
}

export function listSavedOutroPresets(): SavedOutroPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_OUTRO_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizePreset)
      .filter((p): p is SavedOutroPreset => p != null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function writePresets(presets: SavedOutroPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SAVED_OUTRO_PRESETS_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
}

export function getSavedOutroPreset(id: string): SavedOutroPreset | null {
  return listSavedOutroPresets().find((p) => p.id === id) ?? null;
}

export function getSavedOutroPresetByName(name: string): SavedOutroPreset | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return listSavedOutroPresets().find((p) => p.name.trim().toLowerCase() === needle) ?? null;
}

export function captureOutroPresetFields(fields: SavedOutroPresetFields): SavedOutroPresetFields {
  const voiceover = buildOutroVoiceoverFromPhrases(
    normalizeOutroVoPhrases(fields.outroVoPhrases, fields.outroVoiceover),
  );
  const copy = buildStudioOutroCopy({
    line1: fields.outroLine1,
    line2: fields.outroLine2,
    ctaHeadline: fields.outroCtaHeadline,
    languagesLine: fields.outroLanguagesLine,
    voiceover,
  });
  const outroWords = fields.outroWords;
  const outroPhraseTimings =
    fields.outroPhraseTimings && fields.outroPhraseTimings.length > 0
      ? fields.outroPhraseTimings
      : buildOutroPhraseTimings(voiceover, outroWords ?? []);
  return {
    outroLine1: fields.outroLine1,
    outroLine2: fields.outroLine2,
    outroCtaHeadline: fields.outroCtaHeadline,
    outroLanguagesLine: fields.outroLanguagesLine,
    outroVoiceover: voiceover,
    outroVoPhrases: normalizeOutroVoPhrases(fields.outroVoPhrases, voiceover),
    outroPhraseMuted: normalizeOutroPhraseMuted(fields.outroPhraseMuted),
    outroPhraseGapSec: fields.outroPhraseGapSec,
    outroMinHoldSec: 0,
    outroDurationSec: fields.outroDurationSec || estimateOutroVoDurationSec(voiceover),
    outroLayout: migrateOutroLayerDocument(fields.outroLayout),
    outroCopyEn: fields.outroCopyEn ?? copy,
    outroPhraseTimings,
    outroWords,
  };
}

/** Strip preset metadata — safe to merge into a studio draft. */
export function outroFieldsFromPreset(preset: SavedOutroPreset): SavedOutroPresetFields {
  return captureOutroPresetFields(preset);
}

/** Saved “Outro 8/9/2026” when present; otherwise the shipped canonical outro. */
export function resolveDefaultStudioOutroFields(): SavedOutroPresetFields {
  try {
    const saved = getSavedOutroPresetByName(DEFAULT_STUDIO_OUTRO_PRESET_NAME);
    if (saved) return outroFieldsFromPreset(saved);
  } catch (e) {
    console.warn("Default outro preset load failed — using canonical outro", e);
  }
  return canonicalOutroFields();
}

export function saveOutroPreset(
  name: string,
  fields: SavedOutroPresetFields,
  existingId?: string,
): SavedOutroPreset {
  const trimmed = name.trim() || "Untitled outro";
  const normalized = captureOutroPresetFields(fields);
  const now = Date.now();
  const presets = listSavedOutroPresets();
  const idx = existingId ? presets.findIndex((p) => p.id === existingId) : -1;

  if (idx >= 0) {
    const updated: SavedOutroPreset = {
      ...presets[idx]!,
      ...normalized,
      name: trimmed,
      updatedAt: now,
    };
    presets[idx] = updated;
    writePresets(presets);
    return updated;
  }

  const created: SavedOutroPreset = {
    id: `outro-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
    ...normalized,
  };
  writePresets([created, ...presets]);
  return created;
}

export function deleteSavedOutroPreset(id: string): void {
  writePresets(listSavedOutroPresets().filter((p) => p.id !== id));
}

export function duplicateSavedOutroPreset(id: string, newName?: string): SavedOutroPreset | null {
  const source = getSavedOutroPreset(id);
  if (!source) return null;
  return saveOutroPreset(newName?.trim() || `${source.name} copy`, source);
}

export function createDefaultOutroPreset(
  name = DEFAULT_STUDIO_OUTRO_PRESET_NAME,
): SavedOutroPreset {
  const existing = getSavedOutroPresetByName(name);
  if (existing) return existing;
  return saveOutroPreset(name, resolveDefaultStudioOutroFields());
}

export function setPendingOutroPreset(id: string): void {
  sessionStorage.setItem(PENDING_OUTRO_PRESET_KEY, id);
}

export function consumePendingOutroPreset(): SavedOutroPreset | null {
  try {
    const id = sessionStorage.getItem(PENDING_OUTRO_PRESET_KEY);
    if (!id) return null;
    sessionStorage.removeItem(PENDING_OUTRO_PRESET_KEY);
    return getSavedOutroPreset(id);
  } catch {
    return null;
  }
}

export function presetSummaryLine(preset: SavedOutroPreset): string {
  const headline = preset.outroLine1.trim() || preset.outroLine2.trim() || "Brand outro";
  return headline.length > 48 ? `${headline.slice(0, 45)}…` : headline;
}
