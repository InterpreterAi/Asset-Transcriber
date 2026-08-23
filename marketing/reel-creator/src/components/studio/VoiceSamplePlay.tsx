import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { COLORS } from "@/lib/brandSystem";
import type { VoiceActorId } from "@/lib/constants/languages";
import { playVoiceSample, stopVoiceSamplePlayback } from "@/lib/voiceSample";

type Props = {
  voiceId: VoiceActorId;
  language?: string;
  disabled?: boolean;
  compact?: boolean;
  accent?: string;
};

export function VoiceSamplePlay({
  voiceId,
  language = "en",
  disabled,
  compact,
  accent = COLORS.accent,
}: Props) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function onClick(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (disabled || state === "loading") return;
    if (state === "playing") {
      stopVoiceSamplePlayback();
      setState("idle");
      return;
    }
    setState("loading");
    try {
      await playVoiceSample(voiceId, language, () => {
        if (mountedRef.current) setState("playing");
      });
      if (mountedRef.current) setState("idle");
    } catch {
      if (mountedRef.current) setState("error");
      window.setTimeout(() => {
        if (mountedRef.current) setState("idle");
      }, 2200);
    }
  }

  const label =
    state === "loading" ? "Loading sample" : state === "playing" ? "Stop sample" : "Play sample";

  return (
    <button
      type="button"
      disabled={disabled || state === "loading"}
      aria-label={label}
      title={
        state === "error"
          ? "Preview failed — start api-server on :8787 or try again"
          : "Play a short voice sample (instant MP3 or live TTS)"
      }
      onClick={(e) => void onClick(e)}
      style={{
        ...btnStyle,
        width: compact ? 34 : 38,
        height: compact ? 34 : 38,
        borderColor: state === "error" ? "#F87171" : state === "playing" ? accent : COLORS.glassBorder,
        color: state === "playing" ? accent : state === "error" ? "#F87171" : COLORS.inkMuted,
        background: state === "playing" ? "rgba(32,212,240,0.1)" : "transparent",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {state === "loading" ? (
        <Loader2 size={compact ? 14 : 15} className="animate-spin" />
      ) : state === "playing" ? (
        <Pause size={compact ? 14 : 15} />
      ) : (
        <Play size={compact ? 14 : 15} />
      )}
    </button>
  );
}

const btnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: "transparent",
};
