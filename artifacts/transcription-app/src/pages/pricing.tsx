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
import { marketingFade } from "@/components/marketing/marketing-motion";

export default function PricingPage() {
  return (
    <MarketingPageShell premiumNav dark>
      <section className="relative border-b border-white/10 bg-[#060B14] text-white pt-12 pb-16">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-4">
          <motion.p {...marketingFade(0)} className="text-sm font-semibold text-sky-400/90 tracking-wide uppercase mb-3">
            Pricing
          </motion.p>
          <motion.h1 {...marketingFade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.65rem] font-semibold tracking-tight">
            Calm, transparent plans
          </motion.h1>
          <motion.p {...marketingFade(0.1)} className="mt-4 text-lg text-slate-300 max-w-2xl leading-relaxed">
            Built for professional interpreters across OPI and VRI-style workflows with enterprise-minded security practices.
          </motion.p>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
          <motion.div
            {...marketingFade(0)}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-3xl mx-auto md:items-stretch"
          >
            {PRICING_PLANS.map((plan, i) => (
              <motion.div
                key={plan.key}
                {...marketingFade(0.06 * i)}
                className={`relative flex flex-col rounded-2xl cinematic-v2-glass p-8 ${
                  plan.highlight ? "ring-1 ring-cyan-400/50" : ""
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-wider text-[#030508] bg-cyan-400 px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <p className={`text-sm font-medium ${plan.highlight ? "text-cyan-300" : "text-slate-400"}`}>{plan.name}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl sm:text-[2.75rem] font-semibold tracking-tight">{plan.priceLabel}</span>
                  <span className="text-slate-400 text-sm font-medium">/mo</span>
                </div>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed min-h-[2.5rem]">{plan.tagline}</p>
                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.slice(0, 7).map((f) => (
                    <li key={f} className="flex gap-3 text-sm leading-snug text-slate-200">
                      <Check className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlight ? "text-cyan-400" : "text-cyan-400/80"}`} strokeWidth={2.2} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/signup?plan=${plan.key}`}
                  className={`mt-8 w-full py-3 rounded-xl text-sm font-semibold text-center transition-all duration-200 ${
                    plan.highlight
                      ? "bg-cyan-400 text-[#030508] hover:bg-cyan-300"
                      : "border border-white/15 text-white hover:bg-white/5"
                  }`}
                >
                  Start free trial
                </Link>
              </motion.div>
            ))}
          </motion.div>

          <motion.div {...marketingFade(0.12)} className="mt-14 cinematic-v2-glass rounded-2xl p-8 sm:p-10 max-w-3xl mx-auto">
            <h2 className="text-lg font-semibold text-white">{PRICING_SHARED_FEATURES_SECTION_TITLE}</h2>
            <p className="mt-1 text-sm text-slate-400">Included across InterpreterAI plans where applicable.</p>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3">
              {PRICING_SHARED_FEATURES.map((f) => (
                <li key={f} className="flex gap-2 text-sm text-slate-200">
                  <Check className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" strokeWidth={2.2} />
                  {f}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div {...marketingFade(0.15)} className="mt-10 overflow-x-auto cinematic-v2-glass rounded-2xl max-w-3xl mx-auto">
            <table className="w-full min-w-[480px] text-sm text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-4 pl-6 pr-4 font-semibold text-slate-300 w-[45%]">Capability</th>
                  <th className="py-4 px-4 font-semibold text-slate-300">Basic</th>
                  <th className="py-4 pr-6 pl-4 font-semibold text-cyan-300">Professional</th>
                </tr>
              </thead>
              <tbody>
                {PRICING_COMPARISON_ROWS.map((row, idx) => (
                  <tr key={row.label} className={idx % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"}>
                    <td className="py-3.5 pl-6 pr-4 text-slate-400">{row.label}</td>
                    <td className="py-3.5 px-4 text-slate-200">{row.basic}</td>
                    <td className="py-3.5 pr-6 pl-4 font-medium text-white">{row.professional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <motion.p {...marketingFade(0.18)} className="mt-8 text-center text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">
              Sign in
            </Link>{" "}
            to manage billing or upgrade your plan.
          </motion.p>
          <motion.p {...marketingFade(0.2)} className="mt-4 text-center text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
            Paid orders are processed by Paddle.com as Merchant of Record. By purchasing you agree to our{" "}
            <Link href="/terms" className="text-slate-400 hover:text-slate-200 underline">
              Terms
            </Link>
            ,{" "}
            <Link href="/privacy" className="text-slate-400 hover:text-slate-200 underline">
              Privacy Policy
            </Link>
            , and{" "}
            <Link href="/refund" className="text-slate-400 hover:text-slate-200 underline">
              Refund Policy
            </Link>
            .
          </motion.p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
