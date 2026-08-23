/**
 * Approved brand outro preview — edit overlays above canvas + phrase-sync playback.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Layers, Pause, Play, RotateCcw, Scissors, Square } from "lucide-react";
import { UniversalBrandOutro } from "@/components/preview/UniversalBrandOutro";
import { COLORS } from "@/lib/brandSystem";
import { REEL_OUTRO_SEC } from "@/lib/generatedReel";
import {
  migrateOutroLayerDocument,
  OUTRO_EDITABLE_LAYER_IDS,
  OUTRO_LAYER_LABELS,
  OUTRO_STAGE_CENTER,
  OUTRO_STAGE_H,
  OUTRO_STAGE_W,
  snapLayerPosition,
  updateLayerGeometry,
  type OutroLayerDocument,
  type OutroLayerId,
} from "@/lib/outroLayerLayout";
import { resolveOutroPreviewAudio } from "@/lib/outroPreviewAudio";
import type { OutroPhraseTiming } from "@/lib/outroVoPacing";
import { OUTRO_CLIP_EDITOR_SPECS } from "@/lib/outroVoPacing";
import { isRtlLanguage } from "@/lib/constants/languages";
import type { UniversalOutroCopy } from "@/lib/universalBrandOutro";

import { LOCKED_OUTRO_MIN_SEC } from "@/lib/universalBrandOutro";

const PREVIEW_W = 270;
const PREVIEW_H = 480;
const SCALE = PREVIEW_W / OUTRO_STAGE_W;
const RESIZE_HANDLE = 14;
const OUTRO_TRIM_MIN_SEC = Math.min(2.5, LOCKED_OUTRO_MIN_SEC);
const TRIM_HANDLE_W = 10;

type DragSession = {
  mode: "move" | "resize";
  layerId: OutroLayerId;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
  origFontSize: number;
};

type Props = {
  copy: UniversalOutroCopy;
  layout: OutroLayerDocument;
  language: string;
  /** Effective playback/export duration (may be trimmed). */
  durationSec?: number;
  /** Full VO length before trim — defaults to durationSec. */
  naturalDurationSec?: number;
  /** Trimmed end time in seconds; null = use full natural duration. */
  trimmedDurationSec?: number | null;
  onTrimmedDurationChange?: (sec: number | null) => void;
  translatedAudioBase64?: string | null;
  outroVoiceover: string;
  voiceoverTextForAudio?: string;
  outroPhraseTimings?: OutroPhraseTiming[];
  editMode: boolean;
  selectedLayerId: OutroLayerId | null;
  onSelectLayer: (id: OutroLayerId | null) => void;
  onLayoutChange: (layout: OutroLayerDocument) => void;
  onPlaybackState?: (state: { playheadSec: number; playing: boolean }) => void;
};

export function OutroPreviewPanel({
  copy,
  layout,
  language,
  durationSec: durationProp,
  naturalDurationSec: naturalProp,
  trimmedDurationSec: trimmedProp,
  onTrimmedDurationChange,
  translatedAudioBase64,
  outroVoiceover,
  voiceoverTextForAudio,
  outroPhraseTimings = [],
  editMode,
  selectedLayerId,
  onSelectLayer,
  onLayoutChange,
  onPlaybackState,
}: Props) {
  const naturalDurationSec = Math.max(
    OUTRO_TRIM_MIN_SEC,
    naturalProp ?? durationProp ?? REEL_OUTRO_SEC,
  );
  const trimmedDurationSec =
    trimmedProp != null
      ? Math.max(OUTRO_TRIM_MIN_SEC, Math.min(trimmedProp, naturalDurationSec))
      : null;
  const durationSec =
    trimmedDurationSec != null
      ? trimmedDurationSec
      : Math.max(OUTRO_TRIM_MIN_SEC, durationProp ?? naturalDurationSec);
  const isTrimmed =
    trimmedDurationSec != null && trimmedDurationSec < naturalDurationSec - 0.05;
  const spokenForAudio = voiceoverTextForAudio?.trim() || outroVoiceover;
  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const [snapGuides, setSnapGuides] = useState({ vertical: false, horizontal: false });
  const [timelineDrag, setTimelineDrag] = useState<"scrub" | "trim" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const rtl = isRtlLanguage(language);
  const safeLayout = migrateOutroLayerDocument(layout);
  const showEditChrome = editMode && !playing;

  const seekTo = useCallback(
    (sec: number) => {
      const v = Math.max(0, Math.min(durationSec, sec));
      setPlayheadSec(v);
      if (audioRef.current) audioRef.current.currentTime = v;
      onPlaybackState?.({ playheadSec: v, playing });
    },
    [durationSec, onPlaybackState],
  );

  const secFromTimelineClientX = useCallback(
    (clientX: number, useNatural = false) => {
      const el = timelineRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const max = useNatural ? naturalDurationSec : durationSec;
      return ratio * max;
    },
    [durationSec, naturalDurationSec],
  );

  const applyTrimEnd = useCallback(
    (sec: number) => {
      const clamped = Math.max(
        OUTRO_TRIM_MIN_SEC,
        Math.min(naturalDurationSec, sec),
      );
      if (clamped >= naturalDurationSec - 0.05) {
        onTrimmedDurationChange?.(null);
      } else {
        onTrimmedDurationChange?.(Math.round(clamped * 10) / 10);
      }
      if (playheadSec > clamped) seekTo(clamped);
    },
    [naturalDurationSec, onTrimmedDurationChange, playheadSec, seekTo],
  );

  const resetTrim = useCallback(() => {
    onTrimmedDurationChange?.(null);
    if (playheadSec > naturalDurationSec) seekTo(naturalDurationSec);
  }, [naturalDurationSec, onTrimmedDurationChange, playheadSec, seekTo]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    onPlaybackState?.({ playheadSec: 0, playing: false });
  }, [onPlaybackState]);

  const stagePoint = useCallback((clientX: number, clientY: number) => {
    const el = stageRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / SCALE,
      y: (clientY - rect.top) / SCALE,
    };
  }, []);

  const commitGeometry = useCallback(
    (
      id: OutroLayerId,
      patch: Partial<{ x: number; y: number; width: number; height: number; fontSize: number }>,
      opts?: { fromResize?: boolean; origWidth?: number; origHeight?: number; origFontSize?: number },
    ) => {
      onLayoutChange(updateLayerGeometry(layoutRef.current, id, patch, opts));
    },
    [onLayoutChange],
  );

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();
      const pt = stagePoint(e.clientX, e.clientY);
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      if (drag.mode === "move") {
        const rawX = drag.origX + dx;
        const rawY = drag.origY + dy;
        const snapped = snapLayerPosition(rawX, rawY, drag.origW, drag.origH);
        setSnapGuides({ vertical: snapped.snapX, horizontal: snapped.snapY });
        commitGeometry(drag.layerId, { x: snapped.x, y: snapped.y });
      } else {
        setSnapGuides({ vertical: false, horizontal: false });
        commitGeometry(
          drag.layerId,
          {
            width: drag.origW + dx,
            height: drag.origH + dy,
          },
          {
            fromResize: true,
            origWidth: drag.origW,
            origHeight: drag.origH,
            origFontSize: drag.origFontSize,
          },
        );
      }
    }

    function onPointerUp() {
      dragRef.current = null;
      setSnapGuides({ vertical: false, horizontal: false });
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [commitGeometry, stagePoint]);

  useEffect(() => {
    if (!timelineDrag) return;

    function onMove(e: PointerEvent) {
      if (timelineDrag === "scrub") {
        seekTo(secFromTimelineClientX(e.clientX));
      } else if (timelineDrag === "trim") {
        applyTrimEnd(secFromTimelineClientX(e.clientX, true));
      }
    }

    function onUp() {
      setTimelineDrag(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [timelineDrag, seekTo, secFromTimelineClientX, applyTrimEnd]);

  useEffect(() => {
    if (playheadSec > durationSec) seekTo(durationSec);
  }, [durationSec, playheadSec, seekTo]);

  function beginDrag(
    e: ReactPointerEvent,
    layerId: OutroLayerId,
    mode: "move" | "resize",
  ) {
    if (!showEditChrome) return;
    e.preventDefault();
    e.stopPropagation();
    onSelectLayer(layerId);
    const layer = safeLayout.layers[layerId];
    const pt = stagePoint(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      layerId,
      startX: pt.x,
      startY: pt.y,
      origX: layer.x,
      origY: layer.y,
      origW: layer.width,
      origH: layer.height,
      origFontSize: layer.fontSize,
    };
  }

  function selectLayerOnly(layerId: OutroLayerId) {
    if (!showEditChrome) return;
    onSelectLayer(layerId);
  }

  async function startPlayback(previewTranslated: boolean) {
    stopPlayback();
    onSelectLayer(null);
    setPlayheadSec(0);

    const runVisualTick = (getSec: () => number) => {
      setPlaying(true);
      onPlaybackState?.({ playheadSec: 0, playing: true });
      const tick = () => {
        const sec = getSec();
        if (sec >= durationSec) {
          stopPlayback();
          setPlayheadSec(0);
          return;
        }
        setPlayheadSec(sec);
        onPlaybackState?.({ playheadSec: sec, playing: true });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    try {
      const blob = await resolveOutroPreviewAudio({
        voiceoverText: spokenForAudio,
        language: previewTranslated ? language : "en",
        generatedBase64: translatedAudioBase64,
      });
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          stopPlayback();
          setPlayheadSec(0);
        };
        audio.onerror = () => URL.revokeObjectURL(url);
        await audio.play();
        runVisualTick(() => audioRef.current?.currentTime ?? 0);
      } else {
        const t0 = performance.now();
        runVisualTick(() => (performance.now() - t0) / 1000);
      }
    } catch {
      const t0 = performance.now();
      runVisualTick(() => (performance.now() - t0) / 1000);
    }
  }

  function resetPreview() {
    stopPlayback();
    setPlayheadSec(0);
  }

  return (
    <div>
      {showEditChrome ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Layers size={14} color={COLORS.accent} />
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.accent }}>Edit layers on</span>
          <span style={{ fontSize: 11, color: COLORS.inkFaint }}>— drag to move · cyan guides snap to center</span>
        </div>
      ) : null}

      <div
        style={{
          position: "relative",
          width: PREVIEW_W,
          height: PREVIEW_H,
          borderRadius: 16,
          overflow: "hidden",
          border: showEditChrome
            ? `2px solid ${COLORS.accent}`
            : `1px solid ${COLORS.glassBorder}`,
          background: "#02050b",
        }}
      >
        <div
          ref={stageRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: OUTRO_STAGE_W,
            height: OUTRO_STAGE_H,
            transform: `scale(${SCALE})`,
            transformOrigin: "top left",
          }}
        >
          <UniversalBrandOutro
            copy={copy}
            layout={safeLayout}
            displayLang={language}
            rtl={rtl}
            localTime={playheadSec}
            durationSec={durationSec}
            phraseTimings={outroPhraseTimings}
            syncToPhrases={playing}
            allowPointerEvents={!showEditChrome}
          />

          {showEditChrome && snapGuides.vertical ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: OUTRO_STAGE_CENTER.x,
                top: 0,
                width: 1,
                height: OUTRO_STAGE_H,
                background: COLORS.accent,
                boxShadow: `0 0 6px ${COLORS.accent}`,
                zIndex: 15,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {showEditChrome && snapGuides.horizontal ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: OUTRO_STAGE_CENTER.y,
                width: OUTRO_STAGE_W,
                height: 1,
                background: COLORS.accent,
                boxShadow: `0 0 6px ${COLORS.accent}`,
                zIndex: 15,
                pointerEvents: "none",
              }}
            />
          ) : null}
          {showEditChrome && selectedLayerId ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: safeLayout.layers[selectedLayerId].x + safeLayout.layers[selectedLayerId].width / 2 - 4,
                top: safeLayout.layers[selectedLayerId].y + safeLayout.layers[selectedLayerId].height / 2 - 4,
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: `2px solid ${COLORS.accent}`,
                background: "rgba(32,212,240,0.35)",
                zIndex: 16,
                pointerEvents: "none",
              }}
            />
          ) : null}

          {showEditChrome
            ? OUTRO_EDITABLE_LAYER_IDS.map((id) => {
                const layer = safeLayout.layers[id];
                const selected = selectedLayerId === id;
                if (!selected) {
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={`Select ${OUTRO_LAYER_LABELS[id]}`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        selectLayerOnly(id);
                      }}
                      style={{
                        position: "absolute",
                        left: layer.x,
                        top: layer.y,
                        width: layer.width,
                        height: layer.height,
                        padding: 0,
                        margin: 0,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        touchAction: "none",
                        zIndex: 20,
                      }}
                    />
                  );
                }
                return (
                  <div
                    key={id}
                    onPointerDown={(e) => beginDrag(e, id, "move")}
                    style={{
                      position: "absolute",
                      left: layer.x,
                      top: layer.y,
                      width: layer.width,
                      height: layer.height,
                      boxSizing: "border-box",
                      border: `2px solid ${COLORS.accent}`,
                      background: "rgba(32, 212, 240, 0.06)",
                      cursor: "move",
                      touchAction: "none",
                      zIndex: 30,
                    }}
                  >
                    <div
                      role="presentation"
                      aria-label={`Resize ${OUTRO_LAYER_LABELS[id]}`}
                      onPointerDown={(e) => beginDrag(e, id, "resize")}
                      style={{
                        position: "absolute",
                        right: 2,
                        bottom: 2,
                        width: RESIZE_HANDLE,
                        height: RESIZE_HANDLE,
                        borderRadius: 3,
                        border: `2px solid ${COLORS.accent}`,
                        background: COLORS.accent,
                        cursor: "nwse-resize",
                        touchAction: "none",
                        boxShadow: "0 0 0 2px rgba(0,0,0,0.35)",
                      }}
                    />
                  </div>
                );
              })
            : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 10,
          padding: "10px 12px",
          borderRadius: 12,
          border: `1px solid ${COLORS.glassBorder}`,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.inkFaint,
          }}
        >
          Timeline · drag to scrub · cyan handle trims end
        </p>
        <div
          ref={timelineRef}
          role="slider"
          aria-label="Outro timeline"
          aria-valuemin={0}
          aria-valuemax={naturalDurationSec}
          aria-valuenow={playheadSec}
          onPointerDown={(e) => {
            if (playing) return;
            const rect = timelineRef.current?.getBoundingClientRect();
            if (!rect) return;
            const nearTrim =
              isTrimmed &&
              Math.abs(e.clientX - rect.left - (durationSec / naturalDurationSec) * rect.width) <
                TRIM_HANDLE_W + 6;
            e.preventDefault();
            if (nearTrim) {
              setTimelineDrag("trim");
            } else {
              setTimelineDrag("scrub");
              seekTo(secFromTimelineClientX(e.clientX));
            }
          }}
          style={{
            position: "relative",
            height: 32,
            borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            overflow: "hidden",
            cursor: playing ? "default" : "pointer",
            touchAction: "none",
          }}
        >
          {naturalDurationSec > 0 ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: `${(durationSec / naturalDurationSec) * 100}%`,
                top: 0,
                bottom: 0,
                right: 0,
                background: "rgba(0,0,0,0.45)",
                pointerEvents: "none",
              }}
            />
          ) : null}
          {OUTRO_CLIP_EDITOR_SPECS.map((spec) => {
            const timing = outroPhraseTimings.find((t) => t.layerId === spec.layerId);
            const start = timing?.startSec ?? 0;
            const end = timing?.endSec ?? start + 0.8;
            const left = naturalDurationSec > 0 ? (start / naturalDurationSec) * 100 : 0;
            const width =
              naturalDurationSec > 0 ? Math.max(4, ((end - start) / naturalDurationSec) * 100) : 8;
            const active =
              playing && playheadSec + 0.02 >= start && playheadSec < end;
            return (
              <div
                key={spec.layerId}
                title={`${spec.label} · ${start.toFixed(1)}s`}
                style={{
                  position: "absolute",
                  left: `${left}%`,
                  width: `${width}%`,
                  top: 4,
                  bottom: 4,
                  borderRadius: 6,
                  background: active ? COLORS.accent : "rgba(32,212,240,0.35)",
                  opacity: timing ? 1 : 0.35,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#02050b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                }}
              >
                {width > 8 ? spec.label.slice(0, 3) : ""}
              </div>
            );
          })}
          {naturalDurationSec > 0 ? (
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${Math.min(100, (playheadSec / naturalDurationSec) * 100)}%`,
                width: 2,
                background: "#FFFFFF",
                boxShadow: "0 0 6px rgba(255,255,255,0.6)",
                pointerEvents: "none",
                zIndex: 3,
              }}
            />
          ) : null}
          {naturalDurationSec > 0 && !playing ? (
            <div
              role="presentation"
              aria-label="Trim outro end"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTimelineDrag("trim");
              }}
              style={{
                position: "absolute",
                top: 2,
                bottom: 2,
                left: `calc(${(durationSec / naturalDurationSec) * 100}% - ${TRIM_HANDLE_W / 2}px)`,
                width: TRIM_HANDLE_W,
                borderRadius: 4,
                background: COLORS.accent,
                boxShadow: `0 0 8px ${COLORS.accent}`,
                cursor: "ew-resize",
                zIndex: 4,
                touchAction: "none",
              }}
            />
          ) : null}
        </div>
        {isTrimmed ? (
          <p style={{ margin: "6px 0 0", fontSize: 10, color: COLORS.accent }}>
            Trimmed to {durationSec.toFixed(1)}s (full VO {naturalDurationSec.toFixed(1)}s)
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => (playing ? stopPlayback() : void startPlayback(false))}
          style={btnStyle}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Preview"}
        </button>
        <button type="button" onClick={stopPlayback} style={btnStyle}>
          <Square size={14} />
          Stop
        </button>
        <button type="button" onClick={() => void startPlayback(language !== "en")} style={btnStyle}>
          <Play size={14} />
          {language !== "en" ? "Preview translated VO" : "Preview VO"}
        </button>
        <button type="button" onClick={resetPreview} style={btnStyle}>
          <RotateCcw size={14} />
          Reset
        </button>
        {isTrimmed ? (
          <button type="button" onClick={resetTrim} style={btnStyle}>
            <Scissors size={14} />
            Reset trim
          </button>
        ) : null}
        <span style={{ fontSize: 11, color: COLORS.inkFaint, marginLeft: 4 }}>
          {playheadSec.toFixed(1)}s / {durationSec.toFixed(1)}s
          {isTrimmed ? ` · full ${naturalDurationSec.toFixed(1)}s` : ""}
        </span>
      </div>

      {showEditChrome && selectedLayerId ? (
        <p style={{ margin: "8px 0 0", fontSize: 11, color: COLORS.inkFaint }}>
          {OUTRO_LAYER_LABELS[selectedLayerId]} · drag to move · corner to resize · snaps to stage center
        </p>
      ) : null}
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 999,
  border: `1px solid ${COLORS.glassBorder}`,
  background: "transparent",
  color: COLORS.inkMuted,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
