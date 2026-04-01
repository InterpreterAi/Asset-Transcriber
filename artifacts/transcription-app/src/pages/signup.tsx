import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic2, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Button, Input, Card } from "@/components/ui-components";

export default function Signup() {
  const [, setLocation] = useLocation();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [referralId, setReferralId] = useState<number | null>(null);

  useEffect(() => {
    const rid = sessionStorage.getItem("referralId");
    if (rid && /^\d+$/.test(rid)) setReferralId(parseInt(rid));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = { email, password };
      if (referralId) body.referralId = referralId;

      const res = await fetch("/api/auth/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      sessionStorage.removeItem("referralCode");
      sessionStorage.removeItem("referralId");

      setLocation("/workspace");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] relative overflow-hidden px-4">
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(#000 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[400px] relative z-10"
      >
        <div className="text-center mb-8">
          <button onClick={() => setLocation("/")} className="inline-block">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-border">
              <Mic2 className="w-7 h-7 text-primary" />
            </div>
          </button>
          <h1 className="text-2xl font-display font-semibold tracking-tight mb-1">Create your account</h1>
          <p className="text-sm text-muted-foreground">14-day free trial · No credit card required</p>
          {referralId && (
            <p className="text-xs font-medium text-primary mt-1.5 bg-primary/8 px-3 py-1 rounded-full inline-block border border-primary/20">
              You were invited by a colleague
            </p>
          )}
        </div>

        <Card className="p-7 bg-white border border-border shadow-md rounded-2xl">
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-2.5 w-full h-11 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 shadow-sm mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-[11px] text-muted-foreground uppercase tracking-wider"><span className="bg-white px-2">or sign up with email</span></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl border border-destructive/20 text-center">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-muted-foreground" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="pl-10 h-11 bg-gray-50 border-gray-200"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-muted-foreground" />
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="pl-10 pr-10 h-11 bg-gray-50 border-gray-200"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-muted-foreground" />
                <Input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="pl-10 h-11 bg-gray-50 border-gray-200"
                  required
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              By signing up you agree to our{" "}
              <button type="button" onClick={() => setLocation("/terms")} className="underline hover:text-foreground">
                Terms of Use
              </button>{" "}
              and{" "}
              <button type="button" onClick={() => setLocation("/privacy")} className="underline hover:text-foreground">
                Privacy Policy
              </button>
            </p>

            <Button type="submit" className="w-full h-11 mt-1" isLoading={loading}>
              Create Account
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-5">
          Already have an account?{" "}
          <button onClick={() => setLocation("/login")} className="font-semibold text-primary hover:underline">
            Log in
          </button>
        </p>
      </motion.div>
    </div>
  );
}
