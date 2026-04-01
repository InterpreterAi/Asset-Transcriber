import { useState, useEffect, useRef, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import {
  Mic2, LogOut, Settings, AlertTriangle, Clock, User,
  Globe, Languages, Trash2, Copy, Check, Type, Monitor,
  Lock, Eye, EyeOff, X, CheckCircle, Zap, CreditCard, ExternalLink, ShieldCheck,
  LifeBuoy, BookOpen, StickyNote, Flag, Share2, MessageCircle, AlertCircle,
} from "lucide-react";
import { Select } from "@/components/ui-components";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useTranscription } from "@/hooks/use-transcription";
import { useSessionHeartbeat } from "@/hooks/use-session-heartbeat";
import { AudioMeter } from "@/components/AudioMeter";
import { FeedbackModal } from "@/components/FeedbackModal";
import { SupportPanel } from "@/components/SupportPanel";
import { GlossaryPanel } from "@/components/GlossaryPanel";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { UserFeedbackModal } from "@/components/UserFeedbackModal";
import { SessionHistoryPanel } from "@/components/SessionHistoryPanel";
import { TerminologyPanel } from "@/components/TerminologyPanel";
import { formatMinutes } from "@/lib/utils";

const LANG_OPTIONS = [
  { value: "ar",    label: "Arabic" },
  { value: "bg",    label: "Bulgarian" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "hr",    label: "Croatian" },
  { value: "cs",    label: "Czech" },
  { value: "da",    label: "Danish" },
  { value: "nl",    label: "Dutch" },
  { value: "en",    label: "English" },
  { value: "fa",    label: "Persian (Farsi)" },
  { value: "fi",    label: "Finnish" },
  { value: "fr",    label: "French" },
  { value: "de",    label: "German" },
  { value: "el",    label: "Greek" },
  { value: "he",    label: "Hebrew" },
  { value: "hi",    label: "Hindi" },
  { value: "hu",    label: "Hungarian" },
  { value: "id",    label: "Indonesian" },
  { value: "it",    label: "Italian" },
  { value: "ja",    label: "Japanese" },
  { value: "ko",    label: "Korean" },
  { value: "ms",    label: "Malay" },
  { value: "nb",    label: "Norwegian" },
  { value: "pl",    label: "Polish" },
  { value: "pt",    label: "Portuguese" },
  { value: "ro",    label: "Romanian" },
  { value: "ru",    label: "Russian" },
  { value: "sk",    label: "Slovak" },
  { value: "es",    label: "Spanish" },
  { value: "sv",    label: "Swedish" },
  { value: "th",    label: "Thai" },
  { value: "tr",    label: "Turkish" },
  { value: "uk",    label: "Ukrainian" },
  { value: "ur",    label: "Urdu" },
  { value: "vi",    label: "Vietnamese" },
];

// ── Copy button — appears on hover ────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text);
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ml-1.5 p-0.5 rounded hover:bg-black/8 text-muted-foreground/60 hover:text-foreground flex-shrink-0 align-middle"
      title="Copy to clipboard"
    >
      {done
        ? <Check className="w-3 h-3 text-green-500" />
        : <Copy className="w-3 h-3" />}
    </button>
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
  useSessionHeartbeat(!!user);

  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [showFeedback, setShowFeedback]         = useState(false);
  const [showReportIssue, setShowReportIssue]   = useState(false);
  const [showUserFeedback, setShowUserFeedback] = useState(false);
  const [inviteCopied, setInviteCopied]         = useState(false);
  const [activeTab, setActiveTab]               = useState("mic");
  const [inputMode, setInputMode]               = useState<"mic" | "tab">("mic");
  const [tabStream, setTabStream]               = useState<MediaStream | null>(null);

  const [langA, setLangA] = useState("en");
  const [langB, setLangB] = useState("ar");
  const [clearedForPrivacy, setClearedForPrivacy] = useState(false);
  const [textSize, setTextSize] = useState<"sm" | "md" | "lg">("md");
  const [showLeftPanel, setShowLeftPanel] = useState(false);

  // ── Session history refresh key — incremented when a session ends so the panel auto-refreshes
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // ── Session timer ────────────────────────────────────────────────────────────
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (transcription.isRecording) {
      setSessionElapsed(0);
      timerRef.current = setInterval(() => setSessionElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [transcription.isRecording]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Refresh the SessionHistoryPanel after each session ends
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (wasRecordingRef.current && !transcription.isRecording) {
      setTimeout(() => setHistoryRefreshKey(k => k + 1), 1500);
    }
    wasRecordingRef.current = transcription.isRecording;
  }, [transcription.isRecording]);

  // ── Session notes (ephemeral — cleared when session ends) ─────────────────
  const [notes, setNotes] = useState("");

  // ── Upgrade / billing ────────────────────────────────────────────────────────
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  type StripePrice = { id: string; unit_amount: number; currency: string; recurring: { interval: string } | null };
  type StripeProduct = { id: string; name: string; description: string; prices: StripePrice[] };
  const [upgradePlans, setUpgradePlans] = useState<StripeProduct[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const fetchPlans = async () => {
    setPlansLoading(true);
    try {
      const res = await fetch("/api/stripe/products-with-prices", { credentials: "include" });
      const data = await res.json() as { data?: StripeProduct[]; error?: string };
      if (res.ok && data.data) setUpgradePlans(data.data);
    } catch { /* ignore */ } finally {
      setPlansLoading(false);
    }
  };

  const handleOpenUpgrade = () => {
    setShowUpgrade(true);
    setUpgradeError(null);
    void fetchPlans();
  };

  const handleCheckout = async (priceId: string) => {
    setUpgradeLoading(priceId);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Checkout failed");
      window.location.href = data.url;
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUpgradeLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setUpgradeLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Portal unavailable");
      window.location.href = data.url;
    } catch (err: unknown) {
      setUpgradeError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUpgradeLoading(null);
    }
  };

  // ── Change password form ────────────────────────────────────────────────────
  const [pwForm, setPwForm]   = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading]   = useState(false);
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNext, setShowPwNext]       = useState(false);
  const [pwStatus, setPwStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  // ── 2FA state ───────────────────────────────────────────────────────────────
  const [twoFaEnabled,  setTwoFaEnabled]  = useState<boolean | null>(null);
  const [twoFaStep,     setTwoFaStep]     = useState<"idle" | "setup" | "disable">("idle");
  const [twoFaQr,       setTwoFaQr]       = useState("");
  const [twoFaSecret,   setTwoFaSecret]   = useState("");
  const [twoFaToken,    setTwoFaToken]    = useState("");
  const [twoFaLoading,  setTwoFaLoading]  = useState(false);
  const [twoFaMsg,      setTwoFaMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/2fa/status", { credentials: "include" })
      .then(r => r.json())
      .then((d: { enabled: boolean }) => setTwoFaEnabled(d.enabled))
      .catch(() => {});
  }, []);

  const handle2faSetup = async () => {
    setTwoFaLoading(true); setTwoFaMsg(null);
    try {
      const res  = await fetch("/api/auth/2fa/setup", { method: "POST", credentials: "include" });
      const data = await res.json() as { secret?: string; qrDataUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Setup failed");
      setTwoFaSecret(data.secret ?? "");
      setTwoFaQr(data.qrDataUrl ?? "");
      setTwoFaStep("setup");
    } catch (err: unknown) {
      setTwoFaMsg({ type: "err", text: err instanceof Error ? err.message : "Setup failed" });
    } finally { setTwoFaLoading(false); }
  };

  const handle2faEnable = async () => {
    setTwoFaLoading(true); setTwoFaMsg(null);
    try {
      const res  = await fetch("/api/auth/2fa/enable", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFaToken.replace(/\s/g, "") }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setTwoFaEnabled(true); setTwoFaStep("idle"); setTwoFaToken("");
      setTwoFaMsg({ type: "ok", text: "Two-factor authentication is now active." });
    } catch (err: unknown) {
      setTwoFaMsg({ type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally { setTwoFaLoading(false); }
  };

  const handle2faDisable = async () => {
    setTwoFaLoading(true); setTwoFaMsg(null);
    try {
      const res  = await fetch("/api/auth/2fa/disable", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twoFaToken.replace(/\s/g, "") }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to disable");
      setTwoFaEnabled(false); setTwoFaStep("idle"); setTwoFaToken("");
      setTwoFaMsg({ type: "ok", text: "Two-factor authentication disabled." });
    } catch (err: unknown) {
      setTwoFaMsg({ type: "err", text: err instanceof Error ? err.message : "Failed" });
    } finally { setTwoFaLoading(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwStatus(null);
    if (pwForm.next !== pwForm.confirm) {
      setPwStatus({ type: "err", msg: "New passwords do not match." });
      return;
    }
    if (pwForm.next.length < 8) {
      setPwStatus({ type: "err", msg: "New password must be at least 8 characters." });
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setPwStatus({ type: "ok", msg: "Password changed successfully." });
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: unknown) {
      setPwStatus({ type: "err", msg: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setPwLoading(false);
    }
  };

  // CSS variables applied to the transcript scroll container so ALL text
  // elements (including DOM-created bubbles) inherit the size instantly.
  const TEXT_SIZE_VARS: Record<typeof textSize, CSSProperties> = {
    sm: { "--ts-font-size": "12px", "--ts-line-height": "1.5" } as CSSProperties,
    md: { "--ts-font-size": "14px", "--ts-line-height": "1.625" } as CSSProperties,
    lg: { "--ts-font-size": "17px", "--ts-line-height": "1.7" } as CSSProperties,
  };


  useEffect(() => { if (userError) setLocation("/login"); }, [userError, setLocation]);

  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) setSelectedDeviceId(devices[0]!.deviceId);
  }, [devices, selectedDeviceId]);

  // Keep the hook's target-language ref in sync with the user's selector choice.
  // Using a ref inside the hook means this never triggers a re-render or
  // restarts the audio pipeline — it's instantaneous.
  useEffect(() => {
    transcription.setLangPair(langA, langB);
  }, [langA, langB, transcription.setLangPair]);

  useEffect(() => {
    if (!user?.trialExpired) return;
    const t = setTimeout(() => setShowFeedback(true), 1000);
    return () => clearTimeout(t);
  }, [user?.trialExpired]);

  // ── Snapshot push for admin "View Session" ──────────────────────────────
  // Every 5 s while recording, push the accumulated transcript/translation,
  // lang pair, and mic label to the server so an admin can view it live.
  // Data is in-memory only — not stored persistently.
  useEffect(() => {
    if (!transcription.isRecording || !transcription.sessionId) return;
    const push = () => {
      const snap     = transcription.getSnapshot();
      const micDev   = devices.find(d => d.deviceId === selectedDeviceId);
      const micLabel = micDev?.label ?? "Microphone";
      fetch("/api/transcription/session/snapshot", {
        method:      "PUT",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({
          sessionId:   transcription.sessionId,
          langA,
          langB,
          micLabel,
          transcript:  snap.transcript,
          translation: snap.translation,
        }),
      }).catch(() => { /* best-effort */ });
    };
    push();
    const interval = setInterval(push, 5_000);
    return () => clearInterval(interval);
  }, [transcription.isRecording, transcription.sessionId]);

  const handleLogout = async () => {
    await logoutMut.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  const handleToggleRecording = () => {
    if (transcription.isRecording) {
      transcription.stop();
      // Stop tab stream tracks when we stop recording
      if (tabStream) {
        tabStream.getTracks().forEach(t => t.stop());
        setTabStream(null);
      }
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      // HIPAA / ephemeral processing: clear all transcript and translation
      // buffers from browser memory when the session ends.
      // No patient speech content persists beyond the active session.
      transcription.clear();
      setNotes("");
      setClearedForPrivacy(true);
      setTimeout(() => setClearedForPrivacy(false), 4000);
    } else if (inputMode === "tab") {
      setClearedForPrivacy(false);
      void handleStartTabAudio();
    } else {
      setClearedForPrivacy(false);
      transcription.start(selectedDeviceId);
    }
  };

  const handleStartTabAudio = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      // Drop video tracks — we only need audio for transcription
      displayStream.getVideoTracks().forEach(t => t.stop());
      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        transcription.stop();
        return;
      }
      const audioStream = new MediaStream(audioTracks);
      setTabStream(audioStream);
      // The tab stream ends when the user clicks "Stop sharing"
      audioTracks[0]!.addEventListener("ended", () => {
        transcription.stop();
        setTabStream(null);
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      });
      transcription.start("", audioStream);
    } catch {
      // User cancelled the picker — nothing to do
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

  return (
    <div className="h-[100dvh] w-full max-w-[100vw] bg-background flex overflow-hidden text-foreground">
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
      <ReportIssueModal
        isOpen={showReportIssue}
        onClose={() => setShowReportIssue(false)}
        defaultEmail={user.email ?? ""}
      />
      <UserFeedbackModal
        isOpen={showUserFeedback}
        onClose={() => setShowUserFeedback(false)}
        defaultEmail={user.email ?? ""}
      />

      {/* ── UPGRADE MODAL ────────────────────────────────────────────────── */}
      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <div>
                <h2 className="text-lg font-bold">Upgrade Your Plan</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Choose a plan that fits your workflow</p>
              </div>
              <button
                onClick={() => setShowUpgrade(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Plans */}
            <div className="p-6 space-y-4">
              {upgradeError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{upgradeError}</span>
                </div>
              )}

              {plansLoading ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
                </div>
              ) : upgradePlans.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">Plans not available yet</p>
                  <p className="text-xs mt-1">Please check back soon or contact support.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {upgradePlans.map((plan) => {
                    const monthlyPrice = plan.prices.find(p => p.recurring?.interval === "month");
                    const yearlyPrice  = plan.prices.find(p => p.recurring?.interval === "year");
                    const isHighlighted = plan.name.toLowerCase().includes("professional");
                    return (
                      <div
                        key={plan.id}
                        className={`relative rounded-xl border p-5 flex flex-col gap-3 ${
                          isHighlighted
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border bg-muted/20"
                        }`}
                      >
                        {isHighlighted && (
                          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            MOST POPULAR
                          </span>
                        )}
                        <div>
                          <p className="font-semibold text-sm">{plan.name.replace("InterpreterAI ", "")}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{plan.description}</p>
                        </div>
                        {monthlyPrice && (
                          <div>
                            <p className="text-2xl font-bold">${(monthlyPrice.unit_amount / 100).toFixed(0)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                            {yearlyPrice && (
                              <p className="text-[11px] text-muted-foreground">${(yearlyPrice.unit_amount / 100).toFixed(0)}/yr — save {Math.round(100 - (yearlyPrice.unit_amount / (monthlyPrice.unit_amount * 12)) * 100)}%</p>
                            )}
                          </div>
                        )}
                        <div className="flex flex-col gap-2 mt-auto">
                          {monthlyPrice && (
                            <button
                              onClick={() => void handleCheckout(monthlyPrice.id)}
                              disabled={upgradeLoading === monthlyPrice.id}
                              className={`w-full h-9 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                                isHighlighted
                                  ? "bg-primary text-white hover:bg-primary/90"
                                  : "bg-foreground text-background hover:bg-foreground/90"
                              } disabled:opacity-60`}
                            >
                              {upgradeLoading === monthlyPrice.id ? (
                                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              ) : (
                                <Zap className="w-3.5 h-3.5" />
                              )}
                              Monthly
                            </button>
                          )}
                          {yearlyPrice && (
                            <button
                              onClick={() => void handleCheckout(yearlyPrice.id)}
                              disabled={upgradeLoading === yearlyPrice.id}
                              className="w-full h-9 rounded-lg text-xs font-semibold border border-border bg-white hover:bg-muted/60 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                            >
                              {upgradeLoading === yearlyPrice.id ? (
                                <span className="w-3.5 h-3.5 border-2 border-muted border-t-foreground rounded-full animate-spin" />
                              ) : null}
                              Yearly (best value)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-center text-[11px] text-muted-foreground pt-2">
                Secure payment by Stripe. Cancel anytime. All plans include real-time AI transcription & translation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="w-[64px] bg-sidebar border-r border-sidebar-border flex flex-col items-center py-3 flex-shrink-0 z-20">
        <div className="flex-1 flex flex-col gap-1.5">
          {[
            { id: "profile",  icon: <User className="w-5 h-5" />,      title: "Profile" },
            { id: "mic",      icon: <Mic2 className="w-5 h-5" />,      title: "Audio" },
            { id: "lang",     icon: <Globe className="w-5 h-5" />,     title: "Languages" },
            { id: "glossary", icon: <BookOpen className="w-5 h-5" />,  title: "Glossary" },
            { id: "support",  icon: <LifeBuoy className="w-5 h-5" />,  title: "Support" },
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

        {/* ── Growth / utility buttons ─────────────────────────────── */}
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="w-8 h-px bg-sidebar-border mx-auto mb-0.5" />

          {/* Invite another interpreter */}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(
                "I'm using this real-time AI interpreter tool for transcription and translation during calls.\n" +
                "You can try it here:\nhttps://asset-transcriber.replit.app\nFree trial available."
              );
              setInviteCopied(true);
              setTimeout(() => setInviteCopied(false), 2500);
            }}
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
              inviteCopied
                ? "bg-green-100 text-green-600"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
            title={inviteCopied ? "Link copied!" : "Invite another interpreter"}
          >
            {inviteCopied
              ? <Check className="w-4.5 h-4.5" />
              : <Share2 className="w-4.5 h-4.5" />}
          </button>

          {/* Send feedback */}
          <button
            onClick={() => setShowUserFeedback(true)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
            title="Send feedback"
          >
            <MessageCircle className="w-4.5 h-4.5" />
          </button>
        </div>

        <button
          className="w-11 h-11 rounded-xl flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors"
          onClick={handleLogout}
          title="Log Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </aside>

      {/* PROFILE PANEL */}
      {activeTab === "profile" && (
        <div className="w-72 bg-white border-r border-border flex flex-col overflow-y-auto shrink-0 z-10">
          {/* Panel header */}
          <div className="h-[52px] border-b border-border flex items-center justify-between px-4 shrink-0">
            <span className="font-semibold text-sm">Account</span>
            <button
              onClick={() => setActiveTab("mic")}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User identity */}
          <div className="p-4 border-b border-border/60 space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.email ?? user.username}</p>
                <p className="text-[11px] text-muted-foreground truncate">@{user.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                user.planType === "trial"
                  ? "bg-violet-50 text-violet-700 border-violet-200"
                  : user.planType === "basic"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : user.planType === "professional"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}>
                {user.planType === "trial" ? "Free Trial"
                  : user.planType === "basic" ? "Basic"
                  : user.planType === "professional" ? "Professional"
                  : "Unlimited"}
              </span>
              {user.planType === "trial" && (
                <span className="text-[11px] text-muted-foreground">
                  {user.trialExpired ? "Expired" : `${user.trialDaysRemaining}d left`}
                </span>
              )}
            </div>

            {/* Upgrade / Manage billing button */}
            {user.planType === "trial" ? (
              <button
                onClick={handleOpenUpgrade}
                className="w-full mt-2 h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                Upgrade to Pro
              </button>
            ) : (
              <button
                onClick={() => void handleManageBilling()}
                disabled={upgradeLoading === "portal"}
                className="w-full mt-2 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {upgradeLoading === "portal" ? (
                  <span className="w-3.5 h-3.5 border-2 border-border border-t-foreground rounded-full animate-spin" />
                ) : (
                  <ExternalLink className="w-3.5 h-3.5" />
                )}
                Manage Billing
              </button>
            )}
          </div>

          {/* Usage */}
          <div className="p-4 border-b border-border/60">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Today's Usage</p>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium">{Math.round(user.minutesUsedToday)} min used</span>
              {user.planType === "unlimited"
                ? <span className="text-emerald-600 font-semibold">Unlimited</span>
                : <span className="text-muted-foreground">/ {user.dailyLimitMinutes} min</span>
              }
            </div>
            {user.planType !== "unlimited" && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    user.minutesUsedToday >= user.dailyLimitMinutes ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, (user.minutesUsedToday / user.dailyLimitMinutes) * 100)}%` }}
                />
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
              <span>Sessions today</span>
              <span className="font-semibold text-foreground">{(user as unknown as { sessionsToday?: number }).sessionsToday ?? 0}</span>
            </div>
          </div>

          {/* Change password */}
          <div className="p-4 flex-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Change Password</p>

            {pwStatus && (
              <div className={`mb-3 flex items-start gap-2 text-xs p-2.5 rounded-lg border ${
                pwStatus.type === "ok"
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
                {pwStatus.type === "ok"
                  ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                <span>{pwStatus.msg}</span>
              </div>
            )}

            <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
              {/* Current password */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Current</label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type={showPwCurrent ? "text" : "password"}
                    value={pwForm.current}
                    onChange={(e) => setPwForm(f => ({ ...f, current: e.target.value }))}
                    placeholder="Current password"
                    className="w-full pl-8 pr-8 h-8 text-xs rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwCurrent(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPwCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type={showPwNext ? "text" : "password"}
                    value={pwForm.next}
                    onChange={(e) => setPwForm(f => ({ ...f, next: e.target.value }))}
                    placeholder="At least 8 characters"
                    className="w-full pl-8 pr-8 h-8 text-xs rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwNext(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPwNext ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm new password */}
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Confirm</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                  className="w-full pl-3 h-8 text-xs rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={pwLoading}
                className="w-full h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {pwLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Lock className="w-3 h-3" />
                )}
                {pwLoading ? "Updating…" : "Update Password"}
              </button>
            </form>

            {/* ── 2FA Section ─────────────────────────────────────── */}
            <div className="mt-5 pt-4 border-t border-border/60">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Two-Factor Auth</p>
                {twoFaEnabled !== null && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${twoFaEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-muted-foreground"}`}>
                    {twoFaEnabled ? "Active" : "Off"}
                  </span>
                )}
              </div>

              {twoFaMsg && (
                <div className={`mb-2.5 text-xs p-2 rounded-lg border flex items-start gap-1.5 ${twoFaMsg.type === "ok" ? "bg-green-50 text-green-700 border-green-200" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                  {twoFaMsg.type === "ok" ? <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />}
                  {twoFaMsg.text}
                </div>
              )}

              {twoFaStep === "idle" && !twoFaEnabled && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                    Add an extra layer of security. Use any TOTP app (Google Authenticator, Authy, 1Password).
                  </p>
                  <button
                    onClick={() => void handle2faSetup()}
                    disabled={twoFaLoading}
                    className="w-full h-8 rounded-lg border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {twoFaLoading
                      ? <span className="w-3 h-3 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                      : <ShieldCheck className="w-3 h-3" />}
                    Enable Two-Factor Authentication
                  </button>
                </div>
              )}

              {twoFaStep === "setup" && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
                  </p>
                  {twoFaQr && (
                    <div className="flex justify-center">
                      <img src={twoFaQr} alt="2FA QR code" className="w-36 h-36 rounded-xl border border-border p-1" />
                    </div>
                  )}
                  {twoFaSecret && (
                    <div className="bg-gray-50 rounded-lg p-2 border border-border">
                      <p className="text-[10px] text-muted-foreground mb-1">Manual key:</p>
                      <p className="text-xs font-mono break-all text-foreground select-all">{twoFaSecret}</p>
                    </div>
                  )}
                  <input
                    value={twoFaToken}
                    onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full h-8 text-center font-mono text-base tracking-[0.4em] rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTwoFaStep("idle"); setTwoFaToken(""); setTwoFaMsg(null); }}
                      className="flex-1 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handle2faEnable()}
                      disabled={twoFaLoading || twoFaToken.length < 6}
                      className="flex-1 h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                    >
                      {twoFaLoading
                        ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : <ShieldCheck className="w-3 h-3" />}
                      Activate
                    </button>
                  </div>
                </div>
              )}

              {twoFaStep === "idle" && twoFaEnabled && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
                    Your account is protected with two-factor authentication.
                  </p>
                  <button
                    onClick={() => { setTwoFaStep("disable"); setTwoFaMsg(null); }}
                    className="w-full h-8 rounded-lg border border-destructive/30 text-destructive text-xs font-semibold hover:bg-destructive/5 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Lock className="w-3 h-3" />
                    Disable Two-Factor Authentication
                  </button>
                </div>
              )}

              {twoFaStep === "disable" && (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Enter your 6-digit authenticator code to confirm disabling 2FA.
                  </p>
                  <input
                    value={twoFaToken}
                    onChange={e => setTwoFaToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full h-8 text-center font-mono text-base tracking-[0.4em] rounded-lg border border-input bg-gray-50 outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setTwoFaStep("idle"); setTwoFaToken(""); setTwoFaMsg(null); }}
                      className="flex-1 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handle2faDisable()}
                      disabled={twoFaLoading || twoFaToken.length < 6}
                      className="flex-1 h-8 rounded-lg bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                    >
                      {twoFaLoading
                        ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        : null}
                      Confirm Disable
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUPPORT PANEL */}
      {activeTab === "support" && (
        <SupportPanel
          userEmail={user.email ?? null}
          onClose={() => setActiveTab("mic")}
        />
      )}

      {/* GLOSSARY PANEL */}
      {activeTab === "glossary" && (
        <GlossaryPanel onClose={() => setActiveTab("mic")} />
      )}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">

        {/* HEADER */}
        <header className="h-[52px] bg-white border-b border-border flex items-center justify-between px-3 sm:px-5 shrink-0 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 mr-2">
            {/* Mobile: Notes/History drawer toggle — hidden on md+ */}
            <button
              onClick={() => setShowLeftPanel(v => !v)}
              className={`md:hidden w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                showLeftPanel ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title="Notes & Session History"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <span className="font-bold text-[15px] tracking-tight whitespace-nowrap">InterpreterAI</span>
            <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${transcription.isRecording ? "bg-violet-500 animate-pulse" : "bg-violet-300"}`} />
              <span className="truncate max-w-[160px]">{LANG_OPTIONS.find(l => l.value === langA)?.label ?? langA} ↔ {LANG_OPTIONS.find(l => l.value === langB)?.label ?? langB}</span>
            </span>
            {transcription.isRecording && (
              <>
                <span className="flex sm:hidden items-center gap-1 text-[10px] text-rose-500 font-semibold shrink-0">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                  Live
                </span>
                <span className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-200 shrink-0 font-mono">
                  <Clock className="w-3 h-3" />
                  {formatElapsed(sessionElapsed)}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mark Important Line — highlights the last transcript row */}
            <button
              onClick={() => {
                if (!transcription.containerRef.current) return;
                const rows = transcription.containerRef.current.querySelectorAll(".group");
                const last = rows[rows.length - 1] as HTMLElement | undefined;
                if (!last) return;
                last.style.background = "rgba(245,158,11,0.12)";
                last.style.borderLeft = "3px solid rgb(245,158,11)";
                last.style.borderRadius = "6px";
              }}
              disabled={!transcription.hasTranscript}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              title="Mark last line as important"
            >
              <Flag className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mark</span>
            </button>
            <button
              onClick={() => transcription.clear()}
              disabled={transcription.isRecording || !transcription.hasTranscript}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <div className="bg-muted px-2 sm:px-2.5 py-1 rounded-full text-xs font-medium text-muted-foreground flex items-center gap-1 sm:gap-1.5 border border-border/50">
              <Clock className="w-3 h-3 shrink-0" />
              {user.planType === "unlimited"
                ? <span className="hidden sm:inline">{formatMinutes(user.minutesUsedToday)} today · Unlimited</span>
                : <>
                    <span className="sm:hidden">{formatMinutes(user.minutesRemainingToday)}</span>
                    <span className="hidden sm:inline">{formatMinutes(user.minutesUsedToday)} / {formatMinutes(user.dailyLimitMinutes)} today</span>
                  </>
              }
            </div>
            {user.planType === "trial" && (
              <div className={`hidden sm:flex px-2.5 py-1 rounded-full text-xs font-medium border items-center gap-1.5 ${
                user.trialExpired
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : "bg-muted text-muted-foreground border-border/50"
              }`}>
                <AlertTriangle className="w-3 h-3" />
                <span>{user.trialExpired ? "Trial Expired" : `${user.trialDaysRemaining} days left`}</span>
              </div>
            )}
          </div>
        </header>

        {/* ALERTS */}
        {(user.trialExpired || isLimitReached) && (
          <div className="px-4 pt-3 pb-0 shrink-0">
            {user.trialExpired ? (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">Your 14-day trial has expired.</span>
                <button
                  onClick={handleOpenUpgrade}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors whitespace-nowrap shrink-0"
                >
                  <Zap className="w-3 h-3" />
                  Upgrade
                </button>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2 text-sm text-orange-800">
                <Clock className="w-4 h-4 shrink-0" />
                Daily limit of {formatMinutes(user.dailyLimitMinutes)} reached.
              </div>
            )}
          </div>
        )}

        {/* TRANSCRIPT + NOTES + HISTORY PANELS */}
        <div className="flex-1 flex gap-3 p-4 min-h-0 overflow-hidden relative">

          {/* MOBILE BACKDROP — tap to close left panel */}
          {showLeftPanel && (
            <div
              className="fixed inset-0 z-20 bg-black/30 md:hidden"
              onClick={() => setShowLeftPanel(false)}
            />
          )}

          {/* LEFT COLUMN — drawer on mobile, always-visible on md+ */}
          <div className={`
            ${showLeftPanel ? "translate-x-0" : "-translate-x-full"}
            md:translate-x-0
            fixed md:relative
            top-0 left-0 md:left-auto
            h-full md:h-auto
            z-30 md:z-auto
            w-[260px] md:w-[220px]
            shrink-0 flex flex-col gap-3 min-h-0
            transition-transform duration-200 ease-in-out
            pt-0 md:pt-0
          `}>

            {/* Mobile close button (only visible inside drawer on mobile) */}
            <div className="md:hidden h-14 bg-muted/80 border-b border-border flex items-center justify-between px-4 shrink-0">
              <span className="text-sm font-semibold">Notes & History</span>
              <button
                onClick={() => setShowLeftPanel(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* NOTES PANEL */}
            <div className="h-[22%] bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden mx-3 md:mx-0">
              <div className="h-10 border-b border-border bg-muted/20 flex items-center gap-2 px-3 shrink-0">
                <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
                {notes && (
                  <span className="ml-auto text-[9px] text-muted-foreground/50 italic">cleared on end</span>
                )}
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={"Claim #\nPatient allergy\nAppt. time\n\nPrivate — cleared when session ends"}
                className="flex-1 w-full resize-none text-[11px] leading-relaxed p-2.5 outline-none bg-transparent placeholder:text-muted-foreground/35 text-foreground"
                spellCheck={false}
              />
            </div>

            {/* TERMINOLOGY SEARCH PANEL */}
            <div className="h-[40%] min-h-0 mx-3 md:mx-0">
              <TerminologyPanel langA={langA} langB={langB} />
            </div>

            {/* SESSION HISTORY PANEL */}
            <div className="flex-1 min-h-0 mx-3 md:mx-0">
              <SessionHistoryPanel refreshKey={historyRefreshKey} />
            </div>

          </div>

          {/* MAIN TRANSCRIPT PANEL */}
          <div className="flex-1 bg-white rounded-xl border border-border shadow-sm flex flex-col min-h-0 overflow-hidden">

            {/* Transcript header */}
            <div className="h-10 border-b border-border bg-muted/20 flex items-center gap-3 px-4 shrink-0">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
                Practice Output
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
              <span className="hidden sm:block text-[9px] text-muted-foreground/40 italic">
                Audio is processed in real time and is not stored.
              </span>
              {/* Text size selector */}
              <div className="flex items-center gap-0.5 border border-border/60 rounded-md overflow-hidden bg-muted/30 shrink-0">
                <Type className="w-3 h-3 text-muted-foreground/50 ml-1.5" />
                {(["sm", "md", "lg"] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setTextSize(sz)}
                    className={`px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      textSize === sz
                        ? "bg-primary text-white"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                    title={sz === "sm" ? "Small text" : sz === "md" ? "Medium text" : "Large text"}
                  >
                    {sz === "sm" ? "S" : sz === "md" ? "M" : "L"}
                  </button>
                ))}
              </div>
            </div>

            {/* Two-column label row — visible only once transcript starts */}
            {transcription.hasTranscript && (
              <div className="grid grid-cols-2 gap-6 px-4 py-1.5 border-b border-border/40 bg-muted/10 shrink-0">
                <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Original
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                    Translation
                  </span>
                  <button
                    onClick={() => setShowReportIssue(true)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-orange-500 hover:text-orange-600 hover:bg-orange-50 transition-colors border border-orange-200/60 hover:border-orange-300"
                    title="Report a translation issue"
                  >
                    <AlertCircle className="w-2.5 h-2.5" />
                    Report issue
                  </button>
                </div>
              </div>
            )}

            {/* Scrollable transcript area
                containerRef is always mounted so the hook can imperatively
                append speaker bubbles the instant tokens arrive.
                The empty-state overlay sits on top until the first bubble appears.
                TEXT_SIZE_VARS sets CSS custom properties that cascade to all
                DOM-created text elements via var(--ts-font-size). */}
            <div
              className="flex-1 overflow-y-auto p-5 relative"
              data-tsize={textSize}
              style={TEXT_SIZE_VARS[textSize]}
            >
              {/* Direct-to-DOM transcript container — React never touches contents */}
              <div ref={transcription.containerRef} />

              {/* Empty state — absolute overlay, hidden once content exists */}
              {!transcription.hasTranscript && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none">
                  {clearedForPrivacy ? (
                    <>
                      <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      </div>
                      <p className="text-sm font-semibold text-emerald-700">Session cleared</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">No session data was stored</p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Languages className="w-5 h-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-sm font-medium">Start recording to see transcript</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        {LANG_OPTIONS.find(l => l.value === langA)?.label ?? langA} ↔ {LANG_OPTIONS.find(l => l.value === langB)?.label ?? langB} — detected automatically
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM TOOLBAR */}
        <div className="bg-white border-t border-border shrink-0 z-10">

          {/* ROW 1: Input source toggle + device/info + VU meter
               Mobile: mode toggle + VU on line 1, selector on line 2
               Desktop: all three on one line */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 pt-3 pb-2 border-b border-border/40">
            {/* Mode toggle — order-1 always */}
            <div className="flex items-center rounded-lg border border-border/60 overflow-hidden bg-muted/30 shrink-0 order-1">
              <button
                disabled={transcription.isRecording}
                onClick={() => setInputMode("mic")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  inputMode === "mic"
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Mic2 className="w-3.5 h-3.5" />
                Mic
              </button>
              <button
                disabled={transcription.isRecording}
                onClick={() => setInputMode("tab")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  inputMode === "tab"
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tab </span>Audio
              </button>
            </div>

            {/* VU meter — order-2 on mobile (sits right of toggle on line 1),
                          order-3 on desktop (rightmost) */}
            <div className="w-16 sm:w-24 shrink-0 ml-auto order-2 sm:order-3">
              <AudioMeter level={transcription.micLevel} label="" />
            </div>

            {/* Mic: device selector — order-3 on mobile (wraps to full-width line 2),
                                       order-2 on desktop (middle slot) */}
            {inputMode === "mic" && (
              <Select
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                disabled={transcription.isRecording}
                className="h-8 text-xs w-full sm:flex-1 sm:min-w-0 sm:max-w-xs bg-muted/30 order-3 sm:order-2"
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </Select>
            )}

            {/* Tab Audio: how-to hint — order-3 on mobile, order-2 on desktop */}
            {inputMode === "tab" && (
              <div className="w-full sm:flex-1 sm:min-w-0 sm:w-auto order-3 sm:order-2">
                {!transcription.isRecording ? (
                  <ol className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[10px] text-muted-foreground">
                    <li className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold flex items-center justify-center shrink-0">1</span>
                      Join your call in a browser tab
                    </li>
                    <li className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold flex items-center justify-center shrink-0">2</span>
                      Click Start below
                    </li>
                    <li className="flex items-center gap-1">
                      <span className="w-4 h-4 rounded-full bg-muted-foreground/20 text-[9px] font-bold flex items-center justify-center shrink-0">3</span>
                      Pick the tab &amp; enable "Share tab audio"
                    </li>
                  </ol>
                ) : (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5" />
                    Listening to tab audio
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ROW 2: Translation pair + record button
               Mobile:  language row on top, start button full-width below
               Desktop: language selectors | centered start | invisible spacer mirror */}
          <div className="flex flex-col sm:flex-row sm:items-center px-3 sm:px-4 py-3 gap-2 sm:gap-3">

            {/* Language pair */}
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Translate</span>
              <Select
                value={langA}
                onChange={(e) => setLangA(e.target.value)}
                disabled={transcription.isRecording}
                className="h-9 text-sm flex-1 sm:w-[130px] sm:flex-none bg-white border-border min-w-0"
              >
                {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
              <span className="text-xs font-semibold text-muted-foreground shrink-0">↔</span>
              <Select
                value={langB}
                onChange={(e) => setLangB(e.target.value)}
                disabled={transcription.isRecording}
                className="h-9 text-sm flex-1 sm:w-[130px] sm:flex-none bg-white border-border min-w-0"
              >
                {LANG_OPTIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            </div>

            {/* Start / Stop button — full width on mobile, centered on desktop */}
            <div className="w-full sm:flex-1 flex justify-center">
              {isBlocked ? (
                <div className="w-full sm:w-auto h-11 sm:px-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-medium text-sm border border-border">
                  Limit Reached
                </div>
              ) : (
                <div className="relative w-full sm:w-auto">
                  {transcription.isRecording && (
                    <span className="absolute inset-0 rounded-full border-2 border-destructive animate-ping opacity-20 pointer-events-none" />
                  )}
                  <button
                    onClick={handleToggleRecording}
                    disabled={transcription.isStarting}
                    className={`w-full sm:w-auto h-11 sm:px-10 rounded-full flex items-center justify-center gap-2.5 font-semibold text-[15px] shadow-md transition-all active:scale-95 disabled:opacity-70 ${
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

            {/* Invisible spacer — desktop only, keeps Start button centred */}
            <div className="hidden sm:flex items-center gap-2 opacity-0 pointer-events-none" aria-hidden>
              <span className="text-xs font-semibold whitespace-nowrap">Translate</span>
              <div className="h-9 w-[130px]" />
              <span className="text-xs font-semibold">↔</span>
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
