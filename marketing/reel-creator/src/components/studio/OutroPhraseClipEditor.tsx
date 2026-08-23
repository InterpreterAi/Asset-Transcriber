/**
 * Outro phrase clips — each card pairs spoken VO with the on-screen layer it triggers.
 */

import { type CSSProperties } from "react";
import { Mic, Type, Volume2, VolumeX } from "lucide-react";
import { COLORS, TYPE } from "@/lib/brandSystem";
import { isRtlLanguage } from "@/lib/constants/languages";
import type { OutroLayerId } from "@/lib/outroLayerLayout";
import { OUTRO_LAYER_LABELS } from "@/lib/outroLayerLayout";
import {
  OUTRO_CLIP_EDITOR_SPECS,
  type OutroPhraseTiming,
} from "@/lib/outroVoPacing";
import { UNIVERSAL_OUTRO_EN } from "@/lib/universalBrandOutro";

type ScreenCopy = {
  line1: string;
  line2: string;
  languagesLine: string;
  ctaHeadline: string;
  url: string;
  ctaSubline: string;
};

type Props = {
  voPhrases: string[];
  onVoPhraseChange: (index: number, text: string) => void;
  phraseMuted: boolean[];
  onPhraseMutedChange: (index: number, muted: boolean) => void;
  screen: ScreenCopy;
  onScreenChange: (layerId: OutroLayerId, value: string) => void;
  phraseTimings: OutroPhraseTiming[];
  hasVoSync: boolean;
  playheadSec?: number;
  playing?: boolean;
  language?: string;
  disabled?: boolean;
};

function screenForLayer(layerId: OutroLayerId, screen: ScreenCopy): string {
  if (layerId === "line1") return screen.line1;
  if (layerId === "line2") return screen.line2;
  if (layerId === "languagesLine") return screen.languagesLine;
  if (layerId === "ctaHeadline") return screen.ctaHeadline;
  if (layerId === "url") return screen.url;
  return "";
}

const cardStyle: CSSProperties = {
  marginBottom: 14,
  padding: 14,
  borderRadius: 14,
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.bgElevated,
};

const fieldLabel: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  margin: "0 0 6px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.inkFaint,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: "rgba(255,255,255,0.04)",
  color: COLORS.ink,
  fontFamily: TYPE.body.family,
  fontSize: 13,
  lineHeight: 1.45,
};

const muteBtnStyle = (active: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "4px 8px",
  borderRadius: 8,
  border: `1px solid ${active ? "rgba(248,113,113,0.45)" : COLORS.glassBorder}`,
  background: active ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.04)",
  color: active ? "#F87171" : COLORS.inkMuted,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
});

export function OutroPhraseClipEditor({
  voPhrases,
  onVoPhraseChange,
  phraseMuted,
  onPhraseMutedChange,
  screen,
  onScreenChange,
  phraseTimings,
  hasVoSync,
  playheadSec = 0,
  playing = false,
  language = "en",
  disabled = false,
}: Props) {
  const rtl = isRtlLanguage(language);

  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
        Each clip has two independent fields — voiceover and on-screen text can say{" "}
        <strong style={{ color: COLORS.ink }}>different things</strong>. They still share the same
        timing slot, so animation stays synced. Regenerate voiceover after VO edits.
      </p>

      {OUTRO_CLIP_EDITOR_SPECS.map((spec) => {
        const timing = phraseTimings.find((t) => t.layerId === spec.layerId);
        const isVoMuted = phraseMuted[spec.index] ?? false;
        const screenActive =
          playing &&
          timing != null &&
          playheadSec + 0.02 >= timing.startSec &&
          playheadSec < timing.endSec;
        const voActive = screenActive && !isVoMuted;
        const screenSynced = timing != null && timing.startSec >= 0;
        const voSynced = !isVoMuted && hasVoSync && screenSynced;

        return (
          <div
            key={spec.layerId}
            style={{
              ...cardStyle,
              borderColor: screenActive ? "rgba(32,212,240,0.55)" : COLORS.glassBorder,
              background: screenActive ? "rgba(32,212,240,0.08)" : COLORS.bgElevated,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
                Phrase {spec.index + 1} · {spec.label}
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: COLORS.inkFaint }}>
                  → {OUTRO_LAYER_LABELS[spec.layerId]}
                </span>
              </p>
              {screenSynced ? (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#34D399" }}>
                  On screen · {timing!.startSec.toFixed(1)}s
                  {screenActive ? " · playing" : ""}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: COLORS.inkFaint }}>Sync after preview</span>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${
                    isVoMuted
                      ? "rgba(248,113,113,0.35)"
                      : voActive
                        ? "rgba(32,212,240,0.45)"
                        : "rgba(255,255,255,0.06)"
                  }`,
                  background: isVoMuted
                    ? "rgba(248,113,113,0.06)"
                    : voActive
                      ? "rgba(32,212,240,0.06)"
                      : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <p style={{ ...fieldLabel, margin: 0 }}>
                    <Mic size={12} />
                    Says (voiceover)
                  </p>
                  <button
                    type="button"
                    onClick={() => onPhraseMutedChange(spec.index, !isVoMuted)}
                    disabled={disabled}
                    title={isVoMuted ? "Unmute voiceover" : "Mute voiceover only"}
                    style={muteBtnStyle(isVoMuted)}
                  >
                    {isVoMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    {isVoMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
                {isVoMuted ? (
                  <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 600, color: "#F87171" }}>
                    Voiceover muted — on screen still shows
                  </p>
                ) : voSynced ? (
                  <p style={{ margin: "0 0 6px", fontSize: 10, color: COLORS.inkFaint }}>
                    Synced to audio · {timing!.startSec.toFixed(1)}s
                  </p>
                ) : null}
                <textarea
                  value={voPhrases[spec.index] ?? ""}
                  onChange={(e) => onVoPhraseChange(spec.index, e.target.value)}
                  disabled={disabled}
                  rows={2}
                  dir={rtl ? "rtl" : "ltr"}
                  placeholder={spec.defaultSpoken}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    opacity: isVoMuted ? 0.7 : 1,
                    borderColor: isVoMuted ? "rgba(248,113,113,0.25)" : COLORS.glassBorder,
                    background: isVoMuted ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.04)",
                  }}
                />
                {isVoMuted ? (
                  <p style={{ margin: "6px 0 0", fontSize: 10, color: COLORS.inkFaint, lineHeight: 1.4 }}>
                    Script saved — unmute and regenerate voiceover to speak this line.
                  </p>
                ) : null}
              </div>
              <div
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${screenActive ? "rgba(32,212,240,0.45)" : "rgba(255,255,255,0.06)"}`,
                  background: screenActive ? "rgba(32,212,240,0.06)" : "rgba(255,255,255,0.02)",
                }}
              >
                <p style={fieldLabel}>
                  <Type size={12} />
                  On screen
                </p>
                <textarea
                  value={screenForLayer(spec.layerId, screen)}
                  onChange={(e) => onScreenChange(spec.layerId, e.target.value)}
                  disabled={disabled}
                  rows={2}
                  dir={rtl ? "rtl" : "ltr"}
                  placeholder={spec.defaultSpoken}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ ...cardStyle, opacity: 0.85 }}>
        <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
          On screen only · {OUTRO_LAYER_LABELS.ctaSubline}
        </p>
        <p style={fieldLabel}>
          <Type size={12} />
          Not spoken — appears with CTA
        </p>
        <input
          value={screen.ctaSubline}
          onChange={(e) => onScreenChange("ctaSubline", e.target.value)}
          disabled={disabled}
          placeholder={UNIVERSAL_OUTRO_EN.ctaSubline}
          style={inputStyle}
        />
      </div>
    </div>
  );
}
