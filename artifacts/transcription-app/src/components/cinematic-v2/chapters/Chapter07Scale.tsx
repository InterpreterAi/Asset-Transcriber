import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[6]!;

export function Chapter07Scale() {
  return (
    <CinematicChapter chapter={ch} anchorId="enterprise">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <CinematicCopyBlock
            align="left"
            title={CINEMATIC_CONTENT.chapterFrames.ch7}
            subtitle={CINEMATIC_CONTENT.chapterFrames.ch7Sub}
          />

          <div className="mt-8 cinematic-v2-glass rounded-2xl p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-cyan-400 mb-2">
              {CINEMATIC_CONTENT.eyebrow.productDev}
            </p>
            <p className="text-lg font-semibold text-white">{CINEMATIC_CONTENT.scale.feedbackTitle}</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.scale.feedbackBody}</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-cyan-400 hover:text-cyan-300"
            >
              {CINEMATIC_CONTENT.ctas.startTrial}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          <div className="cinematic-v2-glass rounded-2xl p-6">
            <p className="text-lg font-semibold text-white">{CINEMATIC_CONTENT.scale.enterprise.title}</p>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.scale.enterprise.body}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/security" className="text-xs font-semibold px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-200">
                {CINEMATIC_CONTENT.ctas.securityCenter}
              </Link>
              <Link href="/privacy" className="text-xs font-semibold px-3 py-2 rounded-lg border border-white/10 text-slate-300">
                {CINEMATIC_CONTENT.ctas.privacyPolicy}
              </Link>
            </div>
          </div>

          <ul className="space-y-6 pl-4 border-l border-cyan-500/20">
            {CINEMATIC_CONTENT.scale.timeline.map((step, i) => (
              <motion.li
                key={step.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/90">Step {i + 1}</p>
                <p className="text-base font-semibold text-white">{step.label}</p>
                <p className="mt-1 text-xs text-slate-400">{step.detail}</p>
              </motion.li>
            ))}
          </ul>

          {CINEMATIC_CONTENT.scale.enterprise.bullets.map((t) => (
            <div key={t} className="flex items-center gap-3 text-sm text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              {t}
            </div>
          ))}
        </div>
      </div>
    </CinematicChapter>
  );
}
