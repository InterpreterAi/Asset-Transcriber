import { motion } from "framer-motion";
import { CINEMATIC_MARIA_DIALOGUE } from "../data/cinematic-dialogue";
import { CINEMATIC_LANGUAGE_CATALOG } from "../data/cinematic-languages";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

function buildStreamFragments() {
  const fromDialogue = CINEMATIC_MARIA_DIALOGUE.flatMap((t, i) => [
    { lang: t.spokenLang, text: t.original, source: `turn-${i}-orig` },
    { lang: t.translationFor === "doctor" ? "EN" : "ES", text: t.translation, source: `turn-${i}-trans` },
  ]);

  const samples: Record<string, string> = {
    AR: "صباح الخير، متى بدأت الأعراض؟",
    FR: "Bonjour, quand les symptômes ont-ils commencé ?",
    ZH: "早上好，症状是什么时候开始的？",
    DE: "Guten Morgen, wann haben die Symptome begonnen?",
    PT: "Bom dia, quando os sintomas começaram?",
    IT: "Buongiorno, quando sono iniziati i sintomi?",
    JA: "おはようございます。症状はいつからですか？",
    KO: "안녕하세요, 증상은 언제 시작됐나요?",
    RU: "Доброе утро, когда начались симптомы?",
    HI: "नमस्ते, लक्षण कब शुरू हुए?",
    TR: "Günaydın, belirtiler ne zaman başladı?",
    VI: "Xin chào, triệu chứng bắt đầu khi nào?",
    TH: "สวัสดี อาการเริ่มเมื่อไหร่?",
    PL: "Dzień dobry, kiedy zaczęły się objawy?",
    NL: "Goedemorgen, wanneer begonnen de symptomen?",
  };

  const extraLangs = CINEMATIC_LANGUAGE_CATALOG.filter((l) => l.code !== "EN" && l.code !== "ES").map((lang, i) => ({
    lang: lang.code,
    text: samples[lang.code] ?? `${lang.label} — live interpretation support`,
    source: `lang-${lang.code}-${i}`,
  }));

  return [...fromDialogue, ...extraLangs];
}

const FRAGMENTS = buildStreamFragments();
const ANGLES = [-68, -42, -18, 8, 34, 58, 82, 108, 132, 156, -92, -118, 22, 46, 70, 94, -128, 118, 0, 180];

type Props = { timeline: CinematicTimeline };

export function CinematicStreamLayer({ timeline }: Props) {
  const { streamOpacity, finaleCollapse, p, languageWallIntensity } = timeline;
  const visibleCount = Math.min(FRAGMENTS.length, 8 + Math.floor(languageWallIntensity * 24));

  if (streamOpacity <= 0.02) return null;

  const spread = 0.38 + languageWallIntensity * 0.5;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ opacity: streamOpacity * (1 - finaleCollapse) }}
    >
      {FRAGMENTS.slice(0, visibleCount).map((f, i) => {
        const angle = (ANGLES[i % ANGLES.length]! * Math.PI) / 180;
        const dist = (30 + (i % 6) * 8) * spread;
        const cx = 50;
        const cy = 50;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const emerge = Math.min(1, Math.max(0, (p - 0.36 - i * 0.012) / 0.14));

        return (
          <motion.div
            key={f.source}
            className="absolute max-w-[200px] cinematic-v2-glass rounded-lg px-3 py-2"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
              opacity: emerge * 0.9,
            }}
            initial={false}
            animate={{ opacity: [emerge * 0.55, emerge * 0.95, emerge * 0.55] }}
            transition={{ duration: 3.5 + (i % 4) * 0.5, repeat: Infinity, delay: i * 0.15 }}
          >
            <span className="text-[10px] font-mono font-bold text-cyan-400">{f.lang}</span>
            <p
              className="text-[11px] sm:text-xs text-slate-200/90 mt-0.5 leading-snug line-clamp-2"
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
