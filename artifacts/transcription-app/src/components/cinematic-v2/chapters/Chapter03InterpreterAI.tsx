import { motion } from "framer-motion";
import { Mic2, Captions, Languages } from "lucide-react";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[2]!;

export function Chapter03InterpreterAI() {
  return (
    <CinematicChapter chapter={ch}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row items-center gap-12">
        <div className="relative flex-shrink-0 w-48 h-48 sm:w-56 sm:h-56">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-400/25 via-sky-500/15 to-violet-500/10 blur-xl"
          />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
            className="absolute inset-4 rounded-full border border-cyan-400/20"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 rounded-2xl cinematic-v2-glass flex items-center justify-center">
              <Mic2 className="w-9 h-9 text-cyan-300" />
            </div>
          </div>
        </div>

        <div className="flex-1">
          <CinematicCopyBlock
            align="left"
            title={CINEMATIC_CONTENT.chapterFrames.ch3}
            subtitle={CINEMATIC_CONTENT.hero.subhead}
          />
          <p className="mt-4 text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-sky-200 to-cyan-200">
            {CINEMATIC_CONTENT.hero.h1}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {CINEMATIC_CONTENT.hero.pills.map((label, i) => {
              const Icon = [Mic2, Captions, Languages][i]!;
              return (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full cinematic-v2-glass text-[11px] font-semibold uppercase tracking-wider text-slate-300"
                >
                  <Icon className="w-3.5 h-3.5 text-cyan-400" />
                  {label}
                </span>
              );
            })}
          </div>
          <div className="mt-8 space-y-4">
            {CINEMATIC_CONTENT.howItWorks.steps.slice(0, 2).map((s) => (
              <div key={s.title} className="cinematic-v2-glass rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-white">{s.title}</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </CinematicChapter>
  );
}
