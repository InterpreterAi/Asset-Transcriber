import { motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";

const stats = [
  { value: 62, suffix: "+", label: "Languages Supported" },
  { value: 98, suffix: "%", label: "Transcription Accuracy" },
  { value: 0.8, suffix: "s", label: "Avg. AI Latency", decimals: 1 },
  { value: 100, suffix: "%", label: "HIPAA Compliant" },
];

function CountUp({ to, suffix, decimals = 0 }: { to: number; suffix: string; decimals?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const duration = 1800;
    const start = Date.now();
    const frame = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(parseFloat((to * eased).toFixed(decimals)));
      if (progress < 1) requestAnimationFrame(frame);
      else setCount(to);
    };
    requestAnimationFrame(frame);
  }, [isInView, to, decimals]);

  return (
    <span ref={ref}>
      {decimals > 0 ? count.toFixed(decimals) : Math.round(count)}
      {suffix}
    </span>
  );
}

export default function Stats() {
  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
      <div className="container px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center group"
            >
              <div className="text-4xl md:text-5xl font-display font-bold text-white mb-2 tabular-nums group-hover:text-primary transition-colors duration-300">
                <CountUp to={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
              </div>
              <div className="text-sm md:text-base text-muted-foreground font-medium">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
