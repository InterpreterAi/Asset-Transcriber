import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { PRICING_PLANS } from "@/lib/pricing-copy";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CinematicCapabilityRail } from "./CinematicCapabilityRail";
import { CinematicPrivacyPaths, CinematicTrustCopy } from "./CinematicPrivacyPaths";
import { CinematicTestimonials } from "./CinematicTestimonials";
import { CINEMATIC_LANGUAGE_COUNT } from "../data/cinematic-languages";

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

/** One dominant message per chapter — no stacked overlays. */
export function CinematicChapterOverlays({ timeline }: Props) {
  const id = timeline.chapterId;
  const op = (chapterId: string) =>
    chapterOpacity(timeline, chapterId) * (1 - timeline.finaleCollapse);

  return (
    <>
      {timeline.visibility.capabilityRail && <CinematicCapabilityRail timeline={timeline} />}
      {timeline.visibility.testimonials && <CinematicTestimonials timeline={timeline} />}
      {timeline.visibility.privacyPaths && (
        <>
          <CinematicPrivacyPaths timeline={timeline} />
          <CinematicTrustCopy timeline={timeline} />
        </>
      )}

      {id === "problem" && op("problem") > 0.01 && (
        <motion.div
          className="absolute top-[6%] left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-4 text-center pointer-events-none"
          style={{ opacity: op("problem") }}
        >
          <h1 className="text-3xl sm:text-5xl font-semibold text-white leading-[1.1] tracking-tight">
            {CINEMATIC_CONTENT.hero.h1Lead}{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-sky-300">
              {CINEMATIC_CONTENT.hero.h1Accent}
            </span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Real-time captions and translation assistance built specifically for professional interpreters across OPI and VRI
            workflows.
          </p>
          <p className="mt-3 text-sm text-slate-500">{CINEMATIC_CONTENT.hero.noCard}</p>
        </motion.div>
      )}

      {id === "conversation" && op("conversation") > 0.01 && (
        <motion.div
          className="absolute bottom-[5%] left-1/2 -translate-x-1/2 z-20 max-w-xl px-4 text-center pointer-events-none"
          style={{ opacity: op("conversation") }}
        >
          <p className="text-xl sm:text-2xl font-semibold text-white">{CINEMATIC_CONTENT.product.liveDemoTitle}</p>
          <p className="mt-2 text-sm sm:text-base text-slate-300">{CINEMATIC_CONTENT.product.liveDemoSub}</p>
        </motion.div>
      )}

      {id === "languages" && op("languages") > 0.01 && (
        <motion.div
          className="absolute right-[4%] sm:right-[6%] top-1/2 -translate-y-1/2 z-20 max-w-sm text-right pointer-events-none"
          style={{ opacity: op("languages") }}
        >
          <p className="text-4xl sm:text-5xl font-bold text-white">{CINEMATIC_LANGUAGE_COUNT}+</p>
          <p className="text-lg font-semibold text-cyan-300 mt-1">languages</p>
          <p className="mt-4 text-xl sm:text-2xl font-semibold text-white leading-tight">
            {CINEMATIC_CONTENT.chapterFrames.ch4}
          </p>
          <p className="mt-3 text-sm text-slate-300">{CINEMATIC_CONTENT.chapterFrames.ch4Sub}</p>
        </motion.div>
      )}

      {id === "scale" && op("scale") > 0.01 && (
        <motion.div
          className="absolute right-[4%] sm:right-[6%] top-1/2 -translate-y-1/2 z-20 max-w-sm text-right pointer-events-none"
          style={{ opacity: op("scale") }}
        >
          <p className="text-2xl sm:text-3xl font-semibold text-white">{CINEMATIC_CONTENT.chapterFrames.ch7}</p>
          <p className="mt-2 text-sm text-slate-400">{CINEMATIC_CONTENT.chapterFrames.ch7Sub}</p>
          <p className="mt-4 text-base font-semibold text-white">{CINEMATIC_CONTENT.scale.enterprise.title}</p>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">{CINEMATIC_CONTENT.scale.enterprise.body}</p>
        </motion.div>
      )}

      {id === "pricing" && op("pricing") > 0.01 && (
        <motion.div
          className="absolute bottom-[4%] left-1/2 -translate-x-1/2 z-20 w-full max-w-3xl px-4 pointer-events-none"
          style={{ opacity: op("pricing") }}
        >
          <p className="text-xl sm:text-2xl font-semibold text-white text-center">{CINEMATIC_CONTENT.pricing.pageTitle}</p>
          <p className="mt-2 text-sm text-slate-400 text-center">{CINEMATIC_CONTENT.pricing.pageIntro}</p>
          <div className="mt-5 grid grid-cols-3 gap-3 max-w-2xl mx-auto">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.key}
                className={`cinematic-v2-glass rounded-xl p-4 text-center ${plan.highlight ? "ring-1 ring-cyan-400/60" : ""}`}
              >
                <p className="text-xs text-slate-400">{plan.name}</p>
                <p className={`text-xl font-bold mt-1 ${plan.highlight ? "text-cyan-300" : "text-white"}`}>
                  {plan.priceLabel}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {timeline.logoReveal > 0.01 && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4 pointer-events-auto"
          style={{ opacity: timeline.logoReveal }}
        >
          <motion.div
            initial={false}
            animate={{ scale: 0.4 + timeline.logoReveal * 0.6 }}
            className="w-28 h-28 rounded-2xl cinematic-v2-glass flex items-center justify-center mb-8 shadow-[0_0_140px_-8px_rgba(34,211,238,0.8)]"
          >
            <Zap className="w-14 h-14 text-cyan-400" strokeWidth={2.2} />
          </motion.div>
          <h2 className="text-4xl sm:text-6xl font-semibold text-white text-center whitespace-pre-line tracking-tight">
            {CINEMATIC_CONTENT.chapterFrames.ch9}
          </h2>
          <p className="mt-5 text-base sm:text-lg text-slate-300 text-center max-w-2xl">{CINEMATIC_CONTENT.hero.subhead}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
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
        </motion.div>
      )}
    </>
  );
}
