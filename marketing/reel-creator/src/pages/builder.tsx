import { useEffect, useMemo, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useReels, SERIES_MAP, SeriesType } from '@/hooks/use-reels';
import { ReelPlayer } from '@/components/preview/ReelPlayer';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Check, Lock, Languages, Mic2, Loader2, Volume2, Square } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  BRAND_STING_URL,
  DEFAULT_OUTRO_SLOGAN,
  MUSIC_BEDS,
  REEL_LANGUAGES,
  VOICE_ACTORS,
  type MusicBedId,
  type ProblemVisual,
  type SolutionVisual,
  type VoiceActorId,
} from '@/lib/constants/languages';
import { generateSegmentVoiceovers, translateReelScript } from '@/lib/reelBuilderApi';
import { previewAudioUrl, stopAudioPreview } from '@/lib/previewAudio';
import {
  REEL_HANDOFF_PAYLOAD,
  REEL_HANDOFF_READY,
  isReelHandoffPayload,
} from '@/lib/recordingHandoff';

const formSchema = z.object({
  series: z.string().min(1, 'Select a series'),
  reelType: z.string().min(1, 'Add a sub-topic'),
  targetLanguage: z.string().min(1),
  voiceActor: z.enum(['onyx', 'nova', 'alloy', 'echo']),
  musicBed: z.enum([
    'subtle_ambient',
    'medical_urgency',
    'legal_calm',
    'conference_pulse',
    'hopeful_growth',
    'none',
  ]),
  brandStingEnabled: z.boolean(),
  problemVisual: z.enum(['stock_broll', 'none']),
  solutionVisual: z.enum(['workspace_demo', 'none']),
  hook: z.string().min(1, 'Hook is required'),
  problem: z.string().min(1, 'Problem is required'),
  solution: z.string().min(1, 'Solution is required'),
  result: z.string().min(1, 'Result is required'),
  captions: z.string().optional(),
  outroLine1: z.string().optional(),
  outroLine2: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const SEGMENTS = [
  { name: 'hook',     label: 'Hook',     timing: '0–3s',   hint: 'One bold line that stops the scroll.',         rows: 2 },
  { name: 'problem',  label: 'Problem',  timing: '3–12s',  hint: 'The pain your audience feels every day.',      rows: 3 },
  { name: 'solution', label: 'Solution', timing: '12–23s', hint: 'How InterpreterAI removes that friction.',     rows: 4 },
  { name: 'result',   label: 'Result',   timing: '23–28s', hint: 'The transformation. Make them feel it.',       rows: 2 },
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
  const [, setLocation] = useLocation();
  const { getReel, saveReel, isLoaded } = useReels();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [voBusy, setVoBusy] = useState(false);
  const [voStatus, setVoStatus] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<'music' | 'sting' | null>(null);
  const [voiceovers, setVoiceovers] = useState<{
    hook?: Blob;
    problem?: Blob;
    solution?: Blob;
    result?: Blob;
    outro?: Blob;
  }>({});
  const [demoVideoUrl, setDemoVideoUrl] = useState<string | null>(null);

  const isNew = !params?.id;
  const existingReel = params?.id ? getReel(params.id) : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      series: '1',
      reelType: '',
      targetLanguage: 'en',
      voiceActor: 'onyx',
      musicBed: 'subtle_ambient',
      brandStingEnabled: true,
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

  useEffect(() => {
    if (isLoaded && !isNew && existingReel) {
      form.reset({
        series: existingReel.series,
        reelType: existingReel.reelType,
        targetLanguage: existingReel.targetLanguage,
        voiceActor: existingReel.voiceActor,
        musicBed: existingReel.musicBed,
        brandStingEnabled: existingReel.brandStingEnabled,
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
    } else if (isLoaded && !isNew && !existingReel) {
      setLocation('/builder');
    }
  }, [isLoaded, isNew, existingReel, form, setLocation]);

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
    () => MUSIC_BEDS.find((m) => m.id === watchedValues.musicBed)?.file ?? null,
    [watchedValues.musicBed],
  );

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
      await previewAudioUrl(musicUrl, { gain: 0.45, loop: true });
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
    try {
      stopAudioPreview();
      setPreviewing('sting');
      await previewAudioUrl(BRAND_STING_URL, { gain: 0.7, loop: false });
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

  async function onTranslate() {
    setTranslating(true);
    try {
      const v = form.getValues();
      const result = await translateReelScript({
        targetLanguage: v.targetLanguage,
        hook: v.hook,
        problem: v.problem,
        solution: v.solution,
        result: v.result,
        captions: v.captions || '',
      });
      form.setValue('hook', result.hook);
      form.setValue('problem', result.problem);
      form.setValue('solution', result.solution);
      form.setValue('result', result.result);
      form.setValue('captions', result.captions);
      form.setValue('outroLine1', result.outroLine1);
      form.setValue('outroLine2', result.outroLine2);
      setVoiceovers({});
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
      const v = form.getValues();
      const outro = `${v.outroLine1 || DEFAULT_OUTRO_SLOGAN.line1} ${v.outroLine2 || DEFAULT_OUTRO_SLOGAN.line2}`;
      const pack = await generateSegmentVoiceovers(
        {
          hook: v.hook,
          problem: v.problem,
          solution: v.solution,
          result: v.result,
          outro,
        },
        v.voiceActor,
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

  function onSubmit(values: FormValues) {
    setIsSaving(true);
    saveReel({
      id: isNew ? undefined : params!.id,
      series: values.series as SeriesType,
      reelType: values.reelType,
      targetLanguage: values.targetLanguage,
      voiceActor: values.voiceActor as VoiceActorId,
      musicBed: values.musicBed as MusicBedId,
      brandStingEnabled: values.brandStingEnabled,
      problemVisual: values.problemVisual as ProblemVisual,
      solutionVisual: values.solutionVisual as SolutionVisual,
      hook: values.hook,
      problem: values.problem,
      solution: values.solution,
      result: values.result,
      captions: values.captions || '',
      outroLine1: values.outroLine1 || DEFAULT_OUTRO_SLOGAN.line1,
      outroLine2: values.outroLine2 || DEFAULT_OUTRO_SLOGAN.line2,
    });
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
                          <SelectContent>
                            {MUSIC_BEDS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
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
                    name="brandStingEnabled"
                    render={({ field }) => (
                      <FormItem style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          InterpreterAI brand tone
                        </label>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
                          color: 'rgba(248,250,252,0.7)', cursor: 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                            style={{ width: 14, height: 14, accentColor: '#22D3EE' }}
                          />
                          Play sonic logo on intro &amp; outro (when brand appears)
                        </label>
                        <button
                          type="button"
                          onClick={() => void onPreviewBrandSting()}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            background: previewing === 'sting' ? 'rgba(34,211,238,0.18)' : 'rgba(34,211,238,0.08)',
                            border: '1px solid rgba(34,211,238,0.35)',
                            color: '#67E8F9', borderRadius: 8, padding: '8px 10px', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          <Volume2 size={12} />
                          {previewing === 'sting' ? 'Playing brand tone…' : 'Hear brand tone first'}
                        </button>
                      </FormItem>
                    )}
                  />

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
              </div>

              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,250,252,0.25)', marginBottom: '16px' }}>
                  Script
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {SEGMENTS.map((seg, i) => (
                    <FormField
                      key={seg.name}
                      control={form.control}
                      name={seg.name}
                      render={({ field }) => (
                        <FormItem>
                          <div style={{
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
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#F8FAFC' }}>{seg.label}</span>
                                <span style={{ fontSize: '10px', color: 'rgba(248,250,252,0.3)', marginLeft: '8px' }}>{seg.timing}</span>
                              </div>
                            </div>
                            <FormControl>
                              <textarea
                                {...field}
                                rows={seg.rows}
                                placeholder={seg.hint}
                                style={{
                                  width: '100%', background: 'transparent', border: 'none', outline: 'none',
                                  resize: 'none', color: '#F8FAFC', fontSize: '14px', fontWeight: 500,
                                  lineHeight: 1.55, padding: '12px 14px',
                                  fontFamily: 'Inter, SF Pro Display, -apple-system, system-ui, sans-serif',
                                }}
                              />
                            </FormControl>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}

                  <FormField
                    control={form.control}
                    name="captions"
                    render={({ field }) => (
                      <FormItem>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(248,250,252,0.45)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                          On-screen captions (optional)
                        </label>
                        <FormControl>
                          <textarea
                            {...field}
                            rows={2}
                            placeholder="Short caption overlays"
                            style={{
                              width: '100%', marginTop: 6, background: '#0B1220',
                              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                              color: '#F8FAFC', fontSize: 13, padding: 12, resize: 'none',
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
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
                    Brand Outro — Locked (translates with script)
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
              hook: watchedValues.hook,
              problem: watchedValues.problem,
              solution: watchedValues.solution,
              result: watchedValues.result,
              captions: watchedValues.captions || '',
              outroLine1: watchedValues.outroLine1 || DEFAULT_OUTRO_SLOGAN.line1,
              outroLine2: watchedValues.outroLine2 || DEFAULT_OUTRO_SLOGAN.line2,
            }}
            targetLanguage={watchedValues.targetLanguage || 'en'}
            problemVisual={(watchedValues.problemVisual || 'stock_broll') as ProblemVisual}
            solutionVisual={(watchedValues.solutionVisual || 'workspace_demo') as SolutionVisual}
            series={watchedValues.series || '1'}
            musicUrl={musicUrl}
            brandStingEnabled={watchedValues.brandStingEnabled !== false}
            voiceovers={voiceovers}
            demoVideoUrl={demoVideoUrl}
            accentColor={accentColor}
            filename={`interpreterai-${watchedValues.series || 'reel'}-${(watchedValues.reelType || 'draft').replace(/\s+/g, '-').toLowerCase()}`}
          />
        </div>
      </div>
    </div>
  );
}
