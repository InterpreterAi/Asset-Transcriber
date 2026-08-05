/**
 * Focused Creative Studio — one prompt → polished 35-second InterpreterAI reel.
 * Chat box + Language + Series → /api/reel-builder/generate →
 * fixed timeline preview (intro 2s · hook 8s · workspace · configurable outro).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CheckCircle2, Loader2, Lock, LockOpen, Sparkles } from "lucide-react";
import { ReelPlayer } from "@/components/preview/ReelPlayer";
import { COLORS, TYPE } from "@/lib/brandSystem";
import { REEL_LANGUAGES, reelLanguageLabel } from "@/lib/constants/languages";
import { generateReel, workspaceSecFor, type GeneratedStoryboard } from "@/lib/generatedReel";
import { buildLanguagePair } from "@/lib/languageFlags";
import {
  loadOutroConfig,
  OUTRO_MAX_SEC,
  OUTRO_MIN_SEC,
  saveOutroConfig,
  type OutroConfig,
} from "@/lib/outroConfig";
import { useReels, type GeneratedReelSave, type SeriesType } from "@/hooks/use-reels";
import { useToast } from "@/hooks/use-toast";

const STUDIO_SERIES: { id: SeriesType; label: string }[] = [
  { id: "medical", label: "Medical" },
  { id: "legal", label: "Legal" },
  { id: "conference", label: "Conference" },
  { id: "immigration", label: "Immigration" },
  { id: "education", label: "Education" },
];

const PROMPT_PLACEHOLDER =
  "Describe your reel... e.g. 'Medical interpreters wasting 2 hours typing call transcripts. Show stressed person at laptop. Energetic male voiceover. Medical series.'";

const PROGRESS_STEPS = [
  "Writing storyboard with AI…",
  "Searching stock footage…",
  "Generating voiceover…",
  "Building your 35s preview…",
] as const;

type Phase = "idle" | "generating" | "ready" | "error";

export default function Studio() {
  const { toast } = useToast();
  const { reels, saveReel, isLoaded } = useReels();

  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("en");
  const [series, setSeries] = useState<SeriesType>("medical");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressIdx, setProgressIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<GeneratedReelSave | null>(null);
  const [outro, setOutro] = useState<OutroConfig>(() => loadOutroConfig());
  const restoredRef = useRef(false);
  const progressTimer = useRef<number | null>(null);

  // Reload persistence: restore the newest generated reel into the studio.
  useEffect(() => {
    if (!isLoaded || restoredRef.current) return;
    restoredRef.current = true;
    const last = reels.find((r) => r.generated?.storyboard?.hookScript);
    if (last?.generated && phase === "idle" && !result) {
      setResult(last.generated);
      setPrompt(last.generated.prompt);
      setLanguage(last.generated.language);
      setSeries((last.series as SeriesType) || "medical");
      setPhase("ready");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, reels]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) window.clearInterval(progressTimer.current);
    };
  }, []);

  const updateOutro = (patch: Partial<OutroConfig>) => {
    setOutro((prev) => {
      const next = { ...prev, ...patch };
      saveOutroConfig(next);
      return next;
    });
  };

  const promptReady = prompt.trim().length >= 8;
  const generating = phase === "generating";

  async function onGenerate() {
    if (!promptReady || generating) return;
    setPhase("generating");
    setErrorMsg("");
    setProgressIdx(0);
    if (progressTimer.current) window.clearInterval(progressTimer.current);
    progressTimer.current = window.setInterval(() => {
      setProgressIdx((i) => Math.min(PROGRESS_STEPS.length - 1, i + 1));
    }, 3200);

    try {
      const res = await generateReel({
        prompt: prompt.trim(),
        language,
        series,
        outroVoiceover: outro.voiceover,
      });
      const save: GeneratedReelSave = { ...res, outroConfig: { ...outro } };
      setResult(save);
      setPhase("ready");

      saveReel({
        series,
        reelType: "generated_35s",
        targetLanguage: res.language,
        voiceActor: "adam",
        voiceSpeed: "1",
        musicBed: "none",
        brandTone: "none",
        brandStingEnabled: false,
        voVolume: 1,
        bgmVolume: 0.22,
        brandVolume: 0.8,
        problemVisual: "stock_broll",
        solutionVisual: "workspace_demo",
        hook: res.storyboard.hookScript,
        problem: "",
        solution: "",
        result: "",
        captions: res.storyboard.hookScript,
        outroLine1: outro.slogan,
        outroLine2: "",
        batchId: null,
        variationIndex: 0,
        scheduleTag: "35s · 9:16",
        fromStudio: true,
        studioBrief: res.prompt,
        storyboardTitle: `${STUDIO_SERIES.find((s) => s.id === series)?.label ?? "Reel"} · ${res.prompt
          .split(/\s+/)
          .slice(0, 7)
          .join(" ")}`,
        generated: save,
      });

      const ps = res.providerStatus;
      toast({
        title: "Reel ready — saved to Library",
        description:
          ps.footage !== "ok" || ps.voice !== "ok"
            ? "Some providers were unavailable — see status below the prompt."
            : "Footage + voiceover generated. Preview on the right.",
        duration: 3600,
      });
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Generation failed");
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Studio error",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      if (progressTimer.current) {
        window.clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
  }

  // Multilingual display: switching back to English restores the English copy.
  const englishRestore = Boolean(result && result.language !== "en" && language === "en");
  const displayLanguage = result ? (englishRestore ? "en" : result.language) : language;
  const storyboard: GeneratedStoryboard | null = result
    ? englishRestore
      ? result.storyboardEn
      : result.storyboard
    : null;

  const languagePair = useMemo(
    () => buildLanguagePair(displayLanguage, reelLanguageLabel(displayLanguage)),
    [displayLanguage],
  );

  const workspaceSec = workspaceSecFor(outro.durationSec);
  const providerStatus = result?.providerStatus ?? null;

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: COLORS.bg,
        color: COLORS.ink,
        fontFamily: TYPE.body.family,
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 40px 96px" }}>
        <header style={{ marginBottom: 28 }}>
          <p style={eyebrow}>Creative Studio</p>
          <h1
            style={{
              margin: 0,
              fontFamily: TYPE.display.family,
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1.08,
            }}
          >
            One prompt. One polished 35-second reel.
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 15, color: COLORS.inkMuted, maxWidth: 620, lineHeight: 1.5 }}>
            2s intro · 8s hook (stock footage + voiceover) · {workspaceSec}s live workspace demo ·{" "}
            {outro.durationSec}s brand outro — always exactly 35 seconds.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            gap: 40,
            alignItems: "start",
          }}
        >
          {/* ------------------------------------------------ Builder column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <section style={panel}>
              <SectionLabel>Your reel prompt</SectionLabel>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                placeholder={PROMPT_PLACEHOLDER}
                disabled={generating}
                style={{
                  width: "100%",
                  padding: "18px 20px",
                  borderRadius: 16,
                  border: `1px solid ${promptReady ? "rgba(255,255,255,0.28)" : COLORS.glassBorder}`,
                  background: COLORS.bgElevated,
                  color: COLORS.ink,
                  fontSize: 15,
                  lineHeight: 1.55,
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                <Field label={`Language (${REEL_LANGUAGES.length})`}>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    disabled={generating}
                    style={selectStyle}
                  >
                    {REEL_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Series">
                  <select
                    value={series}
                    onChange={(e) => setSeries(e.target.value as SeriesType)}
                    disabled={generating}
                    style={selectStyle}
                  >
                    {STUDIO_SERIES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  disabled={!promptReady || generating}
                  onClick={() => void onGenerate()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "15px 28px",
                    borderRadius: 999,
                    border: "none",
                    background: !promptReady || generating ? "rgba(255,255,255,0.12)" : COLORS.ink,
                    color: !promptReady || generating ? COLORS.inkFaint : COLORS.bg,
                    fontFamily: TYPE.title.family,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: !promptReady || generating ? "default" : "pointer",
                  }}
                >
                  {generating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {generating ? PROGRESS_STEPS[progressIdx] : "Generate Reel"}
                </button>
              </div>

              {phase === "error" && errorMsg ? (
                <p style={{ margin: "14px 0 0", fontSize: 13, color: "#F87171", lineHeight: 1.5 }}>
                  {errorMsg}
                </p>
              ) : null}
            </section>

            {providerStatus ? (
              <section style={panel}>
                <SectionLabel>Provider status</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <StatusBadge
                    ok
                    label="Storyboard · OpenAI"
                  />
                  <StatusBadge
                    ok={providerStatus.footage === "ok"}
                    label={
                      providerStatus.footage === "ok"
                        ? "Stock footage · Pexels"
                        : "Footage unavailable — animated hook fallback"
                    }
                  />
                  <StatusBadge
                    ok={providerStatus.voice === "ok"}
                    label={
                      providerStatus.voice === "ok"
                        ? "Voiceover · ElevenLabs"
                        : "Voice unavailable — timed captions, no audio"
                    }
                  />
                </div>
              </section>
            ) : null}

            {storyboard ? (
              <section style={panel}>
                <SectionLabel>Storyboard{englishRestore ? " · English copy restored" : ""}</SectionLabel>
                <div style={{ display: "grid", gap: 12, fontSize: 13, lineHeight: 1.55, color: COLORS.inkMuted }}>
                  <div>
                    <strong style={{ color: COLORS.ink }}>Hook (8s):</strong> {storyboard.hookScript}
                  </div>
                  <div>
                    <strong style={{ color: COLORS.ink }}>Workspace ({workspaceSec}s):</strong>{" "}
                    {storyboard.workspaceScript.speakerA.map((a, i) => (
                      <div key={i} style={{ marginTop: 6 }}>
                        <span style={{ color: COLORS.ink }}>{languagePair.sourceFlag} </span>
                        {a}
                        <br />
                        <span style={{ color: "#67E8F9" }}>{languagePair.targetFlag} </span>
                        {storyboard.workspaceScript.speakerB[i] ?? ""}
                      </div>
                    ))}
                  </div>
                  <div>
                    <strong style={{ color: COLORS.ink }}>Outro VO ({outro.durationSec}s):</strong>{" "}
                    {storyboard.outroVoiceover}
                  </div>
                  {result && result.language !== "en" ? (
                    <p style={{ margin: 0, fontSize: 12, color: COLORS.inkFaint }}>
                      {englishRestore
                        ? "Showing the preserved English copy — audio was generated in " +
                          reelLanguageLabel(result.language) +
                          ". Generate again for English audio."
                        : `Hook, AI translation lines and outro are in ${reelLanguageLabel(result.language)}. Speaker lines stay English.`}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* -------------------------------------------- Outro settings */}
            <section style={panel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <SectionLabel>Outro Settings</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {outro.locked ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 999,
                        background: "rgba(52,211,153,0.14)",
                        border: "1px solid rgba(52,211,153,0.4)",
                        color: "#34D399",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={13} />
                      Outro locked
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => updateOutro({ locked: !outro.locked })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: `1px solid ${COLORS.glassBorder}`,
                      background: "transparent",
                      color: COLORS.inkMuted,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {outro.locked ? <LockOpen size={13} /> : <Lock size={13} />}
                    {outro.locked ? "Unlock Outro" : "Lock Outro"}
                  </button>
                </div>
              </div>

              {outro.locked ? (
                <p style={{ margin: "10px 0 0", fontSize: 12, color: COLORS.inkFaint, lineHeight: 1.5 }}>
                  {outro.durationSec}s · “{outro.slogan}” · {outro.ctaText} · {outro.url}
                </p>
              ) : (
                <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
                  <Field label={`Outro duration · ${outro.durationSec}s (workspace ${workspaceSec}s)`}>
                    <input
                      type="range"
                      min={OUTRO_MIN_SEC}
                      max={OUTRO_MAX_SEC}
                      step={1}
                      value={outro.durationSec}
                      onChange={(e) => updateOutro({ durationSec: Number(e.target.value) })}
                      style={{ width: "100%", accentColor: COLORS.accent }}
                    />
                  </Field>
                  <Field label="Slogan line">
                    <input
                      value={outro.slogan}
                      onChange={(e) => updateOutro({ slogan: e.target.value })}
                      style={selectStyle}
                    />
                  </Field>
                  <Field label="CTA text">
                    <input
                      value={outro.ctaText}
                      onChange={(e) => updateOutro({ ctaText: e.target.value })}
                      style={selectStyle}
                    />
                  </Field>
                  <Field label="URL">
                    <input
                      value={outro.url}
                      onChange={(e) => updateOutro({ url: e.target.value })}
                      style={selectStyle}
                    />
                  </Field>
                  <Field label="Voiceover script">
                    <textarea
                      value={outro.voiceover}
                      onChange={(e) => updateOutro({ voiceover: e.target.value })}
                      rows={2}
                      style={{ ...selectStyle, resize: "vertical", lineHeight: 1.45 }}
                    />
                  </Field>
                  <p style={{ margin: 0, fontSize: 11, color: COLORS.inkFaint, lineHeight: 1.5 }}>
                    Total stays 35s — the workspace demo compresses or expands to fit
                    (35 − 2 intro − 8 hook − {outro.durationSec} outro = {workspaceSec}s).
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* ------------------------------------------------ Preview column */}
          <aside style={{ position: "sticky", top: 72 }}>
            <SectionLabel>Preview · 35s · 9:16</SectionLabel>
            {result && storyboard ? (
              <ReelPlayer
                key={`${result.createdAt}-${displayLanguage}-${outro.durationSec}`}
                data={{
                  hook: storyboard.hookScript,
                  problem: "",
                  solution: "",
                  result: "",
                }}
                targetLanguage={displayLanguage}
                outroConfig={outro}
                workspaceScript={storyboard.workspaceScript}
                languagePair={languagePair}
                footageUrls={result.footageUrls}
                audioBase64={englishRestore ? null : result.audioBase64}
                outroAudioBase64={englishRestore ? null : result.outroAudioBase64}
                words={englishRestore ? [] : result.words}
                outroWords={englishRestore ? [] : result.outroWords}
                outroVoiceoverText={storyboard.outroVoiceover || outro.voiceover}
                accentColor={COLORS.accent}
                filename={`InterpreterAI_${series}_${displayLanguage}_35s.mp4`}
                musicUrl={null}
              />
            ) : (
              <div
                style={{
                  width: 270,
                  height: 480,
                  borderRadius: 16,
                  border: `1px solid ${COLORS.glassBorder}`,
                  background: COLORS.bgElevated,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: COLORS.inkFaint,
                  fontSize: 13,
                  textAlign: "center",
                  padding: 24,
                  boxSizing: "border-box",
                }}
              >
                {generating ? (
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <Loader2 className="animate-spin" size={22} />
                    {PROGRESS_STEPS[progressIdx]}
                  </span>
                ) : (
                  "Describe your reel and press Generate — the 35-second preview appears here."
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 13px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: ok ? "rgba(52,211,153,0.12)" : "rgba(251,191,36,0.12)",
        border: `1px solid ${ok ? "rgba(52,211,153,0.4)" : "rgba(251,191,36,0.4)"}`,
        color: ok ? "#34D399" : "#FBBF24",
      }}
    >
      {ok ? <CheckCircle2 size={13} /> : <span style={{ fontSize: 13 }}>△</span>}
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: COLORS.inkFaint,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p style={{ ...eyebrow, marginBottom: 12 }}>{children}</p>;
}

const panel: CSSProperties = {
  padding: 22,
  borderRadius: 18,
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(255,255,255,0.07)",
};

const selectStyle: CSSProperties = {
  width: "100%",
  background: COLORS.bgElevated,
  border: `1px solid ${COLORS.glassBorder}`,
  borderRadius: 10,
  color: COLORS.ink,
  fontSize: 13,
  padding: "10px 12px",
  outline: "none",
  boxSizing: "border-box",
};

const eyebrow: CSSProperties = {
  margin: "0 0 16px",
  fontSize: 12,
  fontWeight: 650,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: COLORS.inkFaint,
};
