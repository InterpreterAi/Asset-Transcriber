/**
 * ElevenLabs voice picker — favorites pinned to top with star toggle + sample playback.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ChevronDown, Star } from "lucide-react";
import { COLORS } from "@/lib/brandSystem";
import { VoiceSamplePlay } from "@/components/studio/VoiceSamplePlay";
import {
  getVoiceActor,
  sortVoiceActorsForPicker,
  type VoiceActorId,
} from "@/lib/constants/languages";
import { isVoiceFavorite, listVoiceFavorites, toggleVoiceFavorite } from "@/lib/voiceFavorites";
import { VOICE_SAMPLE_LINE } from "@/lib/voiceSample";

type Props = {
  value: VoiceActorId;
  onChange: (id: VoiceActorId) => void;
  disabled?: boolean;
  /** When true, ▶ preview is still allowed so you can listen before picking. */
  allowPreviewWhileDisabled?: boolean;
  accent?: string;
  /** Language code for preview sample (workspace uses Lang A / Lang B). */
  previewLanguage?: string;
  /** Hide voices already used elsewhere (e.g. blue/yellow workspace speakers). */
  excludeVoiceIds?: VoiceActorId[];
};

function voiceGenderLabel(gender: "male" | "female" | "neutral"): string {
  if (gender === "female") return "Female";
  if (gender === "neutral") return "Neutral";
  return "Male";
}

export function VoiceActorSelect({
  value,
  onChange,
  disabled,
  allowPreviewWhileDisabled = true,
  accent = COLORS.accent,
  previewLanguage = "en",
  excludeVoiceIds = [],
}: Props) {
  const previewLocked = disabled && !allowPreviewWhileDisabled;
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<VoiceActorId[]>(() => listVoiceFavorites());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const excluded = useMemo(() => new Set(excludeVoiceIds), [excludeVoiceIds]);
  const sorted = useMemo(
    () => sortVoiceActorsForPicker(favorites).filter((v) => !excluded.has(v.id)),
    [favorites, excluded],
  );
  const current = getVoiceActor(value);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function onToggleFavorite(id: VoiceActorId, e: MouseEvent) {
    e.stopPropagation();
    setFavorites(toggleVoiceFavorite(id));
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
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
            {current.shortLabel}
            <span style={{ color: COLORS.inkFaint, fontWeight: 500 }}>
              {" "}
              · {voiceGenderLabel(current.gender)} · 62 langs
            </span>
          </span>
          <ChevronDown size={14} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : undefined }} />
        </button>
        <VoiceSamplePlay
          voiceId={value}
          language={previewLanguage}
          disabled={previewLocked}
          accent={accent}
        />
      </div>

      {open && !disabled ? (
        <div style={menuStyle}>
          <p style={menuHint}>
            ▶ Listen first, then tap a name to select · “{VOICE_SAMPLE_LINE}” · no generate needed
            {excludeVoiceIds.length > 0 ? (
              <>
                {" "}
                · Blue/yellow speakers hidden
              </>
            ) : null}
          </p>
          {sorted.length === 0 ? (
            <p style={{ ...menuHint, marginTop: 0 }}>No other voices available.</p>
          ) : null}
          {sorted.map((voice, i) => {
            const active = voice.id === value;
            const fav = isVoiceFavorite(voice.id) || favorites.includes(voice.id);
            const showDivider =
              i > 0 &&
              favorites.length > 0 &&
              favorites.includes(sorted[i - 1]!.id) &&
              !favorites.includes(voice.id);
            return (
              <div key={voice.id}>
                {showDivider ? <div style={dividerStyle}>All voices</div> : null}
                <div
                  style={{
                    ...rowStyle,
                    background: active ? "rgba(32,212,240,0.12)" : "transparent",
                  }}
                >
                  <button
                    type="button"
                    aria-label={fav ? "Unfavorite voice" : "Favorite voice"}
                    onClick={(e) => onToggleFavorite(voice.id, e)}
                    style={{
                      ...starBtn,
                      color: fav ? "#FBBF24" : COLORS.inkFaint,
                    }}
                  >
                    <Star size={14} fill={fav ? "currentColor" : "none"} />
                  </button>
                  <VoiceSamplePlay
                    voiceId={voice.id}
                    language={previewLanguage}
                    compact
                    accent={accent}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onChange(voice.id);
                      setOpen(false);
                    }}
                    style={rowMainBtn}
                  >
                    <span style={{ fontWeight: 700, color: COLORS.ink }}>{voice.shortLabel}</span>
                    <span style={{ fontSize: 11, color: COLORS.inkFaint }}>
                      {voiceGenderLabel(voice.gender)} · multilingual · tap to use
                    </span>
                    <span style={{ fontSize: 11, color: COLORS.inkMuted, lineHeight: 1.35 }}>
                      {voice.label.split("—")[1]?.trim() ?? voice.label}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const triggerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.bgElevated,
  color: COLORS.ink,
  fontSize: 13,
  fontWeight: 650,
};

const menuStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 80,
  maxHeight: 360,
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

const dividerStyle: CSSProperties = {
  margin: "8px 8px 4px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: COLORS.inkFaint,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 2,
  borderRadius: 8,
};

const starBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  flexShrink: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
};

const rowMainBtn: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 2,
  padding: "8px 8px 8px 0",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};
