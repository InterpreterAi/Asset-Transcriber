/**
 * Preloads hook/payoff footage into blob URLs and draws frames to canvas for MP4 export.
 * Avoids html-to-image + cross-origin video taint.
 */

import type { HookVoClip } from "@/lib/generatedReel";
import { isPlayableFootageUrl } from "@/lib/hookFootage";

export type FootageScheduleClip = { url: string; startSec: number; endSec: number };

const MIN_CLIP_SEC = 0.35;

export function buildFootageSchedule(
  urls: string[],
  hookVoClips: HookVoClip[],
  durationSec: number,
): FootageScheduleClip[] {
  if (hookVoClips.length > 0) {
    return hookVoClips
      .map((c, i) => {
        const url = isPlayableFootageUrl(c.footageUrl)
          ? c.footageUrl
          : urls[i] && isPlayableFootageUrl(urls[i]!)
            ? urls[i]!
            : "";
        if (!isPlayableFootageUrl(url)) return null;
        return {
          url,
          startSec: c.startSec,
          endSec: c.startSec + Math.max(MIN_CLIP_SEC, c.durationSec ?? MIN_CLIP_SEC),
        };
      })
      .filter((c): c is FootageScheduleClip => c != null);
  }
  const http = urls.filter(isPlayableFootageUrl);
  if (http.length === 0) return [];
  const clipDur = durationSec / http.length;
  return http.map((url, i) => ({
    url,
    startSec: i * clipDur,
    endSec: i + 1 === http.length ? durationSec : (i + 1) * clipDur,
  }));
}

function activeClipIndex(schedule: FootageScheduleClip[], localTime: number): number {
  let idx = 0;
  for (let i = 0; i < schedule.length; i++) {
    if (localTime + 1e-6 >= schedule[i]!.startSec) idx = i;
    else break;
  }
  return idx;
}

function clipWindowSec(clip: FootageScheduleClip): number {
  return Math.max(MIN_CLIP_SEC, clip.endSec - clip.startSec);
}

function footageSyncAt(
  localTime: number,
  clip: FootageScheduleClip,
  videoDuration: number | undefined,
): { targetTime: number; holdLastFrame: boolean } {
  const windowSec = clipWindowSec(clip);
  const elapsed = Math.max(0, Math.min(windowSec, localTime - clip.startSec));
  if (!videoDuration || !Number.isFinite(videoDuration) || videoDuration <= 0.05) {
    return { targetTime: elapsed, holdLastFrame: false };
  }
  const endTime = Math.max(0.04, videoDuration - 0.04);
  if (elapsed >= endTime) return { targetTime: endTime, holdLastFrame: true };
  return { targetTime: elapsed, holdLastFrame: false };
}

async function resolveBlobUrl(url: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(url);
  if (hit) return hit;
  if (url.startsWith("blob:")) {
    cache.set(url, url);
    return url;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Footage fetch failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  cache.set(url, objectUrl);
  return objectUrl;
}

async function loadVideo(src: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  await new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error("Footage video failed to load"));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", ok);
      video.removeEventListener("error", fail);
      window.clearTimeout(timer);
    };
    video.addEventListener("loadeddata", ok, { once: true });
    video.addEventListener("error", fail, { once: true });
    const timer = window.setTimeout(ok, 8000);
  });
  return video;
}

async function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const finish = () => {
      video.removeEventListener("seeked", finish);
      resolve();
    };
    try {
      if (Math.abs(video.currentTime - time) < 0.03) {
        resolve();
        return;
      }
      video.addEventListener("seeked", finish, { once: true });
      video.currentTime = time;
      window.setTimeout(finish, 300);
    } catch {
      resolve();
    }
  });
}

type LoadedClip = { video: HTMLVideoElement; schedule: FootageScheduleClip };

export class FootageExportPool {
  private blobCache = new Map<string, string>();
  private pools = new Map<string, LoadedClip[]>();
  private disposed = false;

  async load(key: string, schedule: FootageScheduleClip[]): Promise<void> {
    if (schedule.length === 0) {
      this.pools.set(key, []);
      return;
    }
    const loaded: LoadedClip[] = [];
    for (const clip of schedule) {
      try {
        const blobUrl = await resolveBlobUrl(clip.url, this.blobCache);
        const video = await loadVideo(blobUrl);
        loaded.push({ video, schedule: clip });
      } catch {
        /* skip bad clip */
      }
    }
    this.pools.set(key, loaded);
  }

  async draw(
    ctx: CanvasRenderingContext2D,
    key: string,
    localTime: number,
    width: number,
    height: number,
  ): Promise<boolean> {
    const clips = this.pools.get(key) ?? [];
    if (clips.length === 0) return false;

    const schedule = clips.map((c) => c.schedule);
    const idx = activeClipIndex(schedule, localTime);
    const entry = clips[idx];
    if (!entry) return false;

    const { targetTime } = footageSyncAt(
      localTime,
      entry.schedule,
      entry.video.duration,
    );
    await seekVideo(entry.video, targetTime);

    const video = entry.video;
    if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;

    ctx.fillStyle = "#05070C";
    ctx.fillRect(0, 0, width, height);

    const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    try {
      ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const clips of this.pools.values()) {
      for (const { video } of clips) {
        video.pause();
        video.src = "";
      }
    }
    this.pools.clear();
    for (const url of this.blobCache.values()) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    this.blobCache.clear();
  }
}
