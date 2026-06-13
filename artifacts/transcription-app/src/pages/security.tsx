import { Link } from "wouter";
import { Lock, Server, Eye, Shield, Activity, KeyRound, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { MarketingSecurityLockReveal } from "@/components/marketing/MarketingSecurityLockReveal";
import { marketingFade } from "@/components/marketing/marketing-motion";

const pillars = [
  { icon: Server, title: "Secure infrastructure", body: "Built on privacy-conscious, enterprise-inspired practices for hosting and separation of concerns." },
  { icon: Lock, title: "Encrypted communication", body: "Data in transit is protected using modern TLS. Sessions are designed for controlled, authenticated access." },
  { icon: Eye, title: "Privacy-first architecture", body: "Processing is session-focused with interpreter-controlled workflows—minimizing unnecessary retention by design." },
  { icon: Shield, title: "Session protection", body: "Authentication and access controls help ensure only entitled users reach live tooling." },
  { icon: Activity, title: "Monitoring systems", body: "Operational visibility supports reliability, incident response, and continuous health of the platform." },
  { icon: KeyRound, title: "Controlled access systems", body: "Role-appropriate access patterns and secure credential handling for administrative functions." },
  { icon: RefreshCw, title: "Continuous platform improvements", body: "We routinely review and refine security and privacy practices as the product evolves." },
] as const;

export default function Security() {
  return (
    <MarketingPageShell premiumNav dark>
      <section className="relative border-b border-white/10 bg-[#060B14] text-white pt-12 pb-8">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-4 text-center lg:text-left">
          <motion.p {...marketingFade(0)} className="text-sm font-semibold text-sky-400/90 tracking-wide uppercase mb-3">
            Trust center
          </motion.p>
          <motion.h1 {...marketingFade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-[1.15] max-w-2xl mx-auto lg:mx-0">
            Security &amp; trust for interpreter teams
          </motion.h1>
          <motion.p {...marketingFade(0.1)} className="mt-5 text-lg text-slate-300/95 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
            InterpreterAI is designed with HIPAA-focused thinking and privacy-conscious architecture. We describe our practices
            carefully—without claiming certifications we have not earned.
          </motion.p>
        </div>

        <MarketingSecurityLockReveal
          title="Unlock the trust layer"
          intro="Scroll to open the lock and review how InterpreterAI approaches security, privacy, and regulated workflows."
          bullets={pillars.map((p) => ({ title: p.title, body: p.body }))}
        />

        <motion.div
          {...marketingFade(0.15)}
          className="mt-4 mb-20 mx-auto max-w-3xl px-4 sm:px-6 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-8 sm:px-10 sm:py-10 text-center"
        >
          <p className="text-sm text-slate-300/85 leading-relaxed">
            For contractual or vendor-security questions, contact us through your usual InterpreterAI channel. Detailed policies are
            also summarized on our{" "}
            <Link href="/privacy" className="text-sky-300 font-medium hover:underline underline-offset-4">
              Privacy
            </Link>{" "}
            page.
          </p>
        </motion.div>
      </section>
    </MarketingPageShell>
  );
}
