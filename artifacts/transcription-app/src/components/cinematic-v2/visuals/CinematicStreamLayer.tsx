import { motion } from "framer-motion";
import { CINEMATIC_MARIA_DIALOGUE } from "../data/cinematic-dialogue";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

/** Conversation-derived stream fragments — not decorative particles. */
function buildStreamFragments() {
  const fromDialogue = CINEMATIC_MARIA_DIALOGUE.flatMap((t, i) => [
    { lang: t.spokenLang, text: t.original, source: `turn-${i}-orig` },
    { lang: t.translationFor === "doctor" ? "EN" : "ES", text: t.translation, source: `turn-${i}-trans` },
  ]);

  const extraLangs = CINEMATIC_CONTENT.languages.streamCodes
    .filter((c) => c !== "EN" && c !== "ES")
    .map((lang, i) => ({
      lang,
      text:
        lang === "AR"
          ? "صباح الخير، متى بدأت الأعراض؟"
          : lang === "FR"
            ? "Bonjour, quand les symptômes ont-ils commencé ?"
            : lang === "ZH"
              ? "早上好，症状是什么时候开始的？"
              : lang === "DE"
                ? "Guten Morgen, wann haben die Symptome begonnen?"
                : lang === "PT"
                  ? "Bom dia, quando os sintomas começaram?"
                  : lang === "IT"
                    ? "Buongiorno, quando sono iniziati i sintomi?"
                    : lang === "JA"
                      ? "おはようございます。症状はいつからですか？"
                      : "안녕하세요, 증상은 언제 시작됐나요?",
      source: `lang-${lang}-${i}`,
    }));

  return [...fromDialogue, ...extraLangs];
}

const FRAGMENTS = buildStreamFragments();

const ANGLES = [-68, -42, -18, 8, 34, 58, 82, 108, 132, 156, -92, -118, 22, 46, 70, 94];

type Props = { timeline: CinematicTimeline };

export function CinematicStreamLayer({ timeline }: Props) {
  const { streamOpacity, finaleCollapse, dialogueProgress, p } = timeline;
  const visibleCount = Math.min(
    FRAGMENTS.length,
    Math.floor(dialogueProgress * FRAGMENTS.length) + (p > 0.34 ? 5 : 0),
  );

  if (streamOpacity <= 0.02) return null;

  const spread = 0.35 + (p - 0.34) * 0.55;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ opacity: streamOpacity * (1 - finaleCollapse) }}
    >
      {FRAGMENTS.slice(0, visibleCount).map((f, i) => {
        const angle = (ANGLES[i % ANGLES.length]! * Math.PI) / 180;
        const dist = (28 + (i % 5) * 9) * spread;
        const cx = 50;
        const cy = 50;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const emerge = Math.min(1, Math.max(0, (p - 0.34 - i * 0.015) / 0.12));

        return (
          <motion.div
            key={f.source}
            className="absolute max-w-[190px] cinematic-v2-glass rounded-lg px-2.5 py-2"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: `translate(-50%, -50%) rotate(${(i % 3) - 1}deg)`,
              opacity: emerge * 0.9,
            }}
            initial={false}
            animate={{ opacity: [emerge * 0.55, emerge * 0.95, emerge * 0.55] }}
            transition={{ duration: 3.5 + (i % 4) * 0.5, repeat: Infinity, delay: i * 0.15 }}
          >
            <span className="text-[8px] font-mono font-bold text-cyan-400">{f.lang}</span>
            <p
              className="text-[10px] text-slate-300/90 mt-0.5 leading-snug line-clamp-2"
              dir={f.lang === "AR" ? "rtl" : "ltr"}
            >
              {f.text}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}
