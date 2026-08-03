import { useState, useEffect, useCallback } from 'react';

export type SeriesType = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export interface Reel {
  id: string;
  title: string;
  series: SeriesType;
  reelType: string;
  hook: string;
  problem: string;
  solution: string;
  result: string;
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

export function useReels() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      try {
        setReels(JSON.parse(data));
      } catch (e) {
        console.error('Failed to parse reels', e);
      }
    }
    setIsLoaded(true);
  }, []);

  const saveReel = useCallback((reelData: Omit<Reel, 'id' | 'createdAt' | 'updatedAt' | 'title'> & { id?: string }) => {
    const now = Date.now();
    const generatedTitle = reelData.hook
      ? reelData.hook.substring(0, 40) + (reelData.hook.length > 40 ? '...' : '')
      : 'Untitled Reel';

    setReels((currentReels) => {
      let newReels;
      if (reelData.id) {
        newReels = currentReels.map((r) =>
          r.id === reelData.id ? { ...r, ...reelData, title: generatedTitle, updatedAt: now } : r
        );
      } else {
        const newReel: Reel = {
          ...reelData,
          id: crypto.randomUUID(),
          title: generatedTitle,
          createdAt: now,
          updatedAt: now,
        };
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
    [reels]
  );

  return { reels, saveReel, deleteReel, getReel, isLoaded };
}
