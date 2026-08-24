import { Link } from "wouter";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import {
  PRICING_PLANS,
  PRICING_SHARED_FEATURES,
  PRICING_SHARED_FEATURES_SECTION_TITLE,
  PRICING_COMPARISON_ROWS,
} from "@/lib/pricing-copy";
import { CinematicChapter } from "../CinematicChapter";
import { CinematicCopyBlock } from "../CinematicCopyBlock";
import { CINEMATIC_CHAPTERS } from "../data/cinematic-chapters";
import { CINEMATIC_CONTENT } from "../data/cinematic-content";

const ch = CINEMATIC_CHAPTERS[7]!;

export function Chapter08Pricing() {
  return (
    <CinematicChapter chapter={ch}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <CinematicCopyBlock
          eyebrow={CINEMATIC_CONTENT.eyebrow.pricing}
          title={CINEMATIC_CONTENT.pricing.pageTitle}
          subtitle={CINEMATIC_CONTENT.pricing.pageIntro}
        />
        <p className="text-center text-sm text-slate-500 mt-2">{CINEMATIC_CONTENT.pricing.landingSub}</p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {PRICING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className={`relative flex flex-col rounded-2xl cinematic-v2-glass p-7 ${
                plan.highlight ? "ring-1 ring-cyan-400/40 shadow-[0_0_40px_-8px_rgba(34,211,238,0.35)]" : ""
              }`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-[#030508] bg-cyan-400 px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <p className="text-sm font-medium text-slate-400">{plan.name}</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-semibold text-white">{plan.priceLabel}</span>
                <span className="text-slate-500 text-sm">/mo</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{plan.tagline}</p>
              <ul className="mt-6 space-y-2 flex-1">
                {plan.features.slice(0, 6).map((f) => (
                  <li key={f} className="flex gap-2 text-xs text-slate-300">
                    <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-6 w-full py-3 rounded-xl text-sm font-semibold text-center transition-colors ${
                  plan.highlight
                    ? "bg-cyan-500 text-[#030508] hover:bg-cyan-400"
                    : "bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                {CINEMATIC_CONTENT.ctas.startFreeTrial}
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-10 cinematic-v2-glass rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto">
          <h3 className="text-base font-semibold text-white">{PRICING_SHARED_FEATURES_SECTION_TITLE}</h3>
          <ul className="mt-4 grid sm:grid-cols-2 gap-2">
            {PRICING_SHARED_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-xs text-slate-300">
                <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8 overflow-x-auto cinematic-v2-glass rounded-2xl max-w-3xl mx-auto">
          <table className="w-full min-w-[480px] text-xs text-left">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="py-3 pl-5 font-semibold">Capability</th>
                <th className="py-3 px-3 font-semibold">Basic</th>
                <th className="py-3 pr-5 font-semibold text-cyan-400">Professional</th>
              </tr>
            </thead>
            <tbody>
              {PRICING_COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-white/5">
                  <td className="py-2.5 pl-5 text-slate-500">{row.label}</td>
                  <td className="py-2.5 px-3 text-slate-300">{row.basic}</td>
                  <td className="py-2.5 pr-5 text-white font-medium">{row.professional}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500 max-w-2xl mx-auto leading-relaxed">
          OPI and VRI workflows are supported at the workspace level; compliance is always shared between your organization
          and your platform configuration. See{" "}
          <Link href="/security" className="text-cyan-400 hover:underline">
            Security
          </Link>{" "}
          for our trust posture.
        </p>
      </div>
    </CinematicChapter>
  );
}
