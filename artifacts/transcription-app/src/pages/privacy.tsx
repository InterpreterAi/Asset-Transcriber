import { useLocation } from "wouter";
import { ArrowLeft, Mic2 } from "lucide-react";

export default function Privacy() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-[#f5f5f7] py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <button onClick={() => setLocation("/")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Mic2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-lg">InterpreterAI</span>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-8 prose prose-sm max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Last updated: March 2026</p>

          <p>We value user privacy and confidentiality.</p>

          <p>The application does not store or retain audio recordings of conversations.</p>

          <p>Audio processed through the tool is handled in real-time only for the purpose of generating temporary text output.</p>

          <p>No call recordings, transcripts, or interpretation content are stored on our servers.</p>

          <p>Users should ensure they comply with their employer or contracting platform's privacy and confidentiality policies when using external tools.</p>

          <h2>Information We Collect</h2>
          <p>When you create an account we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (stored as a salted hash — never in plain text)</li>
            <li>Usage statistics (session duration, minutes used — no content)</li>
          </ul>

          <h2>Audio Data</h2>
          <p>Audio captured during practice sessions is streamed in real-time to our speech recognition provider. We do not permanently store audio recordings. Any temporary text generated during a session is cleared when the session ends and is not retained on our servers.</p>

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
            <li><strong>Soniox</strong> – speech recognition (audio streams only, not stored)</li>
            <li><strong>OpenAI</strong> – translation (temporary text only, not stored)</li>
            <li><strong>Stripe</strong> – payment processing (billing information only)</li>
          </ul>

          <h2>Data Retention</h2>
          <p>Account data is retained for as long as your account is active. Upon account deletion, personal data is removed within 30 days. Usage logs (duration only, no content) may be retained for up to 12 months for billing and legal compliance.</p>

          <h2>Security</h2>
          <p>We use industry-standard security measures including encrypted connections (TLS), secure password hashing, and server-side session management.</p>

          <h2>Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us.</p>

          <h2>Cookies</h2>
          <p>We use a single session cookie to maintain your login state. No third-party advertising or tracking cookies are used.</p>

          <h2>Changes</h2>
          <p>We may update this policy. We will notify you of significant changes via email or in-app notification.</p>

          <h2>Contact</h2>
          <p>For privacy inquiries: <a href="mailto:privacy@interpreterai.com">privacy@interpreterai.com</a></p>
        </div>

        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
          <button onClick={() => setLocation("/terms")} className="hover:text-foreground transition-colors">Terms of Use</button>
          <button onClick={() => setLocation("/privacy")} className="hover:text-foreground transition-colors">Privacy Policy</button>
        </div>
      </div>
    </div>
  );
}
