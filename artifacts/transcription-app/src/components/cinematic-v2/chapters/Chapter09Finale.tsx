import { Link } from "wouter";
import { motion, useTransform } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { useCinematicStory } from "../CinematicStoryContext";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[8]!;

export function Chapter09Finale() {
  const { scrollYProgress } = useCinematicStory();
  const collapse = useTransform(scrollYProgress, [0.94, 0.98, 1], [1, 0.4, 0]);
  const logoScale = useTransform(scrollYProgress, [0.96, 1], [0.6, 1]);

  return (
    <CinematicChapter chapter={ch}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative">
        <motion.div style={{ opacity: collapse }} className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-cyan-500/10 blur-3xl" />
        </motion.div>

        <motion.div style={{ scale: logoScale }} className="mb-10 flex justify-center">
          <div className="w-16 h-16 rounded-2xl cinematic-v2-glass flex items-center justify-center">
            <Zap className="w-8 h-8 text-cyan-400" strokeWidth={2.2} />
          </div>
        </motion.div>

        <CinematicCopyBlock title={CINEMATIC_CONTENT.chapterFrames.ch9} subtitle={CINEMATIC_CONTENT.hero.subhead} />

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold text-[#030508] bg-cyan-400 hover:bg-cyan-300 transition-all w-full sm:w-auto min-w-[200px]"
          >
            {CINEMATIC_CONTENT.ctas.startTrial}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/security"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] w-full sm:w-auto min-w-[200px]"
          >
            {CINEMATIC_CONTENT.ctas.viewSecurity}
          </Link>
        </div>

        <p className="mt-10 text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
          <strong className="text-slate-400">Notice:</strong> {CINEMATIC_CONTENT.legal.notice}
        </p>

        <footer className="mt-16 pt-8 border-t border-white/[0.06] text-xs text-slate-500">
          <p>{CINEMATIC_CONTENT.scale.footerTagline}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-6">
            <Link href="/privacy" className="hover:text-slate-300">
              Privacy
            </Link>
            <Link href="/security" className="hover:text-slate-300">
              Security
            </Link>
            <Link href="/terms" className="hover:text-slate-300">
              Terms
            </Link>
            <Link href="/pricing" className="hover:text-slate-300">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-slate-300">
              Login
            </Link>
          </div>
          <p className="mt-6">© {new Date().getFullYear()} InterpreterAI · All rights reserved</p>
        </footer>
      </div>
    </CinematicChapter>
  );
}
