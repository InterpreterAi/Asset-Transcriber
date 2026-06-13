import { motion } from "framer-motion";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[3]!;

const STREAM_FRAGMENTS = [
  { lang: "EN", text: "Good morning, how can I help?" },
  { lang: "ES", text: "Buenos días, ¿cómo puedo ayudarle?" },
  { lang: "AR", text: "صباح الخير، كيف يمكنني المساعدة؟" },
  { lang: "FR", text: "Bonjour, comment puis-je vous aider?" },
  { lang: "ZH", text: "早上好，我能帮您什么？" },
  { lang: "DE", text: "Guten Morgen, wie kann ich helfen?" },
  { lang: "PT", text: "Bom dia, como posso ajudar?" },
  { lang: "IT", text: "Buongiorno, come posso aiutarla?" },
  { lang: "JA", text: "おはようございます。ご用件は？" },
  { lang: "KO", text: "안녕하세요, 무엇을 도와드릴까요?" },
];

export function Chapter04Languages() {
  return (
    <CinematicChapter chapter={ch}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <CinematicCopyBlock
          eyebrow={CINEMATIC_CONTENT.eyebrow.coverage}
          title={CINEMATIC_CONTENT.chapterFrames.ch4}
          subtitle={CINEMATIC_CONTENT.chapterFrames.ch4Sub}
        />
        <p className="mt-4 text-center text-sm text-slate-500 max-w-xl mx-auto">
          {CINEMATIC_CONTENT.languages.body}
        </p>

        <div className="mt-12 relative h-64 sm:h-72">
          {STREAM_FRAGMENTS.map((f, i) => (
            <motion.div
              key={f.lang}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06, duration: 0.5 }}
              className="absolute cinematic-v2-glass rounded-lg px-3 py-2 max-w-[200px]"
              style={{
                left: `${8 + (i % 5) * 18}%`,
                top: `${10 + Math.floor(i / 5) * 42}%`,
              }}
            >
              <span className="text-[9px] font-mono font-bold text-cyan-400">{f.lang}</span>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug" dir={f.lang === "AR" ? "rtl" : "ltr"}>
                {f.text}
              </p>
            </motion.div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 max-w-lg mx-auto">
          {CINEMATIC_CONTENT.howItWorks.steps[3]!.body}
        </p>
      </div>
    </CinematicChapter>
  );
}
