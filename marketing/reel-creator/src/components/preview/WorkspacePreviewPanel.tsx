/**
 * Live workspace preview for Studio — plays estimated VO timing before generate.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { WorkspaceSegment } from "@/components/preview/WorkspaceSegment";
import { COLORS } from "@/lib/brandSystem";
import type { LanguagePair } from "@/lib/languageFlags";
import {
  buildEstimatedWorkspaceSchedule,
  workspaceScheduleDurationSec,
  type WorkspaceConversation,
} from "@/lib/workspaceModel";

const CANVAS_W = 1080;
const PREVIEW_W = 270;
const PREVIEW_H = 480;
const SCALE = PREVIEW_W / CANVAS_W;

type Props = {
  conversation: WorkspaceConversation;
  languagePair: LanguagePair;
  subtitleScale?: number;
};

export function WorkspacePreviewPanel({
  conversation,
  languagePair,
  subtitleScale = 1,
}: Props) {
  const schedule = useMemo(
    () => buildEstimatedWorkspaceSchedule(conversation.exchanges),
    [conversation.exchanges],
  );
  const durationSec = useMemo(
    () => workspaceScheduleDurationSec(schedule),
    [schedule],
  );

  const [playing, setPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number | undefined>(undefined);
  const tRef = useRef(0);

  useEffect(() => {
    tRef.current = playheadSec;
  }, [playheadSec]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    lastRef.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - (lastRef.current ?? now)) / 1000;
      lastRef.current = now;
      const next = tRef.current + dt;
      if (next >= durationSec) {
        setPlayheadSec(durationSec);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setPlayheadSec(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, durationSec]);

  function reset() {
    setPlaying(false);
    tRef.current = 0;
    setPlayheadSec(0);
  }

  return (
    <div>
      <div
        style={{
          position: "relative",
          width: PREVIEW_W,
          height: PREVIEW_H,
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${COLORS.glassBorder}`,
          background: "#0B0F19",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_W * (16 / 9),
            transform: `scale(${SCALE})`,
            transformOrigin: "top left",
          }}
        >
          <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_W * (16 / 9) }}>
            <WorkspaceSegment
              conversation={conversation}
              languagePair={languagePair}
              segmentProgress={playheadSec / durationSec}
              playheadSec={playheadSec}
              voSchedule={schedule}
              durationSec={durationSec}
              subtitleScale={subtitleScale}
              voSyncedTyping
              smoothTranscriptScroll
            />
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button type="button" onClick={() => setPlaying((p) => !p)} style={btnStyle}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Preview"}
        </button>
        <button type="button" onClick={reset} style={btnStyle}>
          <RotateCcw size={14} />
          Reset
        </button>
        <span style={{ fontSize: 11, color: COLORS.inkFaint, marginLeft: 4 }}>
          {playheadSec.toFixed(1)}s / {durationSec.toFixed(1)}s
        </span>
      </div>
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
