import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { MarketingPageShell } from "./MarketingPageShell";
import { CinematicWorkspace } from "@/components/cinematic-v2/workspace/CinematicWorkspace";
import { marketingFade } from "./marketing-motion";

type Props = {
  children: ReactNode;
  title: string;
  subtitle?: string;
};

/** Login / signup — live workspace preview shares global autoplay with the landing page. */
export function MarketingAuthLayout({ children, title, subtitle }: Props) {
  return (
    <MarketingPageShell premiumNav dark>
      <div className="min-h-[calc(100vh-4rem)] grid lg:grid-cols-2 gap-0">
        <div className="hidden lg:flex flex-col justify-center px-8 xl:px-12 py-12 relative overflow-hidden">
          <motion.div
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 6, repeat: Infinity }}
            className="absolute top-20 left-10 w-64 h-64 rounded-full bg-sky-500/15 blur-[80px]"
            aria-hidden
          />
          <motion.div {...marketingFade(0)}>
            <Link href="/" className="text-sm text-slate-400 hover:text-white transition-colors mb-6 inline-block">
              ← Back to home
            </Link>
            <h1 className="text-2xl font-semibold text-white tracking-tight max-w-md">{title}</h1>
            {subtitle && <p className="mt-3 text-slate-400 leading-relaxed max-w-md text-sm">{subtitle}</p>}
          </motion.div>
          <motion.div {...marketingFade(0.15)} className="mt-8 w-full max-w-xl">
            <CinematicWorkspace />
          </motion.div>
        </div>

        <div className="flex items-center justify-center px-4 py-12 sm:py-16 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="w-full max-w-[400px]"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </MarketingPageShell>
  );
}
