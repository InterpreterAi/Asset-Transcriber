import { Link } from "wouter";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  PRICING_PLANS,
  PRICING_SHARED_FEATURES,
  PRICING_SHARED_FEATURES_SECTION_TITLE,
  PRICING_COMPARISON_ROWS,
} from "@/lib/pricing-copy";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { marketingFade, marketingScale } from "@/components/marketing/marketing-motion";

export default function PricingPage() {
  return (
    <MarketingPageShell premiumNav>
      <section className="relative border-b border-border/40 overflow-hidden pt-16 pb-12">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <motion.p {...marketingFade(0)} className="text-sm font-semibold text-primary tracking-wide uppercase mb-3">
            Pricing
          </motion.p>
          <motion.h1 {...marketingFade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.65rem] font-semibold tracking-tight">
            Calm, transparent plans
          </motion.h1>
          <motion.p {...marketingFade(0.1)} className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Built for professional interpreters across OPI and VRI-style workflows. All plans include core session tooling with
            enterprise-minded security practices.
          </motion.p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <motion.div {...marketingFade(0)} className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 lg:items-stretch -mt-2">
          {PRICING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              {...marketingScale(0.06 * i)}
              whileHover={{ y: -8, transition: { duration: 0.25 } }}
              className={`relative flex flex-col rounded-2xl border p-8 marketing-premium-card ${
                plan.highlight
                  ? "border-primary/40 bg-white ring-2 ring-primary/20"
                  : "border-border/80 bg-white/95"
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
                className={`mt-8 w-full py-3 rounded-xl text-sm font-semibold text-center transition-all duration-200 ${
                  plan.highlight
                    ? "marketing-cta-glow bg-primary text-primary-foreground hover:bg-[#1D4ED8]"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                Start free trial
              </Link>
            </motion.div>
          ))}
        </motion.div>

        <motion.div {...marketingFade(0.12)} className="mt-14 rounded-2xl border border-border bg-white/95 backdrop-blur p-8 sm:p-10 marketing-premium-card">
          <h2 className="text-lg font-semibold">{PRICING_SHARED_FEATURES_SECTION_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Included across InterpreterAI plans where applicable.</p>
          <ul className="mt-6 grid sm:grid-cols-2 gap-3">
            {PRICING_SHARED_FEATURES.map((f, i) => (
              <motion.li key={f} {...marketingFade(0.02 * i)} className="flex gap-2 text-sm text-foreground/90">
                <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" strokeWidth={2.2} />
                {f}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <motion.div {...marketingFade(0.15)} className="mt-10 overflow-x-auto rounded-2xl border border-border bg-white/95 shadow-sm">
          <table className="w-full min-w-[640px] text-sm text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-slate-50/90">
                <th className="py-4 pl-6 pr-4 font-semibold w-[40%]">Capability</th>
                <th className="py-4 px-4 font-semibold">Basic</th>
                <th className="py-4 px-4 font-semibold text-primary">Professional</th>
                <th className="py-4 pr-6 pl-4 font-semibold">Platinum</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_COMPARISON_ROWS.map((row, idx) => (
                <motion.tr
                  key={row.label}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.03 }}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                >
                  <td className="py-3.5 pl-6 pr-4 text-muted-foreground">{row.label}</td>
                  <td className="py-3.5 px-4">{row.basic}</td>
                  <td className="py-3.5 px-4 font-medium">{row.professional}</td>
                  <td className="py-3.5 pr-6 pl-4">{row.platinum}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <motion.p {...marketingFade(0.18)} className="mt-8 text-center text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          OPI and VRI workflows are supported at the workspace level; compliance is always shared between your organization and your
          platform configuration. See{" "}
          <Link href="/security" className="text-primary font-medium hover:underline underline-offset-4">
            Security
          </Link>{" "}
          for our trust posture.
        </motion.p>
      </section>
    </MarketingPageShell>
  );
}
