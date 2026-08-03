import { useState, useEffect, useCallback } from 'react';
import type {
  MusicBedId,
  ProblemVisual,
  SolutionVisual,
  VoiceActorId,
} from '@/lib/constants/languages';

export type SeriesType = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export interface Reel {
  id: string;
  title: string;
  series: SeriesType;
  reelType: string;
  targetLanguage: string;
  voiceActor: VoiceActorId;
  musicBed: MusicBedId;
  brandStingEnabled: boolean;
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

const STORAGE_KEY = 'interpreterai_reels';

function normalizeReel(raw: Partial<Reel> & { id: string }): Reel {
  return {
    id: raw.id,
    title: raw.title ?? 'Untitled Reel',
    series: (raw.series as SeriesType) ?? '1',
    reelType: raw.reelType ?? '',
    targetLanguage: raw.targetLanguage ?? 'en',
    voiceActor: raw.voiceActor ?? 'onyx',
    musicBed: raw.musicBed ?? 'subtle_ambient',
    brandStingEnabled: raw.brandStingEnabled !== false,
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

  const saveReel = useCallback((reelData: ReelSaveInput) => {
    const now = Date.now();
    const generatedTitle = reelData.hook
      ? reelData.hook.substring(0, 40) + (reelData.hook.length > 40 ? '...' : '')
      : 'Untitled Reel';

    setReels((currentReels) => {
      let newReels;
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

  const getReel = useCallback(
    (id: string) => reels.find((r) => r.id === id),
    [reels],
  );

  return { reels, saveReel, deleteReel, getReel, isLoaded };
}
