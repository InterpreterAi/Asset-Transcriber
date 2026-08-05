/**
 * Fixed 35-second generated reel player:
 *   intro 2s → hook 8s (Pexels footage or animated fallback + word subtitles)
 *   → workspace demo (fills) → configurable Brand Outro (5–12s).
 * All visuals derive from the playhead so preview and MP4 export match.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Download, Pause, Play, RotateCcw } from "lucide-react";
import { InterpreterAILogo } from "@/components/brand/InterpreterAILogo";
import { UniversalBrandOutro } from "@/components/preview/UniversalBrandOutro";
import { WorkspaceSegment } from "@/components/preview/WorkspaceSegment";
import { ReelAudioMixer } from "@/lib/audioMix";
import { exportReelMp4, type ExportProgress } from "@/lib/exportReelMp4";
import { trackFrameTask, waitForFrameTasks } from "@/lib/frameSync";
import {
  base64ToBlob,
  buildGeneratedSegments,
  REEL_TOTAL_SEC,
  trimBlobToDuration,
  type WorkspaceScript,
} from "@/lib/generatedReel";
import {
  captionWindowAt,
  estimateTimedWords,
  REEL_CAPTION_FONT,
  type TimedWord,
} from "@/lib/kineticCaptions";
import { isRtlLanguage } from "@/lib/constants/languages";
import type { LanguagePair } from "@/lib/languageFlags";
import type { OutroConfig } from "@/lib/outroConfig";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
/** 28px at the 270px preview scale (270/1080 = 0.25 → 112 × 0.25 = 28). */
const HOOK_SUBTITLE_PX = 112;
const SUBTITLE_FADE_SEC = 0.1;

export type GeneratedPlayback = {
  outroConfig: OutroConfig;
  workspaceScript: WorkspaceScript;
  languagePair: LanguagePair;
  footageUrls: string[];
  audioBase64: string | null;
  outroAudioBase64: string | null;
  words: TimedWord[];
  outroWords: TimedWord[];
  hookScript: string;
  /** Spoken outro script (translated when reel language ≠ en). */
  outroVoiceover: string;
};

type Props = {
  playback: GeneratedPlayback;
  targetLanguage?: string;
  musicUrl?: string | null;
  volumes?: { vo?: number; bgm?: number; brand?: number };
  filename?: string;
  accentColor?: string;
};

/* ------------------------------------------------------------------ */
/* Hook visuals                                                        */
/* ------------------------------------------------------------------ */

/** Polished animated fallback when stock footage is unavailable. */
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

/**
 * Draws Pexels footage frames onto a canvas (html-to-image can capture
 * canvases but not <video>), synced to the hook playhead for export seeks.
 */
function FootageCanvas({
  urls,
  localTime,
  durationSec,
  playing,
}: {
  urls: string[];
  localTime: number;
  durationSec: number;
  playing: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videosRef = useRef<HTMLVideoElement[]>([]);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const clipUrls = useMemo(() => urls.slice(0, 3), [urls]);

  useEffect(() => {
    const vids = clipUrls.map((url, i) => {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.loop = true;
      v.src = url;
      v.onerror = () => setFailed((prev) => new Set(prev).add(i));
      return v;
    });
    videosRef.current = vids;
    setFailed(new Set());
    return () => {
      for (const v of vids) {
        v.pause();
        v.src = "";
      }
      videosRef.current = [];
    };
  }, [clipUrls]);

  const usable = clipUrls.map((_, i) => i).filter((i) => !failed.has(i));
  const n = usable.length;
  const clipDur = n > 0 ? durationSec / n : durationSec;
  const activeSlot = n > 0 ? Math.min(n - 1, Math.floor(localTime / clipDur)) : -1;
  const activeIdx = activeSlot >= 0 ? usable[activeSlot]! : -1;
  const clipLocal = activeSlot >= 0 ? localTime - activeSlot * clipDur : 0;

  const draw = (video: HTMLVideoElement) => {
    const canvas = canvasRef.current;
    if (!canvas || video.videoWidth === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = Math.max(CANVAS_W / video.videoWidth, CANVAS_H / video.videoHeight);
    const dw = video.videoWidth * scale;
    const dh = video.videoHeight * scale;
    ctx.fillStyle = "#05070C";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    try {
      ctx.drawImage(video, (CANVAS_W - dw) / 2, (CANVAS_H - dh) / 2, dw, dh);
    } catch {
      /* not ready yet */
    }
  };

  // Live playback: play the active clip and mirror frames onto the canvas.
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

  // Paused / export: seek the exact frame and repaint (export awaits this).
  useEffect(() => {
    if (playing || activeIdx < 0) return;
    const video = videosRef.current[activeIdx];
    if (!video) return;
    const task = new Promise<void>((resolve) => {
      const target = video.duration && Number.isFinite(video.duration)
        ? clipLocal % Math.max(0.1, video.duration)
        : clipLocal;
      const done = () => {
        video.removeEventListener("seeked", done);
        draw(video);
        resolve();
      };
      if (video.readyState >= 1) {
        video.addEventListener("seeked", done);
        try {
          video.currentTime = target;
        } catch {
          done();
        }
        // Some containers fire no seeked for identical timestamps.
        if (Math.abs(video.currentTime - target) < 0.01) done();
      } else {
        const onMeta = () => {
          video.removeEventListener("loadedmetadata", onMeta);
          video.addEventListener("seeked", done);
          try {
            video.currentTime = target;
          } catch {
            done();
          }
        };
        video.addEventListener("loadedmetadata", onMeta);
        setTimeout(() => resolve(), 900);
      }
    });
    void trackFrameTask(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, activeIdx, clipLocal, failed]);

  if (n === 0) return <AnimatedHookFallback localTime={localTime} />;

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */

/**
 * Word subtitles: 2–3 words, centered in the bottom third, 28px (preview
 * scale) / 800 / white with drop shadow, no background pill, 0.1s fade.
 */
function WordSubtitles({
  words,
  localTime,
  rtl,
  bottomPx = 430,
  fontPx = HOOK_SUBTITLE_PX,
}: {
  words: TimedWord[];
  localTime: number;
  rtl: boolean;
  bottomPx?: number;
  fontPx?: number;
}) {
  const win = captionWindowAt(words, localTime, 3);
  if (!win || win.words.length === 0) return null;
  const windowStart = win.words[0]!.start;
  const opacity = Math.min(1, Math.max(0, (localTime - windowStart) / SUBTITLE_FADE_SEC + 0.15));
  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      style={{
        position: "absolute",
        left: 48,
        right: 48,
        bottom: bottomPx,
        zIndex: 20,
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
        pointerEvents: "none",
        opacity,
      }}
    >
      <span
        style={{
          fontFamily: REEL_CAPTION_FONT,
          fontSize: fontPx,
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: rtl ? 0 : "-0.02em",
          color: "#FFFFFF",
          textShadow: "0 8px 32px rgba(0,0,0,0.9)",
        }}
      >
        {win.words.map((w) => w.word).join(" ")}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

export function GeneratedReelPlayer({
  playback,
  targetLanguage = "en",
  musicUrl = null,
  volumes,
  filename,
  accentColor = "#0070F3",
}: Props) {
  const {
    outroConfig,
    workspaceScript,
    languagePair,
    footageUrls,
    audioBase64,
    outroAudioBase64,
    words,
    outroWords,
    hookScript,
    outroVoiceover,
  } = playback;

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
  const segments = useMemo(
    () => buildGeneratedSegments(outroConfig.durationSec),
    [outroConfig.durationSec],
  );
  const totalDuration = REEL_TOTAL_SEC;

  const hookSeg = segments[1]!;
  const workspaceSeg = segments[2]!;
  const outroSeg = segments[3]!;
  const hookDur = hookSeg.end - hookSeg.start;
  const workspaceDur = workspaceSeg.end - workspaceSeg.start;
  const outroDur = outroSeg.end - outroSeg.start;

  // Decode + hard-trim VO blobs to their segment windows (fade, never bleed).
  const [voBlobs, setVoBlobs] = useState<{ hook?: Blob; outro?: Blob }>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hook = audioBase64
        ? await trimBlobToDuration(base64ToBlob(audioBase64), hookDur)
        : undefined;
      const outro = outroAudioBase64
        ? await trimBlobToDuration(base64ToBlob(outroAudioBase64), outroDur - 0.3)
        : undefined;
      if (!cancelled) setVoBlobs({ hook, outro });
    })();
    return () => {
      cancelled = true;
    };
  }, [audioBase64, outroAudioBase64, hookDur, outroDur]);

  // Even fallback timing across the hook when ElevenLabs is unavailable.
  const hookWords = useMemo(
    () => (words.length > 0 ? words : estimateTimedWords(hookScript, hookDur - 0.6)),
    [words, hookScript, hookDur],
  );
  const outroCaptionWords = useMemo(
    () =>
      outroWords.length > 0
        ? outroWords
        : estimateTimedWords(outroVoiceover, Math.max(2, outroDur - 1.5)),
    [outroWords, outroVoiceover, outroDur],
  );

  const outroCopy = useMemo<UniversalOutroCopy>(() => {
    const sentences = outroConfig.slogan.split(/(?<=[.!?])\s+/).filter(Boolean);
    return {
      line1: sentences[0] ?? outroConfig.slogan,
      line2: sentences.slice(1).join(" "),
      ctaHeadline: outroConfig.ctaText,
      languagesLine: outroConfig.slogan,
      voiceover: outroVoiceover,
    };
  }, [outroConfig.slogan, outroConfig.ctaText, outroVoiceover]);

  /* Audio */
  useEffect(() => {
    const mixer = new ReelAudioMixer();
    mixerRef.current = mixer;
    return () => mixer.dispose();
  }, []);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.setSegments(segments);
    mixer.setBrandStingEnabled(false);
    mixer.setBrandStingSchedule([]);
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

  /* Clock */
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

  const currentSegment =
    segments.find((s) => currentTime >= s.start && currentTime < s.end) ?? segments[3]!;
  const localTime = Math.max(0, currentTime - currentSegment.start);

  const previewW = 270;
  const previewH = 480;
  const scale = previewW / CANVAS_W;

  /* Segment renderers */
  const renderIntro = (local: number) => {
    const logoOp = Math.min(1, local / 0.45);
    const tagOp = Math.min(1, Math.max(0, (local - 0.55) / 0.5));
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#02050B",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          zIndex: 10,
        }}
      >
        <div style={{ opacity: logoOp, filter: "drop-shadow(0 0 48px rgba(0,112,243,0.4))" }}>
          <InterpreterAILogo variant="wordmark" height={92} />
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: REEL_CAPTION_FONT,
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "rgba(248,250,252,0.75)",
            opacity: tagOp,
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          {outroConfig.slogan}
        </p>
      </div>
    );
  };

  const renderHook = (local: number) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <FootageCanvas
        urls={footageUrls}
        localTime={local}
        durationSec={hookDur}
        playing={isPlaying && !exporting}
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
      <WordSubtitles words={hookWords} localTime={local} rtl={rtl} />
    </div>
  );

  const renderWorkspace = (local: number) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <WorkspaceSegment
        languagePair={languagePair}
        workspaceScript={workspaceScript}
        segmentProgress={workspaceDur > 0 ? local / workspaceDur : 1}
        durationSec={workspaceDur}
      />
    </div>
  );

  const renderOutro = (local: number) => (
    <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
      <UniversalBrandOutro
        copy={outroCopy}
        rtl={rtl}
        localTime={local}
        durationSec={outroDur}
        displayUrl={outroConfig.url}
        showCtaSubline={false}
      />
      <WordSubtitles
        words={outroCaptionWords}
        localTime={local}
        rtl={rtl}
        bottomPx={1180}
        fontPx={64}
      />
    </div>
  );

  const renderStage = () => {
    switch (currentSegment.id) {
      case "intro":
        return renderIntro(localTime);
      case "hook":
        return renderHook(localTime);
      case "workspace":
        return renderWorkspace(localTime);
      default:
        return renderOutro(localTime);
    }
  };

  /* Export */
  const waitForPaint = async () => {
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    await waitForFrameTasks();
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
        fps: 24,
        videoBitrate: 12_000_000,
        frameAccurate: true,
        outroCapture: "dom",
        filename: filename || "InterpreterAI_Reel_35s.mp4",
        seekTo: (t) => {
          flushSync(() => seekRef.current(t));
        },
        waitForPaint,
        onProgress: setExportProgress,
        audio: {
          musicUrl: musicUrl || null,
          voiceovers: voBlobs,
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
          height: previewH,
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
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "#02050B",
            position: "relative",
            overflow: "hidden",
          }}
        >
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
