/**
 * Lightweight hook preview after Generate VO — no workspace/outro segments.
 * Avoids mounting the full GeneratedReelPlayer before Pexels footage exists.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { HookFootagePreview } from "@/components/preview/HookFootagePreview";
import {
  base64ToBlob,
  footageDurationFromVoClips,
  hookClipsForStitch,
  resolveHookDurationSec,
  stitchSegmentClips,
  type HookVoClip,
} from "@/lib/generatedReel";
import { ClipWordSubtitles } from "@/components/preview/ClipWordSubtitles";
import {
  estimateTimedWords,
  type TimedWord,
} from "@/lib/kineticCaptions";
import { isRtlLanguage } from "@/lib/constants/languages";
import { isPlayableFootageUrl } from "@/lib/hookFootage";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const PREVIEW_W = 270;
const PREVIEW_H = 480;
const SCALE = PREVIEW_W / CANVAS_W;

type Props = {
  hookVoClips: HookVoClip[];
  hookWords: TimedWord[];
  hookAudio: string | null;
  hookDurationSec: number;
  hookScript: string;
  targetLanguage?: string;
  subtitleScale?: number;
  accentColor?: string;
  /** Set after Generate Reel — one Pexels URL per hook clip. */
  footageUrls?: string[];
  /** Shown when workspace/outro toggles need a VO regen. */
  selectionNote?: string;
};

function HookBackdrop({ localTime, hasFootage }: { localTime: number; hasFootage?: boolean }) {
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
          "radial-gradient(ellipse 90% 70% at 50% 30%, rgba(0,112,243,0.35) 0%, transparent 55%), linear-gradient(165deg, #0A1628 0%, #12253A 42%, #061018 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "-15%",
          backgroundImage:
            "linear-gradient(rgba(0,112,243,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(0,112,243,0.14) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          transform: `translate(${-drift}px, ${-drift * 0.6}px) scale(${1.04 + t * 0.01})`,
          opacity: 0.6,
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
            border: "2px solid rgba(103,232,249,0.32)",
            transform: `scale(${1 + 0.08 * Math.sin(t * 2 + i)})`,
            opacity: 0.55 - i * 0.12 + pulse * 0.15,
          }}
        />
      ))}
      {!hasFootage ? (
        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            bottom: "36%",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(103,232,249,0.55)",
          }}
        >
          Hook voiceover ready
        </div>
      ) : null}
    </div>
  );
}

export function StudioHookVoPreview({
  hookVoClips,
  hookWords,
  hookAudio,
  hookDurationSec,
  hookScript,
  targetLanguage = "en",
  subtitleScale = 1,
  accentColor = "#0070F3",
  footageUrls = [],
  selectionNote,
}: Props) {
  const durationSec = resolveHookDurationSec(hookVoClips, hookDurationSec);
  const footageDur =
    hookVoClips.length > 0 ? footageDurationFromVoClips(hookVoClips) : durationSec;
  const hasFootage = footageUrls.some(isPlayableFootageUrl) ||
    hookVoClips.some((c) => isPlayableFootageUrl(c.footageUrl));
  const rtl = isRtlLanguage(targetLanguage);
  const words = useMemo(
    () =>
      hookWords.length > 0
        ? hookWords
        : estimateTimedWords(hookScript, Math.max(0.5, durationSec - 0.4)),
    [hookWords, hookScript, durationSec],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hasAudio, setHasAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAudio() {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setHasAudio(false);
      setIsPlaying(false);
      setCurrentTime(0);

      if (hookVoClips.length === 0 && !hookAudio) return;

      try {
        let blob: Blob | undefined;
        if (hookAudio) {
          blob = base64ToBlob(hookAudio);
        } else if (hookVoClips.length === 1) {
          blob = base64ToBlob(hookVoClips[0]!.audioBase64);
        } else if (hookVoClips.length > 1) {
          blob = await stitchSegmentClips(hookClipsForStitch(hookVoClips), durationSec);
        }
        if (!blob || cancelled) return;

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.onended = () => setIsPlaying(false);
        audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
        audioRef.current = audio;
        setHasAudio(true);
      } catch {
        if (!cancelled) {
          audioRef.current = null;
          setHasAudio(false);
        }
      }
    }

    void loadAudio();

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, [hookAudio, hookVoClips, durationSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  function reset() {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    setIsPlaying(true);
  }

  function togglePlay() {
    if (currentTime >= durationSec - 0.05) {
      const audio = audioRef.current;
      if (audio) audio.currentTime = 0;
      setCurrentTime(0);
    }
    setIsPlaying((p) => !p);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div
        style={{
          position: "relative",
          width: PREVIEW_W,
          height: PREVIEW_H,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.7)",
          background: "#0A1628",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${SCALE})`,
            transformOrigin: "top left",
          }}
        >
          {hasFootage ? (
            <HookFootagePreview
              urls={footageUrls}
              hookVoClips={hookVoClips}
              localTime={currentTime}
              durationSec={footageDur}
              playing={isPlaying}
              fallback={<HookBackdrop localTime={currentTime} hasFootage />}
            />
          ) : (
            <HookBackdrop localTime={currentTime} />
          )}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "42%",
              background: "linear-gradient(180deg, transparent 0%, rgba(2,5,11,0.72) 80%)",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
          <ClipWordSubtitles
            words={words}
            localTime={currentTime}
            rtl={rtl}
            scale={subtitleScale}
            canvasWidth={CANVAS_W}
          />
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 4,
            background: "rgba(255,255,255,0.08)",
            zIndex: 5,
          }}
        >
          <div
            style={{
              height: "100%",
              background: accentColor,
              width: `${durationSec > 0 ? (currentTime / durationSec) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={reset} style={roundBtn(false)}>
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={!hasAudio}
          style={{
            ...roundBtn(false),
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

      <p style={{ margin: 0, width: PREVIEW_W, fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center" }}>
        {selectionNote ? (
          <span style={{ color: "#FBBF24" }}>{selectionNote}</span>
        ) : hasFootage ? (
          `Hook reel · ${durationSec.toFixed(1)}s · ${hookVoClips.length} clip${hookVoClips.length === 1 ? "" : "s"} · Pexels footage`
        ) : (
          `Hook-only · ${durationSec.toFixed(1)}s · ${hookVoClips.length} clip${hookVoClips.length === 1 ? "" : "s"} · Generate Reel for Pexels footage`
        )}
      </p>
    </div>
  );
}

function roundBtn(disabled: boolean): CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}
