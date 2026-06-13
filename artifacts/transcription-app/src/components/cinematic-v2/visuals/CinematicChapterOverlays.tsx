import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { PRICING_PLANS, PRICING_COMPARISON_ROWS } from "@/lib/pricing-copy";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";

function chapterOpacity(timeline: CinematicTimeline, id: string): number {
  const ch = CINEMATIC_CHAPTERS.find((c) => c.id === id);
  if (!ch) return 0;
  const [a, b] = ch.range;
  const p = timeline.p;
  const fade = 0.04;
  if (p < a - fade || p > b + fade) return 0;
  if (p < a) return (p - (a - fade)) / fade;
  if (p > b) return 1 - (p - b) / fade;
  return 1;
}

type Props = { timeline: CinematicTimeline };

export function CinematicChapterOverlays({ timeline }: Props) {
  const collapse = timeline.finaleCollapse;
  const activeId = timeline.chapterId;

  const overlays = [
    {
      id: "problem",
      content: (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-400/80 mb-3">
            {CINEMATIC_CONTENT.eyebrow.infrastructure}
          </p>
          <p className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            {CINEMATIC_CONTENT.chapterFrames.ch1}
          </p>
          <p className="mt-3 text-xs text-slate-500">{CINEMATIC_CONTENT.hero.noCard}</p>
        </>
      ),
      position: "bottom" as const,
    },
    {
      id: "conversation",
      content: (
        <>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-400/80 mb-2">
            {CINEMATIC_CONTENT.eyebrow.product}
          </p>
          <p className="text-base font-semibold text-white">{CINEMATIC_CONTENT.product.title}</p>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed max-w-sm">{CINEMATIC_CONTENT.product.subtitle}</p>
        </>
      ),
      position: "bottom" as const,
    },
    {
      id: "interpreterai",
      content: (
        <div className="max-w-md">
          <p className="text-2xl sm:text-3xl font-semibold text-white leading-tight">
            {CINEMATIC_CONTENT.chapterFrames.ch3}
          </p>
          <p className="mt-3 text-sm text-slate-400">{CINEMATIC_CONTENT.hero.subhead}</p>
          <p className="mt-2 text-sm font-medium text-cyan-200/90">{CINEMATIC_CONTENT.hero.h1}</p>
        </div>
      ),
      position: "left" as const,
    },
    {
      id: "languages",
      content: (
        <div className="max-w-md text-right">
          <p className="text-2xl sm:text-3xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch4}</p>
          <p className="mt-2 text-sm text-slate-400">{CINEMATIC_CONTENT.chapterFrames.ch4Sub}</p>
        </div>
      ),
      position: "right" as const,
    },
    {
      id: "uses",
      content: (
        <div className="max-w-lg mx-auto text-center">
          <p className="text-2xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch5}</p>
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.solutions.subtitle}</p>
        </div>
      ),
      position: "top" as const,
    },
    {
      id: "trust",
      content: (
        <div className="max-w-sm">
          <p className="text-xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch6}</p>
          <p className="mt-2 text-xs text-slate-400">{CINEMATIC_CONTENT.trust.landingIntro}</p>
          <p className="mt-3 text-[10px] text-cyan-300/70 italic">
            Security signals radiate from your live session — HIPAA-aligned workflows, no training on your audio.
          </p>
        </div>
      ),
      position: "left" as const,
    },
    {
      id: "scale",
      content: (
        <div className="max-w-sm text-right">
          <p className="text-xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch7}</p>
          <p className="mt-1 text-xs text-slate-400">{CINEMATIC_CONTENT.chapterFrames.ch7Sub}</p>
          <p className="mt-3 text-sm text-white">{CINEMATIC_CONTENT.scale.enterprise.title}</p>
        </div>
      ),
      position: "right" as const,
    },
    {
      id: "pricing",
      content: (
        <div className="max-w-md mx-auto text-center">
          <p className="text-lg font-semibold text-white">{CINEMATIC_CONTENT.pricing.pageTitle}</p>
          <p className="mt-2 text-[10px] text-slate-400">
            Plans illuminate from your session — Basic, Professional, Platinum connected to the workspace above.
          </p>
          <div className="mt-4 flex justify-center gap-6">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.key} className="text-center">
                <p className="text-[10px] text-slate-500">{plan.name}</p>
                <p className={`text-sm font-semibold ${plan.highlight ? "text-cyan-300" : "text-white"}`}>
                  {plan.priceLabel}
                </p>
              </div>
            ))}
          </div>
        </div>
      ),
      position: "bottom" as const,
    },
  ];

  const positionCls = {
    top: "top-[12%] left-1/2 -translate-x-1/2",
    bottom: "bottom-[8%] left-1/2 -translate-x-1/2 text-center",
    left: "left-[4%] sm:left-[6%] top-1/2 -translate-y-1/2",
    right: "right-[4%] sm:right-[6%] top-1/2 -translate-y-1/2",
  };

  return (
    <>
      {overlays.map((o) => {
        const isActive = o.id === activeId;
        const opacity = isActive ? chapterOpacity(timeline, o.id) * (1 - collapse) : 0;
        if (opacity <= 0.01) return null;
        return (
          <motion.div
            key={o.id}
            className={`absolute z-20 px-4 pointer-events-none ${positionCls[o.position]}`}
            style={{ opacity }}
          >
            {o.content}
          </motion.div>
        );
      })}

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
            className="w-24 h-24 rounded-2xl cinematic-v2-glass flex items-center justify-center mb-8 shadow-[0_0_120px_-8px_rgba(34,211,238,0.75)] ring-1 ring-cyan-400/30"
          >
            <Zap className="w-12 h-12 text-cyan-400" strokeWidth={2.2} />
          </motion.div>
          <motion.h2
            initial={false}
            animate={{ opacity: timeline.logoReveal, y: (1 - timeline.logoReveal) * 24 }}
            className="text-3xl sm:text-5xl font-semibold text-white text-center whitespace-pre-line tracking-tight"
          >
            {CINEMATIC_CONTENT.chapterFrames.ch9}
          </motion.h2>
          <p className="mt-4 text-sm text-slate-400 text-center max-w-lg">{CINEMATIC_CONTENT.hero.subhead}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 pointer-events-auto">
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
          <p className="mt-8 text-[10px] text-slate-500 max-w-xl text-center">
            <strong className="text-slate-400">Notice:</strong> {CINEMATIC_CONTENT.legal.notice}
          </p>
          <div className="mt-6 flex gap-4 text-[10px] text-slate-500">
            <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>
            <Link href="/terms" className="hover:text-slate-300">Terms</Link>
            <Link href="/pricing" className="hover:text-slate-300">Pricing</Link>
          </div>
        </motion.div>
      )}

      {chapterOpacity(timeline, "pricing") > 0.5 && timeline.finaleCollapse < 0.3 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 max-w-3xl w-full px-4 opacity-60 pointer-events-none hidden lg:block">
          <div className="cinematic-v2-glass rounded-lg overflow-hidden">
            <table className="w-full text-[8px] text-left">
              <thead>
                <tr className="text-slate-500 border-b border-white/5">
                  <th className="py-1 pl-2">Capability</th>
                  <th className="py-1 px-1">Basic</th>
                  <th className="py-1 px-1 text-cyan-400">Pro</th>
                  <th className="py-1 pr-2">Platinum</th>
                </tr>
              </thead>
              <tbody>
                {PRICING_COMPARISON_ROWS.slice(0, 5).map((row) => (
                  <tr key={row.label} className="border-b border-white/5 text-slate-400">
                    <td className="py-0.5 pl-2">{row.label}</td>
                    <td className="py-0.5 px-1">{row.basic}</td>
                    <td className="py-0.5 px-1 text-slate-200">{row.professional}</td>
                    <td className="py-0.5 pr-2">{row.platinum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
