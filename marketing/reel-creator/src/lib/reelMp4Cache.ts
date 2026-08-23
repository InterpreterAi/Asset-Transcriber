/**
 * IndexedDB cache for exported studio reel MP4s — instant library download without re-export.
 */

const DB_NAME = "interpreterai_reel_mp4";
const DB_VERSION = 1;
const STORE = "mp4";

export type CachedReelMp4 = {
  reelId: string;
  blob: Blob;
  filename: string;
  updatedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "reelId" });
      }
    };
  });
}

export async function saveReelMp4(
  reelId: string,
  blob: Blob,
  filename: string,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
    tx.objectStore(STORE).put({
      reelId,
      blob,
      filename,
      updatedAt: Date.now(),
    } satisfies CachedReelMp4);
  });
}

export async function getReelMp4(reelId: string): Promise<CachedReelMp4 | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
    const req = tx.objectStore(STORE).get(reelId);
    req.onsuccess = () => {
      db.close();
      const row = req.result as CachedReelMp4 | undefined;
      resolve(row?.blob ? row : null);
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
}

export async function hasReelMp4(reelId: string): Promise<boolean> {
  const row = await getReelMp4(reelId);
  return row != null;
}

export async function deleteReelMp4(reelId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.objectStore(STORE).delete(reelId);
  });
}
