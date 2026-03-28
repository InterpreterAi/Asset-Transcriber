import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Mic2, LogOut, Settings, AlertTriangle, Clock, User,
  Globe, Languages, Copy, ArrowLeftRight, X, Check
} from "lucide-react";
import { Button, Card, Select } from "@/components/ui-components";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useTranscription, type Phrase } from "@/hooks/use-transcription";
import { AudioMeter } from "@/components/AudioMeter";
import { FeedbackModal } from "@/components/FeedbackModal";
import { formatMinutes } from "@/lib/utils";

const LANGUAGES = [
  { value: "auto", label: "Auto-detect", sourceOnly: true },
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "hi", label: "Hindi" },
  { value: "tr", label: "Turkish" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "sv", label: "Swedish" },
  { value: "no", label: "Norwegian" },
  { value: "da", label: "Danish" },
  { value: "fi", label: "Finnish" },
  { value: "el", label: "Greek" },
  { value: "he", label: "Hebrew" },
  { value: "cs", label: "Czech" },
  { value: "ro", label: "Romanian" },
  { value: "hu", label: "Hungarian" },
  { value: "uk", label: "Ukrainian" },
  { value: "th", label: "Thai" },
  { value: "vi", label: "Vietnamese" },
  { value: "id", label: "Indonesian" },
  { value: "ms", label: "Malay" },
];

function langLabel(val: string) {
  return LANGUAGES.find((l) => l.value === val)?.label ?? val;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handle}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-black/5 text-muted-foreground hover:text-foreground flex-shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function PhraseBubble({ phrase, translation }: { phrase: Phrase; translation?: string }) {
  const isInterpreter = phrase.speaker === "Interpreter";
  return (
    <div className={`flex flex-col gap-0.5 mb-3 ${isInterpreter ? "items-end" : "items-start"}`}>
      <span className="text-[10px] font-semibold text-muted-foreground px-1 uppercase tracking-wide">
        {phrase.speaker}
      </span>
      <div className={`group relative max-w-[85%] flex items-start gap-1.5 ${isInterpreter ? "flex-row-reverse" : "flex-row"}`}>
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed ${
            isInterpreter
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm border border-border/60"
          }`}
        >
          {phrase.text}
          {translation && (
            <p className={`mt-1.5 text-[12px] opacity-75 border-t pt-1.5 ${isInterpreter ? "border-white/20" : "border-border"}`}>
              {translation}
            </p>
          )}
        </div>
        <div className="mt-1">
          <CopyButton text={translation ? `${phrase.text}\n${translation}` : phrase.text} />
        </div>
      </div>
    </div>
  );
}

function PartialBubble({ phrase }: { phrase: Phrase }) {
  const isInterpreter = phrase.speaker === "Interpreter";
  return (
    <div className={`flex flex-col gap-0.5 mb-3 ${isInterpreter ? "items-end" : "items-start"}`}>
      <span className="text-[10px] font-semibold text-muted-foreground px-1 uppercase tracking-wide">
        {phrase.speaker}
      </span>
      <div
        className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[14px] leading-relaxed italic opacity-60 ${
          isInterpreter
            ? "bg-primary/30 text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm border border-border/60"
        }`}
      >
        {phrase.text}
        <span className="inline-flex gap-0.5 ml-1 align-middle">
          <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      </div>
    </div>
  );
}

export default function Workspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading, error: userError } = useGetMe({ query: { retry: false } });
  const logoutMut = useLogout();

  const { devices } = useAudioDevices();
  const transcription = useTranscription();

  const [micId, setMicId] = useState("");
  const [systemId, setSystemId] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("es");
  const [activeTab, setActiveTab] = useState("mic");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Per-phrase translations: map from phrase.id → translated string
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const translatingRef = useRef<Set<string>>(new Set());

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as phrases come in
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcription.phrases, transcription.partialPhrase]);

  // Translate each new final phrase individually
  const translatePhrase = useCallback(
    async (phrase: Phrase, src: string, tgt: string) => {
      if (translatingRef.current.has(phrase.id)) return;
      translatingRef.current.add(phrase.id);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            text: phrase.text,
            sourceLang: src === "auto" ? undefined : src,
            targetLang: tgt,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { translatedText?: string; text?: string };
          const translated = data.translatedText ?? data.text ?? "";
          setTranslations((prev) => ({ ...prev, [phrase.id]: translated }));
        }
      } catch (err) {
        console.error("Translation error", err);
      } finally {
        translatingRef.current.delete(phrase.id);
      }
    },
    []
  );

  // Watch for new final phrases and translate them
  const prevPhraseCountRef = useRef(0);
  useEffect(() => {
    const phrases = transcription.phrases;
    if (phrases.length > prevPhraseCountRef.current) {
      const newPhrases = phrases.slice(prevPhraseCountRef.current);
      newPhrases.forEach((p) => {
        if (!translations[p.id]) translatePhrase(p, sourceLang, targetLang);
      });
    }
    prevPhraseCountRef.current = phrases.length;
  }, [transcription.phrases, sourceLang, targetLang, translations, translatePhrase]);

  useEffect(() => { if (userError) setLocation("/login"); }, [userError, setLocation]);
  useEffect(() => { if (devices.length > 0 && !micId) setMicId(devices[0]!.deviceId); }, [devices, micId]);
  useEffect(() => {
    if (user?.trialExpired) {
      const t = setTimeout(() => setShowFeedback(true), 1000);
      return () => clearTimeout(t);
    }
  }, [user?.trialExpired]);

  const handleLogout = async () => {
    await logoutMut.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  const handleToggleRecording = () => {
    if (transcription.isRecording) {
      transcription.stop();
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } else {
      transcription.clear();
      setTranslations({});
      prevPhraseCountRef.current = 0;
      transcription.start(micId, systemId);
    }
  };

  const handleSwapLangs = () => {
    if (sourceLang === "auto") {
      setSourceLang(targetLang);
      setTargetLang("en");
    } else {
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
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
  const isBlocked = user.trialExpired || isLimitReached;

  const sourceLangLabel = langLabel(sourceLang);
  const targetLangLabel = langLabel(targetLang);

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden text-foreground">
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* SIDEBAR */}
      <aside className="w-[64px] bg-sidebar border-r border-sidebar-border flex flex-col items-center py-3 flex-shrink-0 z-20">
        <div className="flex-1 flex flex-col gap-1.5">
          {[
            { id: "profile", icon: <User className="w-5 h-5" />, title: "Profile" },
            {
              id: "mic", icon: <Mic2 className="w-5 h-5" />, title: "Audio Settings",
              onClick: () => { setActiveTab("mic"); setShowDeviceSettings((v) => !v); }
            },
            { id: "lang", icon: <Globe className="w-5 h-5" />, title: "Languages" },
          ].map(({ id, icon, title, onClick }) => (
            <button
              key={id}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                activeTab === id
                  ? "bg-white shadow-sm text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              onClick={onClick ?? (() => setActiveTab(id))}
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
          <span className="font-bold text-[15px] tracking-tight">InterpretAI</span>
          <div className="flex items-center gap-2">
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
        <div className="flex-1 flex gap-3 p-4 min-h-0 overflow-hidden relative">

          {/* Audio Settings Panel */}
          {showDeviceSettings && (
            <div className="absolute top-4 left-4 z-30 w-72 bg-white rounded-xl shadow-lg border border-border p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Audio Devices</h4>
                <button onClick={() => setShowDeviceSettings(false)} className="text-muted-foreground hover:text-foreground rounded-lg p-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Microphone (Interpreter)</label>
                <Select value={micId} onChange={(e) => setMicId(e.target.value)} disabled={transcription.isRecording} className="h-9 text-sm">
                  {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 20)}</option>)}
                </Select>
                <AudioMeter level={transcription.micLevel} label="" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">System Audio (Caller)</label>
                <Select value={systemId} onChange={(e) => setSystemId(e.target.value)} disabled={transcription.isRecording} className="h-9 text-sm">
                  <option value="">None</option>
                  {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId.slice(0, 20)}</option>)}
                </Select>
                {systemId && <AudioMeter level={transcription.systemLevel} label="" />}
              </div>
            </div>
          )}

          {/* Original Transcript Panel */}
          <div className="flex-1 bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="h-10 border-b border-border bg-muted/20 flex items-center px-4 shrink-0 gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                {sourceLangLabel === "Auto-detect" ? "Original" : sourceLangLabel}
              </span>
              <span className="text-[10px] text-muted-foreground/60">Original</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {transcription.phrases.length === 0 && !transcription.partialPhrase && !transcription.isRecording ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Mic2 className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">Start recording to see transcript</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Interpreter and Caller will appear as chat bubbles</p>
                </div>
              ) : (
                <div>
                  {transcription.phrases.map((p) => (
                    <PhraseBubble key={p.id} phrase={p} />
                  ))}
                  {transcription.partialPhrase && (
                    <PartialBubble phrase={transcription.partialPhrase} />
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Translation Panel */}
          <div className="flex-1 bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">
            <div className="h-10 border-b border-border bg-muted/20 flex items-center px-4 shrink-0 gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                {targetLangLabel}
              </span>
              <span className="text-[10px] text-muted-foreground/60">Translation</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {transcription.phrases.length === 0 && !transcription.isRecording ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Languages className="w-5 h-5 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium">Translations appear here</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Matched to each speaker's phrase</p>
                </div>
              ) : (
                <div>
                  {transcription.phrases.map((p) => (
                    <PhraseBubble key={p.id} phrase={p} translation={translations[p.id]} />
                  ))}
                  {transcription.partialPhrase && (
                    <PartialBubble phrase={{ ...transcription.partialPhrase, text: "…" }} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM TOOLBAR — two clear rows, no overlap */}
        <div className="bg-white border-t border-border shrink-0 z-10">

          {/* ROW 1: Device selectors */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-border/40">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Mic:</span>
              <Select
                value={micId}
                onChange={(e) => setMicId(e.target.value)}
                disabled={transcription.isRecording}
                className="h-8 text-xs flex-1 min-w-0 max-w-[180px] bg-muted/30"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </Select>
              <div className="w-20 shrink-0">
                <AudioMeter level={transcription.micLevel} label="" />
              </div>
            </div>

            <div className="w-px h-5 bg-border shrink-0" />

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">System:</span>
              <Select
                value={systemId}
                onChange={(e) => setSystemId(e.target.value)}
                disabled={transcription.isRecording}
                className="h-8 text-xs flex-1 min-w-0 max-w-[180px] bg-muted/30"
              >
                <option value="">None</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </Select>
              {systemId && (
                <div className="w-20 shrink-0">
                  <AudioMeter level={transcription.systemLevel} label="" />
                </div>
              )}
            </div>
          </div>

          {/* ROW 2: Language selectors + Record button */}
          <div className="flex items-center px-4 py-3 gap-3">
            {/* Language controls — left side */}
            <div className="flex items-center gap-2">
              <Select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                disabled={transcription.isRecording}
                className="h-9 text-sm w-[140px] bg-white border-border"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>

              <button
                onClick={handleSwapLangs}
                disabled={transcription.isRecording}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors disabled:opacity-40 shrink-0"
                title="Swap languages"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              <Select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                disabled={transcription.isRecording}
                className="h-9 text-sm w-[140px] bg-white border-border"
              >
                {LANGUAGES.filter((l) => !l.sourceOnly).map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>
            </div>

            {/* Record button — pushed to center/right */}
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
                        ? "bg-white text-destructive border-2 border-destructive/30 hover:bg-destructive/5"
                        : "bg-destructive text-white hover:bg-destructive/90 border border-transparent"
                    }`}
                  >
                    {transcription.isStarting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : transcription.isRecording ? (
                      <>
                        <div className="w-3 h-3 bg-destructive rounded-sm animate-pulse" />
                        Stop
                      </>
                    ) : (
                      <>
                        <div className="w-3 h-3 bg-white rounded-full" />
                        Record
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Error indicator */}
            {transcription.error && (
              <div className="text-xs text-destructive max-w-[160px] truncate" title={transcription.error}>
                ⚠ {transcription.error}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
