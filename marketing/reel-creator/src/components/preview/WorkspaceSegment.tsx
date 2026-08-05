/**
 * Dynamic InterpreterAI workspace demo segment.
 * Everything renders deterministically from `segmentProgress` (0–1) so the
 * same sequence plays in preview and MP4 export, and compresses/expands
 * proportionally when the workspace duration changes (35s total is fixed).
 *
 * Phase map (fractions of the 15s base):
 *   0–2s    fade in + "Connecting…"
 *   2–6s    type speakerA[0] word by word
 *   6–8s    show speakerB[0] after a short delay
 *   8–11s   type speakerA[1] word by word
 *   11–13s  show speakerB[1]
 *   13–15s  fade to session summary
 */

import type { CSSProperties } from "react";
import { InterpreterAILogo } from "@/components/brand/InterpreterAILogo";
import { REEL_CAPTION_FONT } from "@/lib/kineticCaptions";
import type { WorkspaceScript } from "@/lib/generatedReel";
import type { LanguagePair } from "@/lib/languageFlags";

const BASE = 15;
const PH = {
  connectEnd: 2 / BASE,
  typeA0End: 6 / BASE,
  showB0At: 6.5 / BASE,
  showB0End: 8 / BASE,
  typeA1End: 11 / BASE,
  showB1At: 11.5 / BASE,
  showB1End: 13 / BASE,
} as const;

type Props = {
  languagePair: LanguagePair;
  workspaceScript: WorkspaceScript;
  /** 0–1 across the whole workspace segment. */
  segmentProgress: number;
  /** Actual segment length (drives the session timer). */
  durationSec?: number;
};

function typedWords(text: string, phaseProgress: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const shown = Math.max(1, Math.ceil(Math.min(1, Math.max(0, phaseProgress)) * words.length));
  return words.slice(0, shown).join(" ");
}

function phaseProgress(p: number, start: number, end: number): number {
  if (p <= start) return 0;
  if (p >= end) return 1;
  return (p - start) / (end - start);
}

function fmtTimer(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function WorkspaceSegment({
  languagePair,
  workspaceScript,
  segmentProgress,
  durationSec = 15,
}: Props) {
  const p = Math.min(1, Math.max(0, segmentProgress));
  const a0 = workspaceScript.speakerA[0] ?? "";
  const a1 = workspaceScript.speakerA[1] ?? "";
  const b0 = workspaceScript.speakerB[0] ?? "";
  const b1 = workspaceScript.speakerB[1] ?? "";

  const fadeIn = Math.min(1, p / (0.6 / BASE));
  const connecting = p < PH.connectEnd;
  const summary = p >= PH.showB1End;
  const summaryOpacity = summary ? Math.min(1, phaseProgress(p, PH.showB1End, PH.showB1End + 0.8 / BASE)) : 0;

  const a0Text = p >= PH.connectEnd ? typedWords(a0, phaseProgress(p, PH.connectEnd, PH.typeA0End)) : "";
  const b0Visible = p >= PH.showB0At;
  const a1Text = p >= PH.showB0End ? typedWords(a1, phaseProgress(p, PH.showB0End, PH.typeA1End)) : "";
  const b1Visible = p >= PH.showB1At;

  const typingA = (p >= PH.connectEnd && p < PH.typeA0End) || (p >= PH.showB0End && p < PH.typeA1End);
  const translating =
    (p >= PH.typeA0End && p < PH.showB0End) || (p >= PH.typeA1End && p < PH.showB1End);

  const statusText = connecting
    ? "Connecting…"
    : summary
      ? "Session complete"
      : translating
        ? "Translating live…"
        : typingA
          ? "Listening…"
          : "Live";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: fadeIn,
        background:
          "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(0,112,243,0.14) 0%, transparent 55%), linear-gradient(180deg, #0A1220 0%, #060A12 100%)",
        display: "flex",
        flexDirection: "column",
        padding: "72px 56px 64px",
        boxSizing: "border-box",
        fontFamily: REEL_CAPTION_FONT,
        color: "#F8FAFC",
      }}
    >
      {/* Top bar: wordmark · language pair pill · session timer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
        <InterpreterAILogo variant="wordmark" height={52} />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 999,
            background: "rgba(0,112,243,0.16)",
            border: "1px solid rgba(0,112,243,0.4)",
            fontSize: 26,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {languagePair.sourceFlag} {languagePair.sourceLabel}
          <span style={{ opacity: 0.6 }}>↔</span>
          {languagePair.targetFlag} {languagePair.targetLabel}
        </span>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 26,
            fontWeight: 700,
            color: "#67E8F9",
          }}
        >
          {fmtTimer(p * durationSec)}
        </span>
      </div>

      {/* Conversation panel */}
      <div
        style={{
          flex: 1,
          marginTop: 40,
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(2,5,11,0.68)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {connecting || summary ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              zIndex: 5,
              background: "rgba(2,5,11,0.72)",
              opacity: connecting ? 1 : summaryOpacity,
              transition: "opacity 200ms linear",
            }}
          >
            {connecting ? (
              <>
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#0070F3",
                    boxShadow: "0 0 24px rgba(0,112,243,0.9)",
                    opacity: 0.5 + 0.5 * Math.abs(Math.sin(p * BASE * Math.PI * 2)),
                  }}
                />
                <span style={{ fontSize: 34, fontWeight: 700, color: "rgba(248,250,252,0.85)" }}>
                  Connecting…
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#67E8F9" }}>
                  Session summary
                </span>
                <span style={{ fontSize: 40, fontWeight: 800, textAlign: "center", lineHeight: 1.3, padding: "0 48px" }}>
                  2 exchanges · 98% accuracy
                </span>
              </>
            )}
          </div>
        ) : null}

        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {[`${languagePair.sourceFlag} Speaker`, `${languagePair.targetFlag} AI Translation`].map(
            (label, i) => (
              <div
                key={label}
                style={{
                  padding: "18px 24px",
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: i === 0 ? "rgba(248,250,252,0.75)" : "#67E8F9",
                  borderLeft: i === 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>

        {/* Exchanges */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "12px 0" }}>
          {[
            { a: a0Text, aFull: a0, b: b0, bVisible: b0Visible },
            { a: a1Text, aFull: a1, b: b1, bVisible: b1Visible },
          ].map((row, i) =>
            row.a ? (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  alignItems: "stretch",
                }}
              >
                <div style={bubbleCell}>
                  <div style={{ ...bubble, background: "rgba(255,255,255,0.06)" }}>
                    {row.a}
                    {row.a !== row.aFull ? <Caret /> : null}
                  </div>
                </div>
                <div style={{ ...bubbleCell, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                  {row.bVisible ? (
                    <div
                      style={{
                        ...bubble,
                        background: "rgba(0,112,243,0.16)",
                        border: "1px solid rgba(0,112,243,0.35)",
                        color: "#E0F2FE",
                      }}
                    >
                      {row.b}
                    </div>
                  ) : row.a === row.aFull ? (
                    <div style={{ ...bubble, opacity: 0.45, fontStyle: "italic" }}>Translating…</div>
                  ) : null}
                </div>
              </div>
            ) : null,
          )}
        </div>
      </div>

      {/* Bottom: translation status + mic / waveform bar */}
      <div
        style={{
          marginTop: 32,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "20px 28px",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(2,5,11,0.72)",
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: summary ? "rgba(255,255,255,0.1)" : "#0070F3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: summary ? "none" : "0 0 28px rgba(0,112,243,0.55)",
            flex: "0 0 auto",
          }}
        >
          <MicGlyph />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, height: 52 }}>
          {Array.from({ length: 32 }).map((_, i) => {
            const active = !connecting && !summary;
            const h = active
              ? 10 + 38 * Math.abs(Math.sin(p * BASE * 6 + i * 0.7)) * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.3)))
              : 6;
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: h,
                  borderRadius: 4,
                  background: active ? "rgba(103,232,249,0.85)" : "rgba(255,255,255,0.18)",
                }}
              />
            );
          })}
        </div>
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: translating ? "#67E8F9" : "rgba(248,250,252,0.7)",
            whiteSpace: "nowrap",
          }}
        >
          {statusText}
        </span>
      </div>
    </div>
  );
}

function Caret() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 4,
        height: "1em",
        marginLeft: 6,
        verticalAlign: "text-bottom",
        background: "#67E8F9",
      }}
    />
  );
}

function MicGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

const bubbleCell: CSSProperties = {
  padding: "14px 22px",
  display: "flex",
  alignItems: "flex-start",
};

const bubble: CSSProperties = {
  padding: "18px 22px",
  borderRadius: 18,
  fontSize: 28,
  fontWeight: 600,
  lineHeight: 1.4,
  color: "rgba(248,250,252,0.92)",
  maxWidth: "100%",
};
