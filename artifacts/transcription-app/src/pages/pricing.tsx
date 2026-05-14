import { Link } from "wouter";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  PRICING_PLANS,
  PRICING_SHARED_FEATURES,
  PRICING_SHARED_FEATURES_SECTION_TITLE,
  PRICING_COMPARISON_ROWS,
} from "@/lib/pricing-copy";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const, delay },
});

export default function PricingPage() {
  return (
    <div className="public-marketing-surface min-h-screen bg-[#F8FAFC] text-foreground overflow-x-hidden">
      <MarketingNav />

      <section className="relative border-b border-border/60 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-white via-[#F8FAFC] to-[#F1F5F9]" />
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(70%_50%_at_50%_-10%,rgba(37,99,235,0.14),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12 lg:pt-20 lg:pb-16 text-center">
          <motion.p {...fade(0)} className="text-sm font-semibold text-primary tracking-wide uppercase mb-3">
            Pricing
          </motion.p>
          <motion.h1 {...fade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.65rem] font-semibold tracking-tight text-foreground">
            Calm, transparent plans
          </motion.h1>
          <motion.p {...fade(0.1)} className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Built for professional interpreters across OPI and VRI-style workflows. All plans include core session tooling with
            enterprise-minded security practices.
          </motion.p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 -mt-4 pb-16">
        <motion.div {...fade(0)} className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 lg:items-stretch">
          {PRICING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              {...fade(0.06 * i)}
              className={`relative flex flex-col rounded-2xl border p-8 transition-all duration-300 hover:-translate-y-1 ${
                plan.highlight
                  ? "border-primary/40 bg-white shadow-[0_20px_50px_-20px_rgba(37,99,235,0.35)] ring-2 ring-primary/20"
                  : "border-border/80 bg-white/90 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.1)] hover:shadow-[0_16px_40px_-16px_rgba(37,99,235,0.15)]"
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground bg-primary px-3 py-1 rounded-full shadow-sm">
                  Most popular
                </span>
              )}
              <p className={`text-sm font-medium ${plan.highlight ? "text-primary" : "text-muted-foreground"}`}>{plan.name}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl sm:text-[2.75rem] font-semibold tracking-tight">{plan.priceLabel}</span>
                <span className="text-muted-foreground text-sm font-medium">/mo</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed min-h-[2.5rem]">{plan.tagline}</p>
              <ul className="mt-8 space-y-3 flex-1">
                {plan.features.slice(0, 6).map((f) => (
                  <li key={f} className="flex gap-3 text-sm leading-snug text-foreground/90">
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlight ? "text-primary" : "text-primary/80"}`} strokeWidth={2.2} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-8 w-full py-3 rounded-xl text-sm font-semibold text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.99] ${
                  plan.highlight
                    ? "bg-primary text-primary-foreground hover:bg-[#1D4ED8] shadow-md"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                Start free trial
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div {...fade(0.12)} className="mt-14 rounded-2xl border border-border bg-white p-8 sm:p-10">
          <h2 className="text-lg font-semibold text-foreground">{PRICING_SHARED_FEATURES_SECTION_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Included across InterpreterAI plans where applicable.</p>
          <ul className="mt-6 grid sm:grid-cols-2 gap-3">
            {PRICING_SHARED_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-foreground/90">
                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" strokeWidth={2.2} />
                {f}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div {...fade(0.15)} className="mt-10 overflow-x-auto rounded-2xl border border-border bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-slate-50/90">
                <th className="py-4 pl-6 pr-4 font-semibold text-foreground w-[40%]">Capability</th>
                <th className="py-4 px-4 font-semibold text-foreground">Basic</th>
                <th className="py-4 px-4 font-semibold text-primary">Professional</th>
                <th className="py-4 pr-6 pl-4 font-semibold text-foreground">Platinum</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_COMPARISON_ROWS.map((row, idx) => (
                <tr key={row.label} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                  <td className="py-3.5 pl-6 pr-4 text-muted-foreground">{row.label}</td>
                  <td className="py-3.5 px-4 text-foreground">{row.basic}</td>
                  <td className="py-3.5 px-4 text-foreground font-medium">{row.professional}</td>
                  <td className="py-3.5 pr-6 pl-4 text-foreground">{row.platinum}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <motion.p {...fade(0.18)} className="mt-8 text-center text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          OPI and VRI workflows are supported at the workspace level; compliance is always shared between your organization and your
          platform configuration. See{" "}
          <Link href="/security" className="text-primary font-medium hover:underline underline-offset-4">
            Security
          </Link>{" "}
          for our trust posture.
        </motion.p>
      </section>

      <MarketingFooter />
    </div>
  );
}
