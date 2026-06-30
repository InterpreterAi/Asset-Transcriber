import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function CTA() {
  return (
    <section id="enterprise" className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/15 rounded-full blur-[100px]" />
      </div>

      <div className="container px-4 md:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            No credit card required
          </div>

          <h2 className="text-4xl md:text-6xl font-display font-bold text-white mb-6 leading-[1.1] tracking-tight">
            Start interpreting
            <br />
            <span className="text-gradient-blue">at a higher level.</span>
          </h2>

          <p className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed">
            Join thousands of professional interpreters who work faster, more accurately, and with less fatigue — using InterpreterAI as their instrument.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <Button
                size="lg"
                className="h-14 px-10 text-base font-semibold bg-primary hover:bg-primary/90 text-white shadow-[0_0_30px_rgba(0,123,255,0.5)] hover:shadow-[0_0_50px_rgba(0,123,255,0.7)] transition-all gap-2"
              >
                Start Free Trial <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-10 text-base font-medium border-border hover:bg-white/5 hover:text-white"
              >
                Log In
              </Button>
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              HIPAA Compliant
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              No Audio Stored
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              Cancel Anytime
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
