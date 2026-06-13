import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Mic2, Languages, Captions } from "lucide-react";

const CAPTION_STREAMS = [
  { en: "Good morning, how can I help you today?", es: "Buenos días, ¿cómo puedo ayudarle hoy?", side: "left" as const },
  { en: "The rotator cuff requires physical therapy.", es: "El manguito rotador requiere fisioterapia.", side: "right" as const },
  { en: "I need to schedule a follow-up appointment.", es: "Necesito programar una cita de seguimiento.", side: "left" as const },
] as const;

function HeroCaptionStream() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setActive((i) => (i + 1) % CAPTION_STREAMS.length), 4200);
    return () => window.clearInterval(id);
  }, []);

  const stream = CAPTION_STREAMS[active]!;
  const stripe = stream.side === "left" ? "bg-blue-500" : "bg-amber-400";
  const lang = stream.side === "left" ? "EN" : "ES";

  return (
    <div className="rounded-xl border border-white/10 bg-[#0b0e14]/90 p-4 space-y-4 min-h-[220px]">
      <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
        <span className="flex items-center gap-1.5 text-sky-300">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          Live assist
        </span>
        <span>English ↔ Spanish</span>
      </div>
      <AudioWaveBars />
      <motion.div
        key={active}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="flex min-w-0 items-start"
      >
        <div className={`w-1 shrink-0 self-stretch rounded-full min-h-[2.5rem] ${stripe}`} />
        <div className="min-w-0 flex-1 pl-3 space-y-2">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500/80">{lang}</div>
          <p className="text-sm text-slate-100 leading-relaxed">{stream.en}</p>
          <p className="text-sm text-slate-300/90 italic leading-relaxed border-l border-white/10 pl-3">{stream.es}</p>
        </div>
      </motion.div>
    </div>
  );
}

function AudioWaveBars() {
  const heights = [14, 22, 36, 28, 44, 32, 48, 26, 40, 18, 34, 42, 20, 38, 30, 46, 24, 36, 16, 40];
  return (
    <div className="flex items-end justify-center gap-[2px] sm:gap-[3px] h-16 sm:h-20 w-full max-w-md mx-auto opacity-70" aria-hidden>
      {heights.map((h, i) => (
        <motion.div
          key={i}
          className="w-[2px] sm:w-[3px] rounded-full bg-gradient-to-t from-sky-500/30 via-sky-400/70 to-white/90"
          animate={{ height: [h * 0.35, h, h * 0.4] }}
          transition={{
            duration: 0.7 + (i % 4) * 0.15,
            repeat: Infinity,
            repeatType: "reverse",
            delay: i * 0.05,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function FloatingCaptionCard({
  en,
  es,
  className,
  delay,
}: {
  en: string;
  es: string;
  className?: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={`marketing-glass-card pointer-events-none hidden xl:block absolute max-w-[240px] ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Captions className="w-3 h-3 text-sky-300/90" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-sky-300/80">Live assist</span>
      </div>
      <p className="text-[11px] text-white/90 leading-snug font-medium">{en}</p>
      <div className="my-2 h-px bg-white/10" />
      <p className="text-[11px] text-sky-200/85 leading-snug font-medium" dir="auto">{es}</p>
    </motion.div>
  );
}

/** Cinematic hero — reel-inspired motion, interpreter-focused visuals, same marketing copy. */
export function MarketingHeroPremium() {
  const { scrollY } = useScroll();
  const demoY = useTransform(scrollY, [0, 400], [0, 60]);
  const glowOpacity = useTransform(scrollY, [0, 300], [1, 0.4]);

  return (
    <section className="relative min-h-[min(100vh,920px)] flex flex-col justify-center overflow-hidden bg-[#060B14] text-white">
      <div className="absolute inset-0 marketing-aurora-bg" aria-hidden />
      <motion.div style={{ opacity: glowOpacity }} className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[8%] left-[10%] w-[min(520px,70vw)] h-[min(520px,70vw)] rounded-full bg-sky-500/[0.12] blur-[100px] marketing-float-slow" />
        <div className="absolute bottom-[5%] right-[5%] w-[min(400px,55vw)] h-[min(400px,55vw)] rounded-full bg-blue-600/[0.14] blur-[90px] marketing-float-slow-reverse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,95vw)] h-[min(400px,50vh)] rounded-full bg-primary/[0.06] blur-[120px]" />
      </motion.div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
        aria-hidden
      />

      <FloatingCaptionCard
        en={CAPTION_STREAMS[0].en}
        es={CAPTION_STREAMS[0].es}
        className="top-[18%] left-[4%] -rotate-2"
        delay={0.9}
      />
      <FloatingCaptionCard
        en={CAPTION_STREAMS[1].en}
        es={CAPTION_STREAMS[1].es}
        className="top-[42%] right-[3%] rotate-1"
        delay={1.15}
      />
      <FloatingCaptionCard
        en={CAPTION_STREAMS[2].en}
        es={CAPTION_STREAMS[2].es}
        className="bottom-[22%] left-[6%] rotate-1"
        delay={1.35}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-24 pb-12 lg:pt-28 lg:pb-16 w-full">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="text-center lg:text-left">
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold tracking-[0.2em] uppercase text-sky-300/90 mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-400" />
              </span>
              Professional interpreter infrastructure
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.06 }}
              className="text-[2rem] sm:text-5xl lg:text-[3.25rem] xl:text-[3.5rem] font-semibold tracking-tight leading-[1.1] text-white"
            >
              Real-Time Support for{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-white to-sky-300">
                Professional Interpreters
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300/90 max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              Real-time captions and multilingual language assistance designed for professional OPI and VRI interpretation workflows
              across 36 supported languages.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.2 }}
              className="mt-8 flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4"
            >
              <Link
                href="/signup"
                className="marketing-cta-glow inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold text-white bg-primary hover:bg-[#1D4ED8] transition-all duration-300 hover:-translate-y-0.5 w-full sm:w-auto min-w-[200px]"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/security"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-[15px] font-semibold border border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.1] hover:border-white/25 backdrop-blur-sm transition-all duration-300 w-full sm:w-auto min-w-[200px]"
              >
                View Security &amp; Privacy
              </Link>
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mt-4 text-sm text-slate-400"
            >
              No credit card required to start.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="mt-10 hidden sm:block"
            >
              <AudioWaveBars />
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400/90"
            >
              {[
                { icon: Mic2, label: "Hear & capture" },
                { icon: Captions, label: "Live captions" },
                { icon: Languages, label: "Translation assist" },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04]">
                  <Icon className="w-3.5 h-3.5 text-sky-400/90" />
                  {label}
                </span>
              ))}
            </motion.div>
          </div>

          <motion.div
            style={{ y: demoY }}
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="marketing-laptop-frame">
              <div className="marketing-laptop-screen p-3 sm:p-4">
                <HeroCaptionStream />
              </div>
              <div className="marketing-laptop-base" aria-hidden />
            </div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-slate-500"
        aria-hidden
      >
        <span className="text-[10px] uppercase tracking-[0.25em]">Scroll</span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="w-px h-8 bg-gradient-to-b from-transparent via-slate-500 to-transparent"
        />
      </motion.div>
    </section>
  );
}
