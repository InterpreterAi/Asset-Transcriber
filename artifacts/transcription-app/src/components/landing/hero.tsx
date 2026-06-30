import { motion } from "framer-motion";
import { ArrowRight, Activity, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Hero() {
  return (
    <section className="relative pt-20 pb-32 overflow-hidden flex flex-col items-center text-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="container px-4 md:px-6 z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
        >
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
          Real-time AI infrastructure for professionals
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          className="max-w-4xl mx-auto text-5xl md:text-7xl font-display font-bold tracking-tight text-white mb-6 leading-[1.1]"
        >
          The command center for{" "}
          <span className="text-gradient-blue">flawless interpretation.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
          className="max-w-2xl mx-auto text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed"
        >
          InterpreterAI listens to live speech in 62 languages and displays a real-time dual-column transcript. Never miss a word, never lose your place, and never take notes again.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/signup">
            <Button size="lg" className="h-14 px-8 text-base font-semibold bg-primary hover:bg-primary/90 text-white shadow-[0_0_20px_rgba(0,123,255,0.4)] hover:shadow-[0_0_30px_rgba(0,123,255,0.6)] transition-all gap-2">
              Start Free Trial <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <a href="#demo">
            <Button size="lg" variant="outline" className="h-14 px-8 text-base font-medium border-border hover:bg-white/5 hover:text-white gap-2">
              <Activity className="h-5 w-5 text-primary" /> Watch Demo
            </Button>
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-12 flex items-center justify-center gap-6 text-sm text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-400" />
            HIPAA Compliant
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-400" />
            No Audio Stored
          </div>
        </motion.div>
      </div>
    </section>
  );
}
