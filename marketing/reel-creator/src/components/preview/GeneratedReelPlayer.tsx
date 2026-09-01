/**
 * Fixed 35-second generated reel player:
 *   hook 10s (Pexels or animated fallback + word subtitles)
 *   → workspace 15s → approved brand outro 10s.
 * First frame is the hook — no separate intro.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import { UniversalBrandOutro } from "@/components/preview/UniversalBrandOutro";
import { HookFootagePreview } from "@/components/preview/HookFootagePreview";
import { WorkspaceSegment } from "@/components/preview/WorkspaceSegment";
import { ReelAudioMixer } from "@/lib/audioMix";
import { exportReelMp4, type ExportProgress, waitForStagePaint } from "@/lib/exportReelMp4";
import { trackFrameTask } from "@/lib/frameSync";
import {
  base64ToBlob,
  buildGeneratedSegments,
  computeReelTotalSec,
  resolveHookDurationSec,
  type GeneratedSegment,
  computeWorkspaceDurationSec,
  computeOutroDurationSec,
  REEL_OUTRO_SEC,
  buildContinuousReelVoiceover,
  hookClipsForStitch,
  stitchSegmentClips,
  trimBlobToDuration,
  type HookVoClip,
  type WorkspaceVoClip,
  clipExchangeIndex,
} from "@/lib/generatedReel";
import { ClipWordSubtitles } from "@/components/preview/ClipWordSubtitles";
import {
  estimateTimedWords,
  mapCaptionWordsToScript,
  normalizeWordTimestamps,
  scaleWordsToDuration,
  type TimedWord,
} from "@/lib/kineticCaptions";
import { speechTrimSecFromWords } from "@/lib/workspaceTiming";
import { estimateSpeechSec } from "@/lib/workspaceModel";
import { buildOutroPhraseTimings } from "@/lib/outroVoPacing";
import type { LanguagePair } from "@/lib/languageFlags";
import { resolveOutroAudioBlob } from "@/lib/outroAudio";
import {
  resolveUniversalOutroCopy,
  type UniversalOutroCopy,
} from "@/lib/universalBrandOutro";
import {
  defaultOutroLayerDocument,
  migrateOutroLayerDocument,
  type OutroLayerDocument,
} from "@/lib/outroLayerLayout";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import type { WorkspaceConversation } from "@/lib/workspaceModel";
import { resolveWorkspaceVoTiming, packWorkspaceAudioForStitch, stitchWorkspaceDialogue, type ResolvedWorkspaceVo } from "@/lib/workspaceVoSync";
import { isPlayableFootageUrl } from "@/lib/hookFootage";
import { isRtlLanguage } from "@/lib/constants/languages";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const SUBTITLE_FADE_SEC = 0.1;

export type GeneratedPlayback = {
  workspace: WorkspaceConversation;
  languagePair: LanguagePair;
  footageUrls: string[];
  hookVoClips?: HookVoClip[];
  hookDurationSec?: number;
  subtitleScale?: number;
  audioBase64: string | null;
  workspaceVoClips?: WorkspaceVoClip[];
  /** Non-English translated outro audio — English uses canonical asset. */
  outroAudioBase64: string | null;
  words: TimedWord[];
  hookScript: string;
  targetLanguage: string;
  outroCopy?: UniversalOutroCopy;
  outroVoiceover?: string;
  outroLayout?: import("@/lib/outroLayerLayout").OutroLayerDocument;
  outroPhraseTimings?: import("@/lib/outroVoPacing").OutroPhraseTiming[];
  /** When false, reel ends after workspace (no 10s brand outro). */
  includeOutro?: boolean;
  /** When false, reel skips workspace dialogue segment. */
  includeWorkspace?: boolean;
  /** Override outro segment length (defaults from VO text / audio). */
  outroDurationSec?: number;
  /** Override workspace segment length (defaults from VO clips). */
  workspaceDurationSec?: number;
};

type Props = {
  playback: GeneratedPlayback;
  musicUrl?: string | null;
  volumes?: { vo?: number; bgm?: number; brand?: number };
  filename?: string;
  accentColor?: string;
  subtitleScale?: number;
  /** Hook segment only — used after Generate VO before footage is attached. */
  previewScope?: "full" | "hook-only";
};

function AnimatedHookFallback({ localTime }: { localTime: number }) {
  const t = Math.max(0, localTime);
  const drift = (t * 24) % 72;
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "radial-gradient(ellipse 90% 70% at 50% 30%, rgba(0,112,243,0.28) 0%, transparent 55%), linear-gradient(165deg, #0A1628 0%, #12253A 42%, #061018 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-15%",
          backgroundImage:
            "linear-gradient(rgba(0,112,243,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(0,112,243,0.12) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          transform: `translate(${-drift}px, ${-drift * 0.6}px) scale(${1.04 + t * 0.01})`,
          opacity: 0.55,
        }}
      />
      {[420, 640, 880].map((size, i) => (
        <div
          key={size}
          style={{
            position: "absolute",
            left: "50%",
            top: "42%",
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: "50%",
            border: "2px solid rgba(103,232,249,0.28)",
            transform: `scale(${1 + 0.08 * Math.sin(t * 2 + i)})`,
            opacity: 0.5 - i * 0.12 + pulse * 0.15,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 25%, rgba(2,5,11,0.6) 100%)",
        }}
      />
    </div>
  );
}

type FootageScheduleClip = { url: string; startSec: number; endSec: number };

function FootageCanvas({
  urls,
  schedule,
  hookVoClips,
  localTime,
  durationSec,
  playing,
  exporting,
}: {
  urls: string[];
  schedule?: FootageScheduleClip[];
  hookVoClips?: HookVoClip[];
  localTime: number;
  durationSec: number;
  playing: boolean;
  exporting: boolean;
}) {
  const fallback = <AnimatedHookFallback localTime={localTime} />;

  if (!exporting) {
    return (
      <HookFootagePreview
        urls={urls}
        hookVoClips={
          schedule && schedule.length > 0
            ? schedule.map((s, i) => ({
                ...(hookVoClips?.[i] ?? {}),
                audioBase64: hookVoClips?.[i]?.audioBase64 ?? "",
                startSec: s.startSec,
                durationSec: Math.max(0.35, s.endSec - s.startSec),
                footageUrl: s.url,
                sayLine: hookVoClips?.[i]?.sayLine ?? "",
                scenario: hookVoClips?.[i]?.scenario ?? "",
                words: hookVoClips?.[i]?.words ?? [],
              }))
            : hookVoClips
        }
        localTime={localTime}
        durationSec={durationSec}
        playing={playing}
        fallback={fallback}
      />
    );
  }

  return (
    <FootageCanvasExport
      urls={urls}
      schedule={schedule}
      localTime={localTime}
      durationSec={durationSec}
      playing={playing}
      fallback={fallback}
    />
  );
}

/** Canvas draw path — export capture only. */
function FootageCanvasExport({
  urls,
  schedule,
  localTime,
  durationSec,
  playing,
  fallback,
}: {
  urls: string[];
  schedule?: FootageScheduleClip[];
  localTime: number;
  durationSec: number;
  playing: boolean;
  fallback: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videosRef = useRef<HTMLVideoElement[]>([]);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [frameReady, setFrameReady] = useState(false);

  const clipDefs = useMemo(() => {
    if (schedule && schedule.length > 0) {
      return schedule.map((s) => ({ url: s.url, startSec: s.startSec, endSec: s.endSec }));
    }
    const slice = urls;
    const n = slice.length;
    const clipDur = n > 0 ? durationSec / n : durationSec;
    return slice.map((url, i) => ({
      url,
      startSec: i * clipDur,
      endSec: (i + 1) * clipDur,
    }));
  }, [schedule, urls, durationSec]);

  useEffect(() => {
    const vids = clipDefs.map((clip, i) => {
      const v = document.createElement("video");
      if (clip.url.startsWith("http://") || clip.url.startsWith("https://")) {
        v.crossOrigin = "anonymous";
      }
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.loop = true;
      v.src = clip.url;
      v.onerror = () => setFailed((prev) => new Set(prev).add(i));
      return v;
    });
    videosRef.current = vids;
    setFailed(new Set());
    setFrameReady(false);
    return () => {
      for (const v of vids) {
        v.pause();
        v.src = "";
      }
      videosRef.current = [];
    };
  }, [clipDefs]);

  const usable = clipDefs.map((_, i) => i).filter((i) => !failed.has(i) && clipDefs[i]?.url);
  const activeIdx =
    usable.find((i) => {
      const c = clipDefs[i]!;
      return localTime >= c.startSec && localTime < c.endSec;
    }) ?? usable[usable.length - 1] ?? -1;
  const clipLocal =
    activeIdx >= 0 ? localTime - (clipDefs[activeIdx]?.startSec ?? 0) : localTime;

  const draw = (video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (video.videoWidth === 0) {
      setFrameReady(false);
      return;
    }
    const scale = Math.max(CANVAS_W / video.videoWidth, CANVAS_H / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    ctx.fillStyle = "#05070C";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    try {
      ctx.drawImage(video, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);
      setFrameReady(true);
    } catch {
      setFrameReady(false);
    }
  };

  useEffect(() => {
    if (!playing || activeIdx < 0) return;
    const video = videosRef.current[activeIdx];
    if (!video) return;
    for (const [i, v] of videosRef.current.entries()) {
      if (i !== activeIdx) v.pause();
    }
    void video.play().catch(() => {});
    let raf = 0;
    const loop = () => {
      draw(video);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      video.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeIdx, failed]);

  useEffect(() => {
    if (activeIdx < 0) {
      setFrameReady(false);
      return;
    }
    const video = videosRef.current[activeIdx];
    if (!video) return;
    if (playing) return;

    const task = new Promise<void>((resolve) => {
      const target =
        video.duration && Number.isFinite(video.duration)
          ? clipLocal % Math.max(0.1, video.duration)
          : clipLocal;
      const done = () => {
        video.removeEventListener("seeked", done);
        draw(video);
        resolve();
      };
      const prime = () => {
        video.removeEventListener("loadeddata", prime);
        video.addEventListener("seeked", done);
        try {
          video.currentTime = target;
        } catch {
          done();
        }
        if (Math.abs(video.currentTime - target) < 0.01) done();
      };
      if (video.readyState >= 2) {
        prime();
      } else {
        video.addEventListener("loadeddata", prime, { once: true });
        setTimeout(() => resolve(), 1200);
      }
    });
    void trackFrameTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeIdx, clipLocal, failed]);

  if (usable.length === 0) return <>{fallback}</>;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: frameReady ? 0 : 2,
          pointerEvents: "none",
        }}
      >
        {fallback}
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: frameReady ? 1 : 0,
          opacity: frameReady ? 1 : 0,
          transition: "opacity 180ms ease",
        }}
      />
    </div>
  );
}

function pickActiveSegment(segments: GeneratedSegment[], t: number): GeneratedSegment {
  const inside = segments.find((s) => s.end > s.start && t >= s.start && t < s.end);
  if (inside) return inside;
  if (t <= 0.001) {
    const hook = segments.find((s) => s.id === "hook");
    if (hook && hook.end > hook.start) return hook;
  }
  return segments.find((s) => s.end > s.start) ?? segments[segments.length - 1]!;
}

/** Per-hook-clip captions — maps alignment words to sayLine script text. */
function HookClipSubtitles({
  clips,
  localTime,
  rtl,
  scale = 1,
  fallbackWords,
  fallbackScript,
  fallbackDur,
}: {
  clips: HookVoClip[];
  localTime: number;
  rtl: boolean;
  scale?: number;
  fallbackWords: TimedWord[];
  fallbackScript: string;
  fallbackDur: number;
}) {
  if (clips.length > 0) {
    let cursor = 0;
    for (const clip of clips) {
      const words = normalizeWordTimestamps(clip.words);
      const dur = speechTrimSecFromWords(words, clip.durationSec ?? 2);
      if (localTime >= cursor - 0.02 && localTime < cursor + dur + 0.04) {
        const local = Math.max(0, localTime - cursor);
        const scaled = scaleWordsToDuration(words, dur);
        const mapped = mapCaptionWordsToScript(scaled, clip.sayLine);
        return (
          <ClipWordSubtitles
            words={mapped}
            localTime={local}
            rtl={rtl}
            scale={scale}
            canvasWidth={CANVAS_W}
          />
        );
      }
      cursor += dur;
    }
  }
  const words =
    fallbackWords.length > 0
      ? fallbackWords
      : estimateTimedWords(fallbackScript, Math.max(0.5, fallbackDur - 0.6));
  return (
    <ClipWordSubtitles words={words} localTime={localTime} rtl={rtl} scale={scale} canvasWidth={CANVAS_W} />
  );
}

export function GeneratedReelPlayer({
  playback,
  musicUrl = null,
  volumes,
  filename,
  accentColor = "#0070F3",
  subtitleScale: subtitleScaleProp = 1,
  previewScope = "full",
}: Props) {
  const hookOnly = previewScope === "hook-only";
  const {
    workspace,
    languagePair,
    footageUrls,
    hookVoClips = [],
    hookDurationSec: hookDurationProp,
    subtitleScale: playbackSubtitleScale = 1,
    audioBase64,
    workspaceVoClips = [],
    outroAudioBase64,
    words,
    hookScript,
    targetLanguage,
    outroCopy: outroCopyProp,
    outroVoiceover: playbackOutroVo,
    includeOutro = true,
    includeWorkspace = true,
    outroDurationSec: outroDurationProp,
    workspaceDurationSec: workspaceDurationProp,
  } = playback;

  const subtitleScale = subtitleScaleProp * playbackSubtitleScale;

  const [resolvedWorkspaceVo, setResolvedWorkspaceVo] = useState<ResolvedWorkspaceVo | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    if (workspaceVoClips.length === 0) {
      setResolvedWorkspaceVo(null);
      return;
    }
    void resolveWorkspaceVoTiming(workspaceVoClips, workspace.exchanges).then((r) => {
      if (!cancelled) setResolvedWorkspaceVo(r);
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceVoClips, workspace.exchanges]);

  const workspaceVoSchedule = useMemo(
    () =>
      resolvedWorkspaceVo?.schedule ??
      workspaceVoClips.map((c, i) => ({
        startSec: c.startSec,
        durationSec: c.durationSec ?? 2,
        speechDurSec: c.durationSec ?? 2,
        exchangeIndex: clipExchangeIndex(c, i),
      })),
    [resolvedWorkspaceVo, workspaceVoClips],
  );
  const workspaceWordsByExchange = resolvedWorkspaceVo?.wordsByExchange;
  const hookDur = useMemo(
    () => resolveHookDurationSec(hookVoClips, hookDurationProp),
    [hookVoClips, hookDurationProp],
  );
  const workspaceDur = hookOnly
    ? 0
    : includeWorkspace
      ? resolvedWorkspaceVo?.durationSec ??
        (typeof workspaceDurationProp === "number"
          ? workspaceDurationProp
          : computeWorkspaceDurationSec(workspaceVoClips))
      : 0;
  const outroDur = hookOnly
    ? 0
    : includeOutro
      ? outroDurationProp ??
        (playback.outroVoiceover
          ? computeOutroDurationSec(playback.outroVoiceover, targetLanguage)
          : REEL_OUTRO_SEC)
      : 0;
  const segments = useMemo(
    () =>
      buildGeneratedSegments(
        hookDur,
        workspaceDur,
        hookOnly ? false : includeOutro,
        hookOnly ? false : includeWorkspace,
        outroDur,
      ),
    [hookDur, workspaceDur, includeOutro, includeWorkspace, outroDur, hookOnly],
  );
  const totalDuration = hookOnly
    ? hookDur
    : computeReelTotalSec(
        hookDur,
        workspaceDur,
        includeOutro,
        includeWorkspace,
        outroDur,
      );

  const footageSchedule = useMemo<FootageScheduleClip[]>(() => {
    if (hookVoClips.length > 0) {
      return hookVoClips
        .map((c, i) => {
          const url =
            isPlayableFootageUrl(c.footageUrl)
              ? c.footageUrl
              : footageUrls[i] && isPlayableFootageUrl(footageUrls[i]!)
                ? footageUrls[i]!
                : "";
          if (!isPlayableFootageUrl(url)) return null;
          return {
            url,
            startSec: c.startSec,
            endSec: c.startSec + Math.max(0.35, c.durationSec),
          };
        })
        .filter((c): c is FootageScheduleClip => c != null);
    }
    return [];
  }, [hookVoClips, footageUrls]);

  const resolvedFootage = useMemo(() => {
    if (footageSchedule.length > 0) return footageSchedule.map((c) => c.url);
    return footageUrls.filter(isPlayableFootageUrl);
  }, [footageSchedule, footageUrls]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const rafRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef(0);
  const mixerRef = useRef<ReelAudioMixer | null>(null);
  const seekRef = useRef((t: number) => setCurrentTime(t));
  seekRef.current = (t: number) => {
    timeRef.current = t;
    setCurrentTime(t);
  };

  const rtl = isRtlLanguage(targetLanguage);

  const outroCopy = useMemo(
    () =>
      outroCopyProp ??
      resolveUniversalOutroCopy({ outroVoiceover: playbackOutroVo }),
    [outroCopyProp, playbackOutroVo],
  );

  const outroLayout = useMemo(
    () => migrateOutroLayerDocument(playback.outroLayout ?? defaultOutroLayerDocument(outroCopy)),
    [playback.outroLayout, outroCopy],
  );

  const outroPhraseTimings = useMemo(
    () =>
      playback.outroPhraseTimings ??
      buildOutroPhraseTimings(
        playbackOutroVo,
        [],
        estimateSpeechSec(playbackOutroVo, targetLanguage),
      ),
    [playback.outroPhraseTimings, playbackOutroVo, targetLanguage],
  );

  const [voBlobs, setVoBlobs] = useState<{ hook?: Blob; workspace?: Blob; outro?: Blob; full?: Blob }>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hookClipBlobs = hookClipsForStitch(hookVoClips);
      const hook =
        hookClipBlobs.length > 0
          ? await stitchSegmentClips(hookClipBlobs, hookDur)
          : audioBase64
            ? await trimBlobToDuration(base64ToBlob(audioBase64), hookDur)
            : undefined;
      const workspaceClips = hookOnly
        ? []
        : includeWorkspace
          ? packWorkspaceAudioForStitch(
              workspaceVoClips,
              resolvedWorkspaceVo?.wordsByExchange,
              workspace.exchanges,
            )
          : [];
      const outro =
        hookOnly || !includeOutro
          ? undefined
          : await resolveOutroAudioBlob({
              language: targetLanguage,
              translatedBase64: outroAudioBase64,
              durationSec: outroDur,
              voiceoverText: playbackOutroVo,
            });
      const full = hookOnly
        ? hook
        : await buildContinuousReelVoiceover({
            hook,
            hookClips: hookClipBlobs.length > 0 ? hookClipBlobs : undefined,
            hookSec: hookDur,
            workspaceClips,
            workspaceSec: workspaceDur,
            outro: includeOutro ? (outro ?? undefined) : undefined,
            includeOutro,
            includeWorkspace,
            outroSec: outroDur,
          });
      const workspace =
        includeWorkspace && workspaceVoClips.length > 0
          ? await stitchWorkspaceDialogue(
              workspaceVoClips,
              resolvedWorkspaceVo?.wordsByExchange,
              workspace.exchanges,
              workspaceDur,
            )
          : undefined;
      if (!cancelled) {
        setVoBlobs({
          hook,
          workspace: workspace ?? undefined,
          outro: includeOutro ? (outro ?? undefined) : undefined,
          full: full ?? undefined,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioBase64, hookVoClips, workspaceVoClips, workspaceVoSchedule, outroAudioBase64, playbackOutroVo, hookDur, workspaceDur, outroDur, targetLanguage, includeOutro, includeWorkspace, hookOnly, resolvedWorkspaceVo]);

  const hookWords = useMemo(
    () => (words.length > 0 ? words : estimateTimedWords(hookScript, hookDur - 0.6)),
    [words, hookScript, hookDur],
  );

  const hookFallbackScript = useMemo(
    () => hookVoClips.map((c) => c.sayLine).filter(Boolean).join(" ") || hookScript,
    [hookVoClips, hookScript],
  );

  useEffect(() => {
    const mixer = new ReelAudioMixer();
    mixerRef.current = mixer;
    return () => mixer.dispose();
  }, []);

  useEffect(() => {
    mixerRef.current?.setSegments(segments);
    mixerRef.current?.setBrandStingEnabled(false);
    mixerRef.current?.setBrandStingSchedule([]);
  }, [segments]);

  useEffect(() => {
    mixerRef.current?.setVolumes({
      vo: volumes?.vo ?? 1,
      bgm: volumes?.bgm ?? 0.22,
      brand: volumes?.brand ?? 0.8,
    });
  }, [volumes?.vo, volumes?.bgm, volumes?.brand]);

  useEffect(() => {
    void mixerRef.current?.loadMusic(musicUrl || "");
  }, [musicUrl]);

  useEffect(() => {
    void mixerRef.current?.loadVoiceovers(voBlobs);
  }, [voBlobs]);

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (isPlaying && !exporting) {
      mixerRef.current?.start(() => timeRef.current);
      lastTimeRef.current = performance.now();
      const tick = (now: number) => {
        const dt = (now - (lastTimeRef.current ?? now)) / 1000;
        lastTimeRef.current = now;
        const next = timeRef.current + dt;
        if (next >= totalDuration) {
          seekRef.current(totalDuration);
          setIsPlaying(false);
          mixerRef.current?.stop();
          return;
        }
        seekRef.current(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (!isPlaying) mixerRef.current?.stop();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, exporting, totalDuration]);

  useEffect(() => {
    if (resolvedFootage.length === 0) return;
    seekRef.current(0);
    setIsPlaying(false);
  }, [resolvedFootage.join("|")]);

  const currentSegment = pickActiveSegment(segments, currentTime);
  const localTime = Math.max(0, currentTime - currentSegment.start);
  const previewW = 270;
  const scale = previewW / CANVAS_W;

  const renderHook = (local: number) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <FootageCanvas
        urls={resolvedFootage}
        schedule={footageSchedule.length > 0 ? footageSchedule : undefined}
        hookVoClips={hookVoClips}
        localTime={local}
        durationSec={hookDur}
        playing={isPlaying && !exporting}
        exporting={exporting}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "42%",
          background: "linear-gradient(180deg, transparent 0%, rgba(2,5,11,0.75) 80%)",
          pointerEvents: "none",
        }}
      />
      <HookClipSubtitles
        clips={hookVoClips}
        localTime={local}
        rtl={rtl}
        scale={subtitleScale}
        fallbackWords={hookWords}
        fallbackScript={hookFallbackScript}
        fallbackDur={hookDur}
      />
    </div>
  );

  const renderWorkspace = (local: number) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <WorkspaceSegment
        conversation={workspace}
        languagePair={languagePair}
        segmentProgress={workspaceDur > 0 ? local / workspaceDur : 1}
        playheadSec={local}
        voSchedule={workspaceVoSchedule.length > 0 ? workspaceVoSchedule : undefined}
        wordsByExchange={workspaceWordsByExchange}
        durationSec={workspaceDur}
        subtitleScale={subtitleScale}
        voSyncedTyping
      />
    </div>
  );

  const renderOutro = (local: number) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <UniversalBrandOutro
        copy={outroCopy}
        layout={outroLayout}
        displayLang={targetLanguage}
        rtl={rtl}
        localTime={local}
        durationSec={outroDur}
        phraseTimings={outroPhraseTimings}
        syncToPhrases
      />
    </div>
  );

  const renderStage = () => {
    if (hookOnly) return renderHook(localTime);
    switch (currentSegment.id) {
      case "hook":
        return renderHook(localTime);
      case "workspace":
        return renderWorkspace(localTime);
      default:
        return renderOutro(localTime);
    }
  };

  const waitForPaint = () => {
    const stage = stageRef.current;
    return stage ? waitForStagePaint(stage) : Promise.resolve();
  };

  const downloadMp4 = async () => {
    const stage = stageRef.current;
    if (!stage || exporting) return;
    setIsPlaying(false);
    mixerRef.current?.stop();
    setExporting(true);
    setExportMsg(null);
    setExportProgress({ pct: 0, detail: "Preparing…" });
    try {
      await exportReelMp4({
        stage,
        durationSec: totalDuration,
        width: CANVAS_W,
        height: CANVAS_H,
        segments,
        fps: 15,
        videoBitrate: 8_000_000,
        frameAccurate: true,
        outroCapture: includeOutro ? "canvas" : "dom",
        outroCopy: includeOutro ? outroCopy : undefined,
        outroLayout: includeOutro ? outroLayout : undefined,
        outroDisplayLang: targetLanguage,
        outroPhraseTimings: includeOutro ? outroPhraseTimings : undefined,
        outroRtl: rtl,
        filename: filename || "InterpreterAI_Reel_35s.mp4",
        fastCapture: true,
        seekTo: (t) => {
          flushSync(() => seekRef.current(t));
        },
        waitForPaint,
        onProgress: setExportProgress,
        audio: {
          musicUrl: musicUrl || null,
          voiceovers: voBlobs.full
            ? { full: voBlobs.full }
            : {
                hook: voBlobs.hook,
                workspace: voBlobs.workspace,
                outro: voBlobs.outro,
              },
          segments,
          volumes: { vo: volumes?.vo ?? 1, bgm: volumes?.bgm ?? 0.22, brand: 0 },
        },
      });
      setExportMsg("MP4 downloaded.");
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : "Export failed");
      setExportProgress(null);
    } finally {
      setExporting(false);
      seekRef.current(0);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: previewW,
        }}
      >
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
          {currentSegment.id.toUpperCase()}
        </span>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.35)" }}>
          {currentTime.toFixed(1)}s / {totalDuration.toFixed(0)}s
        </span>
      </div>

      <div
        style={{
          position: "relative",
          width: previewW,
          height: 480,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.7)",
        }}
      >
        <div
          ref={stageRef}
          data-reel-export-stage="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "#0A1628",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
            <AnimatedHookFallback localTime={currentSegment.id === "hook" ? localTime : 0} />
          </div>
          {renderStage()}
        </div>
        {!exporting ? (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 4,
              background: "rgba(255,255,255,0.08)",
              zIndex: 60,
            }}
          >
            <div
              style={{
                height: "100%",
                background: currentSegment.id === "outro" ? "#22D3EE" : accentColor,
                width: `${(currentTime / totalDuration) * 100}%`,
              }}
            />
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            seekRef.current(0);
            setIsPlaying(true);
          }}
          style={roundBtn(exporting)}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            if (currentTime >= totalDuration) seekRef.current(0);
            setIsPlaying(!isPlaying);
          }}
          style={{
            ...roundBtn(exporting),
            width: 52,
            height: 52,
            background: accentColor,
            border: "none",
            color: "#02050B",
            boxShadow: `0 0 20px ${accentColor}40`,
          }}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>
      </div>

      <button
        type="button"
        disabled={exporting}
        onClick={() => void downloadMp4()}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: previewW,
          background: exporting ? "rgba(0,112,243,0.12)" : accentColor,
          color: exporting ? "#67E8F9" : "#FFFFFF",
          border: exporting ? "1px solid rgba(0,112,243,0.35)" : "none",
          borderRadius: 10,
          padding: "12px 18px",
          fontSize: 13,
          fontWeight: 700,
          cursor: exporting ? "default" : "pointer",
        }}
      >
        <Download size={16} />
        {exporting
          ? exportProgress
            ? `${exportProgress.detail} ${exportProgress.pct}%`
            : "Exporting…"
          : "Download MP4"}
      </button>

      {exportMsg ? (
        <p
          style={{
            width: previewW,
            margin: 0,
            fontSize: 11,
            color: exportMsg.includes("fail") ? "#F87171" : "rgba(103,232,249,0.85)",
            textAlign: "center",
          }}
        >
          {exportMsg}
        </p>
      ) : null}
    </div>
  );
}

function roundBtn(disabled: boolean): CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.5)",
    cursor: disabled ? "default" : "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.4 : 1,
  };
}
