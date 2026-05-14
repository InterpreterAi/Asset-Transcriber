import { Link } from "wouter";
import {
  Shield, Lock, Server, Eye, Activity, KeyRound, RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
});

const pillars = [
  {
    icon: Server,
    title: "Secure infrastructure",
    body: "Built on privacy-conscious, enterprise-inspired practices for hosting and separation of concerns.",
  },
  {
    icon: Lock,
    title: "Encrypted communication",
    body: "Data in transit is protected using modern TLS. Sessions are designed for controlled, authenticated access.",
  },
  {
    icon: Eye,
    title: "Privacy-first architecture",
    body: "Processing is session-focused with interpreter-controlled workflows—minimizing unnecessary retention by design.",
  },
  {
    icon: Shield,
    title: "Session protection",
    body: "Authentication and access controls help ensure only entitled users reach live tooling.",
  },
  {
    icon: Activity,
    title: "Monitoring systems",
    body: "Operational visibility supports reliability, incident response, and continuous health of the platform.",
  },
  {
    icon: KeyRound,
    title: "Controlled access systems",
    body: "Role-appropriate access patterns and secure credential handling for administrative functions.",
  },
  {
    icon: RefreshCw,
    title: "Continuous platform improvements",
    body: "We routinely review and refine security and privacy practices as the product evolves.",
  },
] as const;

export default function Security() {
  return (
    <div className="public-marketing-surface min-h-screen bg-[#F8FAFC] text-foreground overflow-x-hidden">
      <MarketingNav />

      <section className="relative border-b border-border/60 bg-[#0F172A] text-white">
        <div className="absolute inset-0 opacity-[0.35] bg-[radial-gradient(80%_60%_at_30%_0%,rgba(59,130,246,0.35),transparent_55%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20">
          <motion.p {...fade(0)} className="text-sm font-semibold text-blue-300/90 tracking-wide uppercase mb-3">
            Trust center
          </motion.p>
          <motion.h1 {...fade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-[1.15] max-w-2xl">
            Security &amp; trust for interpreter teams
          </motion.h1>
          <motion.p {...fade(0.1)} className="mt-5 text-lg text-slate-300/95 max-w-2xl leading-relaxed">
            InterpreterAI is designed with HIPAA-focused thinking and privacy-conscious architecture. We describe our practices
            carefully—without claiming certifications we have not earned.
          </motion.p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 lg:py-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {pillars.map(({ icon: Icon, title, body }, i) => (
            <motion.article
              key={title}
              {...fade(0.04 * i)}
              className="group rounded-2xl border border-border/80 bg-white p-8 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] hover:shadow-[0_12px_40px_-12px_rgba(37,99,235,0.12)] transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5 group-hover:bg-primary/15 transition-colors">
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{body}</p>
            </motion.article>
          ))}
        </div>

        <motion.div
          {...fade(0.15)}
          className="mt-16 rounded-2xl border border-border bg-slate-50/80 px-6 py-8 sm:px-10 sm:py-10 text-center max-w-3xl mx-auto"
        >
          <p className="text-sm text-muted-foreground leading-relaxed">
            For contractual or vendor-security questions, contact us through your usual InterpreterAI channel. Detailed policies are
            also summarized on our{" "}
            <Link href="/privacy" className="text-primary font-medium hover:underline underline-offset-4">
              Privacy
            </Link>{" "}
            page.
          </p>
        </motion.div>
      </section>

      <MarketingFooter />
    </div>
  );
}
