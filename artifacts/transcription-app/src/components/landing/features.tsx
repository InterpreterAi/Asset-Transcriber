import { motion } from "framer-motion";
import { Mic2, Languages, ShieldCheck, Layers, Zap, Globe } from "lucide-react";

const features = [
  {
    icon: Mic2,
    title: "Real-Time Transcription",
    description:
      "Sub-second speech-to-text across 62 languages. Powered by next-generation AI that understands accents, speed, and medical terminology without training.",
    glow: "rgba(0,123,255,0.2)",
  },
  {
    icon: Languages,
    title: "Dual-Column Translation",
    description:
      "Original and translated text appear side-by-side in real time — one column per speaker. Scroll independently, never lose context, never lose your place.",
    glow: "rgba(0,200,150,0.15)",
  },
  {
    icon: Layers,
    title: "Medical & Legal Terminology",
    description:
      "Built-in glossary of 1,000+ domain-specific terms for medical, legal, and insurance interpretation. Cardiomyopathy, catheterization, jurisprudence — handled precisely.",
    glow: "rgba(180,100,255,0.15)",
  },
  {
    icon: ShieldCheck,
    title: "HIPAA Compliant by Default",
    description:
      "No audio is ever stored. No recordings. No training on your sessions. What happens in the room stays in the room — by design, not by policy.",
    glow: "rgba(50,200,100,0.15)",
  },
  {
    icon: Zap,
    title: "OPI & VRI Ready",
    description:
      "Works with your existing phone or video remote interpretation workflow. No hardware required. Launch from any browser in under 5 seconds.",
    glow: "rgba(0,123,255,0.2)",
  },
  {
    icon: Globe,
    title: "62 Language Pairs",
    description:
      "Arabic, Spanish, Mandarin, Polish, Portuguese, French, Russian, Vietnamese, and 54 more. Formal register only — no dialects, no ambiguity.",
    glow: "rgba(255,180,0,0.12)",
  },
];

export default function Features() {
  return (
    <section id="product" className="py-24 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
      <div className="container px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-primary text-sm font-semibold uppercase tracking-widest mb-4"
          >
            Built for professionals
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="text-3xl md:text-5xl font-display font-bold text-white max-w-3xl mx-auto leading-tight"
          >
            Every feature earned its place
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto"
          >
            No filler. No bloat. Tools that professional interpreters actually need — built by people who listened.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="group relative p-6 rounded-xl border border-border bg-card hover:border-primary/30 transition-all duration-300 overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-xl"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${feature.glow}, transparent 70%)` }}
                />
                <div className="relative z-10">
                  <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:border-primary/40 group-hover:bg-primary/15 transition-all duration-300">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2 font-display">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
