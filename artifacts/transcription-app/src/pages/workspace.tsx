import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Mic2, LogOut, Settings, AlertTriangle, Clock, User,
  Globe, Languages, ArrowLeftRight, Trash2
} from "lucide-react";
import { Select } from "@/components/ui-components";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useTranscription, type Phrase, type LiveTranscript } from "@/hooks/use-transcription";
import { AudioMeter } from "@/components/AudioMeter";
import { FeedbackModal } from "@/components/FeedbackModal";
import { formatMinutes } from "@/lib/utils";

const LANG_OPTIONS = [
  { value: "en",    label: "English" },
  { value: "ar",    label: "Arabic" },
  { value: "es",    label: "Spanish" },
  { value: "fr",    label: "French" },
  { value: "de",    label: "German" },
  { value: "it",    label: "Italian" },
  { value: "pt",    label: "Portuguese" },
  { value: "ru",    label: "Russian" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "ja",    label: "Japanese" },
  { value: "ko",    label: "Korean" },
  { value: "hi",    label: "Hindi" },
  { value: "tr",    label: "Turkish" },
  { value: "nl",    label: "Dutch" },
  { value: "pl",    label: "Polish" },
  { value: "he",    label: "Hebrew" },
  { value: "uk",    label: "Ukrainian" },
];

function langLabel(val: string) {
  return LANG_OPTIONS.find((l) => l.value === val)?.label ?? val.toUpperCase();
}

function getTargetLang(srcLang: string, langA: string, langB: string): string {
  return srcLang === langA ? langB : langA;
}

// ── Pulsing dots ───────────────────────────────────────────────────────────────
function Dots() {
  return (
    <span className="inline-flex gap-[3px] ml-1.5 align-middle">
      <span className="w-1 h-1 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1 h-1 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1 h-1 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

// ── Speaker label ──────────────────────────────────────────────────────────────
function SpeakerTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 mb-1 w-fit">
      {label}
    </span>
  );
}

// ── Paired segment row (finalized) ────────────────────────────────────────────
// One row shows BOTH the original text and its translation side-by-side.
// Left column is always langA (e.g. English), right is langB (e.g. Arabic).
//
function SegmentRow({
  phrase, translation, langA, langB,
}: {
  phrase: Phrase;
  translation?: { text: string; targetLang: string };
  langA: string;
  langB: string;
}) {
  const targetLang = translation?.targetLang ?? getTargetLang(phrase.language, langA, langB);

  // Which physical column each piece of text goes into
  const originalIsLeft = phrase.language === langA || (phrase.language !== langB);
  const leftText  = originalIsLeft ? phrase.text : translation?.text;
  const rightText = originalIsLeft ? translation?.text : phrase.text;
  const leftRtl   = langA === "ar" || langA === "he";
  const rightRtl  = (targetLang === "ar" || targetLang === "he") || (!originalIsLeft && (phrase.language === "ar" || phrase.language === "he"));

  return (
    <div className="grid grid-cols-2 gap-6 mb-5 pb-5 border-b border-border/25 last:border-0 last:pb-0 last:mb-0">
      {/* Left column (langA) */}
      <div>
        <SpeakerTag label={phrase.speakerLabel} />
        {leftText ? (
          <p className="text-[13px] leading-relaxed text-foreground font-medium" dir={leftRtl ? "rtl" : "ltr"}>
            {leftText}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground/50 italic flex items-center gap-1">
            Translating
            <span className="inline-flex gap-[3px] ml-1 align-middle">
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </p>
        )}
      </div>
      {/* Right column (langB) */}
      <div className="border-l border-border/20 pl-6">
        <SpeakerTag label={phrase.speakerLabel} />
        {rightText ? (
          <p className="text-[13px] leading-relaxed text-foreground font-medium" dir={rightRtl ? "rtl" : "ltr"}>
            {rightText}
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground/50 italic flex items-center gap-1">
            Translating
            <span className="inline-flex gap-[3px] ml-1 align-middle">
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

// ── Live paired row ────────────────────────────────────────────────────────────
function LiveRow({
  live, liveTranslation, langA, langB,
}: {
  live: LiveTranscript;
  liveTranslation: { text: string; targetLang: string } | null;
  langA: string;
  langB: string;
}) {
  const targetLang = getTargetLang(live.language, langA, langB);
  const originalIsLeft = live.language === langA || live.language !== langB;
  const leftRtl  = langA === "ar" || langA === "he";
  const rightRtl = targetLang === "ar" || targetLang === "he";

  const leftContent = originalIsLeft ? (
    <p className="text-[13px] leading-relaxed text-foreground font-medium" dir={leftRtl ? "rtl" : "ltr"}>
      {live.text}<Dots />
    </p>
  ) : liveTranslation ? (
    <p className="text-[13px] leading-relaxed text-foreground font-medium" dir={leftRtl ? "rtl" : "ltr"}>
      {liveTranslation.text}<Dots />
    </p>
  ) : (
    <p className="text-[13px] text-muted-foreground/50 italic flex items-center gap-1">
      Translating
      <span className="inline-flex gap-[3px] ml-1 align-middle">
        <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </p>
  );

  const rightContent = !originalIsLeft ? (
    <p className="text-[13px] leading-relaxed text-foreground font-medium" dir={rightRtl ? "rtl" : "ltr"}>
      {live.text}<Dots />
    </p>
  ) : liveTranslation ? (
    <p className="text-[13px] leading-relaxed text-foreground font-medium" dir={rightRtl ? "rtl" : "ltr"}>
      {liveTranslation.text}<Dots />
    </p>
  ) : (
    <p className="text-[13px] text-muted-foreground/50 italic flex items-center gap-1">
      Translating
      <span className="inline-flex gap-[3px] ml-1 align-middle">
        <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
      </span>
    </p>
  );

  return (
    <div className="grid grid-cols-2 gap-6 mb-5">
      <div>
        <SpeakerTag label={live.speakerLabel} />
        {leftContent}
      </div>
      <div className="border-l border-border/20 pl-6">
        <SpeakerTag label={live.speakerLabel} />
        {rightContent}
      </div>
    </div>
  );
}

// ── Main workspace ─────────────────────────────────────────────────────────────
export default function Workspace() {
  const [, setLocation]   = useLocation();
  const queryClient       = useQueryClient();
  const { data: user, isLoading: userLoading, error: userError } = useGetMe({ query: { retry: false } });
  const logoutMut         = useLogout();

  const { devices }   = useAudioDevices();
  const transcription = useTranscription();

  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [showFeedback, setShowFeedback]         = useState(false);
  const [activeTab, setActiveTab]               = useState("mic");

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");

  // translations[phrase.id] = { text, targetLang }
  const [translations,    setTranslations]    = useState<Record<string, { text: string; targetLang: string }>>({});
  const [liveTranslation, setLiveTranslation] = useState<{ text: string; targetLang: string } | null>(null);

  const translatingRef   = useRef<Set<string>>(new Set());
  const translationsDone = useRef<Set<string>>(new Set());
  const liveXlatTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveXlatAbort    = useRef<AbortController | null>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll on new phrase ──────────────────────────────────────────────
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcription.phrases.length]);

  // ── Live translation — debounced 200 ms ───────────────────────────────────
  useEffect(() => {
    if (!transcription.liveTranscript) {
      if (liveXlatTimer.current) clearTimeout(liveXlatTimer.current);
      return;
    }

    const { text, language } = transcription.liveTranscript;
    const targetLang = getTargetLang(language, langA, langB);

    if (liveXlatTimer.current) clearTimeout(liveXlatTimer.current);

    liveXlatTimer.current = setTimeout(async () => {
      if (liveXlatAbort.current) liveXlatAbort.current.abort();
      const controller = new AbortController();
      liveXlatAbort.current = controller;

      try {
        const res = await fetch("/api/translate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal:  controller.signal,
          body:    JSON.stringify({ text, sourceLang: language, targetLang }),
        });
        if (res.ok) {
          const data = await res.json() as { translatedText?: string; text?: string };
          const translated = data.translatedText ?? data.text ?? "";
          if (translated) setLiveTranslation({ text: translated, targetLang });
        }
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          console.error("Live translation error:", err);
        }
      }
    }, 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcription.liveTranscript?.text, transcription.liveTranscript?.language, langA, langB]);

  // ── Phrase translation — fires immediately when a phrase seals ────────────
  const translatePhrase = useCallback(async (phrase: Phrase, targetLang: string) => {
    const key = phrase.id;
    if (translatingRef.current.has(key))   return;
    if (translationsDone.current.has(key)) return;
    translatingRef.current.add(key);

    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch("/api/translate", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text: phrase.text, sourceLang: phrase.language, targetLang }),
        });
        if (res.ok) {
          const data = await res.json() as { translatedText?: string; text?: string };
          const translated = data.translatedText ?? data.text ?? "";
          if (translated) {
            setTranslations(prev => ({ ...prev, [key]: { text: translated, targetLang } }));
            translationsDone.current.add(key);
          }
          break;
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      } catch (err) {
        console.error("Phrase translation error:", err);
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    }

    translatingRef.current.delete(key);
  }, []);

  useEffect(() => {
    for (const phrase of transcription.phrases) {
      if (!phrase.text.trim()) continue;
      if (translationsDone.current.has(phrase.id)) continue;
      if (translatingRef.current.has(phrase.id))   continue;
      void translatePhrase(phrase, getTargetLang(phrase.language, langA, langB));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcription.phrases, langA, langB, translatePhrase]);

  useEffect(() => { if (userError) setLocation("/login"); }, [userError, setLocation]);

  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) setSelectedDeviceId(devices[0]!.deviceId);
  }, [devices, selectedDeviceId]);

  useEffect(() => {
    if (!user?.trialExpired) return;
    const t = setTimeout(() => setShowFeedback(true), 1000);
    return () => clearTimeout(t);
  }, [user?.trialExpired]);

  const handleLogout = async () => {
    await logoutMut.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  const handleClear = () => {
    transcription.clear();
    setTranslations({});
    setLiveTranslation(null);
    translatingRef.current.clear();
    translationsDone.current.clear();
    if (liveXlatTimer.current) clearTimeout(liveXlatTimer.current);
    if (liveXlatAbort.current) liveXlatAbort.current.abort();
  };

  const handleToggleRecording = () => {
    if (transcription.isRecording) {
      transcription.stop();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } else {
      transcription.start(selectedDeviceId);
    }
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }
  if (!user) return null;

  const isLimitReached = user.minutesRemainingToday <= 0;
  const isBlocked      = user.trialExpired || isLimitReached;

  // isEmpty only shows the empty-state placeholder — never go blank after Stop
  const hasContent = transcription.phrases.length > 0 || !!transcription.liveTranscript;

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden text-foreground">
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* SIDEBAR */}
      <aside className="w-[64px] bg-sidebar border-r border-sidebar-border flex flex-col items-center py-3 flex-shrink-0 z-20">
        <div className="flex-1 flex flex-col gap-1.5">
          {[
            { id: "profile", icon: <User className="w-5 h-5" />,  title: "Profile" },
            { id: "mic",     icon: <Mic2 className="w-5 h-5" />,  title: "Audio" },
            { id: "lang",    icon: <Globe className="w-5 h-5" />, title: "Languages" },
          ].map(({ id, icon, title }) => (
            <button
              key={id}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                activeTab === id
                  ? "bg-white shadow-sm text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              onClick={() => setActiveTab(id)}
              title={title}
            >
              {icon}
            </button>
          ))}
          {user.isAdmin && (
            <button
              className="w-11 h-11 rounded-xl flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
              onClick={() => setLocation("/admin")}
              title="Admin"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
        <button
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors mt-auto"
          onClick={handleLogout}
          title="Log Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">

        {/* HEADER */}
        <header className="h-[52px] bg-white border-b border-border flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[15px] tracking-tight">InterpretAI</span>
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
              <span className={`w-1.5 h-1.5 rounded-full ${transcription.isRecording ? "bg-violet-500 animate-pulse" : "bg-violet-300"}`} />
              EN + AR Auto-detect
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              disabled={transcription.isRecording || !hasContent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
            <div className="bg-muted px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground flex items-center gap-1.5 border border-border/50">
              <Clock className="w-3 h-3" />
              <span>{formatMinutes(user.minutesUsedToday)} / {formatMinutes(user.dailyLimitMinutes)} today</span>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${
              user.trialExpired
                ? "bg-destructive/10 text-destructive border-destructive/20"
                : "bg-muted text-muted-foreground border-border/50"
            }`}>
              <AlertTriangle className="w-3 h-3" />
              <span>{user.trialExpired ? "Trial Expired" : `${user.trialDaysRemaining} days left`}</span>
            </div>
          </div>
        </header>

        {/* ALERTS */}
        {(user.trialExpired || isLimitReached) && (
          <div className="px-4 pt-3 pb-0 shrink-0">
            {user.trialExpired ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Your trial has expired. Please contact support to continue.
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-sm text-orange-800">
                <Clock className="w-4 h-4 shrink-0" />
                Daily limit of {formatMinutes(user.dailyLimitMinutes)} reached.
              </div>
            )}
          </div>
        )}

        {/* UNIFIED TRANSCRIPT + TRANSLATION PANEL */}
        <div className="flex-1 p-4 min-h-0 overflow-hidden">
          <div className="h-full bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">

            {/* Two-column header — English | Arabic */}
            <div className="h-10 border-b border-border bg-muted/20 grid grid-cols-2 shrink-0">
              <div className="flex items-center gap-2 px-4 border-r border-border/50">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                  {langLabel(langA)}
                </span>
                {transcription.audioInfo && (
                  <span className="text-[9px] text-muted-foreground/40 font-mono hidden sm:block">
                    {transcription.audioInfo}
                  </span>
                )}
                {transcription.isRecording && (
                  <span className="flex items-center gap-1 text-[10px] text-rose-500 font-semibold">
                    <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                    Listening
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 px-4">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {langLabel(langB)}
                </span>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5">
              {!hasContent ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Languages className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">Start recording to see transcript</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    English or Arabic — both detected automatically · Translated in real time
                  </p>
                </div>
              ) : (
                <div>
                  {transcription.phrases.map((phrase) => (
                    <SegmentRow
                      key={phrase.id}
                      phrase={phrase}
                      translation={translations[phrase.id]}
                      langA={langA}
                      langB={langB}
                    />
                  ))}
                  {transcription.liveTranscript && (
                    <LiveRow
                      live={transcription.liveTranscript}
                      liveTranslation={liveTranslation}
                      langA={langA}
                      langB={langB}
                    />
                  )}
                  <div ref={scrollEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM TOOLBAR */}
        <div className="bg-white border-t border-border shrink-0 z-10">

          {/* ROW 1: Audio device + VU meter */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-border/40">
            <Mic2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <Select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={transcription.isRecording}
              className="h-8 text-xs flex-1 min-w-0 max-w-xs bg-muted/30"
            >
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </Select>
            <div className="w-24 shrink-0">
              <AudioMeter level={transcription.micLevel} label="" />
            </div>
          </div>

          {/* ROW 2: Translation pair + record button */}
          <div className="flex items-center px-4 py-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Translate</span>
              <Select
                value={langA}
                onChange={(e) => setLangA(e.target.value)}
                disabled={transcription.isRecording}
                className="h-9 text-sm w-[130px] bg-white border-border"
              >
                {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
              <button
                onClick={() => { setLangA(langB); setLangB(langA); }}
                disabled={transcription.isRecording}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors disabled:opacity-40"
                title="Swap languages"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <Select
                value={langB}
                onChange={(e) => setLangB(e.target.value)}
                disabled={transcription.isRecording}
                className="h-9 text-sm w-[130px] bg-white border-border"
              >
                {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </div>

            <div className="flex-1 flex justify-center">
              {isBlocked ? (
                <div className="h-11 px-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium text-sm border border-border">
                  Limit Reached
                </div>
              ) : (
                <div className="relative">
                  {transcription.isRecording && (
                    <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20 pointer-events-none" />
                  )}
                  <button
                    onClick={handleToggleRecording}
                    disabled={transcription.isStarting}
                    className={`h-11 px-10 rounded-full flex items-center gap-2.5 font-semibold text-[15px] shadow-md transition-all active:scale-95 disabled:opacity-70 ${
                      transcription.isRecording
                        ? "bg-destructive text-white hover:bg-destructive/90"
                        : "bg-primary text-white hover:bg-primary/90"
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${transcription.isRecording ? "bg-white animate-pulse" : "bg-white/80"}`} />
                    {transcription.isStarting ? "Starting…" : transcription.isRecording ? "Stop" : "Start"}
                  </button>
                </div>
              )}
            </div>

            {/* Spacer to keep record button centred */}
            <div className="flex items-center gap-2 opacity-0 pointer-events-none" aria-hidden>
              <span className="text-xs font-semibold whitespace-nowrap">Translate</span>
              <div className="h-9 w-[130px]" />
              <div className="w-8 h-8" />
              <div className="h-9 w-[130px]" />
            </div>
          </div>

          {/* Error bar */}
          {transcription.error && (
            <div className="px-4 pb-3">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-2.5 flex items-center gap-2 text-xs text-destructive">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {transcription.error}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
