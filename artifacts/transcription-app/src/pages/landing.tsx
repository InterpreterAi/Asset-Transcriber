import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Shield,
  Radio,
  UserRound,
  Lock,
  Building2,
  Headphones,
  Captions,
  Languages,
  Timer,
  BookOpen,
  GitBranch,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingDemoPreview } from "@/components/marketing/MarketingDemoPreview";
import { TestimonialMarquee } from "@/components/marketing/TestimonialMarquee";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const, delay },
});

function HeroWaveform() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.45]" aria-hidden>
      <svg className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[min(1400px,220%)] h-48 sm:h-64" viewBox="0 0 1200 200" fill="none">
        <path
          d="M0 120 Q 150 60 300 100 T 600 90 T 900 110 T 1200 85 L 1200 200 L 0 200 Z"
          className="fill-[#3B82F6]/[0.07]"
        />
        <path
          d="M0 140 Q 200 80 400 120 T 800 100 T 1200 115 L 1200 200 L 0 200 Z"
          className="fill-[#2563EB]/[0.06]"
        />
        <path
          stroke="url(#wgrad)"
          strokeWidth="1.2"
          fill="none"
          d="M0 105 C 200 140, 400 55, 600 95 S 1000 125, 1200 88"
          className="opacity-40"
        />
        <defs>
          <linearGradient id="wgrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
            <stop offset="45%" stopColor="#2563EB" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

const trustItems = [
  { icon: Shield, title: "HIPAA-focused architecture", desc: "Designed with regulated healthcare workflows in mind." },
  { icon: Radio, title: "Secure real-time processing", desc: "Session-oriented streaming with modern transport security." },
  { icon: UserRound, title: "Interpreter-controlled sessions", desc: "You decide how and when the workspace is used." },
  { icon: Lock, title: "Privacy-first workflows", desc: "Minimized retention patterns aligned with product design." },
  { icon: Building2, title: "Enterprise-grade infrastructure", desc: "Reliable hosting and operational discipline." },
  { icon: Headphones, title: "OPI & VRI ready", desc: "Structured for phone-based and remote video sessions." },
] as const;

const workflowFeatures = [
  { icon: Captions, title: "Live captions", body: "Follow the conversation with low-latency text aligned to speech." },
  { icon: Languages, title: "Real-time translation assistance", body: "Bilingual support to keep pace with rapid exchanges." },
  { icon: Timer, title: "Long-session support", body: "Built for extended calls without cluttering your workspace." },
  { icon: BookOpen, title: "Fast terminology recognition", body: "Reference-friendly tooling for specialist vocabulary." },
  { icon: GitBranch, title: "Bilingual workflow support", body: "Clear separation of source and target columns." },
  { icon: Sparkles, title: "Session clarity assistance", body: "Reduce visual noise so you can focus on interpreting." },
] as const;

const timelineSteps = [
  { label: "Workflow research", detail: "Interpreter sessions and feedback inform what we build next." },
  { label: "Platform iteration", detail: "Speed, clarity, and reliability improvements ship continuously." },
  { label: "Operational discipline", detail: "Monitoring and security practices evolve with the product." },
] as const;

export default function Landing() {
  const [loc] = useLocation();

  useEffect(() => {
    if ((loc.split("?")[0] || "/") !== "/") return;
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return;
    requestAnimationFrame(() => {
      document.getElementById(raw)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loc]);

  return (
    <div className="public-marketing-surface min-h-screen bg-[#F8FAFC] text-foreground overflow-x-hidden">
      <MarketingNav />

      {/* Hero */}
      <section className="relative pt-8 pb-16 sm:pt-12 sm:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-[#F8FAFC] to-[#F1F5F9]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_-20%,rgba(37,99,235,0.11),transparent_65%)]" />
        <HeroWaveform />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold tracking-wide uppercase text-primary mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Professional interpreter infrastructure
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-[2rem] sm:text-5xl lg:text-[3.35rem] font-semibold tracking-tight text-foreground leading-[1.12] max-w-4xl mx-auto"
          >
            Real-Time Support for Professional Interpreters
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
          >
            Built for OPI and VRI workflows to help interpreters follow fast conversations, terminology, and long multilingual
            sessions in real time.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-[#1D4ED8] shadow-[0_8px_28px_-6px_rgba(37,99,235,0.45)] hover:shadow-[0_12px_32px_-8px_rgba(37,99,235,0.5)] transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto min-w-[200px]"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/security"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold border border-border bg-white/80 text-foreground hover:bg-white hover:border-primary/25 shadow-sm transition-all duration-300 w-full sm:w-auto min-w-[200px]"
            >
              View Security &amp; Privacy
            </Link>
          </motion.div>
          <p className="mt-4 text-sm text-muted-foreground">No credit card required to start.</p>
        </div>
      </section>

      {/* Trust */}
      <section className="relative border-y border-border/60 bg-white py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fade(0)} className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Trusted operations</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              A calm foundation for teams that cannot afford ambiguity about security or privacy posture.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {trustItems.map(({ icon: Icon, title, desc }, i) => (
              <motion.div
                key={title}
                {...fade(0.04 + i * 0.03)}
                className="rounded-2xl border border-border/70 bg-[#F8FAFC]/80 p-7 hover:bg-white hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.1)] hover:border-primary/15 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground tracking-tight">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* OPI / VRI */}
      <section id="solutions" className="scroll-mt-28 py-16 sm:py-24 bg-[#0F172A] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(60%_50%_at_80%_20%,rgba(59,130,246,0.25),transparent_55%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fade(0)} className="max-w-3xl">
            <p className="text-sm font-semibold text-blue-300/90 uppercase tracking-wider mb-3">Solutions</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">OPI &amp; VRI workflows</h2>
            <p className="mt-4 text-lg text-slate-300/95 leading-relaxed">
              Over-the-phone interpretation (OPI) and video remote interpretation (VRI) both demand speed, legibility, and focus.
              InterpreterAI is structured as infrastructure—not a novelty layer on top of the browser.
            </p>
          </motion.div>

          <div className="mt-12 grid md:grid-cols-2 gap-6 lg:gap-8">
            <motion.div
              {...fade(0.06)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-8 hover:bg-white/[0.07] transition-colors"
            >
              <Headphones className="w-9 h-9 text-blue-300 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-semibold">OPI</h3>
              <p className="mt-3 text-slate-300 leading-relaxed text-[15px]">
                Over-the-phone interpretation support for rapid, back-and-forth audio—paired with text that keeps the narrative
                legible while you render speech.
              </p>
            </motion.div>
            <motion.div
              {...fade(0.1)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-8 hover:bg-white/[0.07] transition-colors"
            >
              <Radio className="w-9 h-9 text-blue-300 mb-4" strokeWidth={1.5} />
              <h3 className="text-xl font-semibold">VRI</h3>
              <p className="mt-3 text-slate-300 leading-relaxed text-[15px]">
                Video remote interpretation support for multilingual meetings—where visual load is already high and your workspace
                must stay minimal, fast, and dependable.
              </p>
            </motion.div>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {workflowFeatures.map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                {...fade(0.05 + i * 0.02)}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6 hover:border-blue-400/20 transition-colors"
              >
                <Icon className="w-5 h-5 text-blue-200 mb-3" strokeWidth={1.75} />
                <h4 className="font-semibold text-white">{title}</h4>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Product / demo */}
      <section id="product" className="scroll-mt-28 py-16 sm:py-24 bg-[#F1F5F9]/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...fade(0)} className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">The workspace, refined</h2>
            <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
              A single, quiet surface for transcripts, assistance columns, and reference tooling—so you stay oriented during live
              sessions.
            </p>
          </motion.div>
          <motion.div {...fade(0.08)}>
            <MarketingDemoPreview />
          </motion.div>
          <p className="text-center text-sm text-muted-foreground mt-6">Illustrative interface — not a live session.</p>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-16 sm:py-24 bg-[#F8FAFC] overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center mb-12">
          <motion.h2 {...fade(0)} className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Teams expect calm, credible tooling
          </motion.h2>
          <motion.p {...fade(0.05)} className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
            Curated feedback from interpreters using InterpreterAI in professional settings.
          </motion.p>
        </div>
        <TestimonialMarquee />
      </section>

      {/* Built with feedback */}
      <section className="py-16 sm:py-24 bg-white border-y border-border/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div {...fade(0)}>
              <p className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Product development</p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">Built With Interpreter Feedback</h2>
              <p className="mt-5 text-muted-foreground text-lg leading-relaxed">
                We continuously improve the platform using real interpreter workflow feedback to enhance speed, clarity, and
                reliability.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 mt-8 text-[15px] font-semibold text-primary hover:text-[#1D4ED8] transition-colors"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </motion.div>
            <motion.div {...fade(0.08)} className="relative">
              <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/50 via-border to-transparent" />
              <ul className="space-y-10 pl-10">
                {timelineSteps.map((step, i) => (
                  <li key={step.label} className="relative">
                    <span className="absolute left-[-29px] top-1.5 w-3 h-3 rounded-full border-2 border-primary bg-white shadow-[0_0_0_4px_rgba(37,99,235,0.12)]" />
                    <p className="text-xs font-bold uppercase tracking-wider text-primary/90">Step {i + 1}</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{step.label}</p>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.detail}</p>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Enterprise */}
      <section id="enterprise" className="scroll-mt-28 py-16 sm:py-24 bg-[#F8FAFC]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div
            {...fade(0)}
            className="rounded-3xl border border-border bg-white p-10 sm:p-14 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.12)]"
          >
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Enterprise-friendly posture</h2>
                <p className="mt-4 text-muted-foreground leading-relaxed text-[17px]">
                  InterpreterAI is built for organizations that review vendor practices before rollout. Explore our trust center for
                  security framing, and our privacy page for data-handling expectations.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/security"
                    className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-[#1D4ED8] transition-colors"
                  >
                    Security center
                  </Link>
                  <Link
                    href="/privacy"
                    className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-[14px] font-semibold border border-border bg-white hover:border-primary/20 transition-colors"
                  >
                    Privacy policy
                  </Link>
                </div>
              </div>
              <div className="grid gap-4">
                {["HIPAA-focused architecture", "Session-oriented design", "Continuous platform improvements"].map((t) => (
                  <div
                    key={t}
                    className="flex items-center gap-4 rounded-2xl border border-border/80 bg-slate-50/80 px-5 py-4 text-[15px] font-medium text-foreground"
                  >
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="py-16 sm:py-20 bg-white border-t border-border/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <motion.h2 {...fade(0)} className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Transparent pricing
          </motion.h2>
          <motion.p {...fade(0.06)} className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Compare plans with a clear feature matrix—built for interpreters who need predictable, professional software.
          </motion.p>
          <motion.div {...fade(0.1)} className="mt-8">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold text-primary-foreground bg-primary hover:bg-[#1D4ED8] shadow-lg hover:shadow-xl transition-all duration-300"
            >
              View pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="py-14 bg-slate-50 border-t border-border/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Notice:</strong> InterpreterAI is a professional support tool. You remain
            responsible for compliance with employer policies, contractual duties, and applicable law when using any assistive
            software during interpreted encounters.
          </p>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
