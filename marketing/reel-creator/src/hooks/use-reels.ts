import { useState, useEffect, useCallback } from 'react';
import {
  ALL_BRAND_TONE_IDS,
  ALL_MUSIC_BED_IDS,
  type BrandToneId,
  type MusicBedId,
  type ProblemVisual,
  type SolutionVisual,
  type VoiceActorId,
  type VoiceSpeedId,
} from '@/lib/constants/languages';

export type SeriesType = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

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
};

/** Filename-friendly scenario slug */
export function seriesFilenameSlug(series: string): string {
  const label = SERIES_MAP[series as SeriesType] ?? series;
  return label.replace(/[^\w]+/g, '');
}

const STORAGE_KEY = 'interpreterai_reels';

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
    voiceActor: raw.voiceActor ?? 'nova',
    voiceSpeed: raw.voiceSpeed ?? '1.15',
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
    if (data) {
      try {
        const parsed = JSON.parse(data) as Partial<Reel>[];
        setReels(parsed.filter((r) => r?.id).map((r) => normalizeReel(r as Partial<Reel> & { id: string })));
      } catch (e) {
        console.error('Failed to parse reels', e);
      }
    }
    setIsLoaded(true);
  }, []);

  const getReel = useCallback(
    (id: string) => reels.find((r) => r.id === id),
    [reels],
  );

  const saveReel = useCallback((reelData: ReelSaveInput) => {
    const now = Date.now();
    const generatedTitle = reelData.hook
      ? reelData.hook.substring(0, 40) + (reelData.hook.length > 40 ? '...' : '')
      : 'Untitled Reel';

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
          id: crypto.randomUUID(),
          title: generatedTitle,
          createdAt: now,
          updatedAt: now,
        });
        newReels = [newReel, ...currentReels];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newReels));
      return newReels;
    });
  }, []);

  const deleteReel = useCallback((id: string) => {
    setReels((currentReels) => {
      const newReels = currentReels.filter((r) => r.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newReels));
      return newReels;
    });
  }, []);

  return { reels, saveReel, deleteReel, getReel, isLoaded };
}
