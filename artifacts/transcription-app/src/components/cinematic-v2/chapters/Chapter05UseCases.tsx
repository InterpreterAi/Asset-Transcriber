import { motion } from "framer-motion";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[4]!;

const NODES = [
  { id: "hospital", label: "Medical", snippet: CINEMATIC_CONTENT.capabilities.cards[0]!.body },
  { id: "legal", label: "Legal", snippet: "Professional workflow infrastructure for legal interpretation." },
  { id: "government", label: "Government", snippet: CINEMATIC_CONTENT.capabilities.cards[4]!.body },
  { id: "callcenter", label: "Call center", snippet: CINEMATIC_CONTENT.solutions.opi.body.slice(0, 80) + "…" },
  { id: "remote", label: "Remote business", snippet: CINEMATIC_CONTENT.solutions.vri.body.slice(0, 80) + "…" },
];

export function Chapter05UseCases() {
  return (
    <CinematicChapter chapter={ch} anchorId="solutions">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <CinematicCopyBlock
          eyebrow={CINEMATIC_CONTENT.eyebrow.solutions}
          title={CINEMATIC_CONTENT.chapterFrames.ch5}
          subtitle={CINEMATIC_CONTENT.solutions.subtitle}
        />

        <div className="mt-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {NODES.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="cinematic-v2-glass rounded-xl p-4 text-center"
            >
              <div className="w-2 h-2 rounded-full bg-cyan-400 mx-auto mb-3 shadow-[0_0_12px_rgba(34,211,238,0.5)]" />
              <p className="text-xs font-semibold text-white uppercase tracking-wider">{n.label}</p>
              <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">{n.snippet}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div className="cinematic-v2-glass rounded-xl p-5">
            <p className="text-sm font-semibold text-white">{CINEMATIC_CONTENT.solutions.opi.title}</p>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.solutions.opi.body}</p>
          </div>
          <div className="cinematic-v2-glass rounded-xl p-5">
            <p className="text-sm font-semibold text-white">{CINEMATIC_CONTENT.solutions.vri.title}</p>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.solutions.vri.body}</p>
          </div>
        </div>
      </div>
    </CinematicChapter>
  );
}
