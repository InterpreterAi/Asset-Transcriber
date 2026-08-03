import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useReels, SERIES_MAP, SeriesType } from '@/hooks/use-reels';
import { ReelPlayer } from '@/components/preview/ReelPlayer';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Check, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  series: z.string().min(1, 'Select a series'),
  reelType: z.string().min(1, 'Add a sub-topic'),
  hook: z.string().min(1, 'Hook is required'),
  problem: z.string().min(1, 'Problem is required'),
  solution: z.string().min(1, 'Solution is required'),
  result: z.string().min(1, 'Result is required'),
});

type FormValues = z.infer<typeof formSchema>;

const SEGMENTS = [
  { name: 'hook',     label: 'Hook',     timing: '0–3s',   hint: 'One bold line that stops the scroll.',         rows: 2 },
  { name: 'problem',  label: 'Problem',  timing: '3–12s',  hint: 'The pain your audience feels every day.',      rows: 3 },
  { name: 'solution', label: 'Solution', timing: '12–23s', hint: 'How InterpreterAI removes that friction.',     rows: 4 },
  { name: 'result',   label: 'Result',   timing: '23–28s', hint: 'The transformation. Make them feel it.',       rows: 2 },
] as const;

const SERIES_COLORS: Record<string, string> = {
  medical: '#22D3EE',
  legal: '#A78BFA',
  conference: '#34D399',
  immigration: '#F59E0B',
  education: '#FB923C',
  general: '#64748B',
};

export default function Builder() {
  const [, params] = useRoute('/builder/:id');
  const [, setLocation] = useLocation();
  const { getReel, saveReel, isLoaded } = useReels();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const isNew = !params?.id;
  const existingReel = params?.id ? getReel(params.id) : null;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { series: 'medical', reelType: '', hook: '', problem: '', solution: '', result: '' },
  });

  const watchedValues = form.watch();
  const selectedSeries = watchedValues.series;
  const accentColor = SERIES_COLORS[selectedSeries] || '#22D3EE';

  useEffect(() => {
    if (isLoaded && !isNew && existingReel) {
      form.reset({
        series: existingReel.series,
        reelType: existingReel.reelType,
        hook: existingReel.hook,
        problem: existingReel.problem,
        solution: existingReel.solution,
        result: existingReel.result,
      });
    } else if (isLoaded && !isNew && !existingReel) {
      setLocation('/builder');
    }
  }, [isLoaded, isNew, existingReel, form, setLocation]);

  function onSubmit(values: FormValues) {
    setIsSaving(true);
    saveReel({
      id: isNew ? undefined : params!.id,
      series: values.series as SeriesType,
      reelType: values.reelType,
      hook: values.hook,
      problem: values.problem,
      solution: values.solution,
      result: values.result,
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

      {/* ── Toolbar ── */}
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
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(248,250,252,0.35)',
              display: 'flex',
              alignItems: 'center',
              padding: '6px',
              borderRadius: '6px',
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
              {isNew ? 'New Reel' : 'Edit Reel'}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(248,250,252,0.3)', marginTop: '1px' }}>
              Preview updates live
            </div>
          </div>
        </div>

        <button
          onClick={form.handleSubmit(onSubmit)}
          disabled={isSaving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            background: isSaving ? 'rgba(34,211,238,0.15)' : '#22D3EE',
            color: isSaving ? '#22D3EE' : '#02050B',
            border: isSaving ? '1px solid rgba(34,211,238,0.3)' : 'none',
            borderRadius: '8px',
            padding: '8px 18px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: isSaving ? 'default' : 'pointer',
            letterSpacing: '0.01em',
            transition: 'all 0.2s',
          }}
        >
          {isSaving ? <Check size={14} /> : <Save size={14} />}
          {isSaving ? 'Saved!' : 'Save Reel'}
        </button>
      </div>

      {/* ── Two panels ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Script form */}
        <div style={{
          width: '420px',
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#080D17',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Configuration block */}
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
                            <SelectTrigger style={{
                              background: '#0B1220',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '8px',
                              color: '#F8FAFC',
                              fontSize: '13px',
                              height: '38px',
                            }}>
                              <SelectValue />
                            </SelectTrigger>
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
                          <Input
                            placeholder="e.g. Bad Connection"
                            {...field}
                            style={{
                              background: '#0B1220',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: '8px',
                              color: '#F8FAFC',
                              fontSize: '13px',
                              height: '38px',
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />

              {/* Content segments */}
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
                            transition: 'border-color 0.15s',
                          }}>
                            {/* Segment header */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 14px 8px',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                            }}>
                              <div style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                background: accentColor,
                                color: '#02050B',
                                fontSize: '10px',
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                {i + 1}
                              </div>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontSize: '12px', fontWeight: 700, color: '#F8FAFC' }}>{seg.label}</span>
                                <span style={{ fontSize: '10px', color: 'rgba(248,250,252,0.3)', marginLeft: '8px' }}>{seg.timing}</span>
                              </div>
                            </div>
                            {/* Textarea */}
                            <FormControl>
                              <textarea
                                {...field}
                                rows={seg.rows}
                                placeholder={seg.hint}
                                style={{
                                  width: '100%',
                                  background: 'transparent',
                                  border: 'none',
                                  outline: 'none',
                                  resize: 'none',
                                  color: '#F8FAFC',
                                  fontSize: '14px',
                                  fontWeight: 500,
                                  lineHeight: 1.55,
                                  padding: '12px 14px',
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
                </div>
              </div>

              {/* Locked outro notice */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(34,211,238,0.05)',
                border: '1px solid rgba(34,211,238,0.15)',
                borderRadius: '10px',
                padding: '14px',
              }}>
                <Lock size={14} style={{ color: '#22D3EE', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#22D3EE', marginBottom: '2px' }}>
                    Brand Outro — Always Locked (28–35s)
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(248,250,252,0.35)', lineHeight: 1.5 }}>
                    Logo · slogan · CTA · app.interpreterai.org — identical on every reel. Cannot be removed.
                  </div>
                </div>
              </div>

            </form>
          </Form>
        </div>

        {/* RIGHT: Preview stage */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#02050B',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle radial glow in background */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse at 60% 50%, rgba(34,211,238,0.04) 0%, transparent 60%)`,
            pointerEvents: 'none',
          }} />
          <ReelPlayer
            data={{
              hook: watchedValues.hook,
              problem: watchedValues.problem,
              solution: watchedValues.solution,
              result: watchedValues.result,
            }}
            accentColor={accentColor}
            filename={`interpreterai-${watchedValues.series || 'reel'}-${(watchedValues.reelType || 'draft').replace(/\s+/g, '-').toLowerCase()}`}
          />
        </div>
      </div>
    </div>
  );
}
