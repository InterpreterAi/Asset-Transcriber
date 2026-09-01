import type { ReactNode } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { marketingFade } from "@/components/marketing/marketing-motion";

export const LEGAL_UPDATED = "August 31, 2026";
export const LEGAL_SUPPORT_EMAIL = "support@interpreterai.com";
export const LEGAL_CONTACT_EMAIL = "legal@interpreterai.com";

const LINKS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund", label: "Refund Policy" },
  { href: "/security", label: "Security" },
] as const;

export function LegalCrossLinks({ current }: { current?: string }) {
  return (
    <nav className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-slate-500" aria-label="Legal pages">
      {LINKS.filter((l) => l.href !== current).map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-slate-200 transition-colors">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function LegalDocument({
  eyebrow = "Legal",
  title,
  updated = LEGAL_UPDATED,
  current,
  children,
}: {
  eyebrow?: string;
  title: string;
  updated?: string;
  current: string;
  children: ReactNode;
}) {
  return (
    <MarketingPageShell premiumNav dark>
      <section className="relative border-b border-white/10 bg-[#060B14] text-white pt-12 pb-16">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-4">
          <motion.p {...marketingFade(0)} className="text-sm font-semibold text-sky-400/90 tracking-wide uppercase mb-3">
            {eyebrow}
          </motion.p>
          <motion.h1 {...marketingFade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.65rem] font-semibold tracking-tight">
            {title}
          </motion.h1>
          <motion.p {...marketingFade(0.1)} className="mt-4 text-lg text-slate-300 max-w-2xl leading-relaxed">
            Last updated: {updated}
          </motion.p>
        </div>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <motion.article
            {...marketingFade(0.06)}
            className="cinematic-v2-glass rounded-2xl p-8 sm:p-12 prose prose-invert prose-sm max-w-none text-slate-400 leading-relaxed prose-headings:text-white prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-cyan-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-200 prose-li:marker:text-slate-500"
          >
            {children}
          </motion.article>
          <LegalCrossLinks current={current} />
        </div>
      </section>
    </MarketingPageShell>
  );
}
