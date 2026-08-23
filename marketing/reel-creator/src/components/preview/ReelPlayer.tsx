import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, FastForward, Download } from 'lucide-react';
import { InterpreterAILogo } from '@/components/brand/InterpreterAILogo';
import { exportReelMp4, type ExportProgress, waitForStagePaint } from '@/lib/exportReelMp4';
import { ReelAudioMixer } from '@/lib/audioMix';
import { isRtlLanguage } from '@/lib/constants/languages';
import {
  brandStingTimes,
  buildDynamicTimeline,
  SCENE_TRANSITION_SEC,
  VO_TRAILING_SILENCE_SEC,
  type ContentKey,
  type DurationMap,
} from '@/lib/timeline';
import {
  LOCKED_OUTRO_MIN_SEC,
  resolveUniversalOutroCopy,
} from '@/lib/universalBrandOutro';
import { UniversalBrandOutro } from '@/components/preview/UniversalBrandOutro';
import {
  measureBlobDuration,
  voiceoverBlobs,
  type SynthesizedVoiceover,
  type VoiceoverPack,
} from '@/lib/reelBuilderApi';
import {
  CAPTION_SIDE_PAD,
  captionFontSizePx,
  clipCaptionWindowAt,
  layoutClipCaptionLines,
  estimateTimedWords,
  activeWordAt,
  KINETIC_ACTIVE_BLUE,
  KINETIC_IDLE_WHITE,
  REEL_CAPTION_FONT,
  type TimedWord,
} from '@/lib/kineticCaptions';
import { activeStatAt, parseStatCallouts } from '@/lib/statCallouts';
import { GeneratedReelPlayer } from '@/components/preview/GeneratedReelPlayer';
import type { WorkspaceConversation } from '@/lib/workspaceModel';
import { migrateWorkspaceScript } from '@/lib/workspaceModel';
import type { UniversalOutroCopy } from '@/lib/universalBrandOutro';
import type { LanguagePair } from '@/lib/languageFlags';

/** Default looping product-proof clip (drop file in public/media/). */
export const DEFAULT_DEMO_PREVIEW = '/media/demo-preview.mp4';

export interface ReelData {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions?: string;
  outroLine1?: string;
  outroLine2?: string;
  /** Localized CTA headline (Universal Brand Outro). */
  outroCtaHeadline?: string;
  /** Short on-screen headlines (support visuals — never replace them). */
  headlines?: Partial<Record<'hook' | 'problem' | 'solution' | 'result', string>>;
  /** Per-beat visual objective for continuous storytelling. */
  visuals?: Partial<Record<'hook' | 'problem' | 'solution' | 'result', SceneVisual>>;
}

export type SceneVisual = {
  assetType?: 'workspace' | 'stock' | 'motion_graphics' | 'typography' | 'product_closeup' | 'feature_callout';
  camera?: 'hold' | 'slowZoom' | 'pan' | 'punchIn';
  callout?: string;
  workspaceMode?: 'full' | 'split' | 'corner' | 'hero';
};

interface ReelPlayerProps {
  data: ReelData;
  targetLanguage?: string;
  /** @deprecated Visuals come from `data.visuals` (workspace-hero storytelling). */
  problemVisual?: string;
  /** @deprecated Visuals come from `data.visuals` (workspace-hero storytelling). */
  solutionVisual?: string;
  series?: string;
  musicUrl?: string | null;
  brandStingEnabled?: boolean;
  brandStingUrl?: string | null;
  voiceSpeed?: number;
  volumes?: { vo?: number; bgm?: number; brand?: number };
  /** Full pack with word timestamps (preferred). */
  voiceoverPack?: Partial<VoiceoverPack> | null;
  /** Legacy blob-only map (still supported). */
  voiceovers?: {
    hook?: Blob;
    problem?: Blob;
    solution?: Blob;
    result?: Blob;
    outro?: Blob;
  };
  demoVideoUrl?: string | null;
  accentColor?: string;
  filename?: string;
  /** Optional playhead callback for external waveform / scrub UI. */
  onTimeChange?: (t: number, total: number) => void;

  /* --- Generated 35s reel mode (hook → workspace → outro) --- */
  workspace?: WorkspaceConversation;
  /** @deprecated — migrated to workspace */
  workspaceScript?: { speakerA: string[]; speakerB: string[] };
  languagePair?: LanguagePair;
  footageUrls?: string[];
  hookVoClips?: import("@/lib/generatedReel").HookVoClip[];
  hookDurationSec?: number;
  subtitleScale?: number;
  audioBase64?: string | null;
  workspaceVoClips?: import("@/lib/generatedReel").WorkspaceVoClip[];
  outroAudioBase64?: string | null;
  words?: TimedWord[];
  outroCopy?: UniversalOutroCopy;
  /** Spoken outro script (translated when reel language ≠ en). */
  outroVoiceoverText?: string;
  /** Include 10s brand outro at end (default true). */
  includeOutro?: boolean;
  /** Include workspace dialogue segment (default true). */
  includeWorkspace?: boolean;
  /** Dynamic outro segment length from VO script. */
  outroDurationSec?: number;
  workspaceDurationSec?: number;
  /** Editable outro layer layout for preview/export parity */
  outroLayout?: import("@/lib/outroLayerLayout").OutroLayerDocument;
  outroPhraseTimings?: import("@/lib/outroVoPacing").OutroPhraseTiming[];
  /** Hook-only after VO; full reel after Generate Reel. */
  previewScope?: "full" | "hook-only";
}

function stockBrollStyle(series: string): CSSProperties {
  if (series === '1' || series === '3') {
    return {
      background:
        'radial-gradient(ellipse 90% 70% at 50% 35%, rgba(0,112,243,0.22) 0%, transparent 55%), linear-gradient(165deg, #0A1628 0%, #12253A 42%, #061018 100%)',
    };
  }
  if (series === '2') {
    return {
      background:
        'radial-gradient(ellipse 80% 60% at 70% 28%, rgba(167,139,250,0.2) 0%, transparent 50%), linear-gradient(165deg, #140E1C 0%, #241833 45%, #080610 100%)',
    };
  }
  return {
    background:
      'radial-gradient(ellipse 85% 65% at 50% 40%, rgba(0,112,243,0.18) 0%, transparent 58%), linear-gradient(160deg, #0C121C 0%, #151E2C 48%, #070B12 100%)',
  };
}

function TechLoopBackground({ series }: { series: string }) {
  return (
    <motion.div
      style={{
        position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden',
        ...stockBrollStyle(series),
      }}
      animate={{ scale: [1, 1.05] }}
      transition={{ duration: 8, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
    >
      <div
        style={{
          position: 'absolute', inset: '-12%',
          backgroundImage:
            'linear-gradient(rgba(0,112,243,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,112,243,0.1) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          opacity: 0.5,
        }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(ellipse at center, transparent 20%, rgba(2,5,11,0.55) 100%)',
      }} />
    </motion.div>
  );
}

function BrandWatermark() {
  return (
    <div style={{
      position: 'absolute', bottom: 56, right: 40,
      opacity: 0.35, pointerEvents: 'none', zIndex: 40,
    }}>
      <InterpreterAILogo variant="wordmark" height={56} />
    </div>
  );
}

/** Animated 62-language workspace UI — used when demo mp4 is missing. */
function AnimatedWorkspaceProof() {
  const langs = ['EN', 'ES', 'FR', 'DE', 'AR', 'ZH', 'JA', 'KO', 'PT', 'HI'];
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(180deg, #0B1220 0%, #060A12 100%)',
      display: 'flex', flexDirection: 'column', padding: 28, boxSizing: 'border-box',
      fontFamily: REEL_CAPTION_FONT,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <InterpreterAILogo variant="wordmark" height={36} />
        <span style={{
          fontSize: 18, fontWeight: 700, color: '#67E8F9',
          background: 'rgba(0,112,243,0.18)', border: '1px solid rgba(0,112,243,0.35)',
          borderRadius: 999, padding: '6px 14px',
        }}>
          Live · 62 languages
        </span>
      </div>
      <div style={{
        flex: 1, borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(2,5,11,0.65)', overflow: 'hidden', position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 10, padding: 16,
      }}>
        {langs.slice(0, 6).map((code, i) => (
          <motion.div
            key={code}
            animate={{ opacity: [0.35, 1, 0.55], x: [0, 4, 0] }}
            transition={{ duration: 2.4, delay: i * 0.18, repeat: Infinity }}
            style={{
              display: 'flex', gap: 12, alignItems: 'flex-start',
              padding: '10px 12px', borderRadius: 12,
              background: i % 2 === 0 ? 'rgba(0,112,243,0.12)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <span style={{
              fontSize: 16, fontWeight: 800, color: '#0070F3', minWidth: 36,
              fontFamily: 'ui-monospace, monospace',
            }}>
              {code}
            </span>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'rgba(248,250,252,0.88)', lineHeight: 1.35 }}>
              {i % 2 === 0
                ? 'Live transcript streaming with speaker turns…'
                : 'Instant interpretation — stay focused on the call.'}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Workspace hero: looping demo clip or animated workspace UI + camera motion. */
function WorkspaceHero({
  videoUrl,
  camera = 'slowZoom',
  callout,
  dimmed,
}: {
  videoUrl?: string | null;
  camera?: SceneVisual['camera'];
  callout?: string;
  dimmed?: boolean;
}) {
  const [useFallback, setUseFallback] = useState(!videoUrl);
  const src = videoUrl || DEFAULT_DEMO_PREVIEW;
  const zoomTo = camera === 'punchIn' ? 1.12 : camera === 'slowZoom' ? 1.06 : camera === 'pan' ? 1.04 : 1.02;

  useEffect(() => {
    setUseFallback(false);
  }, [src]);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      borderRadius: 28, overflow: 'hidden',
      border: '2px solid rgba(255,255,255,0.14)',
      boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
      background: '#0B1220',
    }}>
      <motion.div
        animate={{
          scale: [1, zoomTo],
          x: camera === 'pan' ? [0, -18, 0] : 0,
        }}
        transition={{ duration: camera === 'punchIn' ? 2.4 : 7.5, ease: 'linear', repeat: Infinity, repeatType: 'reverse' }}
        style={{ position: 'absolute', inset: 0, opacity: dimmed ? 0.55 : 1 }}
      >
        {!useFallback ? (
          <video
            key={src}
            src={src}
            muted
            playsInline
            autoPlay
            loop
            onError={() => setUseFallback(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <AnimatedWorkspaceProof />
        )}
      </motion.div>
      {callout ? (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', top: 28, left: 28, zIndex: 8,
            padding: '14px 22px', borderRadius: 16,
            background: 'rgba(0,112,243,0.22)',
            border: '1px solid rgba(255,255,255,0.28)',
            backdropFilter: 'blur(14px)',
            color: '#FFF', fontWeight: 750, fontSize: 28,
            fontFamily: REEL_CAPTION_FONT,
            boxShadow: '0 12px 40px rgba(0,112,243,0.35)',
          }}
        >
          {callout}
        </motion.div>
      ) : null}
      <div style={{
        position: 'absolute', left: 20, bottom: 18, right: 20,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 18, fontWeight: 700, color: '#FFF',
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
          borderRadius: 999, padding: '8px 16px', border: '1px solid rgba(255,255,255,0.12)',
          fontFamily: REEL_CAPTION_FONT,
        }}>
          InterpreterAI · live workspace
        </span>
      </div>
    </div>
  );
}

function ShortHeadline({ text }: { text: string }) {
  const line = text.trim();
  if (!line) return null;
  const short = line.split(/\s+/).slice(0, 8).join(' ');
  return (
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{
        margin: 0,
        fontFamily: REEL_CAPTION_FONT,
        fontSize: 52,
        fontWeight: 750,
        letterSpacing: '-0.03em',
        lineHeight: 1.15,
        color: '#FFFFFF',
        textShadow: '0 8px 32px rgba(0,0,0,0.65)',
        maxWidth: '92%',
        textAlign: 'center',
      }}
    >
      {short}
    </motion.p>
  );
}

function GlassStatBadge({ label }: { label: string }) {
  return (
    <motion.div
      key={label}
      initial={{ scale: 0.82, opacity: 0, y: 18 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: -8 }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
      style={{
        position: 'absolute',
        top: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        padding: '22px 36px',
        borderRadius: 22,
        background: 'linear-gradient(135deg, rgba(255,255,255,0.16) 0%, rgba(0,112,243,0.22) 100%)',
        border: '1px solid rgba(255,255,255,0.28)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        boxShadow: '0 12px 48px rgba(0,112,243,0.35), inset 0 1px 0 rgba(255,255,255,0.35)',
        color: '#FFFFFF',
        fontSize: 42,
        fontWeight: 800,
        letterSpacing: '-0.02em',
        fontFamily: REEL_CAPTION_FONT,
        whiteSpace: 'nowrap',
        maxWidth: '88%',
        textAlign: 'center',
      }}
    >
      {label}
    </motion.div>
  );
}

/** Word-level kinetic captions driven by exact timestamps (frame-synced). */
function KineticCaption({
  words,
  localTime,
  canvasWidth,
  rtl,
  compact,
  fallbackText,
}: {
  words: TimedWord[];
  localTime: number;
  canvasWidth: number;
  rtl: boolean;
  compact?: boolean;
  fallbackText?: string;
}) {
  const win = clipCaptionWindowAt(words, localTime);
  const fontSize = captionFontSizePx(Math.max(2, win?.words.length ?? 3), canvasWidth);
  const size = compact ? Math.round(fontSize * 0.78) : fontSize;

  if (!win || win.words.length === 0) {
    const text = (fallbackText || '').trim();
    if (!text) return null;
    return (
      <p
        dir={rtl ? 'rtl' : 'ltr'}
        style={{
          position: 'relative', zIndex: 12, margin: 0,
          padding: `0 ${CAPTION_SIDE_PAD}px`,
          fontFamily: REEL_CAPTION_FONT,
          fontSize: Math.round(size * 0.85),
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: rtl ? 0 : '-0.03em',
          color: KINETIC_IDLE_WHITE,
          textShadow: '0 6px 28px rgba(0,0,0,0.7)',
          maxWidth: '100%',
        }}
      >
        {text}
      </p>
    );
  }

  const lines = layoutClipCaptionLines(win.words);

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        position: 'relative',
        zIndex: 12,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: Math.round(size * 0.12),
        padding: `0 ${CAPTION_SIDE_PAD}px`,
        boxSizing: 'border-box',
        fontFamily: REEL_CAPTION_FONT,
      }}
    >
      {lines.map((lineWords, lineIdx) => (
        <div
          key={`line-${lineIdx}-${lineWords[0]?.index ?? 0}`}
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: `${Math.round(size * 0.22)}px ${Math.round(size * 0.28)}px`,
            maxWidth: '100%',
          }}
        >
          {lineWords.map((w) => {
            const on = w.index === win.activeIndex;
            return (
              <span
                key={`${w.index}-${w.word}`}
                style={{
                  fontSize: size,
                  fontWeight: 800,
                  lineHeight: 1.12,
                  letterSpacing: rtl ? 0 : '-0.03em',
                  color: on ? KINETIC_ACTIVE_BLUE : KINETIC_IDLE_WHITE,
                  textShadow: on
                    ? `0 0 32px ${KINETIC_ACTIVE_BLUE}aa, 0 6px 28px rgba(0,0,0,0.75)`
                    : '0 6px 28px rgba(0,0,0,0.7)',
                  borderBottom: on ? `5px solid ${KINETIC_ACTIVE_BLUE}` : '5px solid transparent',
                  paddingBottom: 6,
                  transition: 'color 60ms linear, text-shadow 60ms linear, border-color 60ms linear',
                  willChange: 'color',
                  whiteSpace: 'nowrap',
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
function wordsForSegment(
  pack: Partial<VoiceoverPack> | null | undefined,
  id: string,
  fallbackText: string,
  segmentDuration: number,
): TimedWord[] {
  const entry = pack?.[id as keyof VoiceoverPack] as SynthesizedVoiceover | undefined;
  if (entry?.words?.length) return entry.words;
  // Align caption pacing with short VO tails (no long silent caption gaps).
  const speechEst = Math.max(0.4, segmentDuration - VO_TRAILING_SILENCE_SEC);
  return estimateTimedWords(fallbackText, speechEst);
}

export function ReelPlayer(props: ReelPlayerProps) {
  const { workspace, workspaceScript, languagePair } = props;
  const ws =
    workspace ??
    (workspaceScript && languagePair
      ? migrateWorkspaceScript(
          workspaceScript,
          languagePair.sourceLabel === 'English' ? 'en' : props.targetLanguage,
          props.targetLanguage,
        )
      : null);
  if (ws && languagePair) {
    return (
      <GeneratedReelPlayer
        playback={{
          workspace: ws,
          languagePair,
          footageUrls: props.footageUrls ?? [],
          hookVoClips: props.hookVoClips ?? [],
          hookDurationSec: props.hookDurationSec,
          subtitleScale: props.subtitleScale ?? 1,
          audioBase64: props.audioBase64 ?? null,
          workspaceVoClips: props.workspaceVoClips ?? [],
          outroAudioBase64: props.outroAudioBase64 ?? null,
          words: props.words ?? [],
          hookScript: props.data.hook || '',
          targetLanguage: props.targetLanguage ?? 'en',
          outroCopy: props.outroCopy,
          outroVoiceover: props.outroVoiceoverText,
          outroLayout: props.outroLayout,
          outroPhraseTimings: props.outroPhraseTimings,
          includeOutro: props.includeOutro !== false,
          includeWorkspace: props.includeWorkspace !== false,
          outroDurationSec: props.outroDurationSec,
          workspaceDurationSec: props.workspaceDurationSec,
        }}
        musicUrl={props.musicUrl}
        volumes={props.volumes}
        filename={props.filename}
        accentColor={props.accentColor}
        previewScope={props.previewScope ?? "full"}
      />
    );
  }
  return <ClassicReelPlayer {...props} />;
}

function ClassicReelPlayer({
  data,
  targetLanguage = 'en',
  series = '1',
  musicUrl,
  brandStingEnabled = true,
  brandStingUrl,
  voiceSpeed = 1,
  volumes,
  voiceoverPack,
  voiceovers,
  demoVideoUrl,
  accentColor = '#0070F3',
  filename,
  onTimeChange,
}: ReelPlayerProps) {
  const mixVolumes = {
    vo: volumes?.vo ?? 1,
    bgm: volumes?.bgm ?? 0.25,
    brand: volumes?.brand ?? 0.8,
  };
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [measured, setMeasured] = useState<DurationMap>({});
  const rafRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef(0);
  const mixerRef = useRef<ReelAudioMixer | null>(null);
  const seekRef = useRef((t: number) => setCurrentTime(t));
  seekRef.current = (t: number) => {
    timeRef.current = t;
    setCurrentTime(t);
  };

  const rtl = isRtlLanguage(targetLanguage);
  const outroCopy = resolveUniversalOutroCopy({
    outroLine1: data.outroLine1,
    outroLine2: data.outroLine2,
    ctaHeadline: data.outroCtaHeadline,
  });
  const outroText = outroCopy.voiceover;

  const resolvedBlobs = useMemo(() => {
    if (voiceoverPack) return voiceoverBlobs(voiceoverPack);
    return voiceovers || {};
  }, [voiceoverPack, voiceovers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys: ContentKey[] = ['hook', 'problem', 'solution', 'result'];
      const next: DurationMap = {};
      for (const k of keys) {
        next[k] = await measureBlobDuration(resolvedBlobs[k]);
      }
      next.outro = await measureBlobDuration(resolvedBlobs.outro);
      if (!cancelled) setMeasured(next);
    })();
    return () => { cancelled = true; };
  }, [resolvedBlobs]);

  const timeline = useMemo(
    () =>
      buildDynamicTimeline({
        texts: {
          hook: data.hook || '',
          problem: data.problem || '',
          solution: data.solution || '',
          result: data.result || '',
        },
        outroText,
        speed: voiceSpeed,
        measured,
        brandStingEnabled,
        brandStingDuration: 1.0,
      }),
    [data.hook, data.problem, data.solution, data.result, outroText, voiceSpeed, measured, brandStingEnabled],
  );

  const segments = timeline.segments;
  const totalDuration = timeline.total;
  const outroVoSec = measured.outro && measured.outro > 0.2
    ? measured.outro
    : Math.max(2.5, (outroText.trim().split(/\s+/).length || 10) / 2.5 / voiceSpeed);

  const stingSchedule = useMemo(
    () =>
      brandStingTimes(segments, outroVoSec, brandStingEnabled).map((at, i) => ({
        at,
        tag: `sting-${i}`,
      })),
    [segments, outroVoSec, brandStingEnabled],
  );

  useEffect(() => {
    timeRef.current = currentTime;
    onTimeChange?.(currentTime, totalDuration);
  }, [currentTime, totalDuration, onTimeChange]);

  useEffect(() => {
    if (currentTime > totalDuration) {
      seekRef.current(0);
      setIsPlaying(false);
    }
  }, [totalDuration, currentTime]);

  useEffect(() => {
    const mixer = new ReelAudioMixer();
    mixerRef.current = mixer;
    return () => mixer.dispose();
  }, []);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.setSegments(segments);
    mixer.setBrandStingEnabled(brandStingEnabled);
    mixer.setBrandStingSchedule(stingSchedule);
    if (brandStingUrl) void mixer.loadBrandSting(brandStingUrl);
  }, [segments, brandStingEnabled, brandStingUrl, stingSchedule]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.setVolumes(mixVolumes);
  }, [mixVolumes.vo, mixVolumes.bgm, mixVolumes.brand]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    void mixer.loadMusic(musicUrl || '');
  }, [musicUrl]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    void mixer.loadVoiceovers({
      hook: resolvedBlobs.hook,
      problem: resolvedBlobs.problem,
      solution: resolvedBlobs.solution,
      result: resolvedBlobs.result,
      outro: resolvedBlobs.outro,
    });
  }, [resolvedBlobs]);

  useEffect(() => {
    if (isPlaying && !exporting) {
      mixerRef.current?.start(() => timeRef.current);
      lastTimeRef.current = performance.now();
      const tick = (now: number) => {
        const last = lastTimeRef.current ?? now;
        const dt = (now - last) / 1000;
        lastTimeRef.current = now;
        const next = timeRef.current + dt;
        if (next >= totalDuration) {
          seekRef.current(totalDuration);
          setIsPlaying(false);
          mixerRef.current?.stop();
          return;
        }
        seekRef.current(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (!isPlaying) mixerRef.current?.stop();
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, exporting, totalDuration]);

  const currentSegment = segments.find((s) => currentTime >= s.start && currentTime < s.end) || segments[segments.length - 1]!;
  const isOutro = currentSegment.id === 'outro' || currentTime >= totalDuration;
  const isContent = !isOutro;
  const beatId = currentSegment.id as 'hook' | 'problem' | 'solution' | 'result';
  const visual: SceneVisual = data.visuals?.[beatId] || {
    assetType: beatId === 'problem' ? 'stock' : 'workspace',
    camera: beatId === 'solution' || beatId === 'result' ? 'slowZoom' : beatId === 'hook' ? 'pan' : 'hold',
    workspaceMode: beatId === 'problem' ? 'corner' : 'hero',
    callout:
      beatId === 'solution' ? 'Live workspace' :
      beatId === 'result' ? '62 Languages' :
      beatId === 'hook' ? undefined :
      undefined,
  };
  const localTime = Math.max(0, currentTime - currentSegment.start);
  const segDur = Math.max(0.4, currentSegment.end - currentSegment.start);

  const exportW = aspectRatio === '9:16' ? 1080 : 1920;
  const exportH = aspectRatio === '9:16' ? 1920 : 1080;
  const previewW = aspectRatio === '9:16' ? 270 : 480;
  const previewH = Math.round(previewW * (exportH / exportW));
  const scale = previewW / exportW;

  const segmentText = String(
    beatId === 'hook' || beatId === 'problem' || beatId === 'solution' || beatId === 'result'
      ? data[beatId]
      : '',
  );
  const headline =
    data.headlines?.[beatId] ||
    segmentText.split(/[.!?]/)[0]?.trim().split(/\s+/).slice(0, 7).join(' ') ||
    '';
  const captionWords = useMemo(
    () => wordsForSegment(voiceoverPack, currentSegment.id, segmentText, segDur),
    [voiceoverPack, currentSegment.id, segmentText, segDur],
  );
  const statCallouts = useMemo(() => parseStatCallouts(segmentText), [segmentText]);
  const spoken = activeWordAt(captionWords, localTime);
  const activeStat = activeStatAt(statCallouts, spoken?.index);
  const proofVideoUrl = demoVideoUrl || DEFAULT_DEMO_PREVIEW;
  const dimWorkspace = beatId === 'problem' || visual.assetType === 'stock';
  void isContent;
  const outroSeg = segments.find((s) => s.id === 'outro');
  const outroLocalTime = Math.max(0, currentTime - (outroSeg?.start ?? 0));
  const outroDur = Math.max(LOCKED_OUTRO_MIN_SEC, (outroSeg?.end ?? 0) - (outroSeg?.start ?? 0));

  const renderContent = () => {
    if (isOutro) {
      return (
        <UniversalBrandOutro
          copy={outroCopy}
          rtl={rtl}
          localTime={outroLocalTime}
          durationSec={outroDur}
        />
      );
    }

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSegment.id}
          initial={exporting ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={exporting ? undefined : { opacity: 0 }}
          transition={{ duration: exporting ? 0 : SCENE_TRANSITION_SEC, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            textAlign: 'center',
          }}
        >
          <TechLoopBackground series={series} />

          {/* Continuous SaaS ad layout: workspace hero + supporting type/captions */}
          <div style={{
            position: 'relative', zIndex: 10, flex: 1,
            display: 'flex', flexDirection: 'column',
            padding: '40px 36px 48px', boxSizing: 'border-box',
            gap: 18,
          }}>
            <div style={{
              flex: '0 0 auto',
              minHeight: 110,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
              gap: 14, position: 'relative',
            }}>
              <AnimatePresence>
                {activeStat ? <GlassStatBadge label={activeStat.label} /> : null}
              </AnimatePresence>
              <ShortHeadline text={headline} />
            </div>

            <div style={{
              flex: '1 1 auto',
              minHeight: 0,
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'center',
            }}>
              <div style={{ width: '94%', height: '100%' }}>
                <WorkspaceHero
                  videoUrl={proofVideoUrl}
                  camera={visual.camera || (beatId === 'solution' ? 'punchIn' : 'slowZoom')}
                  callout={visual.callout}
                  dimmed={dimWorkspace}
                />
              </div>
            </div>

            <div style={{
              flex: '0 0 auto',
              minHeight: 120,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <KineticCaption
                words={captionWords}
                localTime={localTime}
                canvasWidth={exportW}
                rtl={rtl}
                compact
                fallbackText=""
              />
            </div>
          </div>
          <BrandWatermark />
        </motion.div>
      </AnimatePresence>
    );
  };

  const waitForPaint = () => {
    const stage = stageRef.current;
    return stage ? waitForStagePaint(stage) : Promise.resolve();
  };

  const downloadMp4 = async () => {
    const stage = stageRef.current;
    if (!stage || exporting) return;
    setIsPlaying(false);
    mixerRef.current?.stop();
    setExporting(true);
    setExportMsg(null);
    setExportProgress({ pct: 0, detail: 'Preparing…' });
    try {
      await exportReelMp4({
        stage,
        durationSec: totalDuration,
        width: exportW,
        height: exportH,
        segments,
        fps: 30,
        videoBitrate: 14_000_000,
        frameAccurate: true,
        outroCapture: 'canvas',
        outroCopy,
        filename: filename || 'InterpreterAI_Reel.mp4',
        seekTo: (t) => { flushSync(() => seekRef.current(t)); },
        waitForPaint,
        onProgress: setExportProgress,
        audio: {
          musicUrl: musicUrl || null,
          brandStingUrl: brandStingEnabled ? (brandStingUrl || null) : null,
          brandStingAt: stingSchedule.map((c) => c.at),
          volumes: mixVolumes,
          voiceovers: resolvedBlobs,
          segments,
        },
      });
      setExportMsg('MP4 downloaded.');
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Export failed');
      setExportProgress(null);
    } finally {
      setExporting(false);
      seekRef.current(0);
    }
  };

  const outroStart = segments.find((s) => s.id === 'outro')?.start ?? totalDuration - 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: `${previewW}px` }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['9:16', '16:9'] as const).map((ar) => (
            <button
              key={ar}
              type="button"
              disabled={exporting}
              onClick={() => setAspectRatio(ar)}
              style={{
                background: aspectRatio === ar ? accentColor : 'rgba(255,255,255,0.06)',
                color: aspectRatio === ar ? '#02050B' : 'rgba(255,255,255,0.4)',
                border: 'none', borderRadius: '5px', padding: '4px 10px',
                fontSize: '10px', fontWeight: 700, fontFamily: 'monospace',
                cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.5 : 1,
              }}
            >
              {ar}
            </button>
          ))}
        </div>
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.25)' }}>
          {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
        </span>
      </div>

      <div style={{
        position: 'relative', width: `${previewW}px`, height: `${previewH}px`,
        borderRadius: '12px', overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.7)',
      }}>
        <div
          ref={stageRef}
          data-reel-export-stage="true"
          style={{
            width: exportW, height: exportH,
            transform: `scale(${scale})`, transformOrigin: 'top left',
            background: '#070B14', position: 'relative', overflow: 'hidden',
          }}
        >
          {renderContent()}
          {!exporting ? (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px',
              background: 'rgba(255,255,255,0.08)', zIndex: 60,
            }}>
              <div style={{
                height: '100%',
                background: isContent ? accentColor : '#22D3EE',
                width: `${(currentTime / Math.max(0.01, totalDuration)) * 100}%`,
              }} />
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          disabled={exporting}
          onClick={() => { seekRef.current(0); setIsPlaying(true); }}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)', cursor: exporting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: exporting ? 0.4 : 1,
          }}
        >
          <RotateCcw size={14} />
        </button>

        <button
          type="button"
          disabled={exporting}
          onClick={() => {
            if (currentTime >= totalDuration) seekRef.current(0);
            setIsPlaying(!isPlaying);
          }}
          style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: accentColor, border: 'none', color: '#02050B',
            cursor: exporting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${accentColor}40`,
            opacity: exporting ? 0.4 : 1,
          }}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
        </button>

        <button
          type="button"
          disabled={exporting}
          onClick={() => { seekRef.current(outroStart + 0.05); setIsPlaying(true); }}
          title="Jump to outro"
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)', cursor: exporting ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: exporting ? 0.4 : 1,
          }}
        >
          <FastForward size={14} />
        </button>
      </div>

      <button
        type="button"
        disabled={exporting}
        onClick={() => void downloadMp4()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          width: `${previewW}px`,
          background: exporting ? 'rgba(0,112,243,0.12)' : '#0070F3',
          color: exporting ? '#67E8F9' : '#FFFFFF',
          border: exporting ? '1px solid rgba(0,112,243,0.35)' : 'none',
          borderRadius: '10px', padding: '12px 18px', fontSize: '13px', fontWeight: 700,
          cursor: exporting ? 'default' : 'pointer',
        }}
      >
        <Download size={16} />
        {exporting
          ? (exportProgress ? `${exportProgress.detail} ${exportProgress.pct}%` : 'Exporting…')
          : 'Download MP4'}
      </button>

      {exportMsg ? (
        <p style={{
          width: `${previewW}px`, margin: 0, fontSize: 11,
          color: exportMsg.includes('fail') ? '#F87171' : 'rgba(103,232,249,0.85)',
          textAlign: 'center',
        }}>
          {exportMsg}
        </p>
      ) : null}

      <p style={{ width: `${previewW}px`, margin: 0, fontSize: 10, color: 'rgba(248,250,252,0.3)', textAlign: 'center' }}>
        Word-sync · split-screen proof on Solution/Result · stat badges · BGM auto-duck
      </p>
    </div>
  );
}
