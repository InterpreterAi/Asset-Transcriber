/**
 * Brand Outro — saved preset library + canonical MP4 export.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import {
  BookmarkPlus,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { OutroPreviewPanel } from "@/components/preview/OutroPreviewPanel";
import { exportLockedOutroMaster } from "@/lib/exportLockedOutroMaster";
import { COLORS } from "@/lib/brandSystem";
import { estimateSpeechSec } from "@/lib/workspaceModel";
import { copyFromLayerDocument, defaultOutroLayerDocument, type OutroLayerDocument, type OutroLayerId } from "@/lib/outroLayerLayout";
import {
  buildOutroPhraseTimings,
  estimateOutroVoDurationSec,
  outroSegmentSecFromSpeech,
} from "@/lib/outroVoPacing";
import {
  LOCKED_OUTRO_MIN_SEC,
  UNIVERSAL_OUTRO_EN,
  buildCanonicalOutroVoiceover,
  buildStudioOutroCopy,
  outroDurationForVoSec,
  resolveUniversalOutroCopy,
} from "@/lib/universalBrandOutro";
import { measureBlobDuration, synthesizeLockedOutroVoiceover } from "@/lib/reelBuilderApi";
import { VOICE_ACTORS, type VoiceActorId } from "@/lib/constants/languages";
import {
  createDefaultOutroPreset,
  deleteSavedOutroPreset,
  duplicateSavedOutroPreset,
  getSavedOutroPreset,
  listSavedOutroPresets,
  saveOutroPreset,
  setPendingOutroPreset,
  type SavedOutroPreset,
} from "@/lib/savedOutroPresets";

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: COLORS.bg,
  color: COLORS.ink,
  fontSize: 13,
  boxSizing: "border-box",
};

export default function OutroExportPage() {
  const [presets, setPresets] = useState<SavedOutroPreset[]>(() => listSavedOutroPresets());
  const [selectedId, setSelectedId] = useState<string | null>(() => listSavedOutroPresets()[0]?.id ?? null);
  const [draft, setDraft] = useState<SavedOutroPreset | null>(null);
  const [draftName, setDraftName] = useState("");
  const [selectedLayerId, setSelectedLayerId] = useState<OutroLayerId | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      setDraftName("");
      return;
    }
    const preset = getSavedOutroPreset(selectedId);
    if (preset) {
      setDraft({ ...preset });
      setDraftName(preset.name);
      setSelectedLayerId(null);
    }
  }, [selectedId]);

  const outroCopy = useMemo(
    () =>
      draft
        ? copyFromLayerDocument(draft.outroLayout, draft.outroVoiceover, "en")
        : resolveUniversalOutroCopy({ outroLine1: UNIVERSAL_OUTRO_EN.line1 }),
    [draft],
  );

  const outroEstimateSec = useMemo(
    () => (draft ? estimateOutroVoDurationSec(draft.outroVoiceover, "en") : LOCKED_OUTRO_MIN_SEC),
    [draft],
  );

  const outroPhraseTimings = useMemo(
    () =>
      draft
        ? buildOutroPhraseTimings(
            draft.outroVoiceover,
            [],
            estimateSpeechSec(draft.outroVoiceover, "en"),
          )
        : [],
    [draft],
  );

  function patchDraft(patch: Partial<SavedOutroPreset>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function patchDraftLayout(layout: OutroLayerDocument) {
    setDraft((prev) => (prev ? { ...prev, outroLayout: layout } : prev));
  }

  function refresh() {
    const next = listSavedOutroPresets();
    setPresets(next);
    if (selectedId && !next.some((p) => p.id === selectedId)) {
      setSelectedId(next[0]?.id ?? null);
    }
  }

  function flash(text: string, ok = true) {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 3200);
    void ok;
  }

  function onSaveNewDefault() {
    const created = createDefaultOutroPreset(`Brand outro ${presets.length + 1}`);
    refresh();
    setSelectedId(created.id);
    flash(`Saved “${created.name}”`);
  }

  function onSaveChanges() {
    if (!draft) return;
    try {
      const copyEn = buildStudioOutroCopy({
        line1: draft.outroLine1,
        line2: draft.outroLine2,
        ctaHeadline: draft.outroCtaHeadline,
        languagesLine: draft.outroLanguagesLine,
        voiceover: draft.outroVoiceover,
      });
      const saved = saveOutroPreset(
        draftName,
        { ...draft, outroCopyEn: copyEn },
        draft.id,
      );
      refresh();
      setDraft({ ...saved });
      setDraftName(saved.name);
      flash(`Saved “${saved.name}”`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Save failed", false);
    }
  }

  function onDuplicate() {
    if (!draft) return;
    onSaveChanges();
    const copy = duplicateSavedOutroPreset(draft.id);
    if (!copy) return;
    refresh();
    setSelectedId(copy.id);
    flash(`Duplicated as “${copy.name}”`);
  }

  function onDelete() {
    if (!draft) return;
    if (!window.confirm(`Delete “${draft.name}”?`)) return;
    deleteSavedOutroPreset(draft.id);
    refresh();
    flash("Preset deleted", true);
  }

  function onUseInStudio() {
    if (!draft) return;
    onSaveChanges();
    setPendingOutroPreset(draft.id);
    window.location.href = "/studio/new";
  }

  return (
    <div
      style={{
        minHeight: "100%",
        background: COLORS.bg,
        color: COLORS.ink,
        padding: "32px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <p style={eyebrow}>Brand Outro</p>
          <h1 style={{ margin: "8px 0 10px", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>
            Saved brand outros
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: COLORS.inkMuted, lineHeight: 1.55, maxWidth: 640 }}>
            Save layouts, on-screen copy, and voiceover scripts from Studio — then reuse them on any commercial.
            Pick a preset below or save a new one from Studio&apos;s outro section.
          </p>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          <aside
            style={{
              padding: 16,
              borderRadius: 16,
              border: `1px solid ${COLORS.glassBorder}`,
              background: COLORS.bgElevated,
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button type="button" onClick={onSaveNewDefault} style={smallBtn}>
                <BookmarkPlus size={14} />
                New from default
              </button>
            </div>

            {presets.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.5 }}>
                No presets yet. Click <strong style={{ color: COLORS.ink }}>New from default</strong> or save
                from{" "}
                <Link href="/studio/new" style={{ color: COLORS.accent }}>
                  Studio
                </Link>
                .
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {presets.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: `1px solid ${active ? "rgba(32,212,240,0.45)" : COLORS.glassBorder}`,
                          background: active ? "rgba(32,212,240,0.1)" : "transparent",
                          color: COLORS.ink,
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{p.name}</span>
                        <span style={{ display: "block", marginTop: 4, fontSize: 11, color: COLORS.inkFaint }}>
                          {p.outroLine1.trim() || p.outroLine2.trim() || "Brand outro"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <section
            style={{
              padding: 20,
              borderRadius: 16,
              border: `1px solid ${COLORS.glassBorder}`,
              background: COLORS.bgElevated,
            }}
          >
            {draft ? (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="Preset name"
                    style={{
                      flex: "1 1 180px",
                      minWidth: 160,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${COLORS.glassBorder}`,
                      background: COLORS.bg,
                      color: COLORS.ink,
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  />
                  <button type="button" onClick={onSaveChanges} style={accentBtn}>
                    <Save size={14} />
                    Save
                  </button>
                  <button type="button" onClick={onDuplicate} style={smallBtn}>
                    <Copy size={14} />
                    Duplicate
                  </button>
                  <button type="button" onClick={onDelete} style={smallBtn}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <button type="button" onClick={onUseInStudio} style={accentBtn}>
                    <ExternalLink size={14} />
                    Use in Studio
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 20, alignItems: "start" }}>
                  <div>
                    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.inkFaint }}>
                      Edit copy & voiceover
                    </p>
                    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                      <input
                        value={draft.outroLine1}
                        onChange={(e) => patchDraft({ outroLine1: e.target.value })}
                        placeholder="Headline"
                        style={fieldStyle}
                      />
                      <input
                        value={draft.outroLine2}
                        onChange={(e) => patchDraft({ outroLine2: e.target.value })}
                        placeholder="Subhead"
                        style={fieldStyle}
                      />
                      <input
                        value={draft.outroLanguagesLine}
                        onChange={(e) => patchDraft({ outroLanguagesLine: e.target.value })}
                        placeholder="Languages line"
                        style={fieldStyle}
                      />
                      <input
                        value={draft.outroCtaHeadline}
                        onChange={(e) => patchDraft({ outroCtaHeadline: e.target.value })}
                        placeholder="CTA headline"
                        style={fieldStyle}
                      />
                      <textarea
                        value={draft.outroVoiceover}
                        onChange={(e) => patchDraft({ outroVoiceover: e.target.value })}
                        placeholder="Spoken voiceover"
                        rows={3}
                        style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.45 }}
                      />
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: 11, color: COLORS.inkFaint }}>
                      ~{outroEstimateSec.toFixed(1)}s · drag layers in preview · then press Save
                    </p>
                  </div>
                  <OutroPreviewPanel
                    copy={outroCopy}
                    layout={draft.outroLayout}
                    language="en"
                    durationSec={draft.outroDurationSec ?? outroEstimateSec}
                    naturalDurationSec={outroEstimateSec}
                    trimmedDurationSec={
                      draft.outroDurationSec != null &&
                      draft.outroDurationSec < outroEstimateSec - 0.05
                        ? draft.outroDurationSec
                        : null
                    }
                    onTrimmedDurationChange={(sec) =>
                      patchDraft({ outroDurationSec: sec ?? outroEstimateSec })
                    }
                    outroVoiceover={draft.outroVoiceover}
                    outroPhraseTimings={outroPhraseTimings}
                    editMode
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    onLayoutChange={patchDraftLayout}
                  />
                </div>
              </>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: COLORS.inkMuted }}>
                Select a preset or create one to preview it here.
              </p>
            )}
          </section>
        </div>

        {msg ? (
          <p style={{ marginTop: 16, fontSize: 13, color: msg.includes("failed") ? "#F87171" : "#4ADE80" }}>{msg}</p>
        ) : null}

        <CanonicalExportSection />
      </div>
    </div>
  );
}

function CanonicalExportSection() {
  const copy = resolveUniversalOutroCopy({
    outroLine1: UNIVERSAL_OUTRO_EN.line1,
    outroLine2: UNIVERSAL_OUTRO_EN.line2,
    ctaHeadline: UNIVERSAL_OUTRO_EN.ctaHeadline,
  });
  const layout = defaultOutroLayerDocument(copy);

  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(() => estimateOutroVoDurationSec(copy.voiceover));
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [includeVo, setIncludeVo] = useState(true);
  const [voiceId, setVoiceId] = useState<VoiceActorId>("rachel");
  const [voBlob, setVoBlob] = useState<Blob | null>(null);
  const [voWords, setVoWords] = useState<Array<{ word: string; start: number; end: number }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const timeRef = useRef(0);
  const durRef = useRef(estimateOutroVoDurationSec(copy.voiceover));
  const rafRef = useRef<number | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const phraseTimings = useMemo(
    () => buildOutroPhraseTimings(copy.voiceover, voWords, duration),
    [copy.voiceover, voWords, duration],
  );

  useEffect(() => {
    durRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (!playing || exporting) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
      return;
    }
    if (includeVo && voBlob && audioRef.current) {
      audioRef.current.currentTime = timeRef.current;
      void audioRef.current.play().catch(() => undefined);
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const max = durRef.current;
      let next = timeRef.current + dt;
      if (next >= max) {
        next = max;
        timeRef.current = next;
        setT(next);
        setPlaying(false);
        audioRef.current?.pause();
        return;
      }
      timeRef.current = next;
      setT(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, exporting, includeVo, voBlob]);

  const seek = (sec: number) => {
    const v = Math.max(0, Math.min(durRef.current, sec));
    timeRef.current = v;
    setT(v);
    if (audioRef.current) audioRef.current.currentTime = v;
  };

  async function ensureVoiceover(force = false): Promise<Blob> {
    if (voBlob && !force) return voBlob;
    setProgress(`Generating VO · ${voiceId}…`);
    const spoken = buildCanonicalOutroVoiceover();
    const syn = await synthesizeLockedOutroVoiceover(spoken, voiceId);
    const prepared = syn.blob;
    const voSec = await measureBlobDuration(prepared);
    const nextDur = outroDurationForVoSec(voSec, 0);
    setVoBlob(prepared);
    setVoWords(syn.words);
    setDuration(nextDur);
    durRef.current = nextDur;
    const url = URL.createObjectURL(prepared);
    if (audioRef.current) audioRef.current.src = url;
    else audioRef.current = new Audio(url);
    return prepared;
  }

  async function downloadMp4() {
    if (exporting) return;
    setPlaying(false);
    setExporting(true);
    setMsg(null);
    setProgress("Preparing download…");
    try {
      let audio: Blob | null = null;
      let exportDur = duration;
      if (includeVo) {
        try {
          audio = await ensureVoiceover();
          exportDur = outroDurationForVoSec(await measureBlobDuration(audio), 0);
          setDuration(exportDur);
          durRef.current = exportDur;
        } catch (voErr) {
          setMsg(
            voErr instanceof Error
              ? `VO skipped: ${voErr.message}. Exporting video only…`
              : "VO skipped. Exporting video only…",
          );
          audio = null;
        }
      }

      await exportLockedOutroMaster({
        copy,
        layout,
        phraseTimings,
        durationSec: exportDur,
        voiceover: audio,
        fps: 30,
        videoBitrate: 18_000_000,
        filename: "InterpreterAI_Universal_Brand_Outro.mp4",
        onProgress: (p) => setProgress(`${p.pct}% · ${p.detail}`),
      });
      setMsg("Downloaded InterpreterAI_Universal_Brand_Outro.mp4");
      setProgress(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Export failed");
      setProgress(null);
    } finally {
      setExporting(false);
      seek(0);
    }
  }

  return (
    <section
      style={{
        marginTop: 40,
        padding: 20,
        borderRadius: 16,
        border: `1px solid ${COLORS.glassBorder}`,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...smallBtn,
          width: "100%",
          justifyContent: "space-between",
          marginBottom: open ? 16 : 0,
        }}
      >
        <span>Canonical locked outro MP4 export</span>
        <span style={{ fontSize: 11, color: COLORS.inkFaint }}>{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.inkMuted, textAlign: "center", maxWidth: 520 }}>
            Original approved master — fixed script, not your saved Studio presets.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              disabled={exporting}
              onClick={() => {
                if (t >= durRef.current - 0.05) seek(0);
                setPlaying((p) => !p);
              }}
              style={smallBtn}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" disabled={exporting} onClick={() => { setPlaying(false); seek(0); }} style={smallBtn}>
              <RotateCcw size={14} />
              Reset
            </button>
            <button type="button" disabled={exporting} onClick={() => void downloadMp4()} style={accentBtn}>
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? "Exporting…" : "Download MP4"}
            </button>
          </div>
          <select
            value={voiceId}
            disabled={exporting}
            onChange={(e) => {
              setVoiceId(e.target.value as VoiceActorId);
              setVoBlob(null);
            }}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${COLORS.glassBorder}`,
              background: COLORS.bg,
              color: COLORS.ink,
              fontSize: 13,
            }}
          >
            {VOICE_ACTORS.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: COLORS.inkMuted, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={includeVo} disabled={exporting} onChange={(e) => { setIncludeVo(e.target.checked); setVoBlob(null); }} />
            Include voice-over in download
          </label>
          <p style={{ margin: 0, fontSize: 12, color: COLORS.inkFaint }}>
            {t.toFixed(1)}s / {duration.toFixed(1)}s{progress ? ` · ${progress}` : ""}
          </p>
          {msg ? (
            <p style={{ margin: 0, fontSize: 13, color: msg.includes("Downloaded") ? "#4ADE80" : "#F87171" }}>{msg}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const eyebrow: CSSProperties = {
  margin: 0,
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: COLORS.inkFaint,
  fontWeight: 650,
};

const smallBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 10,
  border: `1px solid ${COLORS.glassBorder}`,
  background: "transparent",
  color: COLORS.inkMuted,
  fontSize: 12,
  fontWeight: 650,
  cursor: "pointer",
};

const accentBtn: CSSProperties = {
  ...smallBtn,
  background: COLORS.accent,
  border: "none",
  color: "#fff",
};
