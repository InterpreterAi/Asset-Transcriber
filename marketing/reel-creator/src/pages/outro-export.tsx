/**
 * Standalone Universal Brand Outro — preview + download MP4.
 * Duration follows the full locked VO (never clips mid-script).
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Download, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { UniversalBrandOutro } from "@/components/preview/UniversalBrandOutro";
import { exportLockedOutroMaster } from "@/lib/exportLockedOutroMaster";
import {
  LOCKED_OUTRO_MIN_SEC,
  UNIVERSAL_OUTRO_EN,
  buildLockedOutroVoiceover,
  outroDurationForVoSec,
  resolveUniversalOutroCopy,
} from "@/lib/universalBrandOutro";
import { measureBlobDuration, synthesizeLockedOutroVoiceover } from "@/lib/reelBuilderApi";
import { COLORS } from "@/lib/brandSystem";
import { VOICE_ACTORS, type VoiceActorId } from "@/lib/constants/languages";

const W = 1080;
const H = 1920;
const PREVIEW_W = 300;
const PREVIEW_H = Math.round(PREVIEW_W * (H / W));
const SCALE = PREVIEW_W / W;

export default function OutroExportPage() {
  const copy = resolveUniversalOutroCopy({
    outroLine1: UNIVERSAL_OUTRO_EN.line1,
    outroLine2: UNIVERSAL_OUTRO_EN.line2,
    ctaHeadline: UNIVERSAL_OUTRO_EN.ctaHeadline,
  });

  const [duration, setDuration] = useState(LOCKED_OUTRO_MIN_SEC);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includeVo, setIncludeVo] = useState(true);
  const [voiceId, setVoiceId] = useState<VoiceActorId>("rachel");
  const [voBlob, setVoBlob] = useState<Blob | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const timeRef = useRef(0);
  const durRef = useRef(LOCKED_OUTRO_MIN_SEC);
  const rafRef = useRef<number | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    durRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!playing || exporting) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      return;
    }
    if (includeVo && voBlob && audioRef.current) {
      audioRef.current.currentTime = timeRef.current;
      void audioRef.current.play().catch(() => undefined);
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const max = durRef.current;
      let next = timeRef.current + dt;
      if (next >= max) {
        next = max;
        timeRef.current = next;
        setT(next);
        setPlaying(false);
        audioRef.current?.pause();
        return;
      }
      timeRef.current = next;
      setT(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, exporting, includeVo, voBlob]);

  const seek = (sec: number) => {
    const v = Math.max(0, Math.min(durRef.current, sec));
    timeRef.current = v;
    setT(v);
    if (audioRef.current) audioRef.current.currentTime = v;
  };

  async function ensureVoiceover(force = false): Promise<Blob> {
    if (voBlob && !force) return voBlob;
    setProgress(`Generating natural VO · ${voiceId}…`);
    const spoken = buildLockedOutroVoiceover();
    // Stitched brand pacing: slogan → silence → Supports/CTA (always 1.0×).
    const syn = await synthesizeLockedOutroVoiceover(spoken, voiceId);
    const prepared = syn.blob;
    const voSec = await measureBlobDuration(prepared);
    const nextDur = outroDurationForVoSec(voSec);
    setVoBlob(prepared);
    setDuration(nextDur);
    durRef.current = nextDur;
    const url = URL.createObjectURL(prepared);
    if (audioRef.current) {
      audioRef.current.src = url;
    } else {
      const a = new Audio(url);
      audioRef.current = a;
    }
    return prepared;
  }

  async function downloadMp4() {
    if (exporting) return;
    setPlaying(false);
    setExporting(true);
    setMsg(null);
    setProgress("Preparing download…");
    try {
      let audio: Blob | null = null;
      let exportDur = duration;
      if (includeVo) {
        try {
          audio = await ensureVoiceover();
          exportDur = outroDurationForVoSec(await measureBlobDuration(audio));
          setDuration(exportDur);
          durRef.current = exportDur;
        } catch (voErr) {
          // Still export video if TTS/API fails
          setMsg(
            voErr instanceof Error
              ? `VO skipped: ${voErr.message}. Exporting video only…`
              : "VO skipped. Exporting video only…",
          );
          audio = null;
        }
      }

      await exportLockedOutroMaster({
        copy,
        durationSec: exportDur,
        voiceover: audio,
        fps: 30,
        videoBitrate: 18_000_000,
        filename: "InterpreterAI_Universal_Brand_Outro.mp4",
        onProgress: (p) => setProgress(`${p.pct}% · ${p.detail}`),
      });
      setMsg("Downloaded InterpreterAI_Universal_Brand_Outro.mp4");
      setProgress(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Export failed");
      setProgress(null);
    } finally {
      setExporting(false);
      seek(0);
    }
  }

  return (
    <div
      style={{
        minHeight: "100%",
        background: COLORS.bg,
        color: COLORS.ink,
        padding: "40px 24px 80px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ maxWidth: 720, width: "100%", textAlign: "center", marginBottom: 28 }}>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: COLORS.inkFaint,
            fontWeight: 650,
          }}
        >
          Locked brand asset
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>
          Universal Brand Outro
        </h1>
        <p style={{ margin: 0, fontSize: 15, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          Download is 1080×1920 master MP4 with shine + staggered CTAs. Usually finishes in a few seconds.
        </p>
      </div>

      <div
        style={{
          width: PREVIEW_W,
          height: PREVIEW_H,
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${COLORS.glassBorder}`,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
          position: "relative",
          background: "#05070C",
        }}
      >
        <div
          style={{
            width: W,
            height: H,
            transform: `scale(${SCALE})`,
            transformOrigin: "top left",
            position: "relative",
          }}
        >
          <UniversalBrandOutro
            copy={copy}
            rtl={false}
            localTime={t}
            durationSec={duration}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 22,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            void (async () => {
              if (includeVo && !voBlob) {
                try {
                  setExporting(true);
                  await ensureVoiceover();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "VO failed");
                  setExporting(false);
                  return;
                } finally {
                  setExporting(false);
                  setProgress(null);
                }
              }
              if (t >= durRef.current - 0.05) seek(0);
              setPlaying((p) => !p);
            })();
          }}
          style={btnStyle}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            setPlaying(false);
            seek(0);
          }}
          style={btnStyle}
        >
          <RotateCcw size={16} />
          Reset
        </button>
        <button
          type="button"
          disabled={exporting}
          onClick={() => void downloadMp4()}
          style={{
            ...btnStyle,
            background: COLORS.accent,
            color: "#fff",
            border: "none",
          }}
        >
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {exporting ? "Exporting…" : "Download MP4"}
        </button>
      </div>

      <div
        style={{
          marginTop: 20,
          width: "100%",
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: COLORS.inkMuted }}>
          <span style={{ fontWeight: 650, color: COLORS.ink }}>Speaker</span>
          <select
            value={voiceId}
            disabled={exporting}
            onChange={(e) => {
              setVoiceId(e.target.value as VoiceActorId);
              setVoBlob(null);
              setPlaying(false);
              seek(0);
              setMsg(null);
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${COLORS.glassBorder}`,
              background: COLORS.bgElevated,
              color: COLORS.ink,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {VOICE_ACTORS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            void (async () => {
              try {
                setExporting(true);
                setMsg(null);
                await ensureVoiceover(true);
                seek(0);
                setPlaying(true);
                setMsg(`Preview ready · ${VOICE_ACTORS.find((v) => v.id === voiceId)?.label ?? voiceId}`);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "VO failed");
              } finally {
                setExporting(false);
                setProgress(null);
              }
            })();
          }}
          style={btnStyle}
        >
          {exporting && progress?.includes("VO") ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
          Generate & preview this speaker
        </button>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: COLORS.inkMuted,
            cursor: exporting ? "default" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={includeVo}
            disabled={exporting}
            onChange={(e) => {
              setIncludeVo(e.target.checked);
              setVoBlob(null);
            }}
          />
          Include voice-over in download (natural brand pacing)
        </label>
      </div>

      <p style={{ marginTop: 12, fontSize: 12, color: COLORS.inkFaint, maxWidth: 420, textAlign: "center", lineHeight: 1.45 }}>
        Script: brand + slogan → pause → Supports 62 languages → Start your free trial now.
      </p>

      <p style={{ marginTop: 12, fontSize: 12, color: COLORS.inkFaint }}>
        {t.toFixed(2)}s / {duration.toFixed(1)}s
        {progress ? ` · ${progress}` : ""}
      </p>
      {msg ? (
        <p
          style={{
            marginTop: 8,
            fontSize: 13,
            color: msg.includes("Downloaded") || msg.includes("Preview ready") ? "#4ADE80" : "#F87171",
            maxWidth: 420,
            textAlign: "center",
          }}
        >
          {msg}
        </p>
      ) : null}
    </div>
  );
}

const btnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  borderRadius: 12,
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.bgElevated,
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: 650,
  cursor: "pointer",
};
