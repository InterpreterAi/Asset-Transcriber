import { motion } from "framer-motion";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[5]!;

export function Chapter06Trust() {
  return (
    <CinematicChapter chapter={ch}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <CinematicCopyBlock
          eyebrow={CINEMATIC_CONTENT.eyebrow.trustCenter}
          title={CINEMATIC_CONTENT.chapterFrames.ch6}
          subtitle={CINEMATIC_CONTENT.trust.landingIntro}
        />

        <div className="mt-12 space-y-3">
          {CINEMATIC_CONTENT.trust.bullets.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="cinematic-v2-glass rounded-xl px-5 py-4 flex gap-4 items-start border-l-2 border-cyan-400/40"
            >
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">{b.title}</p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{b.body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
          {CINEMATIC_CONTENT.trust.securityHero}
        </p>
      </div>
    </CinematicChapter>
  );
}
