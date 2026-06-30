import { motion } from "framer-motion";

const logos = [
  {
    src: "https://logo.clearbit.com/languageline.com",
    alt: "LanguageLine Solutions",
    className: "h-12 md:h-14 object-contain",
  },
  {
    src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Teleperformance_logo.svg/640px-Teleperformance_logo.svg.png",
    alt: "Teleperformance",
    className: "h-8 md:h-10 object-contain",
  },
  {
    src: "https://logo.clearbit.com/propio.com",
    alt: "Propio Language Services",
    className: "h-10 md:h-12 object-contain",
  },
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
            <div key={`${logo.alt}-${i}`} className="shrink-0 px-8 flex items-center justify-center">
              <img
                src={logo.src}
                alt={logo.alt}
                className={`${logo.className} opacity-70 hover:opacity-95 transition-opacity duration-300`}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
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
