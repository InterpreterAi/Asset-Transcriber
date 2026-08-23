/**
 * Hook footage preview — all clips preloaded; 1× playback, hold last frame (no loop / slow-mo).
 * Veo cache MP4s are fetched into blob URLs so moov-at-end files play reliably.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HookVoClip } from "@/lib/generatedReel";
import { isPlayableFootageUrl } from "@/lib/hookFootage";

export type FootageScheduleClip = { url: string; startSec: number; endSec: number };

type Props = {
  urls: string[];
  hookVoClips?: HookVoClip[];
  localTime: number;
  durationSec: number;
  playing: boolean;
  fallback: ReactNode;
};

const MIN_CLIP_SEC = 0.35;

function buildSchedule(
  urls: string[],
  hookVoClips: HookVoClip[],
  durationSec: number,
): FootageScheduleClip[] {
  if (hookVoClips.length > 0) {
    return hookVoClips
      .map((c, i) => {
        const url =
          isPlayableFootageUrl(c.footageUrl)
            ? c.footageUrl
            : urls[i] && isPlayableFootageUrl(urls[i]!)
              ? urls[i]!
              : "";
        if (!isPlayableFootageUrl(url)) return null;
        return {
          url,
          startSec: c.startSec,
          endSec: c.startSec + Math.max(MIN_CLIP_SEC, c.durationSec),
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

/** Always 1× — trim to VO window; hold last frame when stock is shorter (no loop). */
function footageSyncAt(
  localTime: number,
  clip: FootageScheduleClip,
  videoDuration: number | undefined,
): { targetTime: number; playbackRate: number; holdLastFrame: boolean } {
  const windowSec = clipWindowSec(clip);
  const elapsed = Math.max(0, Math.min(windowSec, localTime - clip.startSec));

  if (!videoDuration || !Number.isFinite(videoDuration) || videoDuration <= 0.05) {
    return { targetTime: elapsed, playbackRate: 1, holdLastFrame: false };
  }

  const endTime = Math.max(0.04, videoDuration - 0.04);
  if (elapsed >= endTime) {
    return { targetTime: endTime, playbackRate: 1, holdLastFrame: true };
  }

  return { targetTime: elapsed, playbackRate: 1, holdLastFrame: false };
}

/** Fetch remote / API footage into blob URLs so canvas export never hits CORS taint. */
function needsBlobLoad(url: string): boolean {
  return (
    url.startsWith("/api/reel-builder/footage/") ||
    url.startsWith("http://") ||
    url.startsWith("https://")
  );
}

export function HookFootagePreview({
  urls,
  hookVoClips = [],
  localTime,
  durationSec,
  playing,
  fallback,
}: Props) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const blobUrlsRef = useRef<string[]>([]);
  const [ready, setReady] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [resolvedSrc, setResolvedSrc] = useState<Record<number, string>>({});
  const [videoDurations, setVideoDurations] = useState<Record<number, number>>({});

  const schedule = useMemo(
    () => buildSchedule(urls, hookVoClips, durationSec),
    [hookVoClips, urls, durationSec],
  );

  const activeIdx = useMemo(
    () => activeClipIndex(schedule, localTime),
    [schedule, localTime],
  );

  const displayIdx = useMemo(() => {
    if (ready[activeIdx]) return activeIdx;
    for (let i = activeIdx; i >= 0; i--) {
      if (ready[i]) return i;
    }
    for (let i = 0; i < schedule.length; i++) {
      if (ready[i]) return i;
    }
    return activeIdx;
  }, [activeIdx, ready, schedule.length]);

  const scheduleKey = schedule.map((c) => `${c.startSec}:${c.endSec}:${c.url}`).join("|");

  useEffect(() => {
    setReady({});
    setFailed({});
    setResolvedSrc({});
    setVideoDurations({});
    videoRefs.current = [];
  }, [scheduleKey]);

  useEffect(() => {
    if (schedule.length === 0) return;
    let cancelled = false;

    void (async () => {
      await Promise.all(
        schedule.map(async (clip, i) => {
          if (!needsBlobLoad(clip.url)) {
            if (!cancelled) {
              setResolvedSrc((prev) => ({ ...prev, [i]: clip.url }));
            }
            return;
          }
          try {
            const res = await fetch(clip.url);
            if (!res.ok) throw new Error(`footage ${res.status}`);
            const blob = await res.blob();
            if (!blob.type.startsWith("video/") && blob.size < 10_000) {
              throw new Error("footage response is not video");
            }
            if (cancelled) return;
            const objectUrl = URL.createObjectURL(blob);
            blobUrlsRef.current.push(objectUrl);
            setResolvedSrc((prev) => ({ ...prev, [i]: objectUrl }));
          } catch {
            if (!cancelled) {
              setFailed((prev) => ({ ...prev, [i]: true }));
            }
          }
        }),
      );
    })();

    return () => {
      cancelled = true;
      for (const u of blobUrlsRef.current) URL.revokeObjectURL(u);
      blobUrlsRef.current = [];
    };
  }, [schedule, scheduleKey]);

  useEffect(() => {
    schedule.forEach((_, i) => {
      const video = videoRefs.current[i];
      if (!video) return;
      const clip = schedule[i];
      if (!clip) return;
      const { holdLastFrame } = footageSyncAt(
        localTime,
        clip,
        videoDurations[i] ?? video.duration,
      );

      if (i === activeIdx && playing && !holdLastFrame) {
        void video.play().catch(() => {
          /* Autoplay blocked or not ready yet — not a load failure. */
        });
      } else {
        video.pause();
      }
    });
  }, [activeIdx, localTime, playing, schedule, videoDurations]);

  useEffect(() => {
    const clip = schedule[activeIdx];
    const video = videoRefs.current[activeIdx];
    if (!video || !clip) return;

    const { targetTime, playbackRate, holdLastFrame } = footageSyncAt(
      localTime,
      clip,
      videoDurations[activeIdx] ?? video.duration,
    );

    video.playbackRate = playbackRate;

    const drift = Math.abs(video.currentTime - targetTime);
    const threshold = playing ? 0.25 : 0.05;
    if (drift > threshold || holdLastFrame) {
      try {
        video.currentTime = targetTime;
      } catch {
        /* ignore */
      }
    }
  }, [activeIdx, localTime, playing, schedule, videoDurations]);

  useEffect(() => {
    if (playing) return;

    const seekVideo = (index: number, offsetSec: number) => {
      const video = videoRefs.current[index];
      const clip = schedule[index];
      if (!video || !clip) return;
      const seek = () => {
        const { targetTime, playbackRate } = footageSyncAt(
          clip.startSec + offsetSec,
          clip,
          videoDurations[index] ?? video.duration,
        );
        video.playbackRate = playbackRate;
        try {
          if (Math.abs(video.currentTime - targetTime) > 0.04) {
            video.currentTime = targetTime;
          }
        } catch {
          /* ignore */
        }
      };
      if (video.readyState >= 1) seek();
      else video.addEventListener("loadedmetadata", seek, { once: true });
    };

    const activeClip = schedule[activeIdx];
    if (activeClip) {
      seekVideo(activeIdx, Math.max(0, localTime - activeClip.startSec));
    }
    if (displayIdx !== activeIdx) {
      const displayClip = schedule[displayIdx];
      if (displayClip) {
        seekVideo(displayIdx, Math.max(0, localTime - displayClip.startSec));
      }
    }
  }, [activeIdx, displayIdx, localTime, playing, schedule, videoDurations]);

  const readyCount = Object.values(ready).filter(Boolean).length;
  const failedCount = Object.values(failed).filter(Boolean).length;
  const allFailed = schedule.length > 0 && failedCount >= schedule.length;
  const loading =
    schedule.length > 0 &&
    schedule.some((_, i) => !failed[i] && !resolvedSrc[i]);

  if (schedule.length === 0 || allFailed) {
    return <>{fallback}</>;
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      {readyCount === 0 || loading ? (
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>{fallback}</div>
      ) : null}
      {schedule.map((clip, i) => {
        const src = resolvedSrc[i];
        if (!src) return null;
        return (
          <video
            key={`${i}-${clip.url}`}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            src={src}
            muted
            playsInline
            preload="auto"
            onLoadedData={() => setReady((prev) => ({ ...prev, [i]: true }))}
            onLoadedMetadata={(e) => {
              setReady((prev) => ({ ...prev, [i]: true }));
              const dur = e.currentTarget.duration;
              if (Number.isFinite(dur) && dur > 0) {
                setVideoDurations((prev) => ({ ...prev, [i]: dur }));
              }
            }}
            onCanPlay={() => setReady((prev) => ({ ...prev, [i]: true }))}
            onError={() => setFailed((prev) => ({ ...prev, [i]: true }))}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              zIndex: i === displayIdx ? 2 : 1,
              opacity: i === displayIdx && ready[i] ? 1 : 0,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}
