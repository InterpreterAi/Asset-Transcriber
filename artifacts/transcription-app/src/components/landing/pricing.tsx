import { motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { PRICING_PLANS } from "@/lib/pricing-copy";

export default function Pricing() {
  return (
    <section id="pricing" className="py-24 relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none" />
      <div className="container px-4 md:px-6 relative z-10">
        <div className="text-center mb-16">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-primary text-sm font-semibold uppercase tracking-widest mb-4"
          >
            Pricing
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.05 }}
            className="text-3xl md:text-5xl font-display font-bold text-white mb-4"
          >
            Calm, transparent plans
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground text-lg max-w-2xl mx-auto"
          >
            Built for professional interpreters across OPI and VRI-style workflows with enterprise-minded security practices.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PRICING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative flex flex-col rounded-2xl border bg-card p-7 ${plan.highlight ? "border-primary shadow-[0_0_40px_rgba(0,123,255,0.15)]" : "border-border"}`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-white text-xs font-bold font-display tracking-wide shadow-[0_0_20px_rgba(0,123,255,0.5)]">
                    <Zap className="h-3 w-3 fill-white" />
                    MOST POPULAR
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-base font-semibold mb-1 ${plan.highlight ? "text-primary" : "text-muted-foreground"}`}>
                  {plan.name}
                </h3>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-5xl font-display font-bold text-white">{plan.priceLabel}</span>
                  <span className="text-muted-foreground text-base mb-1.5">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </div>

              <ul className="flex flex-col gap-3 flex-1 mb-8">
                {plan.features.slice(0, 7).map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground/80">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link href={`/signup?plan=${plan.key}`}>
                <Button
                  className={`w-full h-11 font-semibold transition-all ${
                    plan.highlight
                      ? "bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(0,123,255,0.4)] hover:shadow-[0_0_30px_rgba(0,123,255,0.6)]"
                      : "border-border bg-transparent text-white hover:bg-white/5"
                  }`}
                  variant={plan.highlight ? "default" : "outline"}
                >
                  Start free trial
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          No credit card required. Cancel anytime. HIPAA compliant on all plans.
        </motion.p>
      </div>
    </section>
  );
}
