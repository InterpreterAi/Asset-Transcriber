/**
 * Delivery style picker — acting preset for workspace speakers with live TTS preview.
 * ▶ Listen to any style before selecting — no full voiceover generate required.
 */

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { COLORS } from "@/lib/brandSystem";
import type { VoiceActorId } from "@/lib/constants/languages";
import {
  WORKSPACE_DELIVERY_PRESETS,
  type WorkspaceDeliveryPresetId,
  getDeliveryPreset,
  DELIVERY_PREVIEW_LINE,
} from "@/lib/workspaceDeliveryPresets";
import { playVoiceSampleWithDelivery, stopVoiceSamplePlayback } from "@/lib/voiceSample";

type Props = {
  value: WorkspaceDeliveryPresetId;
  onChange: (id: WorkspaceDeliveryPresetId) => void;
  voiceId: VoiceActorId;
  language?: string;
  disabled?: boolean;
  /** Keep ▶ preview enabled even when the picker is locked. */
  allowPreviewWhileDisabled?: boolean;
  accent?: string;
  label?: string;
};

export function DeliveryPresetSelect({
  value,
  onChange,
  voiceId,
  language = "en",
  disabled,
  allowPreviewWhileDisabled = true,
  accent = COLORS.accent,
  label = "Delivery style",
}: Props) {
  const [open, setOpen] = useState(false);
  const [playId, setPlayId] = useState<WorkspaceDeliveryPresetId | null>(null);
  const [playState, setPlayState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = getDeliveryPreset(value);
  const previewLocked = disabled && !allowPreviewWhileDisabled;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function previewDelivery(presetId: WorkspaceDeliveryPresetId, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (previewLocked || playState === "loading") return;
    if (playState === "playing" && playId === presetId) {
      stopVoiceSamplePlayback();
      setPlayState("idle");
      setPlayId(null);
      return;
    }
    setPlayId(presetId);
    setPlayState("loading");
    try {
      await playVoiceSampleWithDelivery(voiceId, language, presetId, DELIVERY_PREVIEW_LINE, () => {
        setPlayState("playing");
      });
      setPlayState("idle");
      setPlayId(null);
    } catch {
      setPlayState("error");
      window.setTimeout(() => {
        setPlayState("idle");
        setPlayId(null);
      }, 2000);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <p style={fieldLabel}>{label}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          style={{
            ...triggerStyle,
            flex: 1,
            borderColor: open ? accent : COLORS.glassBorder,
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <span style={{ flex: 1, textAlign: "left" }}>
            {current.label}
            <span style={{ color: COLORS.inkFaint, fontWeight: 500 }}> · {current.hint}</span>
          </span>
          <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : undefined }} />
        </button>
        <button
          type="button"
          disabled={previewLocked || playState === "loading"}
          aria-label="Preview delivery style"
          title="Listen before generating — this voice + delivery (ElevenLabs)"
          onClick={(e) => void previewDelivery(value, e)}
          style={{
            ...previewBtn,
            borderColor:
              playState === "playing" && playId === value
                ? accent
                : playState === "error"
                  ? "#F87171"
                  : COLORS.glassBorder,
            color:
              playState === "playing" && playId === value
                ? accent
                : playState === "error"
                  ? "#F87171"
                  : COLORS.inkMuted,
          }}
        >
          {playState === "loading" && playId === value ? (
            <Loader2 size={15} className="animate-spin" />
          ) : playState === "playing" && playId === value ? (
            <Pause size={15} />
          ) : (
            <Play size={15} />
          )}
        </button>
      </div>
      {open && !disabled ? (
        <div style={menuStyle}>
          <p style={menuHint}>
            ▶ Listen to any style first, then tap the name to use it · no generate needed
          </p>
          {WORKSPACE_DELIVERY_PRESETS.map((preset) => {
            const rowPlaying = playState === "playing" && playId === preset.id;
            const rowLoading = playState === "loading" && playId === preset.id;
            return (
              <div
                key={preset.id}
                style={{
                  ...rowWrap,
                  background: preset.id === value ? "rgba(32,212,240,0.12)" : "transparent",
                }}
              >
                <button
                  type="button"
                  disabled={previewLocked || playState === "loading"}
                  aria-label={`Preview ${preset.label}`}
                  title="Play sample"
                  onClick={(e) => void previewDelivery(preset.id, e)}
                  style={{
                    ...previewBtn,
                    width: 34,
                    height: 34,
                    borderColor: rowPlaying ? accent : COLORS.glassBorder,
                    color: rowPlaying ? accent : COLORS.inkMuted,
                  }}
                >
                  {rowLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : rowPlaying ? (
                    <Pause size={14} />
                  ) : (
                    <Play size={14} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(preset.id);
                    setOpen(false);
                  }}
                  style={rowMainBtn}
                >
                  <span style={{ fontWeight: 700, color: COLORS.ink }}>{preset.label}</span>
                  <span style={{ fontSize: 11, color: COLORS.inkFaint }}>{preset.hint}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const fieldLabel: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: COLORS.inkFaint,
};

const triggerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.bgElevated,
  color: COLORS.ink,
  fontSize: 12,
  fontWeight: 650,
};

const previewBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 38,
  flexShrink: 0,
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: "transparent",
  cursor: "pointer",
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 80,
  maxHeight: 320,
  overflowY: "auto",
  borderRadius: 12,
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.bgElevated,
  boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
  padding: 6,
};

const menuHint: CSSProperties = {
  margin: "4px 8px 8px",
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1.45,
  color: COLORS.inkFaint,
};

const rowWrap: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 4,
  borderRadius: 8,
};

const rowMainBtn: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "8px 8px 8px 4px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};
