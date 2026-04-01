import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Mic2, ChevronRight, Check, Zap, Globe, Users, Monitor,
  Shield, Clock, BookOpen, Gavel, Video, Building2, Quote,
  ArrowRight, Headphones, FileText, Languages,
} from "lucide-react";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: "easeOut", delay },
});

// ── Speaker badge ──────────────────────────────────────────────────────────────
function SpeakerBadge({ n, color }: { n: number; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border mb-1 ${color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${n === 1 ? "bg-violet-500" : "bg-blue-500"}`} />
      Speaker {n}
    </span>
  );
}

// ── Demo transcript row ────────────────────────────────────────────────────────
function DemoRow({
  speaker,
  orig,
  trans,
  dir: textDir = "ltr",
  highlight = false,
  live = false,
}: {
  speaker: number;
  orig: string;
  trans?: string;
  dir?: "ltr" | "rtl";
  highlight?: boolean;
  live?: boolean;
}) {
  const spColor = speaker === 1
    ? "bg-violet-50 text-violet-700 border-violet-200"
    : "bg-blue-50 text-blue-700 border-blue-200";

  return (
    <div className={`grid grid-cols-2 gap-4 px-3 py-2 rounded-lg ${highlight ? "bg-amber-50/60 border-l-2 border-amber-400" : ""}`}>
      {/* Original column */}
      <div className="flex flex-col">
        <SpeakerBadge n={speaker} color={spColor} />
        <p className="text-[12px] leading-snug text-foreground font-medium">
          {orig}
          {live && <span className="inline-block w-[2px] h-[13px] bg-primary ml-1 animate-pulse align-middle rounded-sm" />}
        </p>
      </div>
      {/* Translation column */}
      <div className="flex flex-col">
        <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border mb-1 bg-emerald-50 text-emerald-700 border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
          AI Translation
        </span>
        {trans ? (
          <p className="text-[12px] leading-snug text-foreground/90 font-medium" dir={textDir}>{trans}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground/50 italic flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" />
            Translating…
          </p>
        )}
      </div>
    </div>
  );
}

// ── App demo preview ───────────────────────────────────────────────────────────
function AppPreview() {
  return (
    <div className="relative w-full max-w-4xl mx-auto select-none">
      {/* Ambient glow */}
      <div className="absolute inset-0 -z-10 rounded-3xl bg-primary/10 blur-3xl scale-90 translate-y-6 opacity-70" />

      <div className="bg-white rounded-2xl border border-border shadow-2xl overflow-hidden">

        {/* ── Window chrome (top bar) ───────────────────────────────────────── */}
        <div className="h-[46px] bg-white border-b border-border flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            {/* macOS traffic lights */}
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-3 h-3 rounded-full bg-[#FFBC2E]" />
              <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            </div>
            {/* Brand */}
            <span className="font-bold text-[13px] tracking-tight text-foreground">InterpreterAI</span>
            {/* Lang pair badge */}
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700 border border-violet-200">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
              English ↔ Arabic
            </span>
            {/* Session timer */}
            <span className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono bg-rose-50 text-rose-600 border border-rose-200">
              <Clock className="w-2.5 h-2.5" />
              02:14
            </span>
          </div>
        </div>

        {/* ── Main layout: sidebar + notes + transcript ─────────────────────── */}
        <div className="flex" style={{ height: "390px" }}>

          {/* Sidebar — matches real 64px sidebar */}
          <div className="w-[52px] bg-[#f8f8fa] border-r border-border flex flex-col items-center pt-3 pb-2 gap-1.5 shrink-0">
            {[
              { Icon: Mic2, active: true },
              { Icon: Globe, active: false },
              { Icon: BookOpen, active: false },
            ].map(({ Icon, active }, i) => (
              <div
                key={i}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                  active ? "bg-white shadow-sm text-primary" : "text-muted-foreground/30"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
            ))}
          </div>

          {/* Notes panel — matches real min-w-[120px] panel */}
          <div className="w-[110px] border-r border-border bg-white flex flex-col shrink-0">
            <div className="h-9 border-b border-border bg-muted/20 flex items-center gap-1.5 px-2.5 shrink-0">
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Notes</span>
            </div>
            <div className="p-2 text-[10px] text-muted-foreground/55 leading-relaxed">
              Client: Maria G.<br />
              Appt: 2:00 PM<br />
              <br />
              Insurance<br />
              claim review
            </div>
          </div>

          {/* ── Main transcript panel ─────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Panel header — matches real "Practice Output" header */}
            <div className="h-9 border-b border-border bg-muted/20 flex items-center justify-between px-4 shrink-0">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Practice Output</span>
              <div className="flex items-center gap-3">
                <span className="hidden sm:block text-[9px] text-muted-foreground/40 italic">Audio processed in real time · not stored</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Listening
                </span>
              </div>
            </div>

            {/* Column labels — matches real two-column label row */}
            <div className="grid grid-cols-2 gap-4 px-3 py-1.5 border-b border-border/40 bg-muted/10 shrink-0">
              <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Original (English)</span>
              <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider">Translation (Arabic)</span>
            </div>

            {/* Transcript scroll area — static demo rows */}
            <div className="flex-1 overflow-hidden py-2 px-1 space-y-1">

              <DemoRow
                speaker={1}
                orig="Hello, how can I help you today?"
                trans="مرحبًا، كيف يمكنني مساعدتك اليوم؟"
                dir="rtl"
              />

              <DemoRow
                speaker={2}
                orig="I need help understanding my insurance documents."
                trans="أحتاج إلى مساعدة في فهم وثائق التأمين الخاصة بي."
                dir="rtl"
              />

              <DemoRow
                speaker={1}
                orig="Of course. Can you tell me your policy number?"
                trans="بالطبع. هل يمكنك إخباري برقم وثيقتك؟"
                dir="rtl"
                highlight
              />

              {/* Live typing line */}
              <DemoRow
                speaker={2}
                orig="Yes, it is"
                live
              />
            </div>
          </div>
        </div>

        {/* ── Bottom toolbar — matches real toolbar ─────────────────────────── */}
        <div className="h-[46px] border-t border-border bg-white flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2">
            {/* Stop button — matches the real rose stop button */}
            <div className="h-8 px-3 rounded-full bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-sm cursor-default">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Stop
            </div>
            {/* Mic selector — matches real input source display */}
            <div className="h-8 px-2.5 rounded-lg border border-border text-[11px] text-muted-foreground flex items-center gap-1.5 bg-muted/20">
              <Mic2 className="w-3 h-3" />
              <span className="hidden sm:inline">Default Microphone</span>
              <span className="sm:hidden">Mic</span>
            </div>
          </div>
          {/* Right side — usage counter */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground hidden sm:block">English ↔ Arabic</span>
            <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full text-[10px] text-muted-foreground font-medium border border-border/50">
              <Clock className="w-3 h-3" />
              2.2 min used
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <section className="max-w-4xl mx-auto px-5 pt-14 pb-10 text-center">
        <motion.div {...fade(0)}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-100 text-violet-700 text-xs font-semibold border border-violet-200 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            Real-Time AI for Professional Interpreters
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-display font-bold tracking-tight text-foreground mb-5 leading-[1.1]">
            Real-Time AI Transcription &amp;<br className="hidden sm:block" />
            <span className="text-primary"> Translation for Professional Interpreters</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
            Listen, transcribe, and translate conversations instantly during live calls, meetings, and interpretation sessions.
          </p>

          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setLocation("/signup")}
              className="flex items-center justify-center gap-2 px-10 py-4 bg-primary text-white rounded-full font-semibold text-[16px] shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
            >
              Start Free Trial <ChevronRight className="w-4 h-4" />
            </button>
            <p className="text-sm text-muted-foreground">Free trial — no credit card required.</p>
          </div>
        </motion.div>
      </section>

      {/* ── SECTION 2 — APP PREVIEW ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-5 pb-8">
        <motion.div {...fade(0.1)}>
          <AppPreview />
        </motion.div>
      </section>

      {/* ── SECTION 3 — FEATURE BULLETS ───────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-10">
        <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: <Mic2 className="w-5 h-5 text-violet-600" />,
              bg: "bg-violet-50 border-violet-100",
              iconBg: "bg-violet-100",
              text: "Real-time speech transcription",
            },
            {
              icon: <Languages className="w-5 h-5 text-blue-600" />,
              bg: "bg-blue-50 border-blue-100",
              iconBg: "bg-blue-100",
              text: "Instant translation between 30+ languages",
            },
            {
              icon: <Headphones className="w-5 h-5 text-emerald-600" />,
              bg: "bg-emerald-50 border-emerald-100",
              iconBg: "bg-emerald-100",
              text: "Built specifically for professional interpreters during live calls",
            },
          ].map(({ icon, bg, iconBg, text }) => (
            <div key={text} className={`flex items-start gap-3 rounded-2xl border p-4 ${bg}`}>
              <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                {icon}
              </div>
              <p className="text-sm font-medium text-foreground leading-relaxed pt-1.5">{text}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── SECTION 4 — HOW IT WORKS ──────────────────────────────────────── */}
      <section className="bg-white border-y border-border py-20">
        <div className="max-w-4xl mx-auto px-5">
          <motion.div {...fade(0)} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg">Three simple steps — from first word to translated text.</p>
          </motion.div>

          <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-3 gap-8 relative">
            {/* Connector lines on desktop */}
            <div className="hidden sm:block absolute top-8 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-border" />

            {[
              {
                step: "1",
                icon: <Headphones className="w-6 h-6 text-violet-600" />,
                iconBg: "bg-violet-100",
                title: "Start Listening",
                desc: "Connect your microphone or meeting audio.",
              },
              {
                step: "2",
                icon: <FileText className="w-6 h-6 text-blue-600" />,
                iconBg: "bg-blue-100",
                title: "AI Transcribes Speech",
                desc: "Speech is converted into real-time text.",
              },
              {
                step: "3",
                icon: <Languages className="w-6 h-6 text-emerald-600" />,
                iconBg: "bg-emerald-100",
                title: "AI Translates Instantly",
                desc: "The opposite language appears immediately.",
              },
            ].map(({ step, icon, iconBg, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center relative">
                <div className={`w-16 h-16 rounded-2xl ${iconBg} flex items-center justify-center mb-4 shadow-sm border border-white relative z-10`}>
                  {icon}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Step {step}</div>
                <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── SECTION 5 — BUILT FOR ─────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 py-20">
        <motion.div {...fade(0)} className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
            Built For
          </h2>
          <p className="text-muted-foreground text-lg">Trusted by interpreters across every professional setting.</p>
        </motion.div>

        <motion.div {...fade(0.1)} className="flex flex-wrap justify-center gap-3">
          {[
            { icon: <Shield className="w-4 h-4" />, label: "Medical interpreters", color: "bg-blue-50 border-blue-200 text-blue-700" },
            { icon: <Gavel className="w-4 h-4" />, label: "Legal interpreters", color: "bg-violet-50 border-violet-200 text-violet-700" },
            { icon: <Headphones className="w-4 h-4" />, label: "Call center interpreters", color: "bg-rose-50 border-rose-200 text-rose-700" },
            { icon: <Globe className="w-4 h-4" />, label: "Freelance interpreters", color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            { icon: <Building2 className="w-4 h-4" />, label: "Language service providers", color: "bg-orange-50 border-orange-200 text-orange-700" },
          ].map(({ icon, label, color }) => (
            <div
              key={label}
              className={`flex items-center gap-2 px-5 py-3 rounded-full border text-sm font-semibold ${color}`}
            >
              {icon}
              {label}
            </div>
          ))}
        </motion.div>

        {/* Supporting cards */}
        <motion.div {...fade(0.15)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
          {[
            {
              icon: <Shield className="w-5 h-5 text-blue-600" />,
              color: "bg-blue-50 border-blue-100",
              iconBg: "bg-blue-100",
              title: "Medical Interpreters",
              desc: "Follow fast clinical conversations with real-time transcription and accurate medical terminology.",
            },
            {
              icon: <Gavel className="w-5 h-5 text-violet-600" />,
              color: "bg-violet-50 border-violet-100",
              iconBg: "bg-violet-100",
              title: "Legal Interpreters",
              desc: "Keep up with complex legal dialogue and preserve precise terminology throughout proceedings.",
            },
            {
              icon: <Headphones className="w-5 h-5 text-rose-600" />,
              color: "bg-rose-50 border-rose-100",
              iconBg: "bg-rose-100",
              title: "Call Center Interpreters",
              desc: "Handle fast back-and-forth phone conversations with real-time AI support as you interpret.",
            },
            {
              icon: <Building2 className="w-5 h-5 text-orange-600" />,
              color: "bg-orange-50 border-orange-100",
              iconBg: "bg-orange-100",
              title: "Language Service Providers",
              desc: "Equip your interpreters with an AI-powered tool that improves accuracy and reduces fatigue.",
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

      {/* ── SECTION 6 — CORE FEATURES ────────────────────────────────────── */}
      <section className="bg-white border-y border-border py-20">
        <div className="max-w-5xl mx-auto px-5">
          <motion.div {...fade(0)} className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-3">
              Everything You Need During a Live Call
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Built for the speed and precision professional interpreters demand.</p>
          </motion.div>
          <motion.div {...fade(0.1)} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                icon: <Zap className="w-5 h-5 text-violet-600" />,
                color: "bg-violet-100",
                title: "Real-Time Speech Capture",
                desc: "Transcribes every spoken word instantly — giving you a live written reference as conversations unfold.",
              },
              {
                icon: <Globe className="w-5 h-5 text-blue-600" />,
                color: "bg-blue-100",
                title: "Interpreter-Grade Translation",
                desc: "Bidirectional translation across 35+ languages, fine-tuned for professional interpretation terminology.",
              },
              {
                icon: <Users className="w-5 h-5 text-emerald-600" />,
                color: "bg-emerald-100",
                title: "Speaker Identification",
                desc: "Automatically separates speakers so you can follow multi-party calls with complete clarity.",
              },
              {
                icon: <Monitor className="w-5 h-5 text-orange-600" />,
                color: "bg-orange-100",
                title: "Mic or Tab Audio",
                desc: "Use your microphone directly, or capture audio from any browser tab during video or phone calls.",
              },
            ].map(({ icon, color, title, desc }) => (
              <div key={title} className="bg-[#f5f5f7] rounded-2xl border border-border p-6">
                <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-4`}>
                  {icon}
                </div>
                <h3 className="font-semibold text-[15px] mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── SECTION 7 — TESTIMONIAL ───────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-20 text-center">
        <motion.div {...fade(0)}>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-6">
            <Quote className="w-5 h-5 text-primary" />
          </div>
          <blockquote className="text-xl sm:text-2xl font-display font-medium text-foreground leading-relaxed mb-6">
            "After using InterpreterAI for a few months I noticed a huge difference in my work. I miss fewer words during fast conversations and I can focus more on interpreting instead of remembering long sentences."
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">M</div>
            <div className="text-left">
              <p className="text-sm font-semibold">Professional Interpreter</p>
              <p className="text-xs text-muted-foreground">Interpreter Call Center</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── SECTION 8 — TRUST / ACCURACY ─────────────────────────────────── */}
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
              "Supports 35+ languages",
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

      {/* ── SECTION 9 — PRICING ───────────────────────────────────────────── */}
      <section className="bg-white border-b border-border py-20">
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
                  "Personal glossary system",
                  "Domain terminology hints",
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

      {/* ── SECTION 10 — DISCLAIMER ───────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-8">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-sm text-amber-800 leading-relaxed">
            <strong>Important:</strong> This tool is designed for language practice and professional development. Users are responsible for ensuring their usage complies with their employer policies, contractual obligations, and confidentiality requirements.
          </p>
        </div>
      </section>

      {/* ── SECTION 11 — FINAL CTA ────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-5 py-20 text-center">
        <motion.div {...fade(0)}>
          <h2 className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-4">
            Ready to try InterpreterAI?
          </h2>
          <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            Start your free trial and experience real-time translation built for professional interpreters.
          </p>
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setLocation("/signup")}
              className="inline-flex items-center gap-2 px-10 py-4 bg-primary text-white rounded-full font-semibold text-[16px] shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
            >
              Start Free Trial <ChevronRight className="w-4 h-4" />
            </button>
            <p className="text-sm text-muted-foreground">Free trial — no credit card required.</p>
          </div>
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
            <button onClick={() => setLocation("/terms")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Use</button>
            <button onClick={() => setLocation("/privacy")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
