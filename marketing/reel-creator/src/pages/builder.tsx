import { useEffect, useMemo, useRef, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useReels, SERIES_MAP, SeriesType, seriesFilenameSlug } from '@/hooks/use-reels';
import { ReelPlayer } from '@/components/preview/ReelPlayer';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Check, Lock, Languages, Mic2, Loader2, Volume2, Square, Layers, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  ALL_BRAND_TONE_IDS,
  ALL_MUSIC_BED_IDS,
  BRAND_TONES,
  DEFAULT_OUTRO_SLOGAN,
  REEL_LANGUAGES,
  VOICE_ACTORS,
  VOICE_SPEEDS,
  musicBedsByCategory,
  reelLanguageLabel,
  type BrandToneId,
  type MusicBedId,
  type ProblemVisual,
  type SolutionVisual,
  type VoiceActorId,
  type VoiceSpeedId,
  defaultOutroVoiceText,
} from '@/lib/constants/languages';
import { generateSegmentVoiceovers, generateScriptVariations, generateSaaSScript, measureBlobDuration, translateReelScript, type VoiceoverPack, type ScriptFrameworkId } from '@/lib/reelBuilderApi';
import { previewAudioUrl, setPreviewGain, stopAudioPreview } from '@/lib/previewAudio';
import { estimateSpeechSeconds, formatEstBadge, buildExportFilename, SCENE_PADDING_SEC } from '@/lib/timeline';
import {
  REEL_HANDOFF_PAYLOAD,
  REEL_HANDOFF_READY,
  isReelHandoffPayload,
} from '@/lib/recordingHandoff';


const formSchema = z.object({
  series: z.string().min(1, 'Select a series'),
  reelType: z.string().optional().default(''),
  targetLanguage: z.string().min(1),
  voiceActor: z.enum(['adam', 'rachel', 'antoni', 'josh', 'bella']),
  voiceSpeed: z.enum(['1', '1.15', '1.25']),
  musicBed: z.string().refine((v) => ALL_MUSIC_BED_IDS.includes(v as MusicBedId), 'Invalid music bed'),
  brandTone: z.string().refine((v) => ALL_BRAND_TONE_IDS.includes(v as BrandToneId), 'Invalid brand tone'),
  brandStingEnabled: z.boolean(),
  voVolume: z.number().min(0).max(1.5),
  bgmVolume: z.number().min(0).max(1),
  brandVolume: z.number().min(0).max(1),
  problemVisual: z.enum(['stock_broll', 'none']),
  solutionVisual: z.enum(['workspace_demo', 'none']),
  hook: z.string().default(''),
  problem: z.string().default(''),
  solution: z.string().default(''),
  result: z.string().default(''),
  captions: z.string().optional(),
  outroLine1: z.string().optional(),
  outroLine2: z.string().optional(),
});

const MUSIC_GROUPS = musicBedsByCategory();

function VolumeSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format: (n: number) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </label>
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#67E8F9' }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#22D3EE', cursor: 'pointer' }}
      />
    </div>
  );
}

type FormValues = z.infer<typeof formSchema>;

const SEGMENTS = [
  { name: 'hook',     label: 'Hook',     timing: 'paced to VO', hint: 'One bold line that stops the scroll.',         rows: 2 },
  { name: 'problem',  label: 'Problem',  timing: 'paced to VO', hint: 'The pain your audience feels every day.',      rows: 3 },
  { name: 'solution', label: 'Solution', timing: 'paced to VO', hint: 'How InterpreterAI removes that friction.',     rows: 4 },
  { name: 'result',   label: 'Result',   timing: 'paced to VO', hint: 'The transformation. Make them feel it.',       rows: 2 },
] as const;

const SERIES_COLORS: Record<string, string> = {
  '1': '#22D3EE',
  '2': '#A78BFA',
  '3': '#F59E0B',
  '4': '#F87171',
  '5': '#34D399',
  '6': '#60A5FA',
  '7': '#FB923C',
  '8': '#E879F9',
  '9': '#2DD4BF',
  '10': '#94A3B8',
  medical: '#22D3EE',
  legal: '#A78BFA',
};

const fieldSelectStyle = {
  background: '#0B1220',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#F8FAFC',
  fontSize: '13px',
  height: '38px',
} as const;

export default function Builder() {
  const [, params] = useRoute('/builder/:id');
  const [location, setLocation] = useLocation();
  const { getReel, saveReel, isLoaded } = useReels();
  const { toast } = useToast();
  const studioQuery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === 'studio';
  const [isSaving, setIsSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [voBusy, setVoBusy] = useState(false);
  const [voStatus, setVoStatus] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<'music' | 'sting' | null>(null);
  const [voiceovers, setVoiceovers] = useState<Partial<VoiceoverPack>>({});
  const [measuredVo, setMeasuredVo] = useState<Partial<Record<'hook' | 'problem' | 'solution' | 'result', number>>>({});
  const [demoVideoUrl, setDemoVideoUrl] = useState<string | null>(null);
  const [batchCount, setBatchCount] = useState<3 | 5>(3);
  const [batchBusy, setBatchBusy] = useState(false);
  const [scheduleTag, setScheduleTag] = useState('');
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [scriptFramework, setScriptFramework] = useState<ScriptFrameworkId>('auto');
  const [scriptBusy, setScriptBusy] = useState(false);
  /** Source of truth for Hook/Problem/Solution/Result — not RHF (was dropping values). */
  const [scriptLines, setScriptLines] = useState({
    hook: '',
    problem: '',
    solution: '',
    result: '',
    captions: '',
  });

  const isNew = !params?.id;
  const existingReel = params?.id ? getReel(params.id) : null;
  const studioMode = studioQuery || Boolean(existingReel?.fromStudio);
  void location;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      series: '1',
      reelType: '',
      targetLanguage: 'en',
      voiceActor: 'rachel',
      voiceSpeed: '1',
      musicBed: 'saas_tech_driving',
      brandTone: 'none',
      brandStingEnabled: false,
      voVolume: 1,
      bgmVolume: 0.25,
      brandVolume: 0.8,
      problemVisual: 'stock_broll',
      solutionVisual: 'workspace_demo',
      hook: '',
      problem: '',
      solution: '',
      result: '',
      captions: '',
      outroLine1: DEFAULT_OUTRO_SLOGAN.line1,
      outroLine2: DEFAULT_OUTRO_SLOGAN.line2,
    },
  });

  const watchedValues = form.watch();
  const selectedSeries = watchedValues.series;
  const accentColor = SERIES_COLORS[selectedSeries] || '#22D3EE';

  const loadedReelIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isNew && existingReel) {
      if (loadedReelIdRef.current === existingReel.id) return;
      loadedReelIdRef.current = existingReel.id;
      form.reset({
        series: existingReel.series,
        reelType: existingReel.reelType,
        targetLanguage: existingReel.targetLanguage,
        voiceActor: existingReel.voiceActor,
        voiceSpeed: existingReel.voiceSpeed,
        musicBed: existingReel.musicBed,
        brandTone: existingReel.brandTone,
        brandStingEnabled: existingReel.brandStingEnabled,
        voVolume: existingReel.voVolume,
        bgmVolume: existingReel.bgmVolume,
        brandVolume: existingReel.brandVolume,
        problemVisual: existingReel.problemVisual,
        solutionVisual: existingReel.solutionVisual,
        hook: existingReel.hook,
        problem: existingReel.problem,
        solution: existingReel.solution,
        result: existingReel.result,
        captions: existingReel.captions,
        outroLine1: existingReel.outroLine1,
        outroLine2: existingReel.outroLine2,
      });
      setScriptLines({
        hook: existingReel.hook || '',
        problem: existingReel.problem || '',
        solution: existingReel.solution || '',
        result: existingReel.result || '',
        captions: existingReel.captions || '',
      });
      setActiveBatchId(existingReel.batchId ?? null);
      setScheduleTag(existingReel.scheduleTag ?? '');
    } else if (!isNew && !existingReel) {
      setLocation('/builder');
    } else if (isNew) {
      loadedReelIdRef.current = null;
    }
  }, [isLoaded, isNew, existingReel, form, setLocation]);

  function applyScriptFields(script: {
    hook?: string;
    problem?: string;
    solution?: string;
    result?: string;
    captions?: string;
    outroLine1?: string;
    outroLine2?: string;
  }) {
    const next = {
      hook: (script.hook ?? scriptLines.hook ?? '').trim(),
      problem: (script.problem ?? scriptLines.problem ?? '').trim(),
      solution: (script.solution ?? scriptLines.solution ?? '').trim(),
      result: (script.result ?? scriptLines.result ?? '').trim(),
      captions:
        script.captions !== undefined
          ? String(script.captions)
          : scriptLines.captions,
    };
    setScriptLines(next);
    // Keep RHF in sync for Save Reel
    form.setValue('hook', next.hook, { shouldDirty: true, shouldValidate: false });
    form.setValue('problem', next.problem, { shouldDirty: true, shouldValidate: false });
    form.setValue('solution', next.solution, { shouldDirty: true, shouldValidate: false });
    form.setValue('result', next.result, { shouldDirty: true, shouldValidate: false });
    form.setValue('captions', next.captions, { shouldDirty: true, shouldValidate: false });
    if (script.outroLine1 != null) {
      form.setValue('outroLine1', script.outroLine1, { shouldDirty: true });
    }
    if (script.outroLine2 != null) {
      form.setValue('outroLine2', script.outroLine2, { shouldDirty: true });
    }
    setVoiceovers({});
    setMeasuredVo({});
  }

  function updateScriptLine(key: keyof typeof scriptLines, value: string) {
    setScriptLines((prev) => {
      const next = { ...prev, [key]: value };
      form.setValue(key, value, { shouldDirty: true, shouldValidate: false });
      return next;
    });
    if (key !== 'captions') {
      setVoiceovers({});
    }
  }

  // Admin marketing demo → workspace_demo video handoff
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (isReelHandoffPayload(ev.data)) {
        const blob = new Blob([ev.data.buffer], { type: ev.data.mimeType || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        setDemoVideoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        form.setValue('solutionVisual', 'workspace_demo');
        toast({ title: 'Workspace demo video received', duration: 2500 });
      }
    };
    window.addEventListener('message', onMessage);
    try {
      window.opener?.postMessage({ type: REEL_HANDOFF_READY }, '*');
    } catch {
      /* */
    }
    // satisfy unused import lint for payload constant
    void REEL_HANDOFF_PAYLOAD;
    return () => window.removeEventListener('message', onMessage);
  }, [form, toast]);

  const musicUrl = useMemo(
    () => MUSIC_GROUPS.flatMap((g) => g.beds).find((m) => m.id === watchedValues.musicBed)?.file ?? null,
    [watchedValues.musicBed],
  );

  const brandStingUrl = useMemo(() => {
    const tone = BRAND_TONES.find((t) => t.id === watchedValues.brandTone);
    return tone?.file ?? null;
  }, [watchedValues.brandTone]);

  const brandStingOn = Boolean(brandStingUrl);

  const voiceSpeedValue = useMemo(() => {
    const row = VOICE_SPEEDS.find((s) => s.id === watchedValues.voiceSpeed);
    return row?.value ?? 1;
  }, [watchedValues.voiceSpeed]);

  const exportFilename = useMemo(() => {
    const scenario = watchedValues.reelType?.trim()
      ? watchedValues.reelType
      : seriesFilenameSlug(watchedValues.series || '1');
    return buildExportFilename(scenario, reelLanguageLabel(watchedValues.targetLanguage || 'en'));
  }, [watchedValues.reelType, watchedValues.series, watchedValues.targetLanguage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keys = ['hook', 'problem', 'solution', 'result'] as const;
      const next: Partial<Record<(typeof keys)[number], number>> = {};
      for (const k of keys) {
        const d = await measureBlobDuration(voiceovers[k]?.blob);
        if (d > 0.2) next[k] = d;
      }
      if (!cancelled) setMeasuredVo(next);
    })();
    return () => { cancelled = true; };
  }, [voiceovers]);

  useEffect(() => () => stopAudioPreview(), []);

  async function onPreviewMusic() {
    if (previewing === 'music') {
      stopAudioPreview();
      setPreviewing(null);
      return;
    }
    if (!musicUrl) {
      toast({ title: 'No music selected', duration: 2000 });
      return;
    }
    try {
      stopAudioPreview();
      setPreviewing('music');
      await previewAudioUrl(musicUrl, { gain: watchedValues.bgmVolume ?? 0.25, loop: true });
      toast({ title: 'Playing bed (loop) — click again to stop', duration: 2500 });
    } catch (e) {
      setPreviewing(null);
      toast({
        title: 'Preview failed',
        description: e instanceof Error ? e.message : 'Audio error',
        variant: 'destructive',
      });
    }
  }

  async function onPreviewBrandSting() {
    if (previewing === 'sting') {
      stopAudioPreview();
      setPreviewing(null);
      return;
    }
    if (!brandStingUrl) {
      toast({ title: 'No brand tone selected', duration: 2000 });
      return;
    }
    try {
      stopAudioPreview();
      setPreviewing('sting');
      await previewAudioUrl(brandStingUrl, { gain: watchedValues.brandVolume ?? 0.8, loop: false });
      toast({ title: 'InterpreterAI brand tone', duration: 2000 });
      window.setTimeout(() => setPreviewing((p) => (p === 'sting' ? null : p)), 1600);
    } catch (e) {
      setPreviewing(null);
      toast({
        title: 'Brand tone failed',
        description: e instanceof Error ? e.message : 'Audio error',
        variant: 'destructive',
      });
    }
  }

  async function onGenerateSaaSScript() {
    setScriptBusy(true);
    try {
      const v = form.getValues();
      const result = await generateSaaSScript({
        framework: scriptFramework,
        topic: v.reelType || SERIES_MAP[v.series as SeriesType] || '',
        series: v.series,
        targetLanguage: v.targetLanguage,
        hook: scriptLines.hook,
        problem: scriptLines.problem,
        solution: scriptLines.solution,
        result: scriptLines.result,
      });
      if (!result.hook?.trim() && !result.problem?.trim()) {
        throw new Error('Script API returned empty hook/problem — try again');
      }
      applyScriptFields({
        hook: result.hook,
        problem: result.problem,
        solution: result.solution,
        result: result.result,
        captions: result.captions || '',
      });
      document.getElementById('reel-script-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast({
        title: `Script · ${result.frameworkLabel || 'Generated'}`,
        description: 'Hook / Problem / Solution / Result are filled — click Generate VO.',
        duration: 3500,
      });
    } catch (e) {
      toast({
        title: 'Script generate failed',
        description: e instanceof Error ? e.message : 'Check API / OPENAI_API_KEY',
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setScriptBusy(false);
    }
  }

  async function onTranslate() {
    setTranslating(true);
    try {
      const v = form.getValues();
      const result = await translateReelScript({
        targetLanguage: v.targetLanguage,
        hook: scriptLines.hook,
        problem: scriptLines.problem,
        solution: scriptLines.solution,
        result: scriptLines.result,
        captions: scriptLines.captions || '',
      });
      applyScriptFields({
        hook: result.hook,
        problem: result.problem,
        solution: result.solution,
        result: result.result,
        captions: result.captions,
        outroLine1: result.outroLine1,
        outroLine2: result.outroLine2,
      });
      toast({ title: `Script translated → ${v.targetLanguage}`, duration: 2500 });
    } catch (e) {
      toast({
        title: 'Translate failed',
        description: e instanceof Error ? e.message : 'Check API proxy / OPENAI_API_KEY',
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setTranslating(false);
    }
  }

  async function onGenerateVoice() {
    setVoBusy(true);
    setVoStatus('Starting…');
    try {
      let lines = { ...scriptLines };
      if (![lines.hook, lines.problem, lines.solution, lines.result].some((t) => t?.trim())) {
        if (studioMode) {
          throw new Error('Storyboard narration missing — regenerate in Creative Studio');
        }
        setVoStatus('Writing script…');
        const v0 = form.getValues();
        const generated = await generateSaaSScript({
          framework: scriptFramework,
          topic: v0.reelType || SERIES_MAP[v0.series as SeriesType] || '',
          series: v0.series,
          targetLanguage: v0.targetLanguage,
        });
        if (!generated.hook?.trim() && !generated.problem?.trim()) {
          throw new Error('Could not generate script text — check OPENAI_API_KEY / API');
        }
        applyScriptFields({
          hook: generated.hook,
          problem: generated.problem,
          solution: generated.solution,
          result: generated.result,
          captions: generated.captions || '',
        });
        lines = {
          hook: generated.hook || '',
          problem: generated.problem || '',
          solution: generated.solution || '',
          result: generated.result || '',
          captions: generated.captions || '',
        };
      }

      const v = form.getValues();
      const outro = defaultOutroVoiceText(v.outroLine1, v.outroLine2);
      const speed = VOICE_SPEEDS.find((s) => s.id === v.voiceSpeed)?.value ?? 1;
      const pack = await generateSegmentVoiceovers(
        {
          hook: lines.hook,
          problem: lines.problem,
          solution: lines.solution,
          result: lines.result,
          outro,
        },
        v.voiceActor,
        speed,
        (label) => setVoStatus(`TTS: ${label}…`),
      );
      setVoiceovers(pack);
      setVoStatus('Voiceover ready — press Play');
      toast({ title: 'Voiceover generated', duration: 2000 });
    } catch (e) {
      setVoStatus(null);
      toast({
        title: 'Voiceover failed',
        description: e instanceof Error ? e.message : 'TTS error',
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setVoBusy(false);
    }
  }

  function reelPayloadFromValues(values: FormValues, extra?: {
    hook?: string;
    problem?: string;
    solution?: string;
    result?: string;
    captions?: string;
    batchId?: string | null;
    variationIndex?: number;
    scheduleTag?: string;
    id?: string;
  }) {
    return {
      id: extra?.id,
      series: values.series as SeriesType,
      reelType: values.reelType,
      targetLanguage: values.targetLanguage,
      voiceActor: values.voiceActor as VoiceActorId,
      voiceSpeed: values.voiceSpeed as VoiceSpeedId,
      musicBed: values.musicBed as MusicBedId,
      brandTone: values.brandTone as BrandToneId,
      brandStingEnabled: values.brandTone !== 'none',
      voVolume: values.voVolume,
      bgmVolume: values.bgmVolume,
      brandVolume: values.brandVolume,
      problemVisual: values.problemVisual as ProblemVisual,
      solutionVisual: values.solutionVisual as SolutionVisual,
      hook: extra?.hook ?? scriptLines.hook ?? values.hook,
      problem: extra?.problem ?? scriptLines.problem ?? values.problem,
      solution: extra?.solution ?? scriptLines.solution ?? values.solution,
      result: extra?.result ?? scriptLines.result ?? values.result,
      captions: (extra?.captions ?? scriptLines.captions ?? values.captions) || '',
      outroLine1: values.outroLine1 || DEFAULT_OUTRO_SLOGAN.line1,
      outroLine2: values.outroLine2 || DEFAULT_OUTRO_SLOGAN.line2,
      batchId: extra?.batchId !== undefined ? extra.batchId : activeBatchId,
      variationIndex: extra?.variationIndex ?? existingReel?.variationIndex ?? 0,
      scheduleTag: (extra?.scheduleTag ?? scheduleTag).trim(),
      fromStudio: studioMode || Boolean(existingReel?.fromStudio),
      studioBrief: existingReel?.studioBrief || '',
      storyboardTitle: existingReel?.storyboardTitle || '',
    };
  }

  async function onBatchVariations() {
    setBatchBusy(true);
    try {
      if (!scriptLines.hook.trim() || !scriptLines.problem.trim() || !scriptLines.solution.trim() || !scriptLines.result.trim()) {
        toast({
          title: studioMode
            ? 'Storyboard narration missing — regenerate in Creative Studio'
            : 'Fill Hook / Problem / Solution / Result first',
          variant: 'destructive',
          duration: 3000,
        });
        return;
      }
      const v = form.getValues();
      const variations = await generateScriptVariations({
        hook: scriptLines.hook,
        problem: scriptLines.problem,
        solution: scriptLines.solution,
        result: scriptLines.result,
        captions: scriptLines.captions || '',
        count: batchCount,
      });
      if (variations.length === 0) {
        throw new Error('No variations returned');
      }
      const batchId = crypto.randomUUID();
      const tag = scheduleTag.trim() || `Batch ${new Date().toLocaleDateString()}`;
      setActiveBatchId(batchId);
      setScheduleTag(tag);

      const first = variations[0]!;
      applyScriptFields({
        hook: first.hook,
        problem: first.problem,
        solution: first.solution,
        result: first.result,
        captions: first.captions || '',
      });
      document.getElementById('reel-script-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

      variations.forEach((vr, i) => {
        saveReel(reelPayloadFromValues(v, {
          hook: vr.hook,
          problem: vr.problem,
          solution: vr.solution,
          result: vr.result,
          captions: vr.captions || '',
          batchId,
          variationIndex: i + 1,
          scheduleTag: tag,
        }));
      });

      toast({
        title: `Saved ${variations.length} variations`,
        description: `Batch tagged “${tag}” — open Library to schedule.`,
        duration: 4000,
      });
    } catch (e) {
      toast({
        title: 'Batch generate failed',
        description: e instanceof Error ? e.message : 'Check API / OPENAI_API_KEY',
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setBatchBusy(false);
    }
  }

  function onSubmit(values: FormValues) {
    setIsSaving(true);
    saveReel(reelPayloadFromValues(values, {
      id: isNew ? undefined : params!.id,
      batchId: activeBatchId,
      variationIndex: existingReel?.variationIndex ?? 0,
      scheduleTag,
    }));
    toast({ title: 'Reel saved', duration: 2000 });
    setTimeout(() => {
      setIsSaving(false);
      if (isNew) setLocation('/');
    }, 500);
  }

  if (!isLoaded) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: '#02050B', color: '#F8FAFC' }}>
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: '52px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#080D17',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setLocation('/')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(248,250,252,0.35)', display: 'flex', alignItems: 'center',
              padding: '6px', borderRadius: '6px',
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
              {isNew ? 'New Reel' : 'Edit Reel'}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(248,250,252,0.3)', marginTop: '1px' }}>
              OpenAI translate/TTS · 62 languages · isolated from workspace
            </div>
          </div>
        </div>

        <button
          onClick={form.handleSubmit(onSubmit)}
          disabled={isSaving}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            background: isSaving ? 'rgba(34,211,238,0.15)' : '#22D3EE',
            color: isSaving ? '#22D3EE' : '#02050B',
            border: isSaving ? '1px solid rgba(34,211,238,0.3)' : 'none',
            borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: 700,
            cursor: isSaving ? 'default' : 'pointer',
          }}
        >
          {isSaving ? <Check size={14} /> : <Save size={14} />}
          {isSaving ? 'Saved!' : 'Save Reel'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{
          width: '420px', flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#080D17', display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,250,252,0.25)', marginBottom: '12px' }}>
                  Configuration
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <FormField
                    control={form.control}
                    name="series"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Series</label>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(SERIES_MAP).map(([key, label]) => (
                              <SelectItem key={key} value={key}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reelType"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Sub-topic</label>
                        <FormControl>
                          <Input placeholder="e.g. Bad Connection" {...field} style={fieldSelectStyle} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <FormField
                    control={form.control}
                    name="targetLanguage"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Target Language ({REEL_LANGUAGES.length})
                        </label>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-72">
                            {REEL_LANGUAGES.map((l) => (
                              <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="voiceActor"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Voice Actor</label>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {VOICE_ACTORS.map((v) => (
                              <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="voiceSpeed"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Voice tempo</label>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {VOICE_SPEEDS.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="musicBed"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Background Music</label>
                        <Select
                          onValueChange={(v) => {
                            stopAudioPreview();
                            setPreviewing(null);
                            field.onChange(v);
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-80 w-[var(--radix-select-trigger-width)]" position="popper" sideOffset={6}>
                            {MUSIC_GROUPS.map(({ category, beds }) => (
                              <SelectGroup key={category.id}>
                                <SelectLabel>{category.label}</SelectLabel>
                                {beds.map((m) => (
                                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() => void onPreviewMusic()}
                          disabled={!musicUrl}
                          style={{
                            marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: previewing === 'music' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: previewing === 'music' ? '#FCA5A5' : 'rgba(248,250,252,0.75)',
                            borderRadius: 8, padding: '8px 10px', fontSize: 11, fontWeight: 700,
                            cursor: musicUrl ? 'pointer' : 'default', opacity: musicUrl ? 1 : 0.45,
                          }}
                        >
                          {previewing === 'music' ? <Square size={12} /> : <Volume2 size={12} />}
                          {previewing === 'music' ? 'Stop music preview' : 'Hear music first'}
                        </button>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="brandTone"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          Sonic logo / brand tone
                        </label>
                        <Select
                          onValueChange={(v) => {
                            stopAudioPreview();
                            setPreviewing(null);
                            field.onChange(v);
                            form.setValue('brandStingEnabled', v !== 'none');
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger style={fieldSelectStyle}><SelectValue placeholder="Select brand tone" /></SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-80 w-[var(--radix-select-trigger-width)]" position="popper" sideOffset={6}>
                            {BRAND_TONES.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p style={{ margin: 0, fontSize: 10, color: 'rgba(248,250,252,0.35)', lineHeight: 1.4 }}>
                          Plays on intro + after outro slogan VO (never over CTA voice)
                        </p>
                        <button
                          type="button"
                          onClick={() => void onPreviewBrandSting()}
                          disabled={!brandStingUrl}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: previewing === 'sting' ? 'rgba(34,211,238,0.18)' : 'rgba(34,211,238,0.08)',
                            border: '1px solid rgba(34,211,238,0.35)',
                            color: '#67E8F9', borderRadius: 8, padding: '8px 10px', fontSize: 11, fontWeight: 700,
                            cursor: brandStingUrl ? 'pointer' : 'default',
                            opacity: brandStingUrl ? 1 : 0.45,
                          }}
                        >
                          <Volume2 size={12} />
                          {previewing === 'sting' ? 'Playing brand tone…' : 'Hear brand tone first'}
                        </button>
                      </FormItem>
                    )}
                  />

                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 14,
                    padding: '12px 12px 10px',
                    background: 'rgba(34,211,238,0.04)',
                    border: '1px solid rgba(34,211,238,0.15)',
                    borderRadius: 10,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(248,250,252,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Mix levels
                    </span>
                    <FormField
                      control={form.control}
                      name="voVolume"
                      render={({ field }) => (
                        <FormItem>
                          <VolumeSlider
                            label="Voiceover volume"
                            value={field.value}
                            min={0}
                            max={1.5}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(n) => {
                              field.onChange(n);
                              if (previewing === null) {/* live via ReelPlayer */}
                            }}
                          />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bgmVolume"
                      render={({ field }) => (
                        <FormItem>
                          <VolumeSlider
                            label="Background music"
                            value={field.value}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(n) => {
                              field.onChange(n);
                              if (previewing === 'music') setPreviewGain(n);
                            }}
                          />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="brandVolume"
                      render={({ field }) => (
                        <FormItem>
                          <VolumeSlider
                            label="Sonic logo / brand tone"
                            value={field.value}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(n) => {
                              field.onChange(n);
                              if (previewing === 'sting') setPreviewGain(n);
                            }}
                          />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <FormField
                      control={form.control}
                      name="problemVisual"
                      render={({ field }) => (
                        <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Problem overlay</label>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="stock_broll">stock_broll</SelectItem>
                              <SelectItem value="none">none</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="solutionVisual"
                      render={({ field }) => (
                        <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Solution overlay</label>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger style={fieldSelectStyle}><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="workspace_demo">workspace_demo</SelectItem>
                              <SelectItem value="none">none</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

              <div id="reel-script-fields">
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,250,252,0.25)', marginBottom: '16px' }}>
                  {studioMode ? 'Storyboard narration (AI · locked)' : 'Script'}
                </div>
                {studioMode && existingReel?.studioBrief ? (
                  <div style={{
                    marginBottom: 12, padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 12, color: 'rgba(248,250,252,0.55)', lineHeight: 1.45,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(248,250,252,0.35)', marginBottom: 6 }}>
                      Commercial brief
                    </div>
                    {existingReel.studioBrief}
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {SEGMENTS.map((seg, i) => (
                    <div key={seg.name} style={{
                      background: '#0B1220',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <div style={{
                          width: '20px', height: '20px', borderRadius: '50%',
                          background: accentColor, color: '#02050B',
                          fontSize: '10px', fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#F8FAFC' }}>
                            {studioMode ? `Scene 0${i + 1}` : seg.label}
                          </span>
                          <span style={{ fontSize: '10px', color: 'rgba(248,250,252,0.3)', marginLeft: '8px' }}>{seg.timing}</span>
                        </div>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, fontFamily: 'monospace',
                          color: '#67E8F9',
                          background: 'rgba(34,211,238,0.12)',
                          border: '1px solid rgba(34,211,238,0.25)',
                          borderRadius: 999, padding: '3px 8px',
                        }}>
                          {formatEstBadge(
                            (measuredVo[seg.name] && measuredVo[seg.name]! > 0.2
                              ? measuredVo[seg.name]!
                              : estimateSpeechSeconds(String(scriptLines[seg.name] || ''), voiceSpeedValue))
                            + SCENE_PADDING_SEC,
                          )}
                        </span>
                      </div>
                      {studioMode ? (
                        <div style={{
                          padding: '12px 14px', color: '#F8FAFC', fontSize: 14, fontWeight: 500,
                          lineHeight: 1.55, whiteSpace: 'pre-wrap',
                        }}>
                          {scriptLines[seg.name] || '—'}
                        </div>
                      ) : (
                        <textarea
                          value={scriptLines[seg.name]}
                          onChange={(e) => updateScriptLine(seg.name, e.target.value)}
                          rows={seg.rows}
                          placeholder={seg.hint}
                          style={{
                            width: '100%', background: 'transparent', border: 'none', outline: 'none',
                            resize: 'vertical', color: '#F8FAFC', fontSize: '14px', fontWeight: 500,
                            lineHeight: 1.55, padding: '12px 14px', minHeight: 64,
                            fontFamily: 'Inter, SF Pro Display, -apple-system, system-ui, sans-serif',
                          }}
                        />
                      )}
                    </div>
                  ))}

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      On-screen captions (optional)
                    </label>
                    <textarea
                      value={scriptLines.captions}
                      onChange={(e) => updateScriptLine('captions', e.target.value)}
                      rows={2}
                      placeholder="Short caption overlays"
                      style={{
                        width: '100%', marginTop: 6, background: '#0B1220',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                        color: '#F8FAFC', fontSize: 13, padding: 12, resize: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>


                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => void onTranslate()}
                    disabled={translating}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.35)',
                      color: '#67E8F9', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 700,
                      cursor: translating ? 'default' : 'pointer', opacity: translating ? 0.7 : 1,
                    }}
                  >
                    {translating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
                    Translate Script
                  </button>
                  <button
                    type="button"
                    onClick={() => void onGenerateVoice()}
                    disabled={voBusy}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.4)',
                      color: '#93C5FD', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 700,
                      cursor: voBusy ? 'default' : 'pointer', opacity: voBusy ? 0.7 : 1,
                    }}
                  >
                    {voBusy ? <Loader2 size={14} className="animate-spin" /> : <Mic2 size={14} />}
                    Generate VO
                  </button>
                </div>
                {voStatus ? (
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(248,250,252,0.4)' }}>{voStatus}</p>
                ) : null}

                {!studioMode ? (
                <div style={{
                  marginTop: 14, padding: 12, borderRadius: 10,
                  border: '1px solid rgba(0,112,243,0.28)', background: 'rgba(0,112,243,0.06)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#93C5FD' }}>
                    SaaS ad script engine
                  </div>
                  <select
                    value={scriptFramework}
                    onChange={(e) => setScriptFramework(e.target.value as ScriptFrameworkId)}
                    style={{
                      background: '#02050B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                      color: '#F8FAFC', fontSize: 12, padding: '8px 10px',
                    }}
                  >
                    <option value="auto">Auto · rotate frameworks</option>
                    <option value="pov_pain">POV Pain Point</option>
                    <option value="us_vs_them">Us vs Them</option>
                    <option value="shocking_stat">Shocking Industry Stat</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void onGenerateSaaSScript()}
                    disabled={scriptBusy || translating}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      background: 'rgba(0,112,243,0.2)', border: '1px solid rgba(0,112,243,0.45)',
                      color: '#BFDBFE', borderRadius: 8, padding: '10px 12px', fontSize: 12, fontWeight: 700,
                      cursor: scriptBusy ? 'default' : 'pointer', opacity: scriptBusy ? 0.7 : 1,
                    }}
                  >
                    {scriptBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Generate converting script
                  </button>
                </div>
                ) : (
                <div style={{
                  marginTop: 14, padding: 12, borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)',
                  fontSize: 12, color: 'rgba(248,250,252,0.55)', lineHeight: 1.45,
                }}>
                  Script came from Creative Studio. Use language, translate, ElevenLabs VO, soundtrack, batch, and export below.
                  <button
                    type="button"
                    onClick={() => setLocation('/')}
                    style={{
                      display: 'block', marginTop: 10, background: 'none', border: 'none',
                      color: '#93C5FD', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
                    }}
                  >
                    ← Back to Creative Studio
                  </button>
                </div>
                )}

                <div style={{
                  marginTop: 14, padding: 12, borderRadius: 10,
                  border: '1px solid rgba(255,215,0,0.2)', background: 'rgba(255,215,0,0.04)',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,215,0,0.75)' }}>
                    Batch · social scheduling
                  </div>
                  <input
                    type="text"
                    value={scheduleTag}
                    onChange={(e) => setScheduleTag(e.target.value)}
                    placeholder="Schedule tag (e.g. Week of Aug 4)"
                    style={{
                      background: '#02050B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                      color: '#F8FAFC', fontSize: 12, padding: '8px 10px', outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select
                      value={batchCount}
                      onChange={(e) => setBatchCount(Number(e.target.value) as 3 | 5)}
                      style={{
                        background: '#02050B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                        color: '#F8FAFC', fontSize: 12, padding: '8px 10px', height: 36,
                      }}
                    >
                      <option value={3}>3 variations</option>
                      <option value={5}>5 variations</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void onBatchVariations()}
                      disabled={batchBusy || voBusy}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.35)',
                        color: '#FFD700', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700,
                        cursor: batchBusy ? 'default' : 'pointer', opacity: batchBusy ? 0.7 : 1, height: 36,
                      }}
                    >
                      {batchBusy ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                      Generate & save batch
                    </button>
                  </div>
                </div>
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'rgba(34,211,238,0.05)', border: '1px solid rgba(34,211,238,0.15)',
                borderRadius: '10px', padding: '14px',
              }}>
                <Lock size={14} style={{ color: '#22D3EE', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#22D3EE', marginBottom: '2px' }}>
                    Universal Brand Outro — Locked 4.0s (language only)
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(248,250,252,0.35)', lineHeight: 1.5 }}>
                    {(watchedValues.outroLine1 || DEFAULT_OUTRO_SLOGAN.line1)}{' '}
                    {(watchedValues.outroLine2 || DEFAULT_OUTRO_SLOGAN.line2)}
                  </div>
                </div>
              </div>

            </form>
          </Form>
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#02050B', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse at 60% 50%, rgba(34,211,238,0.04) 0%, transparent 60%)`,
            pointerEvents: 'none',
          }} />
          <ReelPlayer
            data={{
              hook: scriptLines.hook,
              problem: scriptLines.problem,
              solution: scriptLines.solution,
              result: scriptLines.result,
              captions: scriptLines.captions || '',
              outroLine1: watchedValues.outroLine1 || DEFAULT_OUTRO_SLOGAN.line1,
              outroLine2: watchedValues.outroLine2 || DEFAULT_OUTRO_SLOGAN.line2,
            }}
            targetLanguage={watchedValues.targetLanguage || 'en'}
            problemVisual={(watchedValues.problemVisual || 'stock_broll') as ProblemVisual}
            solutionVisual={(watchedValues.solutionVisual || 'workspace_demo') as SolutionVisual}
            series={watchedValues.series || '1'}
            musicUrl={musicUrl}
            brandStingEnabled={brandStingOn}
            brandStingUrl={brandStingUrl}
            voiceSpeed={voiceSpeedValue}
            volumes={{
              vo: watchedValues.voVolume ?? 1,
              bgm: watchedValues.bgmVolume ?? 0.25,
              brand: watchedValues.brandVolume ?? 0.8,
            }}
            voiceoverPack={voiceovers}
            demoVideoUrl={demoVideoUrl}
            accentColor={accentColor}
            filename={exportFilename}
          />
        </div>
      </div>
    </div>
  );
}
