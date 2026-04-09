import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ApiError, useLogin } from "@workspace/api-client-react";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Mic2, Lock, Mail, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button, Input, Card } from "@/components/ui-components";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  invalid_state:    "Authentication failed — please try again.",
  token_failed:     "Could not verify your Google account. Try again.",
  profile_failed:   "Could not retrieve your Google profile. Try again.",
  auth_failed:      "Google sign-in failed. Please try again.",
  not_configured:   "Google login is not yet enabled.",
  disposable_email: "Temporary email addresses are not allowed.",
  session_failed:
    "Could not save your session (database). Check Postgres and the user_sessions table, then try again.",
};

type Step = "credentials" | "2fa";

export default function Login() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const loginMut = useLogin();

  const oauthError = new URLSearchParams(search).get("error");

  const [step, setStep]           = useState<Step>("credentials");
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [otpValue, setOtpValue]   = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError]         = useState(oauthError ? (GOOGLE_ERROR_MESSAGES[oauthError] ?? "Sign-in failed.") : "");
  const [verifyBanner, setVerifyBanner] = useState<string | null>(null);
  const [showResend, setShowResend]     = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = new URLSearchParams(search);
    const v = p.get("verify");
    if (v === "ok") {
      setVerifyBanner("Your email is verified. You can sign in now.");
      setError("");
    } else if (v === "required") {
      setVerifyBanner(null);
      setError("Please verify your email before accessing InterpreterAI.");
      setShowResend(true);
    } else if (v === "invalid" || v === "missing" || v === "error") {
      setVerifyBanner(null);
      setError(
        v === "missing"
          ? "Verification link is missing. Request a new email below."
          : "That verification link is invalid or has expired. Request a new one below.",
      );
      setShowResend(true);
    }
  }, [search]);

  // ── Step 1: email + password ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // OAuth failures put ?error= in the URL; that is unrelated to email/password — drop it so the banner matches this attempt.
    if (oauthError) {
      setLocation("/login");
    }
    setError("");
    try {
      const data = await loginMut.mutateAsync({ data: { username, password } }) as any;
      if (data?.requires2fa) {
        setStep("2fa");
        setTimeout(() => otpRef.current?.focus(), 120);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/workspace");
    } catch (err: unknown) {
      // customFetch throws ApiError with JSON on `.data` (not axios `.response.data`).
      let status: number | undefined;
      let payload: { error?: unknown; code?: string; hint?: unknown } | undefined;
      if (err instanceof ApiError) {
        status = err.status;
        const d = err.data;
        payload =
          d && typeof d === "object" ? (d as { error?: unknown; code?: string; hint?: unknown }) : undefined;
      } else {
        const ax = err as {
          response?: { status?: number; data?: { error?: unknown; code?: string; hint?: unknown } };
        };
        status = ax.response?.status;
        payload = ax.response?.data;
      }
      const apiMsg =
        typeof payload?.error === "string" && payload.error.length <= 800 ? payload.error.trim() : "";
      const apiHint =
        typeof payload?.hint === "string" && payload.hint.length <= 600 ? payload.hint.trim() : "";
      if (status === 403 && payload?.code === "email_not_verified") {
        setShowResend(true);
        setError(apiMsg || "Please verify your email before signing in.");
        return;
      }
      setShowResend(false);
      // Never show err.message: ApiError.message can embed long server text; only API `error` / `hint`.
      const uncaughtTip =
        payload?.code === "login_uncaught_exception"
          ? " Check your API host logs for POST /api/auth/login failed (often database URL, migrations, or session store)."
          : "";
      const combined = [apiMsg, apiHint, uncaughtTip].filter(Boolean).join(" ").trim();
      setError(
        combined ||
          (status === 401 || status === 400 ? "Invalid credentials" : "Something went wrong. Please try again."),
      );
    }
  };

  // ── Step 2: TOTP code ───────────────────────────────────────────────────────
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: otpValue.replace(/\s/g, "") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code — please try again");
        setOtpValue("");
        otpRef.current?.focus();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/workspace");
    } catch {
      setError("Connection error — please try again");
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpInput = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setOtpValue(digits);
  };

  const handleResendVerification = async () => {
    if (!username.trim()) {
      setError("Enter your email address above, then tap resend.");
      return;
    }
    setResendLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: username.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not resend email");
      setVerifyBanner("If your account needs verification, we sent a new email. Check your inbox.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not resend email");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#f5f5f7]">
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" as const }}
        className="w-full max-w-[400px] px-4 relative z-10"
      >
        <div className="text-center mb-10">
          <button onClick={() => setLocation("/")} className="inline-block" aria-label="Go to homepage">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-border hover:shadow-md transition-shadow">
              {step === "2fa"
                ? <ShieldCheck className="w-8 h-8 text-primary" />
                : <Mic2 className="w-8 h-8 text-primary" />}
            </div>
          </button>
          <h1 className="text-3xl font-display font-semibold text-foreground mb-2 tracking-tight">InterpreterAI</h1>
          <p className="text-muted-foreground text-sm">
            {step === "2fa" ? "Two-factor authentication" : "Professional Transcription & Translation"}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === "credentials" && (
            <motion.div key="credentials" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
              <Card className="p-8 bg-white border border-border shadow-md rounded-2xl">
                <a
                  href="/api/auth/google"
                  className="flex items-center justify-center gap-2.5 w-full h-12 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 shadow-sm mb-5"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </a>

                <div className="relative mb-5">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                  <div className="relative flex justify-center text-[11px] text-muted-foreground uppercase tracking-wider"><span className="bg-white px-2">or sign in with email</span></div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {verifyBanner && (
                    <div className="bg-emerald-50 text-emerald-900 text-sm p-3 rounded-xl border border-emerald-200 text-center font-medium">
                      {verifyBanner}
                    </div>
                  )}
                  {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl border border-destructive/20 text-center font-medium">
                      {error}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Email or Username</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="you@example.com"
                        className="pl-10 h-12 bg-gray-50 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between ml-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Password</label>
                      <button type="button" onClick={() => setLocation("/forgot-password")} className="text-xs text-primary hover:underline">
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground" />
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pl-10 h-12 bg-gray-50 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 mt-4 shadow-sm"
                    size="lg"
                    isLoading={loginMut.isPending}
                  >
                    Sign In
                  </Button>
                  {showResend && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11"
                      isLoading={resendLoading}
                      onClick={handleResendVerification}
                    >
                      Resend verification email
                    </Button>
                  )}
                </form>
              </Card>

              <p className="text-center text-sm text-muted-foreground mt-5">
                Don't have an account?{" "}
                <button onClick={() => setLocation("/signup")} className="font-semibold text-primary hover:underline">
                  Start free trial
                </button>
              </p>
              <div className="flex items-center justify-center gap-5 mt-4">
                <button onClick={() => setLocation("/terms")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms of Use</button>
                <button onClick={() => setLocation("/privacy")} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</button>
              </div>
            </motion.div>
          )}

          {step === "2fa" && (
            <motion.div key="2fa" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }}>
              <Card className="p-8 bg-white border border-border shadow-md rounded-2xl">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-foreground mb-1">Verification required</h2>
                  <p className="text-sm text-muted-foreground">
                    Open your authenticator app and enter the 6-digit code for <span className="font-medium text-foreground">InterpreterAI</span>.
                  </p>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-5">
                  {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl border border-destructive/20 text-center font-medium">
                      {error}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                      6-Digit Code
                    </label>
                    <Input
                      ref={otpRef}
                      value={otpValue}
                      onChange={(e) => handleOtpInput(e.target.value)}
                      placeholder="000000"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="h-14 text-center text-2xl font-mono tracking-[0.5em] bg-gray-50 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary"
                      maxLength={6}
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 shadow-sm"
                    size="lg"
                    isLoading={verifying}
                    disabled={otpValue.length < 6}
                  >
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Verify & Sign In
                  </Button>
                </form>

                <button
                  onClick={() => { setStep("credentials"); setError(""); setOtpValue(""); }}
                  className="mt-5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to sign in
                </button>
              </Card>

              <p className="text-center text-xs text-muted-foreground mt-5">
                Lost access to your authenticator?{" "}
                <a href="mailto:support@interpreterai.org" className="text-primary hover:underline">Contact support</a>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
