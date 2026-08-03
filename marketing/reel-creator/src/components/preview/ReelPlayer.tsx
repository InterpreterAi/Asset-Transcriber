import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, FastForward, Download } from 'lucide-react';
import { InterpreterAILogo } from '@/components/brand/InterpreterAILogo';
import { exportReelMp4, type ExportProgress } from '@/lib/exportReelMp4';
import { ReelAudioMixer } from '@/lib/audioMix';
import { BRAND_STING_URL, isRtlLanguage, type ProblemVisual, type SolutionVisual } from '@/lib/constants/languages';

export interface ReelData {
  hook: string;
  problem: string;
  solution: string;
  result: string;
  captions?: string;
  outroLine1?: string;
  outroLine2?: string;
}

interface ReelPlayerProps {
  data: ReelData;
  targetLanguage?: string;
  problemVisual?: ProblemVisual;
  solutionVisual?: SolutionVisual;
  series?: string;
  musicUrl?: string | null;
  brandStingEnabled?: boolean;
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
}

export const TOTAL_DURATION = 35;

const SEGMENTS = [
  { id: 'intro',    start: 0,  end: 2  },
  { id: 'hook',     start: 2,  end: 5  },
  { id: 'problem',  start: 5,  end: 14 },
  { id: 'solution', start: 14, end: 25 },
  { id: 'result',   start: 25, end: 28 },
  { id: 'outro',    start: 28, end: 35 },
] as const;

const LABELS: Record<string, string> = {
  hook: 'Hook', problem: 'Problem', solution: 'Solution', result: 'Result',
};

function stockBrollStyle(series: string): CSSProperties {
  // Contextual beds — not InterpreterAI workspace UI
  if (series === '1' || series === '3') {
    return {
      background:
        'linear-gradient(160deg, #0a1628 0%, #1a3a4a 40%, #0b1a22 100%), radial-gradient(ellipse at 30% 70%, rgba(34,211,238,0.12), transparent 55%)',
    };
  }
  if (series === '2') {
    return {
      background:
        'linear-gradient(165deg, #120c1a 0%, #2a1f3d 45%, #0b0814 100%), radial-gradient(ellipse at 70% 30%, rgba(167,139,250,0.18), transparent 50%)',
    };
  }
  return {
    background:
      'linear-gradient(155deg, #0c1018 0%, #1c2433 50%, #080c14 100%), radial-gradient(ellipse at 50% 80%, rgba(248,113,113,0.12), transparent 55%)',
  };
}

function BrandIntro() {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        background: '#02050B',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div style={{
        position: 'absolute', width: '720px', height: '720px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <InterpreterAILogo variant="wordmark" height={168} />
    </div>
  );
}

function BrandOutro({
  line1,
  line2,
  rtl,
}: {
  line1: string;
  line2: string;
  rtl: boolean;
}) {
  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, #0B1220 0%, #02050B 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '120px 64px', zIndex: 50, textAlign: 'center',
      }}
    >
      <div style={{
        position: 'absolute', width: '640px', height: '640px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', width: '100%', maxWidth: 940 }}>
        <InterpreterAILogo variant="wordmark" height={176} />

        <div style={{ width: '112px', height: '3px', background: 'rgba(34,211,238,0.45)', margin: '52px auto' }} />

        <p style={{
          fontSize: '56px', fontWeight: 700, color: '#FFFFFF',
          letterSpacing: rtl ? '0' : '-0.02em', lineHeight: 1.25, marginBottom: '14px',
          maxWidth: '960px',
        }}>
          {line1}
        </p>
        <p style={{
          fontSize: '56px', fontWeight: 700, color: '#67E8F9',
          letterSpacing: rtl ? '0' : '-0.02em', lineHeight: 1.25, marginBottom: '40px',
          maxWidth: '960px',
        }}>
          {line2}
        </p>
        <div style={{ marginBottom: '52px', textAlign: 'center' }}>
          <p style={{
            margin: 0, fontSize: '36px', fontWeight: 600, color: 'rgba(248,250,252,0.65)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Built for professional interpreters
          </p>
          <p style={{
            margin: '10px 0 0', fontSize: '36px', fontWeight: 600, color: 'rgba(248,250,252,0.65)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            62 languages
          </p>
        </div>

        <div
          style={{
            background: '#22D3EE', color: '#02050B',
            borderRadius: '20px', padding: '34px 56px',
            fontSize: '42px', fontWeight: 800, letterSpacing: '-0.01em',
            marginBottom: '40px', whiteSpace: 'nowrap',
            width: '100%', maxWidth: 900,
          }}
        >
          Start Free — 7 Days · 2 Hours/Day
        </div>

        <p style={{ fontSize: '38px', fontWeight: 700, color: '#67E8F9', letterSpacing: '0.02em' }}>
          app.interpreterai.org
        </p>
      </div>
    </div>
  );
}

function BrandWatermark() {
  return (
    <div style={{
      position: 'absolute', bottom: '56px', right: '40px',
      display: 'flex', alignItems: 'center', gap: '8px',
      opacity: 0.45, pointerEvents: 'none', zIndex: 40,
    }}>
      <InterpreterAILogo variant="wordmark" height={72} />
    </div>
  );
}

function ProblemBroll({ series }: { series: string }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 1, ...stockBrollStyle(series),
      }}
    >
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(2,5,11,0.35), rgba(2,5,11,0.75))',
      }} />
      <div style={{
        position: 'absolute', top: '18%', left: '10%', right: '10%',
        height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99,
      }} />
      <div style={{
        position: 'absolute', top: '22%', left: '10%', width: '55%',
        height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 99,
      }} />
      <div style={{
        position: 'absolute', bottom: '22%', left: '12%', right: '12%',
        borderRadius: 28, border: '1px solid rgba(255,255,255,0.08)',
        height: 220, background: 'rgba(11,18,32,0.45)',
        boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
      }} />
    </div>
  );
}

function SolutionDemoOverlay({ videoUrl }: { videoUrl?: string | null }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 1, background: '#02050B',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: '78%', aspectRatio: '9/16', maxHeight: '78%',
        borderRadius: 48, border: '3px solid rgba(255,255,255,0.12)',
        background: '#0B1220', overflow: 'hidden', position: 'relative',
        boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
      }}>
        {videoUrl ? (
          <video
            src={videoUrl}
            muted
            playsInline
            autoPlay
            loop
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 48, textAlign: 'center',
            background: 'linear-gradient(180deg, #0B1220 0%, #02050B 100%)',
          }}>
            <InterpreterAILogo variant="wordmark" height={96} />
            <p style={{ marginTop: 36, fontSize: 36, fontWeight: 700, color: 'rgba(248,250,252,0.85)' }}>
              Workspace demo
            </p>
            <p style={{ marginTop: 16, fontSize: 28, color: 'rgba(248,250,252,0.4)', lineHeight: 1.4, maxWidth: 720 }}>
              Record from /admin/demo-marketing — drops into Solution
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReelPlayer({
  data,
  targetLanguage = 'en',
  problemVisual = 'stock_broll',
  solutionVisual = 'workspace_demo',
  series = '1',
  musicUrl,
  brandStingEnabled = true,
  voiceovers,
  demoVideoUrl,
  accentColor = '#22D3EE',
  filename,
}: ReelPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const seekRef = useRef((t: number) => setCurrentTime(t));
  const timeRef = useRef(0);
  const mixerRef = useRef<ReelAudioMixer | null>(null);
  seekRef.current = (t: number) => {
    timeRef.current = t;
    setCurrentTime(t);
  };

  const rtl = isRtlLanguage(targetLanguage);
  const outro1 = data.outroLine1 || 'Stay focused on the conversation.';
  const outro2 = data.outroLine2 || "We'll handle the words.";

  useEffect(() => {
    timeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const mixer = new ReelAudioMixer();
    mixerRef.current = mixer;
    mixer.setSegments(
      SEGMENTS.filter((s) => s.id !== 'intro').map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end,
      })),
    );
    return () => mixer.dispose();
  }, []);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.setBrandStingEnabled(brandStingEnabled);
    void mixer.loadBrandSting(BRAND_STING_URL);
  }, [brandStingEnabled]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    if (!musicUrl) {
      void mixer.loadMusic('').catch(() => undefined);
      return;
    }
    void mixer.loadMusic(musicUrl);
  }, [musicUrl]);

  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer || !voiceovers) return;
    void mixer.loadVoiceovers({
      hook: voiceovers.hook,
      problem: voiceovers.problem,
      solution: voiceovers.solution,
      result: voiceovers.result,
      outro: voiceovers.outro,
    });
  }, [voiceovers]);

  useEffect(() => {
    if (isPlaying && !exporting) {
      mixerRef.current?.start(() => timeRef.current);
      lastTimeRef.current = performance.now();
      const tick = (now: number) => {
        const delta = (now - lastTimeRef.current!) / 1000;
        lastTimeRef.current = now;
        setCurrentTime((prev) => {
          const next = prev + delta;
          if (next >= TOTAL_DURATION) {
            setIsPlaying(false);
            mixerRef.current?.stop();
            return TOTAL_DURATION;
          }
          timeRef.current = next;
          return next;
        });
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (!isPlaying) mixerRef.current?.stop();
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, exporting]);

  const currentSegment = SEGMENTS.find((s) => currentTime >= s.start && currentTime < s.end) || SEGMENTS[SEGMENTS.length - 1];
  const isIntro = currentSegment.id === 'intro';
  const isOutro = currentSegment.id === 'outro' || currentTime >= TOTAL_DURATION;
  const isContent = !isIntro && !isOutro;
  const isProblem = currentSegment.id === 'problem';
  const isSolution = currentSegment.id === 'solution';

  const exportW = aspectRatio === '9:16' ? 1080 : 1920;
  const exportH = aspectRatio === '9:16' ? 1920 : 1080;
  const previewW = aspectRatio === '9:16' ? 270 : 480;
  const previewH = Math.round(previewW * (exportH / exportW));
  const scale = previewW / exportW;

  const renderContent = () => {
    if (isIntro) return <BrandIntro />;
    if (isOutro) return <BrandOutro line1={outro1} line2={outro2} rtl={rtl} />;

    const text = data[currentSegment.id as keyof ReelData] || `[${currentSegment.id.toUpperCase()}]`;
    const fontSize = text.length > 80 ? 72 : text.length > 50 ? 88 : text.length > 28 ? 104 : 124;

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentSegment.id}
          initial={exporting ? false : { opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={exporting ? undefined : { opacity: 0, y: -14, scale: 1.02 }}
          transition={{ duration: exporting ? 0 : 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '120px 64px', textAlign: rtl ? 'right' : 'center',
            background: isSolution || isProblem ? 'transparent' : '#02050B',
          }}
        >
          {isProblem && problemVisual === 'stock_broll' ? <ProblemBroll series={series} /> : null}
          {isSolution && solutionVisual === 'workspace_demo' ? (
            <SolutionDemoOverlay videoUrl={demoVideoUrl} />
          ) : null}
          {/* Hard cut back to brand night at solution if no overlay */}
          {isSolution && solutionVisual === 'none' ? (
            <div style={{ position: 'absolute', inset: 0, background: '#02050B', zIndex: 0 }} />
          ) : null}

          <div style={{ position: 'relative', zIndex: 10, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }} dir={rtl ? 'rtl' : 'ltr'}>
            <div style={{ position: 'absolute', top: '-48px', left: rtl ? undefined : '0', right: rtl ? '0' : undefined }}>
              <span style={{
                display: 'inline-block',
                background: `${accentColor}18`,
                border: `1px solid ${accentColor}40`,
                borderRadius: '100px',
                padding: '16px 36px',
                fontSize: '34px', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                color: accentColor,
              }}>
                {LABELS[currentSegment.id] ?? currentSegment.id}
              </span>
            </div>

            <h2 style={{
              fontSize,
              fontWeight: 800,
              lineHeight: 1.18,
              letterSpacing: rtl ? '0' : '-0.03em',
              color: '#FFFFFF',
              maxWidth: '940px',
              textShadow: '0 8px 40px rgba(0,0,0,0.65)',
              marginTop: 80,
            }}>
              {text}
            </h2>

            {data.captions ? (
              <p style={{
                marginTop: 48, fontSize: 36, fontWeight: 600,
                color: 'rgba(248,250,252,0.72)', maxWidth: 880,
              }}>
                {data.captions}
              </p>
            ) : null}

            <div style={{
              position: 'absolute', bottom: '-80px', left: '0', right: '0',
              height: '2px',
              background: `linear-gradient(to right, transparent, ${accentColor}30, transparent)`,
            }} />
          </div>
          <BrandWatermark />
        </motion.div>
      </AnimatePresence>
    );
  };

  const waitForPaint = () =>
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

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
        durationSec: TOTAL_DURATION,
        width: exportW,
        height: exportH,
        segments: SEGMENTS.map((s) => ({ id: s.id, start: s.start, end: s.end })),
        fps: 15,
        filename: `${filename || 'interpreterai-reel'}-${aspectRatio.replace(':', 'x')}.mp4`,
        seekTo: (t) => {
          flushSync(() => seekRef.current(t));
        },
        waitForPaint,
        onProgress: setExportProgress,
        audio: {
          musicUrl: musicUrl || null,
          brandStingUrl: brandStingEnabled ? BRAND_STING_URL : null,
          brandStingAt: brandStingEnabled ? [0.05, 28.05] : [],
          voiceovers: voiceovers
            ? {
                hook: voiceovers.hook,
                problem: voiceovers.problem,
                solution: voiceovers.solution,
                result: voiceovers.result,
                outro: voiceovers.outro,
              }
            : undefined,
          segments: SEGMENTS.map((s) => ({ id: s.id, start: s.start, end: s.end })),
        },
      });
      setExportMsg('MP4 downloaded — save to Files / iCloud and share anywhere.');
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : 'Export failed');
      setExportProgress(null);
    } finally {
      setExporting(false);
      seekRef.current(0);
    }
  };

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
          {Math.floor(currentTime)}s / {TOTAL_DURATION}s · {rtl ? 'RTL' : 'LTR'}
        </span>
      </div>

      <div style={{
        position: 'relative',
        width: `${previewW}px`,
        height: `${previewH}px`,
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 24px 60px rgba(0,0,0,0.7), 0 0 40px rgba(37,99,235,0.06)`,
      }}>
        <div
          ref={stageRef}
          data-reel-export-stage="true"
          style={{
            width: exportW,
            height: exportH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: '#02050B',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at 50% 30%, rgba(37,99,235,0.06) 0%, transparent 60%)',
            pointerEvents: 'none', zIndex: 0,
          }} />

          {renderContent()}

          {!exporting ? (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '6px',
              background: 'rgba(255,255,255,0.08)', zIndex: 60,
            }}>
              <div style={{
                height: '100%',
                background: isContent ? accentColor : '#22D3EE',
                width: `${(currentTime / TOTAL_DURATION) * 100}%`,
              }} />
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          disabled={exporting}
          onClick={() => { setCurrentTime(0); timeRef.current = 0; setIsPlaying(true); }}
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
            if (currentTime >= TOTAL_DURATION) {
              setCurrentTime(0);
              timeRef.current = 0;
            }
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
          onClick={() => { setCurrentTime(28.1); timeRef.current = 28.1; setIsPlaying(true); }}
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
          background: exporting ? 'rgba(34,211,238,0.12)' : '#22D3EE',
          color: exporting ? '#67E8F9' : '#02050B',
          border: exporting ? '1px solid rgba(34,211,238,0.35)' : 'none',
          borderRadius: '10px', padding: '12px 18px', fontSize: '13px', fontWeight: 700,
          cursor: exporting ? 'default' : 'pointer',
        }}
      >
        <Download size={16} />
        {exporting
          ? (exportProgress ? `${exportProgress.detail} ${exportProgress.pct}%` : 'Exporting…')
          : `Download MP4 (${aspectRatio})`}
      </button>

      {exporting && exportProgress ? (
        <div style={{ width: `${previewW}px` }}>
          <div style={{ height: '4px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${exportProgress.pct}%`,
              background: 'linear-gradient(90deg, #22D3EE, #2563EB)',
              transition: 'width 0.15s',
            }} />
          </div>
        </div>
      ) : null}

      {exportMsg ? (
        <p style={{
          width: `${previewW}px`, margin: 0, fontSize: 11,
          color: exportMsg.includes('failed') || exportMsg.includes('required') ? '#F87171' : 'rgba(103,232,249,0.85)',
          textAlign: 'center', lineHeight: 1.4,
        }}>
          {exportMsg}
        </p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.4 }}>
        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#22D3EE' }} />
        <span style={{ fontSize: '10px', color: '#F8FAFC', letterSpacing: '0.06em' }}>
          Intro/outro locked · music ducks under VO
        </span>
        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#22D3EE' }} />
      </div>
    </div>
  );
}
