import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Maria Santos",
    role: "Medical Interpreter",
    company: "Propio Language Services",
    initials: "MS",
    color: "from-blue-500 to-cyan-400",
    quote:
      "I used to miss words when patients spoke quickly. Now I catch everything. InterpreterAI is the only tool that actually understands medical terminology — cardiomyopathy, catheterization, dialysis. It gets it right every time.",
  },
  {
    name: "Ahmed Al-Rashidi",
    role: "Legal Interpreter",
    company: "LanguageLine Solutions",
    initials: "AA",
    color: "from-violet-500 to-purple-400",
    quote:
      "The Arabic translation is formal and precise — Modern Standard Arabic, no dialects, no ambiguity. For legal interpretation, accuracy is not optional. InterpreterAI is the only tool I trust in a courtroom.",
  },
  {
    name: "Rosa Fuentes",
    role: "OPI Interpreter",
    company: "GLOBO Language Services",
    initials: "RF",
    color: "from-emerald-500 to-teal-400",
    quote:
      "I work 8-hour shifts doing Spanish medical interpretation. InterpreterAI has completely changed how I perform. My clients notice the difference — fewer repetition requests, cleaner sessions, less fatigue.",
  },
  {
    name: "James Nguyen",
    role: "Court Interpreter",
    company: "Teleperformance",
    initials: "JN",
    color: "from-orange-500 to-amber-400",
    quote:
      "Vietnamese legal interpretation is incredibly complex — the terminology has no margin for error. InterpreterAI keeps up with every technical term and never loses context mid-sentence.",
  },
  {
    name: "Fatima Al-Hassan",
    role: "Medical Interpreter",
    company: "LanguageLine Solutions",
    initials: "FH",
    color: "from-pink-500 to-rose-400",
    quote:
      "As an Arabic interpreter handling ICU consultations, every word matters. The dual-column view lets me focus on the patient and the physician at the same time. I can't imagine going back.",
  },
  {
    name: "Carlos Mendez",
    role: "Insurance Interpreter",
    company: "Propio Language Services",
    initials: "CM",
    color: "from-sky-500 to-blue-400",
    quote:
      "Insurance claims are dense. InterpreterAI handles the legal-financial crossover perfectly — terms like subrogation, indemnification, deductible — all translated correctly in real time.",
  },
];

function Card({ t }: { t: typeof testimonials[number] }) {
  return (
    <div className="shrink-0 w-80 md:w-96 mx-3 p-6 rounded-2xl border border-border bg-card flex flex-col gap-4 hover:border-primary/20 transition-colors duration-300">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-primary text-primary" />
        ))}
      </div>
      <p className="text-foreground/85 text-sm leading-relaxed flex-1 italic">
        &ldquo;{t.quote}&rdquo;
      </p>
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold font-display shrink-0`}>
          {t.initials}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{t.name}</div>
          <div className="text-xs text-muted-foreground">{t.role} · {t.company}</div>
        </div>
      </div>
    </div>
  );
}

export default function Testimonials() {
  const doubled = [...testimonials, ...testimonials];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />

      <div className="container px-4 md:px-6 relative z-10 mb-14">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-primary text-sm font-semibold uppercase tracking-widest mb-4 text-center"
        >
          From the field
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.05 }}
          className="text-3xl md:text-5xl font-display font-bold text-white max-w-2xl mx-auto leading-tight text-center"
        >
          Interpreters who use it every day
        </motion.h2>
      </div>

      <div className="relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 z-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />

        <div
          className="flex items-stretch py-2"
          style={{
            animation: "marqueeReverse 40s linear infinite",
            width: "max-content",
          }}
        >
          {doubled.map((t, i) => (
            <Card key={i} t={t} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marqueeReverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </section>
  );
}
