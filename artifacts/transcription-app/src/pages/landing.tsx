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
  ArrowRight,
  Globe2,
  Phone,
  Workflow,
} from "lucide-react";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { MarketingHeroPremium } from "@/components/marketing/MarketingHeroPremium";
import { MarketingScrollDialogueSection } from "@/components/marketing/MarketingScrollDialogueSection";
import { MarketingSecurityLockReveal } from "@/components/marketing/MarketingSecurityLockReveal";
import { MEDICAL_DIALOGUE } from "@/components/marketing/marketing-dialogue-script";
import { marketingFade, marketingScale } from "@/components/marketing/marketing-motion";
import { TestimonialMarquee } from "@/components/marketing/TestimonialMarquee";

const trustItems = [
  { icon: Shield, title: "HIPAA-focused architecture", desc: "Designed with regulated healthcare workflows in mind." },
  { icon: Radio, title: "Secure real-time processing", desc: "Session-oriented streaming with modern transport security." },
  { icon: UserRound, title: "Interpreter-controlled sessions", desc: "You decide how and when the workspace is used." },
  { icon: Lock, title: "Privacy-first workflows", desc: "Minimized retention patterns aligned with product design." },
  { icon: Building2, title: "Enterprise-grade infrastructure", desc: "Reliable hosting and operational discipline." },
  { icon: Headphones, title: "OPI & VRI ready", desc: "Structured for phone-based and remote video sessions." },
] as const;

const capabilityCards = [
  { icon: Captions, title: "Real-Time Captions", body: "Follow conversations live during fast-paced multilingual sessions." },
  { icon: Languages, title: "Translation Assistance", body: "Live language support designed for interpretation workflows." },
  { icon: Globe2, title: "31 Supported Languages", body: "Built for multilingual OPI and VRI environments." },
  { icon: Phone, title: "OPI & VRI Ready", body: "Designed specifically for remote interpretation sessions." },
  { icon: Workflow, title: "Interpreter Workflow Support", body: "Helps reduce fatigue during long bilingual conversations." },
  { icon: Shield, title: "Privacy-Focused Infrastructure", body: "Built with secure real-time processing practices." },
] as const;

const howItWorksSteps = [
  { icon: Captions, title: "Live captions appear", body: "Readable text updates as dialogue progresses—supporting clarity during rapid exchanges." },
  { icon: Languages, title: "Translation assistance updates in real time", body: "Assistance columns stay aligned with the session so you can focus on interpretation—not manual note-taking." },
  { icon: UserRound, title: "Interpreters remain fully in control", body: "The workspace supports your workflow; session use follows your professional judgment and policies." },
  { icon: Globe2, title: "Multilingual coverage", body: "The platform supports 36 languages for varied OPI, VRI, and remote communication contexts." },
] as const;

const timelineSteps = [
  { label: "Workflow research", detail: "Interpreter sessions and feedback inform what we build next." },
  { label: "Platform iteration", detail: "Speed, clarity, and reliability improvements ship continuously." },
  { label: "Operational discipline", detail: "Reliability and security practices evolve with the product." },
] as const;

function LanguagesGlobeVisual() {
  const orbitCodes = ["EN", "ES", "FR", "AR", "ZH", "PT", "DE", "JA"];
  return (
    <div className="relative mx-auto w-full max-w-[420px] aspect-square" aria-hidden>
      <div className="absolute inset-[12%] rounded-full bg-gradient-to-br from-primary/25 via-[#3B82F6]/15 to-transparent ring-1 ring-primary/20 shadow-[0_24px_80px_-20px_rgba(37,99,235,0.45)] marketing-float-slow" />
      <svg viewBox="0 0 400 400" className="relative w-full h-full text-primary/40">
        <circle cx="200" cy="200" r="118" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <ellipse cx="200" cy="200" rx="118" ry="48" fill="none" stroke="currentColor" strokeWidth="1" />
        <ellipse cx="200" cy="200" rx="48" ry="118" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="200" cy="200" r="4" className="fill-primary/60" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[236px] h-[236px]">
          {orbitCodes.map((code, i) => (
            <span
              key={code}
              className="marketing-orbit-badge absolute left-1/2 top-1/2 -ml-4 -mt-3 text-[10px] font-bold tracking-wide text-primary bg-white/95 border border-primary/15 rounded-md px-2 py-0.5 shadow-md"
              style={{ animationDelay: `${i * -3}s` }}
            >
              {code}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

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
    <MarketingPageShell premiumNav dark>
      <MarketingHeroPremium />

      <MarketingScrollDialogueSection
        id="product"
        eyebrow="Product"
        title="Your live session workspace"
        subtitle="One focused surface for real-time captions, translation assistance, and interpreter workflow support—so you stay oriented during OPI and VRI sessions without unnecessary clutter."
        lines={MEDICAL_DIALOGUE}
        scenario="medical"
      />

      <section id="capabilities" className="scroll-mt-28 py-16 sm:py-24 relative border-y border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...marketingFade(0)} className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white">Platform capabilities</h2>
            <p className="mt-4 text-slate-400 leading-relaxed text-[17px]">
              Clear, workflow-centered support for live interpretation—real-time captions, multilingual assistance, and tools aligned
              with how professional interpreters work.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilityCards.map(({ icon: Icon, title, body }, i) => (
              <motion.div key={title} {...marketingScale(0.04 + i * 0.04)} className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-7">
                <motion.div
                  whileHover={{ rotate: [0, -8, 8, 0] }}
                  transition={{ duration: 0.5 }}
                  className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5"
                >
                  <Icon className="w-5 h-5" strokeWidth={1.75} />
                </motion.div>
                <h3 className="text-[16px] font-semibold tracking-tight text-white">{title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...marketingFade(0)} className="text-center max-w-3xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white">How InterpreterAI Supports Live Sessions</h2>
            <p className="mt-4 text-slate-400 text-lg leading-relaxed">
              The platform provides real-time captions, translation assistance, and multilingual workflow support designed for
              professional interpretation environments.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-6 lg:gap-8">
            {howItWorksSteps.map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                {...marketingFade(0.06 + i * 0.05)}
                whileHover={{ x: 6 }}
                className="relative flex gap-5 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-7"
              >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="w-6 h-6" strokeWidth={1.6} />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-white">{title}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 overflow-hidden border-y border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div {...marketingFade(0)} className="order-2 lg:order-1">
              <LanguagesGlobeVisual />
            </motion.div>
            <motion.div {...marketingFade(0.08)} className="order-1 lg:order-2 text-center lg:text-left">
              <p className="text-sm font-semibold text-sky-400 uppercase tracking-wider mb-3">Coverage</p>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">31 Supported Languages</h2>
              <p className="mt-5 text-slate-400 text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
                Built for multilingual interpretation workflows across medical, customer support, and remote communication
                environments.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="bg-[#060B14] text-white relative overflow-hidden">
        <MarketingSecurityLockReveal
          title="Trusted operations"
          intro="A calm foundation for teams that cannot afford ambiguity about security or privacy posture."
          bullets={trustItems.map((t) => ({ title: t.title, body: t.desc }))}
        />
      </section>

      <section id="solutions" className="scroll-mt-28 py-16 sm:py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...marketingFade(0)} className="text-center max-w-3xl mx-auto mb-12">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400/90 mb-3">Solutions</p>
            <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white">OPI &amp; VRI workflows</h2>
            <p className="mt-4 text-slate-400 text-lg leading-relaxed">
              Over-the-phone (OPI) and video remote (VRI) sessions need legible real-time captions and calm translation assistance.
              InterpreterAI is structured as professional workflow infrastructure—built for interpreters, not generic meeting tooling.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-8">
          <motion.div {...marketingFade(0)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
            <Headphones className="w-9 h-9 text-blue-300 mb-4" />
            <h3 className="text-xl font-semibold">OPI</h3>
            <p className="mt-3 text-slate-300 leading-relaxed text-[15px]">
              Phone-based interpretation support when callers rotate quickly—paired with captions and assistance columns that keep
              dialogue legible while you interpret.
            </p>
          </motion.div>
          <motion.div {...marketingFade(0.08)} className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
            <Radio className="w-9 h-9 text-blue-300 mb-4" />
            <h3 className="text-xl font-semibold">VRI</h3>
            <p className="mt-3 text-slate-300 leading-relaxed text-[15px]">
              Remote video sessions where screen space is limited—your workspace stays minimal while real-time captions and
              assistance support bilingual workflows.
            </p>
          </motion.div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center mb-12">
          <motion.h2 {...marketingFade(0)} className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Teams expect calm, credible tooling
          </motion.h2>
          <motion.p {...marketingFade(0.05)} className="mt-4 text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Curated feedback from interpreters using InterpreterAI in professional settings.
          </motion.p>
        </div>
        <TestimonialMarquee />
      </section>

      <section className="py-16 sm:py-24 border-y border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div {...marketingFade(0)}>
            <p className="text-sm font-semibold text-sky-400 uppercase tracking-wider mb-3">Product development</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Built With Interpreter Feedback</h2>
            <p className="mt-5 text-slate-400 text-lg leading-relaxed">
              We continuously improve the platform using real interpreter workflow feedback to enhance speed, clarity, and
              reliability.
            </p>
            <Link href="/signup" className="inline-flex items-center gap-2 mt-8 text-[15px] font-semibold text-sky-400 hover:text-sky-300 transition-colors">
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
          <motion.div {...marketingFade(0.1)} className="relative">
            <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-sky-500/50 via-white/10 to-transparent" />
            <ul className="space-y-10 pl-10">
              {timelineSteps.map((step, i) => (
                <motion.li key={step.label} {...marketingFade(0.12 + i * 0.08)} className="relative">
                  <span className="absolute left-[-29px] top-1.5 w-3 h-3 rounded-full border-2 border-sky-400 bg-[#060B14] shadow-[0_0_0_4px_rgba(56,189,248,0.12)]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-sky-400/90">Step {i + 1}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{step.label}</p>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{step.detail}</p>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      <section id="enterprise" className="scroll-mt-28 py-16 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.div {...marketingScale(0)} className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur p-10 sm:p-14">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">Enterprise-friendly posture</h2>
                <p className="mt-4 text-slate-400 leading-relaxed text-[17px]">
                  InterpreterAI is built for organizations that review vendor practices before rollout. Explore our trust center for
                  security framing, and our privacy page for data-handling expectations.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/security" className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-[14px] font-semibold bg-primary text-primary-foreground hover:bg-[#1D4ED8] transition-colors">
                    Security center
                  </Link>
                  <Link href="/privacy" className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-[14px] font-semibold border border-white/15 bg-white/[0.04] text-white hover:border-white/25 transition-colors">
                    Privacy policy
                  </Link>
                </div>
              </div>
              <div className="grid gap-4">
                {["HIPAA-focused architecture", "Session-oriented design", "Continuous platform improvements"].map((t, i) => (
                  <motion.div key={t} {...marketingFade(0.08 + i * 0.06)} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-[15px] font-medium text-slate-200">
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    {t}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 bg-gradient-to-br from-sky-500/[0.08] via-transparent to-blue-600/[0.06] text-center border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <motion.h2 {...marketingFade(0)} className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">Transparent pricing</motion.h2>
          <motion.p {...marketingFade(0.06)} className="mt-4 text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
            Compare plans with a clear feature matrix—built for interpreters who need predictable, professional software.
          </motion.p>
          <motion.div {...marketingFade(0.12)} className="mt-8">
            <Link href="/pricing" className="marketing-cta-glow inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold text-white bg-primary hover:bg-[#1D4ED8] transition-all">
              View pricing
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="py-12 border-t border-white/[0.06]">
        <motion.div {...marketingFade(0)} className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-slate-500 leading-relaxed">
            <strong className="text-slate-300">Notice:</strong> InterpreterAI is a professional support tool. You remain
            responsible for compliance with employer policies, contractual duties, and applicable law when using any assistive
            software during interpreted encounters.
          </p>
        </motion.div>
      </section>
    </MarketingPageShell>
  );
}
