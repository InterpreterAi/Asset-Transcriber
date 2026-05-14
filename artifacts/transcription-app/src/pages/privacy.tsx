import { Link } from "wouter";
import { motion } from "framer-motion";
import { UserRound, Trash2, Ban, Shield, Radio, Layers } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.45, delay },
});

const highlights = [
  {
    icon: UserRound,
    title: "Interpreters remain in control",
    body: "You choose how sessions run within the product. Workflow decisions stay with licensed professionals on the call.",
  },
  {
    icon: Trash2,
    title: "Transcripts can be cleared",
    body: "Session-oriented design means on-screen text is tied to an active session; clear expectations help you manage what stays visible while you work.",
  },
  {
    icon: Ban,
    title: "We do not sell user data",
    body: "Personal information is used to operate the service—not resold for advertising networks or unrelated profiling.",
  },
  {
    icon: Shield,
    title: "Privacy-first workflow",
    body: "Product surfaces are intentionally minimal so interpreters can focus on the encounter, not surplus data collection.",
  },
  {
    icon: Radio,
    title: "Real-time processing architecture",
    body: "Audio is processed as a stream for transcription and assistance features. Design assumptions favor ephemeral handling over bulk retention.",
  },
  {
    icon: Layers,
    title: "Session-focused infrastructure",
    body: "Back-end boundaries emphasize the current authenticated session, reducing cross-session drift in how tools behave.",
  },
] as const;

export default function Privacy() {
  return (
    <div className="public-marketing-surface min-h-screen bg-[#F8FAFC] text-foreground overflow-x-hidden">
      <MarketingNav />

      <section className="relative border-b border-border/60 bg-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_20%_0%,rgba(37,99,235,0.08),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-14">
          <motion.h1 {...fade(0)} className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Privacy Policy
          </motion.h1>
          <motion.p {...fade(0.05)} className="mt-3 text-muted-foreground">
            Last updated: March 2026
          </motion.p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {highlights.map(({ icon: Icon, title, body }, i) => (
            <motion.div
              key={title}
              {...fade(0.04 * i)}
              className="rounded-2xl border border-border bg-white p-7 shadow-[0_4px_24px_-12px_rgba(15,23,42,0.08)]"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
            </motion.div>
          ))}
        </div>

        <motion.article
          {...fade(0.12)}
          className="mt-14 prose prose-slate prose-sm max-w-none bg-white rounded-2xl border border-border p-8 sm:p-12 prose-headings:font-semibold prose-headings:tracking-tight prose-p:text-muted-foreground prose-li:text-muted-foreground"
        >
          <p>We value user privacy and confidentiality.</p>

          <p>
            The application does not store or retain audio recordings of conversations. Audio processed through the tool is handled
            in real-time for the purpose of generating temporary text output.
          </p>

          <p>No call recordings, transcripts, or interpretation content are stored on our servers.</p>

          <p>
            Users should ensure they comply with their employer or contracting platform&apos;s privacy and confidentiality policies
            when using external tools.
          </p>

          <h2>Information We Collect</h2>
          <p>When you create an account we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (stored as a salted hash — never in plain text)</li>
            <li>Usage statistics (session duration, minutes used — no content)</li>
          </ul>

          <h2>Audio Data</h2>
          <p>
            Audio captured during practice sessions is streamed in real-time to our speech recognition provider. We do not permanently
            store audio recordings. Any temporary text generated during a session is cleared when the session ends and is not retained
            on our servers.
          </p>

          <h2>How We Use Your Information</h2>
          <ul>
            <li>To provide and operate the language practice service</li>
            <li>To enforce usage limits and manage your subscription</li>
            <li>To communicate important service updates</li>
            <li>To prevent fraud and abuse</li>
          </ul>

          <h2>Data Sharing</h2>
          <p>We do not sell your personal data. We share data only with:</p>
          <ul>
            <li>
              <strong>Soniox</strong> – speech recognition (audio streams only, not stored)
            </li>
            <li>
              <strong>OpenAI</strong> – translation (temporary text only, not stored)
            </li>
            <li>
              <strong>Stripe</strong> – payment processing (billing information only)
            </li>
          </ul>

          <h2>Data Retention</h2>
          <p>
            Account data is retained for as long as your account is active. Upon account deletion, personal data is removed within 30
            days. Usage logs (duration only, no content) may be retained for up to 12 months for billing and legal compliance.
          </p>

          <h2>Security</h2>
          <p>
            We use industry-standard security measures including encrypted connections (TLS), secure password hashing, and server-side
            session management.
          </p>

          <h2>Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us.</p>

          <h2>Cookies</h2>
          <p>We use a single session cookie to maintain your login state. No third-party advertising or tracking cookies are used.</p>

          <h2>Changes</h2>
          <p>We may update this policy. We will notify you of significant changes via email or in-app notification.</p>

          <h2>Contact</h2>
          <p>
            For privacy inquiries:{" "}
            <a href="mailto:privacy@interpreterai.com" className="text-primary font-medium no-underline hover:underline">
              privacy@interpreterai.com
            </a>
          </p>
        </motion.article>

        <div className="mt-10 flex flex-wrap justify-center gap-8 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Use
          </Link>
          <Link href="/security" className="hover:text-foreground transition-colors">
            Security
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
