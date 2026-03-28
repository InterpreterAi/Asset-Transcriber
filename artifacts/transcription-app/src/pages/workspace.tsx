import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Mic2, LogOut, Settings, Play, Square, AlertTriangle, Clock, User, Globe, Languages, Copy, ArrowLeftRight } from "lucide-react";
import { Button, Card, Select } from "@/components/ui-components";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useTranscription } from "@/hooks/use-transcription";
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
  { value: "ms", label: "Malay" }
];

export default function Workspace() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading, error: userError } = useGetMe({
    query: { retry: false }
  });
  const logoutMut = useLogout();
  
  const { devices } = useAudioDevices();
  const transcription = useTranscription();
  
  const [micId, setMicId] = useState("");
  const [systemId, setSystemId] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("es");
  
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);

  const activeTabRef = useRef("mic"); // "mic", "lang", "profile", "settings"
  const [activeTab, setActiveTab] = useState("mic");

  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  
  // Translation debouncing
  useEffect(() => {
    const textToTranslate = transcription.transcript;
    if (!textToTranslate) return;

    const translate = async () => {
      setIsTranslating(true);
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: textToTranslate,
            sourceLang: sourceLang === "auto" ? undefined : sourceLang,
            targetLang: targetLang
          })
        });
        if (res.ok) {
          const data = await res.json();
          setTranslatedText(data.translatedText || data.text || "");
        }
      } catch (err) {
        console.error("Translation error", err);
      } finally {
        setIsTranslating(false);
      }
    };

    const timer = setTimeout(translate, 800);
    return () => clearTimeout(timer);
  }, [transcription.transcript, sourceLang, targetLang]);

  useEffect(() => {
    if (userError) setLocation("/login");
  }, [userError, setLocation]);

  useEffect(() => {
    if (devices.length > 0 && !micId) setMicId(devices[0].deviceId);
  }, [devices, micId]);

  useEffect(() => {
    if (user?.trialExpired) {
      const timer = setTimeout(() => setShowFeedback(true), 1000);
      return () => clearTimeout(timer);
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
      setTranslatedText("");
      transcription.start(micId, systemId);
    }
  };

  const handleSwapLangs = () => {
    if (sourceLang === "auto") {
      setSourceLang(targetLang);
      setTargetLang("en"); // default fallback if swapping from auto
    } else {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
    }
  };

  const copyToClipboard = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
    }
  };

  if (userLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div></div>;
  if (!user) return null;

  const isLimitReached = user.minutesRemainingToday <= 0;
  const isBlocked = user.trialExpired || isLimitReached;

  return (
    <div className="h-screen w-screen bg-background flex overflow-hidden text-foreground">
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* SIDEBAR */}
      <aside className="w-[64px] bg-sidebar border-r border-sidebar-border flex flex-col items-center py-4 flex-shrink-0 z-20">
        <div className="flex-1 flex flex-col gap-2">
          <button 
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${activeTab === 'profile' ? 'bg-white shadow-sm text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
            onClick={() => setActiveTab('profile')}
            title="Profile"
          >
            <User className="w-5 h-5" />
          </button>
          
          <button 
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${activeTab === 'mic' ? 'bg-white shadow-sm text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
            onClick={() => {
              setActiveTab('mic');
              setShowDeviceSettings(!showDeviceSettings);
            }}
            title="Audio Settings"
          >
            <Mic2 className="w-5 h-5" />
          </button>
          
          <button 
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${activeTab === 'lang' ? 'bg-white shadow-sm text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
            onClick={() => setActiveTab('lang')}
            title="Translation Settings"
          >
            <Globe className="w-5 h-5" />
          </button>

          {user.isAdmin && (
            <button 
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${activeTab === 'settings' ? 'bg-white shadow-sm text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
              onClick={() => setLocation('/admin')}
              title="Admin Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        <button 
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors mt-auto"
          onClick={handleLogout}
          title="Log Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* HEADER BAR */}
        <header className="h-[52px] bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[15px] tracking-tight">InterpretAI</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-muted px-3 py-1 rounded-full text-xs font-medium text-muted-foreground flex items-center gap-1.5 border border-border/50">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatMinutes(user.minutesUsedToday)} / {formatMinutes(user.dailyLimitMinutes)} today</span>
            </div>
            
            <div className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${user.trialExpired ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-muted text-muted-foreground border-border/50'}`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{user.trialExpired ? 'Trial Expired' : `${user.trialDaysRemaining} days left`}</span>
            </div>
          </div>
        </header>

        {/* ALERTS */}
        {(user.trialExpired || isLimitReached) && (
          <div className="px-6 pt-4 pb-2 shrink-0">
             {user.trialExpired ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-3 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p>Your trial has expired. Please contact support to upgrade.</p>
              </div>
            ) : isLimitReached ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-3 text-sm text-orange-800">
                <Clock className="w-4 h-4 shrink-0" />
                <p>You have reached your daily limit of {formatMinutes(user.dailyLimitMinutes)}.</p>
              </div>
            ) : null}
          </div>
        )}

        {/* SPLIT SCREEN PANELS */}
        <div className="flex-1 flex flex-col sm:flex-row gap-4 p-4 sm:p-6 min-h-0 relative">
          
          {/* Audio Settings Popover */}
          {showDeviceSettings && (
            <div className="absolute top-4 left-6 z-30 w-80 bg-white rounded-xl shadow-lg border border-border p-4 shadow-black/5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Audio Settings</h4>
                <button onClick={() => setShowDeviceSettings(false)} className="text-muted-foreground hover:text-foreground">
                  <Square className="w-4 h-4 opacity-0" /> {/* Just for spacing or close icon if added */}
                </button>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Microphone</label>
                  <Select value={micId} onChange={e => setMicId(e.target.value)} disabled={transcription.isRecording} className="h-9 text-sm">
                    {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                  </Select>
                  <div className="pt-1"><AudioMeter level={transcription.micLevel} label="" /></div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">System Audio (Optional)</label>
                  <Select value={systemId} onChange={e => setSystemId(e.target.value)} disabled={transcription.isRecording} className="h-9 text-sm">
                    <option value="">None</option>
                    {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                  </Select>
                  {systemId && <div className="pt-1"><AudioMeter level={transcription.systemLevel} label="" /></div>}
                </div>
              </div>
            </div>
          )}

          {/* Original Transcript Panel */}
          <div className="flex-1 bg-card rounded-xl border border-card-border shadow-sm flex flex-col min-h-0 relative overflow-hidden">
            <div className="h-10 border-b border-border bg-muted/30 flex items-center justify-between px-4 shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Original Transcript</span>
              <button onClick={() => copyToClipboard(transcription.transcript)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Copy to clipboard">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto">
              {!transcription.transcript && !transcription.partialTranscript && !transcription.isRecording ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Mic2 className="w-5 h-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium">Start recording to see transcript</p>
                </div>
              ) : (
                <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                  {transcription.transcript}
                  {transcription.partialTranscript && (
                    <span className="text-muted-foreground italic ml-1">{transcription.partialTranscript}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Translation Panel */}
          <div className="flex-1 bg-card rounded-xl border border-card-border shadow-sm flex flex-col min-h-0 relative overflow-hidden">
            <div className="h-10 border-b border-border bg-muted/30 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Translation</span>
                {isTranslating && <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>}
              </div>
              <button onClick={() => copyToClipboard(translatedText)} className="text-muted-foreground hover:text-foreground transition-colors p-1" title="Copy to clipboard">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto">
               {!translatedText && !transcription.isRecording ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Languages className="w-5 h-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium">Translations will appear here</p>
                </div>
              ) : (
                <div className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap font-sans">
                  {translatedText}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM TOOLBAR */}
        <div className="bg-white border-t border-border px-4 py-3 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] z-20">
          
          <div className="flex flex-col gap-3 max-w-5xl mx-auto w-full">
            {/* ROW 1: Audio Devices & Meters (Desktop layout: flex row, Mobile layout: stacked) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/30 p-2 rounded-lg border border-border/50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap w-20">Microphone:</span>
                <Select value={micId} onChange={e => setMicId(e.target.value)} disabled={transcription.isRecording} className="h-8 text-xs max-w-[140px] bg-white">
                  {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </Select>
                <div className="w-24 shrink-0 hidden sm:block">
                  <AudioMeter level={transcription.micLevel} label="" hideLabel />
                </div>
              </div>
              
              <div className="hidden sm:block w-px h-6 bg-border"></div>

              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap w-24">System Audio:</span>
                <Select value={systemId} onChange={e => setSystemId(e.target.value)} disabled={transcription.isRecording} className="h-8 text-xs max-w-[140px] bg-white">
                  <option value="">None</option>
                  {devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
                </Select>
                <div className="w-24 shrink-0 hidden sm:block">
                  <AudioMeter level={transcription.systemLevel} label="" hideLabel />
                </div>
              </div>
            </div>

            {/* ROW 2: Language + Record */}
            <div className="flex items-center justify-center gap-4 relative py-1">
              
              <div className="flex items-center gap-2 flex-1 justify-end">
                <Select disabled={transcription.isRecording} value={sourceLang} onChange={e => setSourceLang(e.target.value)} className="w-[140px] h-10 text-sm font-medium bg-white shadow-sm border-border">
                  {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </div>

              <button 
                onClick={handleSwapLangs} 
                disabled={transcription.isRecording}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 flex-1 justify-start">
                <Select disabled={transcription.isRecording} value={targetLang} onChange={e => setTargetLang(e.target.value)} className="w-[140px] h-10 text-sm font-medium bg-white shadow-sm border-border">
                  {LANGUAGES.filter(l => !l.sourceOnly).map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </Select>
              </div>

              {/* Absolute center record button to ensure perfect alignment */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                {isBlocked ? (
                  <div className="w-[160px] h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium text-sm border border-border shadow-sm">
                    Limit Reached
                  </div>
                ) : (
                  <button
                    onClick={handleToggleRecording}
                    disabled={transcription.isStarting}
                    className={`w-[160px] h-12 rounded-full flex items-center justify-center font-semibold text-[15px] shadow-md transition-all active:scale-95 ${
                      transcription.isRecording 
                        ? 'bg-white text-destructive border-2 border-destructive/20 shadow-destructive/20 hover:bg-destructive/5' 
                        : 'bg-destructive text-white hover:bg-destructive/90 hover:shadow-destructive/30 border border-transparent'
                    }`}
                  >
                    {transcription.isStarting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : transcription.isRecording ? (
                      <>
                        <div className="w-3 h-3 bg-destructive rounded-sm mr-2.5 animate-pulse"></div> Stop
                      </>
                    ) : (
                      <>
                        <div className="w-3 h-3 bg-white rounded-full mr-2.5"></div> Record
                      </>
                    )}
                  </button>
                )}
                {transcription.isRecording && (
                  <div className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20 pointer-events-none"></div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
