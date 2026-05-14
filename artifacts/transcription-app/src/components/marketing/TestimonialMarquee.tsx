import { Star } from "lucide-react";
import { MARKETING_TESTIMONIALS } from "./marketing-testimonials";

function Stars({ n }: { n: 4 | 5 }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: n }).map((_, i) => (
        <Star key={i} className="w-3.5 h-3.5 fill-[#3B82F6]/90 text-[#3B82F6]" strokeWidth={0} />
      ))}
    </div>
  );
}

function Card({ quote, stars }: { quote: string; stars: 4 | 5 }) {
  return (
    <div
      className="shrink-0 w-[340px] sm:w-[380px] rounded-2xl border border-white/60 bg-white/45 backdrop-blur-md px-7 py-6 marketing-soft-glow"
      style={{
        boxShadow: "0 0 40px -12px rgba(37, 99, 235, 0.15), 0 4px 24px -8px rgba(15, 23, 42, 0.08)",
      }}
    >
      <Stars n={stars} />
      <p className="mt-4 text-[15px] leading-relaxed text-foreground font-medium tracking-tight">{quote}</p>
      <p className="mt-5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Interpreter professional</p>
    </div>
  );
}

export function TestimonialMarquee() {
  const rowA = MARKETING_TESTIMONIALS;
  const mid = Math.ceil(MARKETING_TESTIMONIALS.length / 2);
  const rowB = [...MARKETING_TESTIMONIALS.slice(mid), ...MARKETING_TESTIMONIALS.slice(0, mid)];

  return (
    <div className="relative overflow-hidden py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 sm:w-40 bg-gradient-to-r from-[#F8FAFC] to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 sm:w-40 bg-gradient-to-l from-[#F8FAFC] to-transparent z-10" />

      <div className="flex gap-6 marketing-marquee-track pl-6">
        {[...rowA, ...rowA].map((t, i) => (
          <Card key={`a-${i}`} quote={t.quote} stars={t.stars} />
        ))}
      </div>

      <div className="flex gap-6 mt-6 marketing-marquee-track-reverse pr-6">
        {[...rowB, ...rowB].map((t, i) => (
          <Card key={`b-${i}`} quote={t.quote} stars={t.stars} />
        ))}
      </div>
    </div>
  );
}
