import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X } from "lucide-react";
import { MARKETING_TESTIMONIALS_ENRICHED } from "@/components/marketing/marketing-testimonials";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";
import { CINEMATIC_DIALOGUE } from "../data/cinematic-dialogue";
import type { CinematicTimeline } from "../motion/useCinematicTimeline";

type Props = { timeline: CinematicTimeline; inline?: boolean };

function MiniReplay({ lineIndex, onClose }: { lineIndex: number; onClose: () => void }) {
  const turn = CINEMATIC_DIALOGUE[lineIndex];
  if (!turn) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      className="fixed left-4 bottom-24 z-50 w-[min(340px,90vw)] cinematic-v2-glass rounded-xl p-4 pointer-events-auto shadow-2xl"
    >
      <div className="flex justify-between items-start mb-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Session replay</p>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-sm text-slate-100 leading-relaxed">{turn.original}</p>
      <p className="text-sm text-slate-300 italic mt-2 pl-3 border-l border-cyan-400/30">{turn.translation}</p>
    </motion.div>
  );
}

function TestimonialCard({
  stars,
  quote,
  feature,
  role,
  emerge,
  active,
  highlighted,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  stars: number;
  quote: string;
  feature: string;
  role?: string;
  emerge: number;
  active: boolean;
  highlighted: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`w-full text-left cinematic-v2-glass rounded-xl px-4 py-3 transition-all shrink-0 ${
        highlighted || active ? "ring-1 ring-cyan-400/50 bg-white/[0.06]" : ""
      }`}
      style={{ opacity: emerge, transform: `translateX(${(1 - emerge) * -12}px)` }}
    >
      <div className="flex gap-0.5 mb-1.5">
        {Array.from({ length: stars }).map((_, s) => (
          <Star key={s} className="w-3 h-3 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-sm text-slate-100 leading-snug">&ldquo;{quote}&rdquo;</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{feature}</p>
      {role && <p className="mt-0.5 text-[10px] text-slate-600">{role}</p>}
    </button>
  );
}

export function CinematicTestimonials({ timeline, inline }: Props) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const [hoverFeature, setHoverFeature] = useState<string | null>(null);

  if (!timeline.visibility.testimonials) return null;

  const intensity = timeline.testimonialIntensity;
  const items = MARKETING_TESTIMONIALS_ENRICHED;
  const loopItems = [...items, ...items];

  const header = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400/90 mb-2">
        {CINEMATIC_CONTENT.testimonials.eyebrow}
      </p>
      <h2 className="text-xl sm:text-2xl font-semibold text-white leading-tight">
        {CINEMATIC_CONTENT.testimonials.title}
      </h2>
      <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">{CINEMATIC_CONTENT.testimonials.subtitle}</p>
    </>
  );

  if (inline) {
    return (
      <div className="pointer-events-auto min-h-0 flex flex-col" style={{ opacity: intensity }}>
        {header}
        <div className="mt-4 relative h-[min(340px,42vh)] overflow-hidden mask-fade-y">
          <div className="cinematic-testimonial-scroll space-y-3 pr-1">
            {loopItems.map((t, i) => (
              <TestimonialCard
                key={`${t.feature}-${i}`}
                stars={t.stars}
                quote={t.quote}
                feature={t.feature}
                role={t.role}
                emerge={1}
                active={activeId === i % items.length}
                highlighted={hoverFeature === t.feature}
                onClick={() => setActiveId(activeId === i % items.length ? null : i % items.length)}
                onMouseEnter={() => setHoverFeature(t.feature)}
                onMouseLeave={() => setHoverFeature(null)}
              />
            ))}
          </div>
        </div>
        <AnimatePresence>
          {activeId !== null && items[activeId] && (
            <MiniReplay lineIndex={items[activeId]!.replayLine} onClose={() => setActiveId(null)} />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div
      className="absolute left-[3%] sm:left-[5%] top-1/2 -translate-y-1/2 z-20 max-w-md w-[min(420px,42vw)] pointer-events-auto"
      style={{ opacity: intensity }}
    >
      {header}
      <div className="mt-5 space-y-3">
        {items.slice(0, 6).map((t, i) => {
          const emerge = Math.min(1, Math.max(0, (timeline.chapterLocal - i * 0.08) / 0.35));
          return (
            <TestimonialCard
              key={i}
              stars={t.stars}
              quote={t.quote}
              feature={t.feature}
              role={t.role}
              emerge={emerge}
              active={activeId === i}
              highlighted={hoverFeature === t.feature}
              onClick={() => setActiveId(activeId === i ? null : i)}
              onMouseEnter={() => setHoverFeature(t.feature)}
              onMouseLeave={() => setHoverFeature(null)}
            />
          );
        })}
      </div>
      <AnimatePresence>
        {activeId !== null && items[activeId] && (
          <MiniReplay lineIndex={items[activeId]!.replayLine} onClose={() => setActiveId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
