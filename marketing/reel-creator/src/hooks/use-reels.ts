import { useState, useEffect, useCallback } from 'react';
import {
  ALL_BRAND_TONE_IDS,
  ALL_MUSIC_BED_IDS,
  normalizeVoiceActorId,
  type BrandToneId,
  type MusicBedId,
  type ProblemVisual,
  type SolutionVisual,
  type VoiceActorId,
  type VoiceSpeedId,
} from '@/lib/constants/languages';
import { FINISHED_EXPORTS, finishedExportToReel } from '@/lib/finishedExports';
import type { GeneratedReelResult } from '@/lib/generatedReel';
import type { OutroConfig } from '@/lib/outroConfig';
import type { StudioDraft } from '@/lib/studioDraft';
import { deleteReelMp4, hasReelMp4 } from '@/lib/reelMp4Cache';

export type SeriesType =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'medical' | 'legal' | 'conference' | 'immigration' | 'education';

/** Full generated 35s reel payload + the outro config it was built with. */
export type GeneratedReelSave = GeneratedReelResult & { outroConfig: OutroConfig };

export interface Reel {
  id: string;
  title: string;
  series: SeriesType;
  reelType: string;
  targetLanguage: string;
  voiceActor: VoiceActorId;
  voiceSpeed: VoiceSpeedId;
  musicBed: MusicBedId;
  brandTone: BrandToneId;
  brandStingEnabled: boolean;
  voVolume: number;
  bgmVolume: number;
  brandVolume: number;
  problemVisual: ProblemVisual;
  solutionVisual: SolutionVisual;
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions: string;
  outroLine1: string;
  outroLine2: string;
  /** Groups batch-generated script variations for social scheduling. */
  batchId?: string | null;
  variationIndex?: number;
  scheduleTag?: string;
  /** Creative Studio handoff — script came from AI storyboard, not manual forms. */
  fromStudio?: boolean;
  studioBrief?: string;
  storyboardTitle?: string;
  /** Ready MP4 in public/ — Library shows a Download button. */
  downloadUrl?: string;
  downloadFilename?: string;
  /** MP4 blob stored in IndexedDB — instant library download. */
  mp4Cached?: boolean;
  /** Focused Studio one-prompt reel — storyboard, footage URLs, timed words,
   * hook/outro audio (base64) and outro config, so it replays after reload. */
  generated?: GeneratedReelSave;
  /** Full Creative Studio editor snapshot — hook clips, workspace, outro, VO cache. */
  studioDraft?: StudioDraft;
  createdAt: number;
  updatedAt: number;
}

export const SERIES_MAP: Record<SeriesType, string> = {
  '1': 'Real Medical Calls',
  '2': 'Legal Calls',
  '3': 'Insurance Calls',
  '4': 'Interpreter Problems',
  '5': 'Can You Keep Up?',
  '6': '62 Languages',
  '7': 'Interpreter Burnout',
  '8': 'Impossible Calls',
  '9': 'Feature Focus',
  '10': 'Customer Stories',
  medical: 'Medical',
  legal: 'Legal',
  conference: 'Conference',
  immigration: 'Immigration',
  education: 'Education',
};

/** Filename-friendly scenario slug */
export function seriesFilenameSlug(series: string): string {
  const label = SERIES_MAP[series as SeriesType] ?? series;
  return label.replace(/[^\w]+/g, '');
}

const STORAGE_KEY = 'interpreterai_reels';
const DELETED_KEY = 'interpreterai_reels_deleted';

function loadDeletedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function persistDeletedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify([...ids]));
  } catch (e) {
    console.warn('Failed to persist deleted reel ids', e);
  }
}

function markReelDeleted(id: string): void {
  const ids = loadDeletedIds();
  ids.add(id);
  persistDeletedIds(ids);
}

function stripHeavyDraftAudio(draft: StudioDraft | undefined): StudioDraft | undefined {
  if (!draft) return draft;
  return {
    ...draft,
    hookAudio: null,
    cachedVoiceover: draft.cachedVoiceover
      ? {
          ...draft.cachedVoiceover,
          audioBase64: null,
          outroAudioBase64: null,
          hookVoClips: draft.cachedVoiceover.hookVoClips.map((c) => ({
            ...c,
            audioBase64: '',
          })),
          workspaceVoClips: draft.cachedVoiceover.workspaceVoClips.map((c) => ({
            ...c,
            audioBase64: '',
          })),
        }
      : null,
    result: draft.result
      ? {
          ...draft.result,
          audioBase64: null,
          outroAudioBase64: null,
          hookVoClips: (draft.result.hookVoClips ?? []).map((c) => ({ ...c, audioBase64: '' })),
          workspaceVoClips: (draft.result.workspaceVoClips ?? []).map((c) => ({
            ...c,
            audioBase64: '',
          })),
        }
      : null,
  };
}

/**
 * Persist reels; on quota overflow drop heavy audio payloads from older
 * generated reels (newest keeps audio) instead of losing the whole save.
 */
function persistReels(reels: Reel[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reels));
    return;
  } catch {
    /* quota — retry slimmed */
  }
  try {
    const slimmed = reels.map((r, i) =>
      i > 0
        ? {
            ...r,
            generated: r.generated
              ? { ...r.generated, audioBase64: null, outroAudioBase64: null }
              : r.generated,
            studioDraft: stripHeavyDraftAudio(r.studioDraft),
          }
        : r,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slimmed));
  } catch (e) {
    console.error('Failed to persist reels (storage quota)', e);
  }
}

const LEGACY_MUSIC: Record<string, MusicBedId> = {
  medical_urgency: 'urgent_er_alarm',
  legal_calm: 'dramatic_legal_synth',
  conference_pulse: 'saas_tech_driving',
  hopeful_growth: 'upbeat_innovation',
};

function normalizeMusicBed(raw: unknown): MusicBedId {
  if (typeof raw !== 'string') return 'saas_tech_driving';
  if (raw in LEGACY_MUSIC) return LEGACY_MUSIC[raw]!;
  return ALL_MUSIC_BED_IDS.includes(raw as MusicBedId) ? (raw as MusicBedId) : 'saas_tech_driving';
}

function normalizeBrandTone(raw: unknown, stingEnabled?: boolean): BrandToneId {
  if (typeof raw === 'string' && ALL_BRAND_TONE_IDS.includes(raw as BrandToneId)) {
    return raw as BrandToneId;
  }
  if (stingEnabled === false) return 'none';
  return 'none';
}

function clampVol(n: unknown, fallback: number, max: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(0, n));
}

function normalizeReel(raw: Partial<Reel> & { id: string }): Reel {
  const brandTone = normalizeBrandTone(raw.brandTone, raw.brandStingEnabled);
  return {
    id: raw.id,
    title: raw.title ?? 'Untitled Reel',
    series: (raw.series as SeriesType) ?? '1',
    reelType: raw.reelType ?? '',
    targetLanguage: raw.targetLanguage ?? 'en',
    voiceActor: normalizeVoiceActorId(raw.voiceActor),
    voiceSpeed: raw.voiceSpeed ?? '1',
    musicBed: normalizeMusicBed(raw.musicBed),
    brandTone,
    brandStingEnabled: brandTone !== 'none',
    voVolume: clampVol(raw.voVolume, 1, 1.5),
    bgmVolume: clampVol(raw.bgmVolume, 0.25, 1),
    brandVolume: clampVol(raw.brandVolume, 0.8, 1),
    problemVisual: raw.problemVisual ?? 'stock_broll',
    solutionVisual: raw.solutionVisual ?? 'workspace_demo',
    hook: raw.hook ?? '',
    problem: raw.problem ?? '',
    solution: raw.solution ?? '',
    result: raw.result ?? '',
    captions: raw.captions ?? '',
    outroLine1: raw.outroLine1 ?? 'Stay focused on the conversation.',
    outroLine2: raw.outroLine2 ?? "We'll handle the words.",
    batchId: raw.batchId ?? null,
    variationIndex: typeof raw.variationIndex === 'number' ? raw.variationIndex : 0,
    scheduleTag: raw.scheduleTag ?? '',
    fromStudio: Boolean(raw.fromStudio),
    studioBrief: typeof raw.studioBrief === "string" ? raw.studioBrief : "",
    storyboardTitle: typeof raw.storyboardTitle === "string" ? raw.storyboardTitle : "",
    downloadUrl: typeof raw.downloadUrl === "string" && raw.downloadUrl.trim() ? raw.downloadUrl.trim() : undefined,
    downloadFilename:
      typeof raw.downloadFilename === "string" && raw.downloadFilename.trim()
        ? raw.downloadFilename.trim()
        : undefined,
    mp4Cached: Boolean(raw.mp4Cached),
    generated:
      raw.generated && typeof raw.generated === "object" ? raw.generated : undefined,
    studioDraft:
      raw.studioDraft && typeof raw.studioDraft === "object"
        ? (raw.studioDraft as StudioDraft)
        : undefined,
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  };
}

export type ReelSaveInput = Omit<Reel, 'id' | 'createdAt' | 'updatedAt' | 'title'> & {
  id?: string;
};

export function useReels() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEY);
    let parsed: Reel[] = [];
    if (data) {
      try {
        const raw = JSON.parse(data) as Partial<Reel>[];
        parsed = raw.filter((r) => r?.id).map((r) => normalizeReel(r as Partial<Reel> & { id: string }));
      } catch (e) {
        console.error('Failed to parse reels', e);
      }
    }

    const deletedIds = loadDeletedIds();

    // Seed finished MP4 exports (public/library) — keep user edits, refresh download URLs.
    const byId = new Map(parsed.map((r) => [r.id, r]));
    let changed = false;
    for (const exp of FINISHED_EXPORTS) {
      if (deletedIds.has(exp.id)) continue;
      const seeded = finishedExportToReel(exp);
      const existing = byId.get(exp.id);
      if (!existing) {
        byId.set(exp.id, seeded);
        changed = true;
      } else if (existing.downloadUrl !== seeded.downloadUrl || existing.downloadFilename !== seeded.downloadFilename) {
        byId.set(exp.id, {
          ...existing,
          downloadUrl: seeded.downloadUrl,
          downloadFilename: seeded.downloadFilename,
          title: existing.title || seeded.title,
          hook: existing.hook || seeded.hook,
          scheduleTag: existing.scheduleTag || seeded.scheduleTag,
          updatedAt: Date.now(),
        });
        changed = true;
      }
    }

    const merged = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    if (changed) {
      persistReels(merged);
    }
    setReels(merged);
    setIsLoaded(true);
  }, []);

  /** Restore mp4Cached flags from IndexedDB after reload. */
  useEffect(() => {
    if (!isLoaded || reels.length === 0) return;

    let cancelled = false;
    void (async () => {
      const idsToFlag: string[] = [];
      for (const reel of reels) {
        if (reel.downloadUrl || reel.mp4Cached) continue;
        if (await hasReelMp4(reel.id)) idsToFlag.push(reel.id);
      }
      if (cancelled || idsToFlag.length === 0) return;
      setReels((current) => {
        const next = current.map((r) =>
          idsToFlag.includes(r.id) ? { ...r, mp4Cached: true } : r,
        );
        persistReels(next);
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, reels.length]);

  const getReel = useCallback(
    (id: string) => reels.find((r) => r.id === id),
    [reels],
  );

  const saveReel = useCallback((reelData: ReelSaveInput): string => {
    const now = Date.now();
    const generatedTitle =
      (reelData.storyboardTitle && reelData.storyboardTitle.trim()) ||
      (reelData.hook
        ? reelData.hook.substring(0, 40) + (reelData.hook.length > 40 ? '...' : '')
        : 'Untitled Reel');
    const id = reelData.id ?? crypto.randomUUID();

    setReels((currentReels) => {
      let newReels: Reel[];
      if (reelData.id) {
        newReels = currentReels.map((r) =>
          r.id === reelData.id
            ? normalizeReel({ ...r, ...reelData, title: generatedTitle, updatedAt: now })
            : r,
        );
      } else {
        const newReel = normalizeReel({
          ...reelData,
          id,
          title: generatedTitle,
          createdAt: now,
          updatedAt: now,
        });
        newReels = [newReel, ...currentReels];
      }
      persistReels(newReels);
      return newReels;
    });
    return id;
  }, []);

  const deleteReel = useCallback((id: string) => {
    markReelDeleted(id);
    void deleteReelMp4(id);
    setReels((currentReels) => {
      const newReels = currentReels.filter((r) => r.id !== id);
      persistReels(newReels);
      return newReels;
    });
  }, []);

  return { reels, saveReel, deleteReel, getReel, isLoaded };
}
