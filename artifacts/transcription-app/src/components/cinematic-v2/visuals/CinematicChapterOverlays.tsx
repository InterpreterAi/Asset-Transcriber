import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { PRICING_PLANS, PRICING_COMPARISON_ROWS } from "@/lib/pricing-copy";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CinematicCapabilityRail } from "./CinematicCapabilityRail";
import { CinematicLanguageWall } from "./CinematicLanguageWall";
import { CinematicPrivacyCopy, CinematicPrivacyPaths } from "./CinematicPrivacyPaths";

function chapterOpacity(timeline: CinematicTimeline, id: string): number {
  const ch = CINEMATIC_CHAPTERS.find((c) => c.id === id);
  if (!ch) return 0;
  const [a, b] = ch.range;
  const p = timeline.p;
  const fade = 0.035;
  if (p < a - fade || p > b + fade) return 0;
  if (p < a) return (p - (a - fade)) / fade;
  if (p > b) return 1 - (p - b) / fade;
  return 1;
}

type Props = { timeline: CinematicTimeline };

export function CinematicChapterOverlays({ timeline }: Props) {
  const collapse = timeline.finaleCollapse;
  const id = timeline.chapterId;
  const op = (chapterId: string) => chapterOpacity(timeline, chapterId) * (1 - collapse);

  return (
    <>
      <CinematicLanguageWall timeline={timeline} />
      <CinematicCapabilityRail timeline={timeline} />
      <CinematicPrivacyPaths timeline={timeline} />
      <CinematicPrivacyCopy timeline={timeline} />

      {/* Ch1 — Hero positioning (original site conversion clarity) */}
      {op("problem") > 0.01 && (
        <motion.div
          className="absolute top-[8%] left-1/2 -translate-x-1/2 z-20 w-full max-w-4xl px-4 text-center pointer-events-none"
          style={{ opacity: op("problem") }}
        >
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.22em] text-cyan-400/90 mb-4">
            {CINEMATIC_CONTENT.eyebrow.infrastructure}
          </p>
          <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-semibold text-white leading-[1.08] tracking-tight">
            {CINEMATIC_CONTENT.hero.h1Lead}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-sky-300">
              {CINEMATIC_CONTENT.hero.h1Accent}
            </span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {CINEMATIC_CONTENT.hero.subhead}
          </p>
          <p className="mt-4 text-sm text-slate-500">{CINEMATIC_CONTENT.hero.noCard}</p>
        </motion.div>
      )}

      {/* Ch2 — Workflow explanation */}
      {op("conversation") > 0.01 && (
        <motion.div
          className="absolute bottom-[6%] left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-4 pointer-events-none"
          style={{ opacity: op("conversation") }}
        >
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400/90 mb-2 text-center">
            {CINEMATIC_CONTENT.eyebrow.product}
          </p>
          <p className="text-xl sm:text-2xl font-semibold text-white text-center">{CINEMATIC_CONTENT.product.title}</p>
          <p className="mt-3 text-sm sm:text-base text-slate-300 text-center leading-relaxed">
            {CINEMATIC_CONTENT.product.subtitle}
          </p>
          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            {CINEMATIC_CONTENT.howItWorks.steps.slice(0, 3).map((step) => (
              <div key={step.title} className="cinematic-v2-glass rounded-xl px-4 py-3 text-center">
                <p className="text-sm font-semibold text-white">{step.title}</p>
                <p className="text-xs text-slate-400 mt-1 leading-snug">{step.body}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Ch3 — Product chapter headline (capabilities rail handles pillars) */}
      {op("interpreterai") > 0.01 && (
        <motion.div
          className="absolute top-[10%] left-[3%] sm:left-[5%] z-20 max-w-sm pointer-events-none"
          style={{ opacity: op("interpreterai") }}
        >
          <p className="text-2xl sm:text-4xl font-semibold text-white leading-tight">
            {CINEMATIC_CONTENT.chapterFrames.ch3}
          </p>
          <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed">
            {CINEMATIC_CONTENT.capabilities.sectionSub}
          </p>
        </motion.div>
      )}

      {/* Ch4 — Languages scale */}
      {op("languages") > 0.01 && (
        <motion.div
          className="absolute bottom-[8%] right-[3%] sm:right-[6%] z-20 max-w-md text-right pointer-events-none"
          style={{ opacity: op("languages") }}
        >
          <p className="text-2xl sm:text-4xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch4}</p>
          <p className="mt-3 text-sm sm:text-base text-slate-300">{CINEMATIC_CONTENT.chapterFrames.ch4Sub}</p>
          <p className="mt-3 text-sm text-slate-400">{CINEMATIC_CONTENT.languages.body}</p>
        </motion.div>
      )}

      {/* Ch5 — OPI / VRI solutions */}
      {op("uses") > 0.01 && (
        <motion.div
          className="absolute top-[8%] left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-4 pointer-events-none"
          style={{ opacity: op("uses") }}
        >
          <p className="text-2xl sm:text-3xl font-semibold text-white text-center">
            {CINEMATIC_CONTENT.chapterFrames.ch5}
          </p>
          <p className="mt-3 text-sm text-slate-400 text-center max-w-2xl mx-auto">
            {CINEMATIC_CONTENT.solutions.subtitle}
          </p>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <div className="cinematic-v2-glass rounded-xl px-5 py-4">
              <p className="text-lg font-bold text-cyan-300">{CINEMATIC_CONTENT.solutions.opi.title}</p>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.solutions.opi.body}</p>
            </div>
            <div className="cinematic-v2-glass rounded-xl px-5 py-4">
              <p className="text-lg font-bold text-cyan-300">{CINEMATIC_CONTENT.solutions.vri.title}</p>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.solutions.vri.body}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Ch6 — Privacy/security handled by CinematicPrivacyCopy + paths */}

      {/* Ch7 — Scale / enterprise */}
      {op("scale") > 0.01 && (
        <motion.div
          className="absolute right-[3%] sm:right-[6%] top-1/2 -translate-y-1/2 z-20 max-w-sm text-right pointer-events-none"
          style={{ opacity: op("scale") }}
        >
          <p className="text-2xl sm:text-3xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch7}</p>
          <p className="mt-2 text-sm text-slate-400">{CINEMATIC_CONTENT.chapterFrames.ch7Sub}</p>
          <p className="mt-5 text-base font-semibold text-white">{CINEMATIC_CONTENT.scale.enterprise.title}</p>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.scale.enterprise.body}</p>
          <ul className="mt-4 space-y-2">
            {CINEMATIC_CONTENT.scale.enterprise.bullets.map((b) => (
              <li key={b} className="text-sm text-cyan-300/80">
                {b}
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Ch8 — Pricing clarity */}
      {op("pricing") > 0.01 && (
        <motion.div
          className="absolute bottom-[5%] left-1/2 -translate-x-1/2 z-20 w-full max-w-4xl px-4 pointer-events-none"
          style={{ opacity: op("pricing") }}
        >
          <p className="text-xl sm:text-2xl font-semibold text-white text-center">{CINEMATIC_CONTENT.pricing.pageTitle}</p>
          <p className="mt-2 text-sm text-slate-400 text-center max-w-xl mx-auto">{CINEMATIC_CONTENT.pricing.pageIntro}</p>
          <div className="mt-5 grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`cinematic-v2-glass rounded-xl p-4 text-center ${plan.highlight ? "ring-1 ring-cyan-400/60" : ""}`}
              >
                <p className="text-xs text-slate-400">{plan.name}</p>
                <p className={`text-xl sm:text-2xl font-bold mt-1 ${plan.highlight ? "text-cyan-300" : "text-white"}`}>
                  {plan.priceLabel}
                </p>
                <p className="text-[10px] text-slate-500 mt-2 line-clamp-2">{plan.tagline}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {op("pricing") > 0.5 && timeline.finaleCollapse < 0.3 && (
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 z-20 max-w-3xl w-full px-4 opacity-70 pointer-events-none hidden lg:block"
          style={{ opacity: op("pricing") * 0.7 }}
        >
          <div className="cinematic-v2-glass rounded-lg overflow-hidden">
            <table className="w-full text-[9px] text-left">
              <thead>
                <tr className="text-slate-500 border-b border-white/5">
                  <th className="py-1.5 pl-2">Capability</th>
                  <th className="py-1 px-1">Basic</th>
                  <th className="py-1 px-1 text-cyan-400">Pro</th>
                  <th className="py-1 pr-2">Platinum</th>
                </tr>
              </thead>
              <tbody>
                {PRICING_COMPARISON_ROWS.slice(0, 5).map((row) => (
                  <tr key={row.label} className="border-b border-white/5 text-slate-400">
                    <td className="py-1 pl-2">{row.label}</td>
                    <td className="py-1 px-1">{row.basic}</td>
                    <td className="py-1 px-1 text-slate-200">{row.professional}</td>
                    <td className="py-1 pr-2">{row.platinum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ch9 — Finale */}
      {timeline.logoReveal > 0.01 && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4 pointer-events-auto"
          style={{ opacity: timeline.logoReveal }}
        >
          <motion.div
            initial={false}
            animate={{
              scale: 0.35 + timeline.logoReveal * 0.65,
              rotate: (1 - timeline.logoReveal) * -8,
            }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
            className="w-28 h-28 rounded-2xl cinematic-v2-glass flex items-center justify-center mb-8 shadow-[0_0_140px_-8px_rgba(34,211,238,0.8)] ring-1 ring-cyan-400/30"
          >
            <Zap className="w-14 h-14 text-cyan-400" strokeWidth={2.2} />
          </motion.div>
          <motion.h2
            initial={false}
            animate={{ opacity: timeline.logoReveal, y: (1 - timeline.logoReveal) * 24 }}
            className="text-4xl sm:text-6xl font-semibold text-white text-center whitespace-pre-line tracking-tight"
          >
            {CINEMATIC_CONTENT.chapterFrames.ch9}
          </motion.h2>
          <p className="mt-5 text-base sm:text-lg text-slate-300 text-center max-w-2xl leading-relaxed">
            {CINEMATIC_CONTENT.hero.subhead}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 max-w-2xl">
            {CINEMATIC_CONTENT.positioningPillars.slice(0, 4).map((p) => (
              <span key={p.title} className="text-[11px] font-semibold px-3 py-1 rounded-full border border-white/10 text-slate-300">
                {p.title}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 pointer-events-auto">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl text-base font-semibold text-[#030508] bg-cyan-400 hover:bg-cyan-300"
            >
              {CINEMATIC_CONTENT.ctas.startTrial}
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/security"
              className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl text-base font-semibold border border-white/15 text-white"
            >
              {CINEMATIC_CONTENT.ctas.viewSecurity}
            </Link>
          </div>
          <p className="mt-8 text-xs text-slate-500 max-w-xl text-center">
            <strong className="text-slate-400">Notice:</strong> {CINEMATIC_CONTENT.legal.notice}
          </p>
          <div className="mt-6 flex gap-4 text-xs text-slate-500">
            <Link href="/privacy" className="hover:text-slate-300">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-slate-300">
              Terms
            </Link>
            <Link href="/pricing" className="hover:text-slate-300">
              Pricing
            </Link>
          </div>
        </motion.div>
      )}
    </>
  );
}
