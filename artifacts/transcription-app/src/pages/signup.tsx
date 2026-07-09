import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { Mic2, Mail, Lock, Eye, EyeOff, Zap } from "lucide-react";
import { Button, Input, Card } from "@/components/ui-components";
import { postLoginDestination } from "@/lib/auth-redirect";
import { MarketingAuthLayout } from "@/components/marketing/MarketingAuthLayout";
import { isInAppBrowser } from "@/lib/browser-detect";

export default function Signup() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [referrerUserId, setReferrerUserId] = useState<number | null>(null);
  const [referralSlug, setReferralSlug] = useState<string>("");
  const webViewBlocked = typeof window !== "undefined" && isInAppBrowser();
  const loginReferralQuery =
    referrerUserId
      ? `?ref=${encodeURIComponent(String(referrerUserId))}${referralSlug ? `&u=${encodeURIComponent(referralSlug)}` : ""}`
      : "";

  useEffect(() => {
    const params = new URLSearchParams(search);
    const refFromUrl = params.get("ref");
    const slugFromUrl = params.get("u");
    const refFromStorage = sessionStorage.getItem("referralCode");
    const slugFromStorage = sessionStorage.getItem("referralUserSlug");

    const resolvedRef = refFromUrl && /^\d+$/.test(refFromUrl) ? refFromUrl : refFromStorage;
    if (resolvedRef && /^\d+$/.test(resolvedRef)) {
      setReferrerUserId(parseInt(resolvedRef, 10));
      sessionStorage.setItem("referralCode", resolvedRef);
    }
    const resolvedSlug = (slugFromUrl || slugFromStorage || "").trim();
    if (resolvedSlug) {
      setReferralSlug(resolvedSlug);
      sessionStorage.setItem("referralUserSlug", resolvedSlug);
    }
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must be at least 8 characters and include at least one letter and one number.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = { email, password };
      if (referrerUserId) body.referrerUserId = referrerUserId;

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        accountAutoDisabled?: boolean;
        message?: string;
      };
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(data.error || "Too many signup attempts. Please try again later.");
        }
        throw new Error(data.error || "Signup failed");
      }

      sessionStorage.removeItem("referralCode");
      sessionStorage.removeItem("referralUserSlug");

      if (data.accountAutoDisabled) {
        throw new Error(data.message || "This account could not be activated automatically. Contact support if you need help.");
      }

      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation(postLoginDestination(search));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  if (webViewBlocked) {
    const openTarget =
      referrerUserId
        ? `/invite?ref=${encodeURIComponent(String(referrerUserId))}${referralSlug ? `&u=${encodeURIComponent(referralSlug)}` : ""}`
        : window.location.href;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card text-card-foreground p-8 text-center shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7" strokeWidth={2.2} />
          </div>
          <p className="text-lg font-semibold">InterpreterAI</p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Open in your browser to sign in</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Google sign-in doesn&apos;t work inside LinkedIn or social apps. Tap the button below or copy the link and open it in Safari or Chrome.
          </p>
          <button
            type="button"
            onClick={() => window.open(openTarget, "_blank")}
            className="mt-6 h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Open in Safari / Chrome
          </button>
        </div>
      </div>
    );
  }

  return (
    <MarketingAuthLayout
      title="Create your account"
      subtitle="7-day free trial · No credit card required · Start in one step"
    >
      <div className="lg:hidden text-center mb-6">
        <div className="w-14 h-14 bg-sky-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-sky-500/20">
          <Mic2 className="w-7 h-7 text-sky-300" />
        </div>
        {referrerUserId && (
          <p className="text-xs font-medium text-sky-300 mt-2 bg-sky-500/10 px-3 py-1 rounded-full inline-block border border-sky-500/20">
            You were invited by a colleague
          </p>
        )}
      </div>

        <Card className="p-7 bg-white/95 backdrop-blur border border-white/20 shadow-2xl rounded-2xl">
              <a
                href={referrerUserId ? `/api/auth/google?ref=${referrerUserId}` : "/api/auth/google"}
                className="flex items-center justify-center gap-2.5 w-full h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700 shadow-sm mb-4"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </a>

              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[11px] text-slate-500 uppercase tracking-wider">
                  <span className="bg-white px-2">or sign up with email</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl border border-destructive/20 text-center">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-muted-foreground" />
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-10 h-11 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-slate-400" />
                    <Input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="pl-10 pr-10 h-11 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-slate-400" />
                    <Input
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat password"
                      className="pl-10 h-11 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                      required
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-600 text-center leading-relaxed">
                  By signing up you agree to our{" "}
                  <button type="button" onClick={() => setLocation("/terms")} className="underline hover:text-slate-900">
                    Terms of Use
                  </button>{" "}
                  and{" "}
                  <button type="button" onClick={() => setLocation("/privacy")} className="underline hover:text-slate-900">
                    Privacy Policy
                  </button>
                </p>

                <Button type="submit" className="w-full h-11 mt-1" isLoading={loading}>
                  Create Account
                </Button>
              </form>
        </Card>

        <p className="text-center text-sm text-slate-600 mt-5">
          Already have an account?{" "}
          <button type="button" onClick={() => setLocation(`/login${loginReferralQuery}`)} className="font-semibold text-primary hover:underline">
            Log in
          </button>
        </p>
    </MarketingAuthLayout>
  );
}
