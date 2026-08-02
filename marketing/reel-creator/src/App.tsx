import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  CANVAS_H,
  CANVAS_W,
  compositionDurationMs,
  reelConfig,
  type ReelConfig,
} from "./lib/config";
import {
  exportCompositionMp4,
  exportMiddleFramePng,
  verifyRecordingFidelity,
  type ExportProgress,
  type FidelityReport,
} from "./lib/exportComposition";
import {
  isReelHandoffPayload,
  REEL_HANDOFF_READY,
} from "./lib/recordingHandoff";
import { useCompositionClock } from "./hooks/useCompositionClock";
import { ReelStage } from "./components/ReelStage";
import { ExportOverlayHost } from "./components/ExportOverlayHost";

type OverlayMode = "intro" | "outro" | "none";

export default function App() {
  const [cfg] = useState<ReelConfig>(reelConfig);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [exportOverlay, setExportOverlay] = useState<OverlayMode>("none");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fidelity, setFidelity] = useState<FidelityReport | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportHostRef = useRef<HTMLDivElement | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  const totalMs = useMemo(
    () => compositionDurationMs(videoDuration, cfg),
    [videoDuration, cfg],
  );
  const clock = useCompositionClock(totalMs);

  const clockSeekRef = useRef(clock.seek);
  const clockPauseRef = useRef(clock.pause);
  clockSeekRef.current = clock.seek;
  clockPauseRef.current = clock.pause;

  const loadRecording = useCallback(
    (file: Blob, name: string) => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      const url = URL.createObjectURL(file);
      videoUrlRef.current = url;
      setVideoUrl(url);
      setFileName(name);
      setVideoDuration(0);
      setVideoSize(null);
      setFidelity(null);
      setSizeError(null);
      setMsg(
        `Loaded ${name} from Admin Marketing Demo. Timeline: Intro ${cfg.intro.durationMs}ms → recording → Outro ${cfg.outro.durationMs}ms. Click Export MP4.`,
      );
      clockSeekRef.current(0);
      clockPauseRef.current();
    },
    [cfg.intro.durationMs, cfg.outro.durationMs],
  );

  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  // Auto-accept recording handoff from /admin/demo-marketing
  useEffect(() => {
    const announce = () => {
      try {
        window.opener?.postMessage({ type: REEL_HANDOFF_READY }, "*");
      } catch {
        /* ignore */
      }
      // Also announce to any parent that pinged us
    };
    announce();

    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === "interpreterai-reel-ping") {
        if (ev.source && "postMessage" in ev.source) {
          (ev.source as Window).postMessage({ type: REEL_HANDOFF_READY }, "*");
        }
        return;
      }
      if (!isReelHandoffPayload(ev.data)) return;
      const blob = new Blob([ev.data.buffer], { type: ev.data.mimeType || "video/mp4" });
      loadRecording(blob, ev.data.filename || "demo-marketing-recording.mp4");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [loadRecording]);

  const onFile = (file: File | null) => {
    if (!file) return;
    loadRecording(file, file.name);
  };

  const onVideoMeta = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Number.isFinite(v.duration)) setVideoDuration(v.duration);
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setVideoSize({ w: v.videoWidth, h: v.videoHeight });
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener("loadedmetadata", onVideoMeta);
    if (v.readyState >= 1) onVideoMeta();
    return () => v.removeEventListener("loadedmetadata", onVideoMeta);
  }, [videoUrl, onVideoMeta]);

  const waitForPaint = () =>
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const sizeMatches =
    !!videoSize && videoSize.w === CANVAS_W && videoSize.h === CANVAS_H;

  const runVerify = async () => {
    const video = videoRef.current;
    if (!video || !videoUrl || videoDuration <= 0) {
      setMsg("Upload a recording first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const report = await verifyRecordingFidelity(video);
      setFidelity(report);
      setMsg(
        report.ok
          ? `FIDELITY PASS — blitRecordingFrame matches uploaded MP4 exactly (0 mismatched pixels). ${CANVAS_W}×${CANVAS_H} 1:1.`
          : report.errors.join("\n"),
      );
    } catch (e) {
      setFidelity(null);
      setMsg(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setBusy(false);
    }
  };

  const dumpMiddlePng = async () => {
    const video = videoRef.current;
    if (!video || !videoUrl || videoDuration <= 0) {
      setMsg("Upload a recording first.");
      return;
    }
    setBusy(true);
    try {
      const report = await exportMiddleFramePng(video);
      setFidelity(report);
      setMsg("Saved reel-middle-frame.png via shared blit pipeline (1:1).");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "PNG export failed");
    } finally {
      setBusy(false);
    }
  };

  const exportMp4 = async () => {
    const video = videoRef.current;
    const overlayHost = exportHostRef.current;
    if (!video || !overlayHost || !videoUrl || videoDuration <= 0) {
      setMsg("Upload a screen recording of /admin/demo-marketing first.");
      return;
    }
    if (!sizeMatches) {
      setMsg(
        `EXPORT ABORTED — recording is ${videoSize?.w ?? "?"}×${videoSize?.h ?? "?"}, required ${CANVAS_W}×${CANVAS_H}.`,
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    setProgress({ pct: 0, stage: "verifying", detail: "Pixel-exact gate…" });
    clock.pause();
    try {
      const report = await exportCompositionMp4({
        video,
        overlayHost,
        setOverlay: (mode) => {
          flushSync(() => setExportOverlay(mode));
        },
        waitForPaint,
        cfg,
        filename: `${cfg.export.filename}.mp4`,
        onProgress: setProgress,
      });
      setFidelity(report);
      setMsg(
        `Exported ${CANVAS_W}×${CANVAS_H}. Pixel gate passed (mismatchedPixels=${report.mismatchedPixels}). Middle = uploaded MP4 1:1.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Export failed");
      setProgress(null);
    } finally {
      setExportOverlay("none");
      setBusy(false);
    }
  };

  const progressPct = totalMs ? (clock.elapsedMs / totalMs) * 100 : 0;

  return (
    <div className="reel-shell">
      <aside className="panel">
        <h1 style={{ margin: "0 0 6px", fontSize: 18 }}>Reel Creator</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Assembler only. Preview and export share <code>blitRecordingFrame</code> — 1:1 from your
          MP4. Required size: <strong>{CANVAS_W}×{CANVAS_H}</strong>. Any pixel mismatch aborts
          export. No workspace UI is rendered.
        </p>

        <a
          className="btn btn-primary"
          style={{ display: "inline-flex", textDecoration: "none", marginBottom: 14 }}
          href={cfg.demoUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open real Admin Marketing Demo
        </a>

        <ol className="muted" style={{ margin: "0 0 14px", paddingLeft: 18, lineHeight: 1.55 }}>
          <li>
            Preferred: open <code>/admin/demo-marketing</code> → <strong>Record</strong> → use demo →{" "}
            <strong>Stop</strong> (auto-loads here).
          </li>
          <li>Or upload a {CANVAS_W}×{CANVAS_H} MP4 manually.</li>
          <li>Export MP4 — Intro + recording + Outro (assembler only).</li>
        </ol>

        <div className="field">
          <label>Recording MP4 ({CANVAS_W}×{CANVAS_H} required)</label>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/*"
            disabled={busy}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {fileName ? (
          <p className="muted">
            {fileName}
            {videoDuration > 0 ? ` · ${videoDuration.toFixed(1)}s` : ""}
            {videoSize ? ` · ${videoSize.w}×${videoSize.h}` : ""}
            {videoSize
              ? sizeMatches
                ? " · OK 1:1"
                : " · REJECT (not 1080×1920)"
              : ""}
          </p>
        ) : null}

        {sizeError ? (
          <pre
            className="muted"
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(248,113,113,0.45)",
              background: "rgba(248,113,113,0.08)",
              whiteSpace: "pre-wrap",
              fontSize: 11,
            }}
          >
            {sizeError}
          </pre>
        ) : null}

        {fidelity ? (
          <pre
            className="muted"
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 10,
              border: `1px solid ${fidelity.ok ? "rgba(34,211,238,0.35)" : "rgba(248,113,113,0.45)"}`,
              background: fidelity.ok ? "rgba(34,211,238,0.06)" : "rgba(248,113,113,0.08)",
              whiteSpace: "pre-wrap",
              fontSize: 11,
            }}
          >
            {fidelity.ok ? "FIDELITY PASS" : "FIDELITY FAIL"}
            {"\n"}
            size: {fidelity.srcW}×{fidelity.srcH}
            {"\n"}
            mismatchedPixels: {fidelity.mismatchedPixels}
            {fidelity.firstMismatch
              ? `\nfirst: (${fidelity.firstMismatch.x},${fidelity.firstMismatch.y}) ch${fidelity.firstMismatch.ch} src=${fidelity.firstMismatch.src} out=${fidelity.firstMismatch.out}`
              : ""}
            {fidelity.errors.length ? `\n${fidelity.errors.slice(0, 4).join("\n")}` : ""}
          </pre>
        ) : null}

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={!videoUrl || busy || !sizeMatches}
            onClick={() => void runVerify()}
          >
            Verify pixels
          </button>
          <button
            type="button"
            className="btn"
            disabled={!videoUrl || busy || !sizeMatches}
            onClick={() => void dumpMiddlePng()}
          >
            Dump middle PNG
          </button>
        </div>

        <p className="muted" style={{ marginTop: 12 }}>
          Timeline: Intro {cfg.intro.durationMs}ms → Recording → Outro {cfg.outro.durationMs}ms
          {videoDuration > 0 ? ` · Total ${(totalMs / 1000).toFixed(1)}s` : ""}
        </p>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!videoUrl || busy || !sizeMatches}
            onClick={() => clock.restart()}
          >
            Play
          </button>
          <button
            type="button"
            className="btn"
            disabled={!videoUrl || busy || !sizeMatches}
            onClick={() => (clock.playing ? clock.pause() : clock.play())}
          >
            {clock.playing ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!videoUrl || busy}
            onClick={() => {
              clock.pause();
              clock.seek(0);
            }}
          >
            Reset
          </button>
        </div>

        <hr style={{ border: 0, borderTop: "1px solid rgba(255,255,255,0.08)", margin: "18px 0" }} />

        {busy && progress ? (
          <div className="export-progress">
            <div className="export-progress-meta">
              <span>{progress.detail}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="export-progress-track">
              <div className="export-progress-fill" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        ) : null}

        <div className="btn-row" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!videoUrl || busy || !sizeMatches}
            onClick={() => void exportMp4()}
          >
            {busy ? "Working…" : "Export MP4"}
          </button>
        </div>
        {msg ? (
          <pre className="muted" style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 11 }}>
            {msg}
          </pre>
        ) : null}
      </aside>

      <main className="stage-wrap">
        <ReelStage
          videoUrl={videoUrl}
          videoRef={videoRef}
          canvasRef={canvasRef}
          elapsedMs={clock.elapsedMs}
          playing={clock.playing}
          cfg={cfg}
          onSizeError={setSizeError}
        />
        <div className="timeline-bar">
          <div className="timeline-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </main>

      <ExportOverlayHost mode={exportOverlay} cfg={cfg} hostRef={exportHostRef} />
    </div>
  );
}
