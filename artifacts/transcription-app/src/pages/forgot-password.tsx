import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic2, Mail, ArrowLeft } from "lucide-react";
import { Button, Input, Card } from "@/components/ui-components";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="public-marketing-surface min-h-screen flex items-center justify-center bg-[#f5f5f7] text-slate-900 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[380px]"
      >
        <div className="text-center mb-8">
          <button onClick={() => setLocation("/")} className="inline-block" aria-label="Go to homepage">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-slate-200/80 hover:shadow-md transition-shadow">
              <Mic2 className="w-7 h-7 text-primary" />
            </div>
          </button>
          <h1 className="text-2xl font-display font-semibold tracking-tight mb-1 text-slate-900">Reset your password</h1>
          <p className="text-sm text-slate-600">Enter your email to receive reset instructions</p>
        </div>

        <Card className="p-7 bg-white border border-slate-200/90 shadow-md rounded-2xl">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-6 h-6 text-emerald-700" />
              </div>
              <p className="font-semibold mb-1 text-slate-900">Check your email</p>
              <p className="text-sm text-slate-600">
                If an account exists for <strong>{email.trim()}</strong>, we sent a password reset link.
              </p>
              <p className="text-xs text-slate-600 mt-3">
                No email? Contact{" "}
                <a href="mailto:support@interpreterai.com" className="underline">support@interpreterai.com</a>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-xl border border-destructive/20 text-center">
                  {error}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[17px] h-[17px] text-slate-400" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="pl-10 h-11 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11" isLoading={loading}>
                Send Reset Link
              </Button>
            </form>
          )}
        </Card>

        <button
          onClick={() => setLocation("/login")}
          className="flex items-center gap-1.5 mx-auto mt-5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to login
        </button>
      </motion.div>
    </div>
  );
}
