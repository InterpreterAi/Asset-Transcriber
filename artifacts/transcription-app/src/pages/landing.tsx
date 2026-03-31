import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Mic2, ChevronRight, Check, Zap, Globe, Users, Monitor,
  Shield, Clock, BookOpen, Gavel, Video, Building2
} from "lucide-react";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: "easeOut", delay },
});

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-foreground overflow-x-hidden">

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-sm">
            <Mic2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-[17px] tracking-tight">InterpreterAI</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/terms")} className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</button>
          <button onClick={() => setLocation("/privacy")} className="hidden sm:block text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</button>
          <button
            onClick={() => setLocation("/login")}
            className="text-sm font-medium px-4 py-1.5 rounded-lg border border-border bg-white hover:bg-muted/40 transition-colors"
          >
            Log In
          </button>
        </div>
      </nav>

      {/* ── SECTION 1 — HERO ─────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pt-16 pb-20 text-center">
        <motion.div {...fade(0)}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold border border-violet-200 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            Real-Time AI for Professional Interpreters
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight text-foreground mb-5 leading-[1.1]">
            AI Co-Pilot for<br />
            <span className="text-primary">Live Interpreters</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-4 max-w-2xl mx-auto leading-relaxed font-medium">
            99% Accurate Real-Time Transcription & Translation So You Never Miss a Word During Live Interpretation.
          </p>

          <p className="text-base text-muted-foreground mb-7 max-w-2xl mx-auto leading-relaxed">
            InterpreterAI listens, transcribes, and translates conversations instantly — helping professional interpreters stay accurate, fast, and confident during live calls.
          </p>

          <ul className="flex flex-col sm:flex-row flex-wrap justify-center gap-x-6 gap-y-2 mb-9 text-sm text-foreground font-medium">
            {["Built for medical interpreters", "Built for court interpreters", "Built for business interpreters", "Works during live calls"].map(b => (
              <li key={b} className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-primary flex-shrink-0" />{b}
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => setLocation("/signup")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-primary text-white rounded-full font-semibold text-[15px] shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
            >
              Start Free Trial <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-white text-foreground rounded-full font-semibold text-[15px] border border-border shadow-sm hover:bg-muted/40 active:scale-95 transition-all"
            >
              Log In
            </button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">14-day free trial · No credit card required</p>
        </motion.div>
      </section>

      {/* ── SECTION 2 — INTERPRETER PROBLEM ──────────────────────────────── */}
      <section className="bg-white border-y border-border py-20">
        <div className="max-w-4xl mx-auto px-5">
          <motion.div {...fade(0)} className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-4">
              Interpreting Live Is Hard.<br className="hidden sm:block" /> Missing Words Is Not an Option.
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              Professional interpreters handle fast conversations, complex terminology, and high pressure situations.
            </p>
            <p className="text-muted-foreground text-base mt-2 max-w-xl mx-auto">
              InterpreterAI helps interpreters stay precise during live calls.
            </p>
          </motion.div>

          <motion.ul {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              "Never miss technical terminology",
              "See what was just said instantly",
              "Handle fast speakers confidently",
              "Reduce interpreter fatigue",
              "Focus on interpreting instead of remembering every word",
            ].map(item => (
              <li key={item} className="flex items-start gap-3 bg-[#f5f5f7] rounded-xl px-4 py-3.5">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-primary" />
                </div>
                <span className="text-sm font-medium">{item}</span>
              </li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* ── SECTION 3 — CORE FEATURES ────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-20">
        <motion.div {...fade(0)} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Built Around the Way You Work
          </h2>
        </motion.div>
        <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[
            {
              icon: <Zap className="w-5 h-5 text-violet-600" />,
              color: "bg-violet-100",
              title: "Real-Time Speech Capture",
              desc: "Captures every spoken word instantly so you never miss critical information during live interpretation.",
            },
            {
              icon: <Globe className="w-5 h-5 text-blue-600" />,
              color: "bg-blue-100",
              title: "Interpreter-Grade Translation",
              desc: "Bidirectional translation designed for professional interpreting workflows.",
            },
            {
              icon: <Users className="w-5 h-5 text-emerald-600" />,
              color: "bg-emerald-100",
              title: "Speaker Identification",
              desc: "Automatically separates speakers so interpreters always know who said what.",
            },
            {
              icon: <Monitor className="w-5 h-5 text-orange-600" />,
              color: "bg-orange-100",
              title: "Works With Live Calls",
              desc: "Designed to work alongside Zoom, Microsoft Teams, phone calls, and remote interpreting platforms.",
            },
          ].map(({ icon, color, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-border p-6 shadow-sm">
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                {icon}
              </div>
              <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── SECTION 4 — TRUST / ACCURACY ─────────────────────────────────── */}
      <section className="bg-primary py-20">
        <div className="max-w-4xl mx-auto px-5">
          <motion.div {...fade(0)} className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-white mb-4">
              Designed for Professional Interpreters
            </h2>
            <p className="text-white/80 text-lg max-w-2xl mx-auto leading-relaxed">
              InterpreterAI uses advanced speech recognition optimized for fast live conversations.
            </p>
          </motion.div>

          <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              "Up to 99% speech recognition accuracy",
              "Sub-second transcription speed",
              "Supports 30+ languages",
              "Handles fast dialogue and overlapping speakers",
            ].map(item => (
              <div key={item} className="flex items-center gap-3 bg-white/10 backdrop-blur rounded-xl px-4 py-3.5">
                <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-white">{item}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── SECTION 5 — WHO USES INTERPRETERAI ───────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 py-20">
        <motion.div {...fade(0)} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Who Uses InterpreterAI?
          </h2>
        </motion.div>
        <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              icon: <Shield className="w-5 h-5 text-blue-600" />,
              color: "bg-blue-50 border-blue-100",
              iconBg: "bg-blue-100",
              title: "Medical Interpreters",
              desc: "Follow fast doctor-patient conversations without missing medical terminology.",
            },
            {
              icon: <Gavel className="w-5 h-5 text-violet-600" />,
              color: "bg-violet-50 border-violet-100",
              iconBg: "bg-violet-100",
              title: "Court Interpreters",
              desc: "Capture every statement precisely during legal proceedings.",
            },
            {
              icon: <Video className="w-5 h-5 text-emerald-600" />,
              color: "bg-emerald-50 border-emerald-100",
              iconBg: "bg-emerald-100",
              title: "Remote Interpreters",
              desc: "Stay accurate during Zoom or phone interpretation sessions.",
            },
            {
              icon: <Building2 className="w-5 h-5 text-orange-600" />,
              color: "bg-orange-50 border-orange-100",
              iconBg: "bg-orange-100",
              title: "Conference Interpreters",
              desc: "Keep up with rapid speakers during conferences and meetings.",
            },
          ].map(({ icon, color, iconBg, title, desc }) => (
            <div key={title} className={`rounded-2xl border p-5 ${color}`}>
              <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
                {icon}
              </div>
              <h3 className="font-semibold text-[14px] mb-1.5">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── SECTION 6 — PRICING ───────────────────────────────────────────── */}
      <section className="bg-white border-y border-border py-20">
        <div className="max-w-5xl mx-auto px-5">
          <motion.div {...fade(0)} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
              Simple, Transparent Pricing
            </h2>
          </motion.div>
          <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                name: "Basic",
                price: "$40",
                sub: "Perfect for part-time interpreters",
                features: [
                  "Real-time transcription",
                  "Bidirectional translation",
                  "Speaker identification",
                  "Up to 5 hours interpreting per day",
                ],
                highlight: false,
              },
              {
                name: "Professional",
                price: "$80",
                sub: "Most popular for full-time interpreters",
                features: [
                  "Everything in Basic",
                  "Up to 7 hours interpreting per day",
                  "Translation memory",
                  "Domain glossaries",
                  "Priority processing",
                ],
                highlight: true,
              },
              {
                name: "Unlimited",
                price: "$120",
                sub: "For agencies and heavy users",
                features: [
                  "Unlimited interpreting hours",
                  "Tab audio capture",
                  "API access",
                  "Dedicated support",
                ],
                highlight: false,
              },
            ].map(({ name, price, sub, features, highlight }) => (
              <div
                key={name}
                className={`rounded-2xl border p-6 flex flex-col ${highlight
                  ? "border-primary bg-primary text-white shadow-xl scale-[1.02]"
                  : "border-border bg-[#f5f5f7]"
                }`}
              >
                {highlight && (
                  <div className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-2">
                    Most Popular
                  </div>
                )}
                <div className={`text-sm font-semibold mb-0.5 ${highlight ? "text-white/80" : "text-muted-foreground"}`}>
                  {name}
                </div>
                <div className={`text-4xl font-display font-bold mb-0.5 ${highlight ? "text-white" : "text-foreground"}`}>
                  {price}<span className={`text-base font-normal ml-1 ${highlight ? "text-white/60" : "text-muted-foreground"}`}>/mo</span>
                </div>
                <div className={`text-[12px] mb-5 ${highlight ? "text-white/70" : "text-muted-foreground"}`}>{sub}</div>
                <ul className="space-y-2 mb-6 flex-1">
                  {features.map(f => (
                    <li key={f} className={`text-sm flex items-start gap-2 ${highlight ? "text-white/90" : "text-foreground"}`}>
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlight ? "text-white/70" : "text-primary"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setLocation("/signup")}
                  className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 ${highlight
                    ? "bg-white text-primary hover:bg-white/90"
                    : "bg-primary text-white hover:bg-primary/90"
                  }`}
                >
                  Start Free Trial
                </button>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── SECTION 7 — FINAL CTA ─────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-24 text-center">
        <motion.div {...fade(0)}>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-4">
            Professional interpreters don't guess.<br className="hidden sm:block" /> They rely on precision.
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            InterpreterAI makes sure you never miss a word.
          </p>
          <button
            onClick={() => setLocation("/signup")}
            className="inline-flex items-center gap-2 px-10 py-4 bg-primary text-white rounded-full font-semibold text-[15px] shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
          >
            Start Free Trial <ChevronRight className="w-4 h-4" />
          </button>
          <p className="mt-4 text-sm text-muted-foreground">14-day free trial · No credit card required</p>
        </motion.div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 bg-white">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mic2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">© 2026 InterpreterAI</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={() => setLocation("/terms")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</button>
            <button onClick={() => setLocation("/privacy")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
