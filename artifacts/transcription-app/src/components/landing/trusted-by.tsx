import { motion } from "framer-motion";

const logos = [
  "Propio Language Services",
  "GLOBO Language Services",
  "Teleperformance",
  "LanguageLine Solutions",
];

export default function TrustedBy() {
  const doubled = [...logos, ...logos, ...logos];

  return (
    <section className="py-12 border-y border-border/50 bg-black/20 overflow-hidden">
      <div className="container px-4 md:px-6 mb-8">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-sm font-medium text-muted-foreground uppercase tracking-widest"
        >
          Trusted daily by professional OPI/VRI interpreters at
        </motion.p>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-r from-black/20 to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-20 z-10 bg-gradient-to-l from-black/20 to-transparent pointer-events-none" />

        <div
          className="flex items-center"
          style={{
            animation: "marquee 28s linear infinite",
            width: "max-content",
          }}
        >
          {doubled.map((logo, i) => (
            <div key={`${logo}-${i}`} className="shrink-0 px-8 flex items-center justify-center">
              <span className="text-white/70 font-display font-semibold text-lg">{logo}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </section>
  );
}
