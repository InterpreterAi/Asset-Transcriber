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
    <nav className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground" aria-label="Legal pages">
      {LINKS.filter((l) => l.href !== current).map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-foreground transition-colors">
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
    <MarketingPageShell premiumNav={false} dark={false}>
      <section className="relative border-b border-border/60 bg-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_20%_0%,rgba(37,99,235,0.08),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-14">
          <motion.p {...marketingFade(0)} className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            {eyebrow}
          </motion.p>
          <motion.h1 {...marketingFade(0.04)} className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {title}
          </motion.h1>
          <motion.p {...marketingFade(0.08)} className="mt-3 text-muted-foreground">
            Last updated: {updated}
          </motion.p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-14 lg:py-20">
        <motion.article
          {...marketingFade(0.06)}
          className="prose prose-slate prose-sm max-w-none bg-white rounded-2xl border border-border p-8 sm:p-12 prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-muted-foreground prose-li:text-muted-foreground shadow-sm"
        >
          {children}
        </motion.article>
        <LegalCrossLinks current={current} />
      </section>
    </MarketingPageShell>
  );
}
