import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Mic2, LogOut, Settings, AlertTriangle, Clock, User,
  Globe, Languages, Copy, ArrowLeftRight, Check, Trash2
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

// ── Language badge ─────────────────────────────────────────────────────────────
function LangBadge({ lang }: { lang: string }) {
  const isArabic = lang === "ar" || lang === "he";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${
      isArabic
        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
        : "bg-blue-100 text-blue-700 border border-blue-200"
    }`}>
      {langLabel(lang)}
    </span>
  );
}

// ── Copy button ────────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground flex-shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ── Finalized phrase bubble ────────────────────────────────────────────────────
function TranscriptEntry({ phrase }: { phrase: Phrase }) {
  const isRtl = phrase.language === "ar" || phrase.language === "he";
  return (
    <div className="group flex flex-col gap-1 mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
        {phrase.speakerLabel}
      </span>
      <div className="flex items-start gap-2">
        <div className="flex-1 flex items-start gap-2 flex-wrap">
          <LangBadge lang={phrase.language} />
          <p className="text-sm leading-relaxed text-foreground flex-1 min-w-0" dir={isRtl ? "rtl" : "ltr"}>
            {phrase.text}
          </p>
        </div>
        <CopyButton text={phrase.text} />
      </div>
    </div>
  );
}

// ── Live bubble — fw buffer + current nfw partial in one line ─────────────────
function LiveEntry({ live }: { live: LiveTranscript }) {
  const isRtl = live.language === "ar" || live.language === "he";
  return (
    <div className="flex flex-col gap-1 mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600/50">
        {live.speakerLabel}
      </span>
      <div className="flex items-start gap-2">
        <LangBadge lang={live.language} />
        <p
          className="text-sm leading-relaxed text-muted-foreground/70 italic flex-1 min-w-0"
          dir={isRtl ? "rtl" : "ltr"}
        >
          {live.text}
          <span className="inline-flex gap-0.5 ml-1.5 align-middle">
            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Translation entry ──────────────────────────────────────────────────────────
function TranslationEntry({
  phrase, translation, targetLang,
}: {
  phrase: Phrase;
  translation?: string;
  targetLang: string;
}) {
  const isRtl = targetLang === "ar" || targetLang === "he";
  return (
    <div className="group flex flex-col gap-1 mb-4">
      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
        {phrase.speakerLabel}
      </span>
      <div className="flex items-start gap-2">
        <div className="flex-1 flex items-start gap-2 flex-wrap">
          <LangBadge lang={targetLang} />
          {translation ? (
            <p className="text-sm leading-relaxed text-foreground flex-1 min-w-0" dir={isRtl ? "rtl" : "ltr"}>
              {translation}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic flex items-center gap-1">
              Translating
              <span className="inline-flex gap-0.5 ml-1 align-middle">
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </p>
          )}
        </div>
        {translation && <CopyButton text={translation} />}
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

  // Translation output language pair — independent of the auto-detected input
  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");

  // Translations keyed by phrase id
  const [translations, setTranslations] = useState<Record<string, { text: string; targetLang: string }>>({});
  const translatingRef = useRef<Set<string>>(new Set());

  const transcriptEndRef  = useRef<HTMLDivElement>(null);
  const translationEndRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll: fires ONLY when a new final phrase is committed ──────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    translationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcription.phrases.length]);

  // ── Translation: fires immediately when a final phrase is sealed ──────────
  // If detected language is English → translate to langB (Arabic).
  // If detected language is Arabic  → translate to langA (English).
  // Never runs on partial/live text.
  const translatePhrase = useCallback(async (phrase: Phrase, targetLang: string) => {
    const key = phrase.id;
    if (translatingRef.current.has(key)) return;
    translatingRef.current.add(key);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: phrase.text, sourceLang: phrase.language, targetLang }),
      });
      if (res.ok) {
        const data = await res.json() as { translatedText?: string; text?: string };
        const translated = data.translatedText ?? data.text ?? "";
        if (translated) {
          setTranslations(prev => ({ ...prev, [key]: { text: translated, targetLang } }));
        }
      }
    } catch (err) {
      console.error("Translation error", err);
    } finally {
      translatingRef.current.delete(key);
    }
  }, []);

  useEffect(() => {
    for (const phrase of transcription.phrases) {
      if (phrase.text.trim() && !translations[phrase.id] && !translatingRef.current.has(phrase.id)) {
        void translatePhrase(phrase, getTargetLang(phrase.language, langA, langB));
      }
    }
  }, [transcription.phrases, langA, langB, translations, translatePhrase]);

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
    translatingRef.current.clear();
  };

  const handleToggleRecording = () => {
    if (transcription.isRecording) {
      transcription.stop();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } else {
      // No language parameter — both channels start automatically
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
  const isEmpty        = transcription.phrases.length === 0 && !transcription.liveTranscript;

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
            {/* Auto-detect pill — shows which language is currently live */}
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
              <span className={`w-1.5 h-1.5 rounded-full ${transcription.isRecording ? "bg-violet-500 animate-pulse" : "bg-violet-300"}`} />
              EN + AR Auto-detect
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              disabled={transcription.isRecording || isEmpty}
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

        {/* PANELS */}
        <div className="flex-1 flex gap-3 p-4 min-h-0 overflow-hidden">

          {/* ── Transcript panel ── */}
          <div className="flex-1 bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="h-10 border-b border-border bg-muted/20 flex items-center px-4 shrink-0 gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                Original
              </span>
              {transcription.audioInfo && (
                <span className="text-[9px] text-muted-foreground/50 font-mono hidden sm:block">
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
            <div className="flex-1 overflow-y-auto p-4">
              {isEmpty ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Mic2 className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">Start recording to see transcript</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Speaks English or Arabic — both detected automatically
                  </p>
                </div>
              ) : (
                <div>
                  {transcription.phrases.map((p) => (
                    <TranscriptEntry key={p.id} phrase={p} />
                  ))}
                  {transcription.liveTranscript && (
                    <LiveEntry live={transcription.liveTranscript} />
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* ── Translation panel ── */}
          <div className="flex-1 bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="h-10 border-b border-border bg-muted/20 flex items-center px-4 shrink-0 gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                Translation
              </span>
              <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                <ArrowLeftRight className="w-3 h-3" />
                {langLabel(langA)} ↔ {langLabel(langB)}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isEmpty ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Languages className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">Translations appear here</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    English → Arabic · Arabic → English · Per sentence
                  </p>
                </div>
              ) : (
                <div>
                  {transcription.phrases.map((p) => {
                    const tr = translations[p.id];
                    const targetLang = tr?.targetLang ?? getTargetLang(p.language, langA, langB);
                    return (
                      <TranslationEntry
                        key={p.id}
                        phrase={p}
                        translation={tr?.text}
                        targetLang={targetLang}
                      />
                    );
                  })}
                  {/* Placeholder row aligned with the live transcript */}
                  {transcription.liveTranscript && (
                    <div className="flex flex-col gap-1 mb-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600/40">
                        {transcription.liveTranscript.speakerLabel}
                      </span>
                      <div className="flex items-start gap-2">
                        <LangBadge lang={getTargetLang(transcription.liveTranscript.language, langA, langB)} />
                        <p className="text-sm text-muted-foreground/40 italic">—</p>
                      </div>
                    </div>
                  )}
                  <div ref={translationEndRef} />
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
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Translate to</span>
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
              <span className="text-xs font-semibold whitespace-nowrap">Translate to</span>
              <div className="h-9 w-[130px]" />
              <div className="w-8 h-8" />
              <div className="h-9 w-[130px]" />
            </div>
          </div>

          {/* Error bar */}
          {transcription.error && (
            <div className="px-4 pb-3">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-destructive">
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
