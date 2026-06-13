import { Link } from "wouter";
import { Server, Eye, Shield, Activity, KeyRound, RefreshCw, Radio, UserRound, Trash2, Ban } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { marketingFade } from "@/components/marketing/marketing-motion";

const sessionFlow = [
  { step: "1", title: "Authenticated session", body: "Interpreters sign in and control when the workspace is active during OPI or VRI calls." },
  { step: "2", title: "Real-time audio stream", body: "Audio is processed as a live stream for captions and translation assistance—not bulk-uploaded recordings." },
  { step: "3", title: "Session-oriented output", body: "Captions and assist text appear in the workspace aligned with the live encounter." },
  { step: "4", title: "Interpreter judgment", body: "You remain responsible for professional decisions; the tool supports—not replaces—interpretation." },
] as const;

const trustPillars = [
  { icon: Server, title: "Secure infrastructure", body: "Enterprise-inspired hosting with separation of concerns and modern transport security." },
  { icon: Radio, title: "How data moves", body: "Session streams use encrypted transport. Design favors ephemeral handling over bulk retention." },
  { icon: UserRound, title: "Interpreter control", body: "You choose how and when the workspace runs within your professional workflow." },
  { icon: Trash2, title: "Retention approach", body: "Session-oriented design with minimized retention patterns aligned with product goals." },
  { icon: Eye, title: "Privacy principles", body: "Privacy-first workflows—minimal surfaces, no sale of user data, interpreter-focused design." },
  { icon: Shield, title: "Security practices", body: "Authentication, access controls, and operational monitoring support platform reliability." },
  { icon: Activity, title: "Continuous improvement", body: "Security and privacy practices evolve as the product and threat landscape change." },
  { icon: KeyRound, title: "Controlled access", body: "Role-appropriate access for administrative and support functions." },
] as const;

const privacyHighlights = [
  { icon: Ban, title: "We do not sell user data", body: "Personal information operates the service—not advertising networks or unrelated profiling." },
  { icon: Trash2, title: "Transcripts can be cleared", body: "On-screen session text is tied to your active workflow; manage what stays visible while you work." },
] as const;

export default function Security() {
  return (
    <MarketingPageShell premiumNav dark>
      <section className="relative border-b border-white/10 bg-[#060B14] text-white pt-12 pb-16">
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-4">
          <motion.p {...marketingFade(0)} className="text-sm font-semibold text-sky-400/90 tracking-wide uppercase mb-3">
            Trust center
          </motion.p>
          <motion.h1 {...marketingFade(0.05)} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight leading-[1.15] max-w-3xl">
            Security &amp; Privacy for interpreter teams
          </motion.h1>
          <motion.p {...marketingFade(0.1)} className="mt-5 text-lg text-slate-300/95 max-w-3xl leading-relaxed">
            One trust story: how sessions flow, how data moves, interpreter control, retention, privacy principles, and security
            practices—described carefully without claiming certifications we have not earned.
          </motion.p>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <motion.h2 {...marketingFade(0.12)} className="text-xl font-semibold text-white mb-6">
            How sessions flow
          </motion.h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {sessionFlow.map((item, i) => (
              <motion.div
                key={item.step}
                {...marketingFade(0.14 + i * 0.04)}
                className="cinematic-v2-glass rounded-xl p-5 border-l-2 border-cyan-400/40"
              >
                <span className="text-xs font-bold text-cyan-400">{item.step}</span>
                <p className="mt-2 font-semibold text-white">{item.title}</p>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t border-white/10">
          <motion.h2 {...marketingFade(0.2)} className="text-xl font-semibold text-white mb-6">
            Security &amp; privacy architecture
          </motion.h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {trustPillars.map((p, i) => (
              <motion.div key={p.title} {...marketingFade(0.22 + i * 0.03)} className="cinematic-v2-glass rounded-xl p-6">
                <p.icon className="w-5 h-5 text-cyan-400 mb-3" strokeWidth={1.75} />
                <p className="font-semibold text-white">{p.title}</p>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div id="privacy-policy" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t border-white/10 scroll-mt-24">
          <motion.h2 {...marketingFade(0.3)} className="text-xl font-semibold text-white mb-2">
            Privacy policy highlights
          </motion.h2>
          <motion.p {...marketingFade(0.32)} className="text-sm text-slate-400 mb-6">
            Last updated: March 2026
          </motion.p>
          <div className="grid md:grid-cols-2 gap-5 mb-10">
            {privacyHighlights.map((p, i) => (
              <motion.div key={p.title} {...marketingFade(0.34 + i * 0.04)} className="cinematic-v2-glass rounded-xl p-6">
                <p.icon className="w-5 h-5 text-cyan-400 mb-3" />
                <p className="font-semibold text-white">{p.title}</p>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{p.body}</p>
              </motion.div>
            ))}
          </div>
          <motion.article
            {...marketingFade(0.38)}
            className="prose prose-invert prose-sm max-w-none text-slate-400 leading-relaxed space-y-4"
          >
            <p>
              The application does not store or retain audio recordings of conversations. Audio processed through the tool is
              handled in real-time for temporary text output.
            </p>
            <p>No call recordings, transcripts, or interpretation content are stored on our servers.</p>
            <p>
              Users should ensure they comply with employer or contracting platform privacy and confidentiality policies when using
              assistive software.
            </p>
            <p>
              <Link href="/terms" className="text-cyan-400 hover:underline">
                Terms of Service
              </Link>{" "}
              and contractual questions can be directed through your usual InterpreterAI channel.
            </p>
          </motion.article>
        </div>

        <motion.div
          {...marketingFade(0.4)}
          className="mx-auto max-w-3xl px-4 sm:px-6 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-8 text-center mb-12"
        >
          <p className="text-sm text-slate-300 leading-relaxed flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0" />
            HIPAA-focused thinking guides our design. We describe practices carefully and improve them continuously.
          </p>
        </motion.div>
      </section>
    </MarketingPageShell>
  );
}
