/**
 * Creative Studio V2 player — premium SaaS commercial canvas.
 * Fixed brand system. Slow motion only. New intro + outro.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, RotateCcw } from "lucide-react";
import { InterpreterAILogo } from "@/components/brand/InterpreterAILogo";
import { BRAND, CANVAS, COLORS, MOTION, TYPE } from "@/lib/brandSystem";
import type { StoryboardPackage, StoryScene } from "@/lib/storyboard";

type Props = {
  pack: StoryboardPackage | null;
  accent?: string;
  /** Seek playhead to this scene (review mode). */
  focusSceneId?: string | null;
  /** Larger preview for the studio canvas. */
  width?: number;
};

function SoftBackground({ zoom }: { zoom: boolean }) {
  return (
    <motion.div
      animate={zoom ? { scale: [1, MOTION.cameraZoom] } : { scale: 1 }}
      transition={{ duration: 10, ease: "linear" }}
      style={{
        position: "absolute",
        inset: 0,
        background: COLORS.gradient,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 70%, transparent 20%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </motion.div>
  );
}

function IntroCard() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 40,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: MOTION.ease }}
        style={{ textAlign: "center" }}
      >
        <div
          style={{
            filter: "drop-shadow(0 0 40px rgba(59,130,246,0.35))",
            marginBottom: 28,
          }}
        >
          <InterpreterAILogo variant="wordmark" height={72} />
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: TYPE.body.family,
            fontSize: 28,
            fontWeight: 500,
            color: COLORS.inkMuted,
            letterSpacing: "-0.02em",
          }}
        >
          {BRAND.tagline1}
        </p>
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: TYPE.body.family,
            fontSize: 28,
            fontWeight: 500,
            color: COLORS.inkFaint,
            letterSpacing: "-0.02em",
          }}
        >
          {BRAND.tagline2}
        </p>
      </motion.div>
    </div>
  );
}

/** Premium end card — Apple-like spacing, no clutter. */
function OutroCard({ localTime }: { localTime: number }) {
  const showLogo = localTime >= 0.5;
  const showTag = localTime >= 1.3;
  const showDomains = localTime >= 2.0;
  const showCta = localTime >= 2.8;
  const showUrl = localTime >= 3.5;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(59,130,246,0.1) 0%, transparent 60%), #05070C",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `0 ${CANVAS.safePadX}px`,
        zIndex: 50,
        textAlign: "center",
      }}
    >
      <AnimatePresence>
        {showLogo && (
          <motion.div
            key="logo"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: MOTION.ease }}
            style={{ marginBottom: 48 }}
          >
            <InterpreterAILogo variant="wordmark" height={88} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTag && (
          <motion.div
            key="tag"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: MOTION.ease }}
            style={{ marginBottom: 40, maxWidth: 820 }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: TYPE.title.family,
                fontSize: 40,
                fontWeight: 600,
                color: COLORS.ink,
                letterSpacing: "-0.03em",
                lineHeight: 1.25,
              }}
            >
              {BRAND.tagline1}
            </p>
            <p
              style={{
                margin: "12px 0 0",
                fontFamily: TYPE.title.family,
                fontSize: 40,
                fontWeight: 500,
                color: COLORS.inkMuted,
                letterSpacing: "-0.03em",
              }}
            >
              {BRAND.tagline2}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDomains && (
          <motion.div
            key="dom"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: MOTION.ease }}
            style={{ marginBottom: 44 }}
          >
            <p
              style={{
                margin: "0 0 16px",
                fontFamily: TYPE.micro.family,
                fontSize: TYPE.micro.size,
                fontWeight: 650,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: COLORS.inkFaint,
              }}
            >
              {BRAND.languagesLine}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "center",
              }}
            >
              {BRAND.domains.map((d) => (
                <span
                  key={d}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 999,
                    background: COLORS.glass,
                    border: `1px solid ${COLORS.glassBorder}`,
                    fontFamily: TYPE.micro.family,
                    fontSize: 16,
                    fontWeight: 600,
                    color: COLORS.inkMuted,
                  }}
                >
                  {d}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCta && (
          <motion.div
            key="cta"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: MOTION.ease }}
            style={{
              marginBottom: 36,
              padding: "22px 40px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.96)",
              color: "#05070C",
              fontFamily: TYPE.title.family,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <div>{BRAND.ctaPrimary}</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 16,
                fontWeight: 600,
                opacity: 0.55,
              }}
            >
              {BRAND.ctaSecondary}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUrl && (
          <motion.div
            key="url"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            {/* QR placeholder — geometric, not clipart */}
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 16,
                background: "#fff",
                padding: 10,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundImage:
                    "repeating-linear-gradient(0deg,#05070C 0 4px,transparent 4px 8px), repeating-linear-gradient(90deg,#05070C 0 4px,transparent 4px 8px)",
                  opacity: 0.9,
                  borderRadius: 8,
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontFamily: TYPE.micro.family,
                  fontSize: 16,
                  fontWeight: 500,
                  color: COLORS.inkFaint,
                  letterSpacing: "0.02em",
                }}
              >
                {BRAND.inviteUrl.replace("https://", "")}
              </span>
              <motion.span
                animate={{ x: [0, 4, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                style={{ color: COLORS.accent, fontSize: 18 }}
              >
                →
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SceneCanvas({
  scene,
  localTime,
}: {
  scene: StoryScene;
  localTime: number;
}) {
  const words = useMemo(
    () => scene.headline.trim().split(/\s+/).filter(Boolean),
    [scene.headline],
  );
  // Show 2–4 words cycling slowly with scene time
  const chunkSize = Math.min(4, Math.max(2, words.length <= 4 ? words.length : 3));
  const idx = Math.min(
    Math.floor((localTime / Math.max(0.2, scene.end - scene.start)) * Math.ceil(words.length / chunkSize)),
    Math.max(0, Math.ceil(words.length / chunkSize) - 1),
  );
  const visible = words.slice(idx * chunkSize, idx * chunkSize + chunkSize);
  const zoom = scene.motion.camera === "slowZoom";

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <SoftBackground zoom={zoom} />
      <motion.div
        key={scene.id + idx}
        initial={{
          opacity: 0,
          y: scene.motion.enter === "slideUp" ? MOTION.slideY : 0,
          scale: scene.motion.enter === "scale" ? MOTION.scaleFrom : 1,
          filter: scene.motion.enter === "blurIn" ? `blur(${MOTION.blurFrom}px)` : "blur(0px)",
        }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: MOTION.fadeIn, ease: MOTION.ease }}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${CANVAS.safePadX}px`,
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "14px 22px",
            maxWidth: 900,
          }}
        >
          {visible.map((w, i) => (
            <span
              key={`${w}-${i}`}
              style={{
                fontFamily: TYPE.display.family,
                fontSize: TYPE.display.size,
                fontWeight: TYPE.display.weight,
                letterSpacing: TYPE.display.tracking,
                lineHeight: TYPE.display.lineHeight,
                color: COLORS.ink,
              }}
            >
              {w}
            </span>
          ))}
        </div>
        {scene.subhead ? (
          <p
            style={{
              marginTop: 36,
              maxWidth: 720,
              fontFamily: TYPE.body.family,
              fontSize: TYPE.body.size,
              fontWeight: TYPE.body.weight,
              color: COLORS.inkMuted,
              letterSpacing: TYPE.body.tracking,
              lineHeight: TYPE.body.lineHeight,
            }}
          >
            {scene.subhead}
          </p>
        ) : null}
        {scene.statLabel ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: MOTION.ease, delay: 0.15 }}
            style={{
              marginTop: 48,
              padding: "18px 28px",
              borderRadius: 20,
              background: COLORS.glass,
              border: `1px solid ${COLORS.glassBorder}`,
              backdropFilter: "blur(16px)",
              fontFamily: TYPE.title.family,
              fontSize: 28,
              fontWeight: 650,
              color: COLORS.ink,
              boxShadow: `0 16px 40px ${COLORS.shadow}`,
            }}
          >
            {scene.statLabel}
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  );
}

export function StudioPlayer({ pack, focusSceneId, width = 300 }: Props) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  const last = useRef<number | undefined>(undefined);
  const total = pack?.totalDuration ?? 30;

  useEffect(() => {
    if (!focusSceneId || !pack) return;
    const hit = pack.storyboard.find((s) => s.id === focusSceneId);
    if (!hit) return;
    setPlaying(false);
    setT(hit.start + 0.05);
  }, [focusSceneId, pack]);

  const scene =
    pack?.storyboard.find((s) => t >= s.start && t < s.end) ||
    pack?.storyboard[pack.storyboard.length - 1];

  useEffect(() => {
    if (!playing) {
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - (last.current ?? now)) / 1000;
      last.current = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, total]);

  const previewW = width;
  const previewH = Math.round(previewW * (CANVAS.height / CANVAS.width));
  const scale = previewW / CANVAS.width;
  const local = scene ? Math.max(0, t - scene.start) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <div
        style={{
          width: previewW,
          height: previewH,
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${COLORS.glassBorder}`,
          boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
          position: "relative",
          background: COLORS.bg,
        }}
      >
        <div
          style={{
            width: CANVAS.width,
            height: CANVAS.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            background: COLORS.bg,
          }}
        >
          {!pack ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.inkFaint,
                fontFamily: TYPE.body.family,
                fontSize: 36,
              }}
            >
              Generate a storyboard
            </div>
          ) : scene?.role === "intro" ? (
            <IntroCard />
          ) : scene?.role === "outro" ? (
            <OutroCard localTime={local} />
          ) : scene ? (
            <SceneCanvas scene={scene} localTime={local} />
          ) : null}
        </div>
      </div>

      <div
        style={{
          width: previewW,
          height: 3,
          borderRadius: 99,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(t / total) * 100}%`,
            background: COLORS.ink,
            opacity: 0.7,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => {
            setT(0);
            setPlaying(true);
          }}
          style={iconBtn}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          disabled={!pack}
          onClick={() => {
            if (t >= total) setT(0);
            setPlaying((p) => !p);
          }}
          style={{
            ...iconBtn,
            width: 52,
            height: 52,
            background: COLORS.ink,
            color: COLORS.bg,
            opacity: pack ? 1 : 0.4,
          }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: COLORS.inkFaint,
            minWidth: 72,
          }}
        >
          {t.toFixed(1)}s / {total}s
        </span>
      </div>
    </div>
  );
}

const iconBtn: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.glass,
  color: COLORS.inkMuted,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};
