import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type PromoProps = {
  screenVideo: string;
  voiceoverAudio: string;
  musicAudio: string | null;
};

const CAPTIONS = [
  {from: 0, to: 90, text: "Most tools miss the caller"},
  {from: 90, to: 180, text: "Captures call audio directly"},
  {from: 180, to: 360, text: "Live transcription and instant translation"},
  {from: 360, to: 540, text: "Speaker-separated segments (diarization)"},
  {from: 540, to: 660, text: "Spanish ↔ English, live both ways"},
  {from: 660, to: 750, text: "Consistent terminology"},
];

const panel: React.CSSProperties = {
  borderRadius: 36,
  border: "2px solid rgba(255,255,255,0.14)",
  boxShadow: "0 30px 90px rgba(0,0,0,0.45), 0 0 120px rgba(30,120,255,0.16)",
  overflow: "hidden",
  backgroundColor: "#0f1722",
};

const badgeStyle: React.CSSProperties = {
  fontSize: 34,
  fontWeight: 800,
  letterSpacing: 0.3,
  color: "#ebf4ff",
  textShadow: "0 6px 26px rgba(0,0,0,0.45)",
  background: "linear-gradient(90deg, rgba(21,94,239,0.88), rgba(14,165,233,0.88))",
  border: "1px solid rgba(125,211,252,0.55)",
  borderRadius: 999,
  padding: "16px 30px",
};

const stageMap = [
  {from: 0, to: 90, zoom: 1.08},
  {from: 90, to: 180, zoom: 1.0},
  {from: 180, to: 360, zoom: 1.04},
  {from: 360, to: 540, zoom: 1.08},
  {from: 540, to: 660, zoom: 1.03},
  {from: 660, to: 750, zoom: 1.1},
  {from: 750, to: 900, zoom: 0.97},
];

const getStageZoom = (frame: number): number => {
  const st = stageMap.find((s) => frame >= s.from && frame < s.to) ?? stageMap[stageMap.length - 1]!;
  const progress = interpolate(frame, [st.from, st.to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return st.zoom + progress * 0.02;
};

const overlayCard = (label: string, y: number): React.CSSProperties => ({
  position: "absolute",
  left: 86,
  top: y,
  background: "rgba(6,15,28,0.72)",
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 22,
  padding: "16px 20px",
  color: "#e5edf8",
  fontSize: 30,
  fontWeight: 700,
  backdropFilter: "blur(8px)",
  boxShadow: "0 14px 40px rgba(0,0,0,0.35)",
  maxWidth: 860,
  lineHeight: 1.2,
  whiteSpace: "pre-line",
  pointerEvents: "none",
  zIndex: 20,
});

const EndScreen: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 30% 20%, rgba(37,99,235,0.35), rgba(3,7,18,0.95) 55%), #020617",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
      }}
    >
      <div
        style={{
          textAlign: "center",
          padding: "0 80px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 92,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: -1,
          }}
        >
          Try Free
          <br />
          <span style={{color: "#38bdf8"}}>2 hours daily</span>
        </h1>
        <p
          style={{
            marginTop: 34,
            fontSize: 48,
            fontWeight: 700,
            color: "#cbd5e1",
            letterSpacing: 0.6,
          }}
        >
          app.interpreterai.org
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const PromoVertical: React.FC<PromoProps> = ({screenVideo, voiceoverAudio, musicAudio}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const zoom = getStageZoom(frame);

  const pulse = 0.8 + 0.2 * Math.sin(frame / 10);
  const badgeIn = spring({
    frame,
    fps,
    config: {
      damping: 14,
      stiffness: 110,
      mass: 0.7,
    },
  });

  const caption = CAPTIONS.find((c) => frame >= c.from && frame < c.to)?.text ?? null;
  const captionAlpha = caption
    ? interpolate(frame, [Math.max(0, (CAPTIONS.find((c) => c.text === caption)?.from ?? 0) + 2), (CAPTIONS.find((c) => c.text === caption)?.from ?? 0) + 16], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 25% 10%, rgba(37,99,235,0.24), rgba(2,6,23,0.95) 45%), #020617",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 70% 75%, rgba(14,165,233,0.15), rgba(2,6,23,0) 45%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 70,
          ...panel,
          transform: `scale(${zoom})`,
          transformOrigin: "50% 50%",
        }}
      >
        <OffthreadVideo
          src={staticFile(screenVideo)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
          muted
        />

        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(2,6,23,0.25) 0%, rgba(2,6,23,0.04) 25%, rgba(2,6,23,0.26) 100%)",
          }}
        />
      </div>

      {/* 3s-6s: tab audio highlight */}
      <Sequence from={90} durationInFrames={90}>
        <div
          style={{
            ...overlayCard("Tab Audio ON", 1460),
            transform: `translateY(${interpolate(frame, [90, 118], [40, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px) scale(${0.92 + badgeIn * 0.08})`,
            background:
              "linear-gradient(90deg, rgba(37,99,235,0.9), rgba(14,165,233,0.9))",
            borderColor: "rgba(125,211,252,0.8)",
            boxShadow: "0 18px 48px rgba(14,165,233,0.4)",
          }}
        />
      </Sequence>

      {/* 12s-18s: diarization overlays */}
      <Sequence from={360} durationInFrames={180}>
        <div style={overlayCard("Speaker 1 (EN)\nCan you describe your symptoms?", 220)} />
        <div
          style={{
            ...overlayCard("Speaker 2 (ES)\nMe duele el pecho desde ayer", 460),
            borderColor: "rgba(52,211,153,0.45)",
          }}
        />
      </Sequence>

      {/* 18s-22s: bidirectional live */}
      <Sequence from={540} durationInFrames={120}>
        <div style={overlayCard("Spanish → English", 250)} />
        <div style={overlayCard("English → Spanish", 410)} />
      </Sequence>

      {/* 22s-25s: glossary lock term */}
      <Sequence from={660} durationInFrames={90}>
        <div
          style={{
            ...overlayCard('Glossary lock: "chest pain" → "dolor en el pecho"', 300),
            borderColor: "rgba(251,191,36,0.55)",
            boxShadow: "0 14px 38px rgba(251,191,36,0.2)",
          }}
        />
      </Sequence>

      {/* Captions synced to timing blocks */}
      {caption ? (
        <div
          style={{
            position: "absolute",
            bottom: 180,
            left: 60,
            right: 60,
            opacity: captionAlpha,
            transform: `translateY(${interpolate(frame, [0, 12], [16, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}px)`,
            display: "flex",
            justifyContent: "center",
            zIndex: 30,
          }}
        >
          <div style={badgeStyle}>{caption}</div>
        </div>
      ) : null}

      {/* subtle pulse so ad feels alive */}
      <div
        style={{
          position: "absolute",
          right: 88,
          top: 96,
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "#38bdf8",
          boxShadow: `0 0 ${40 * pulse}px rgba(56,189,248,0.75)`,
          zIndex: 40,
        }}
      />

      {/* End screen */}
      <Sequence from={750} durationInFrames={150}>
        <EndScreen />
      </Sequence>

      <Audio src={staticFile(voiceoverAudio)} />
      {musicAudio ? <Audio src={staticFile(musicAudio)} volume={0.12} /> : null}
    </AbsoluteFill>
  );
};
