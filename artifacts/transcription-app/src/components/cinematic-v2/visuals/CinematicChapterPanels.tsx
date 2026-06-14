import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Mic2, Captions, Languages, Check } from "lucide-react";
import { PRICING_PLANS } from "@/lib/pricing-copy";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { CinematicCapabilityRail } from "./CinematicCapabilityRail";
import { CinematicTestimonials } from "./CinematicTestimonials";
import { CinematicCompanyMarquee } from "./CinematicCompanyMarquee";
import { CINEMATIC_LANGUAGE_COUNT } from "../data/cinematic-languages";

type Props = { timeline: CinematicTimeline };

function HeroCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div className="px-4 sm:px-6 text-center" style={{ opacity }}>
      <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-3">
        {CINEMATIC_CONTENT.eyebrow.infrastructure}
      </p>
      <h1 className="text-2xl sm:text-4xl lg:text-[2.75rem] font-semibold text-white leading-[1.12] tracking-tight">
        {CINEMATIC_CONTENT.hero.h1Lead}{" "}
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-sky-300">
          {CINEMATIC_CONTENT.hero.h1Accent}
        </span>
      </h1>
      <p className="mt-4 text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
        {CINEMATIC_CONTENT.hero.subhead}
      </p>
      <p className="mt-3 text-sm text-slate-500">{CINEMATIC_CONTENT.hero.noCard}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {[
          { icon: Mic2, label: CINEMATIC_CONTENT.hero.pills[0] },
          { icon: Captions, label: CINEMATIC_CONTENT.hero.pills[1] },
          { icon: Languages, label: CINEMATIC_CONTENT.hero.pills[2] },
        ].map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-slate-300"
          >
            <Icon className="w-3.5 h-3.5 text-cyan-400" />
            {label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function ConversationCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div className="px-4 sm:px-6 text-center max-w-2xl mx-auto" style={{ opacity }}>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400/90 mb-2">
        {CINEMATIC_CONTENT.eyebrow.product}
      </p>
      <p className="text-lg sm:text-2xl font-semibold text-white">{CINEMATIC_CONTENT.product.liveDemoTitle}</p>
      <p className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.product.liveDemoSub}</p>
    </motion.div>
  );
}

function ProductCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div className="px-2 sm:px-4 shrink-0" style={{ opacity }}>
      <p className="text-xl sm:text-2xl font-semibold text-white leading-tight">
        {CINEMATIC_CONTENT.chapterFrames.ch3}
      </p>
      <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.capabilities.sectionSub}</p>
      <p className="mt-3 text-sm font-medium text-cyan-200/90">{CINEMATIC_CONTENT.product.title}</p>
      <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.product.subtitle}</p>
    </motion.div>
  );
}

function LanguagesCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div className="px-2 sm:px-4 h-full flex flex-col justify-center" style={{ opacity }}>
      <p className="text-4xl sm:text-5xl font-bold text-white">{CINEMATIC_LANGUAGE_COUNT}+</p>
      <p className="text-base font-semibold text-cyan-300 mt-1">supported languages</p>
      <p className="mt-4 text-xl sm:text-2xl font-semibold text-white leading-tight">
        {CINEMATIC_CONTENT.chapterFrames.ch4}
      </p>
      <p className="mt-3 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.chapterFrames.ch4Sub}</p>
      <p className="mt-3 text-xs text-slate-400">{CINEMATIC_CONTENT.languages.body}</p>
    </motion.div>
  );
}

function TrustCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div className="px-2 sm:px-4 h-full flex flex-col justify-center relative z-10" style={{ opacity }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-2">Trust center</p>
      <h2 className="text-xl sm:text-2xl font-semibold text-white">Security &amp; Privacy</h2>
      <p className="mt-2 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.trust.landingIntro}</p>
      <div className="mt-4 cinematic-v2-glass rounded-xl px-4 py-3 border-l-2 border-cyan-400/50">
        <p className="text-sm font-semibold text-cyan-200">{CINEMATIC_CONTENT.trust.privacyHeadline}</p>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.trust.privacyBody}</p>
      </div>
      <Link href="/security" className="mt-4 inline-block text-sm font-semibold text-cyan-400 hover:text-cyan-300">
        Explore Security &amp; Privacy →
      </Link>
    </motion.div>
  );
}

function EnterpriseCopy({ opacity, showMarquee }: { opacity: number; showMarquee: boolean }) {
  return (
    <motion.div className="px-2 sm:px-4 h-full flex flex-col justify-center" style={{ opacity }}>
      <p className="text-xl sm:text-2xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch7}</p>
      <p className="mt-2 text-sm text-slate-400">{CINEMATIC_CONTENT.chapterFrames.ch7Sub}</p>
      <p className="mt-4 text-base font-semibold text-white">{CINEMATIC_CONTENT.scale.enterprise.title}</p>
      <p className="mt-2 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.scale.enterprise.body}</p>
      <ul className="mt-3 space-y-1">
        {CINEMATIC_CONTENT.scale.enterprise.bullets.map((b) => (
          <li key={b} className="text-sm text-cyan-300/80">
            {b}
          </li>
        ))}
      </ul>
      {showMarquee && (
        <div className="mt-6">
          <CinematicCompanyMarquee />
        </div>
      )}
    </motion.div>
  );
}

function PricingCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div className="px-3 sm:px-4 text-center max-w-4xl mx-auto pointer-events-auto" style={{ opacity }}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-2">Pricing</p>
      <p className="text-lg sm:text-xl font-semibold text-white">{CINEMATIC_CONTENT.pricing.pageTitle}</p>
      <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto">{CINEMATIC_CONTENT.pricing.pageIntro}</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto">
        {PRICING_PLANS.map((plan) => (
          <Link
            key={plan.key}
            href={`/signup?plan=${plan.key}`}
            className={`block cinematic-v2-glass rounded-xl p-4 text-left transition-all hover:ring-1 hover:ring-cyan-400/40 ${
              plan.highlight ? "ring-1 ring-cyan-400/60" : ""
            }`}
          >
            {plan.highlight && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-300">Most popular</span>
            )}
            <p className="text-xs text-slate-400 mt-1">{plan.name}</p>
            <p className={`text-2xl font-bold mt-1 ${plan.highlight ? "text-cyan-300" : "text-white"}`}>
              {plan.priceLabel}
              <span className="text-sm font-medium text-slate-500">/mo</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{plan.tagline}</p>
            <ul className="mt-3 space-y-1.5">
              {plan.features.slice(0, 4).map((f) => (
                <li key={f} className="flex gap-1.5 text-[10px] text-slate-300">
                  <Check className="w-3 h-3 text-cyan-400 shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <span className="mt-3 inline-block text-[11px] font-semibold text-cyan-400">Start free trial →</span>
          </Link>
        ))}
      </div>
      <Link href="/pricing" className="mt-4 inline-block text-xs text-slate-500 hover:text-cyan-400">
        View full plan comparison →
      </Link>
    </motion.div>
  );
}

function FinaleCopy({ opacity }: { opacity: number }) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center px-4 text-center pointer-events-auto"
      style={{ opacity }}
    >
      <div className="w-24 h-24 rounded-2xl cinematic-v2-glass flex items-center justify-center mb-6 shadow-[0_0_120px_-8px_rgba(34,211,238,0.7)]">
        <Zap className="w-12 h-12 text-cyan-400" strokeWidth={2.2} />
      </div>
      <h2 className="text-3xl sm:text-5xl font-semibold text-white whitespace-pre-line tracking-tight">
        {CINEMATIC_CONTENT.chapterFrames.ch9}
      </h2>
      <p className="mt-4 text-base text-slate-300 max-w-xl">{CINEMATIC_CONTENT.hero.subhead}</p>
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Link
          href="/signup"
          className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-[#030508] bg-cyan-400 hover:bg-cyan-300"
        >
          {CINEMATIC_CONTENT.ctas.startTrial}
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/security"
          className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold border border-white/15 text-white"
        >
          {CINEMATIC_CONTENT.ctas.viewSecurity}
        </Link>
      </div>
    </motion.div>
  );
}

function panelOpacity(timeline: CinematicTimeline): number {
  if (timeline.logoReveal > 0.01) return timeline.logoReveal;
  return 1 - timeline.finaleCollapse;
}

export function CinematicChapterPanels({ timeline }: Props) {
  const id = timeline.chapterId;
  const op = panelOpacity(timeline);

  if (id === "problem") return <HeroCopy opacity={op} />;
  if (id === "conversation") return <ConversationCopy opacity={op} />;
  if (id === "interpreterai") return <ProductCopy opacity={op} />;
  if (id === "languages") return <LanguagesCopy opacity={op} />;
  if (id === "trust") return <TrustCopy opacity={op} />;
  if (id === "scale") return <EnterpriseCopy opacity={op} showMarquee={timeline.visibility.companyMarquee} />;
  if (id === "pricing") return <PricingCopy opacity={op} />;
  if (id === "finale" || timeline.logoReveal > 0.01) return <FinaleCopy opacity={timeline.logoReveal || op} />;
  return null;
}

export function CinematicChapterSidePanels({ timeline }: Props) {
  if (timeline.visibility.capabilityRail) {
    return <CinematicCapabilityRail timeline={timeline} inline />;
  }
  if (timeline.visibility.testimonials) {
    return <CinematicTestimonials timeline={timeline} inline />;
  }
  return null;
}
