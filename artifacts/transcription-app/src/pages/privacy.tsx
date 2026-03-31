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
          <span className="font-display font-bold text-lg">InterpretAI</span>
        </div>
        <div className="bg-white rounded-2xl border border-border shadow-sm p-8 prose prose-sm max-w-none">
          <h1>Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Last updated: March 2026</p>

          <h2>1. Information We Collect</h2>
          <p>When you create an account we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (stored as a salted bcrypt hash — never in plain text)</li>
            <li>Usage statistics (session duration, minutes used)</li>
            <li>IP address at signup (for security and abuse prevention)</li>
          </ul>

          <h2>2. Audio Data</h2>
          <p>Audio captured during transcription sessions is streamed in real-time to our speech recognition provider (Soniox). We do not permanently store audio recordings. Transcript text may be held briefly in memory for translation and is not retained after your session ends.</p>

          <h2>3. How We Use Your Information</h2>
          <ul>
            <li>To provide and operate the transcription and translation service</li>
            <li>To enforce usage limits and manage your subscription</li>
            <li>To communicate important service updates</li>
            <li>To prevent fraud and abuse</li>
          </ul>

          <h2>4. Data Sharing</h2>
          <p>We do not sell your personal data. We share data only with:</p>
          <ul>
            <li><strong>Soniox</strong> – speech recognition (audio streams only)</li>
            <li><strong>OpenAI</strong> – translation (transcript text only)</li>
            <li><strong>Stripe</strong> – payment processing (billing information only)</li>
          </ul>

          <h2>5. Data Retention</h2>
          <p>Account data is retained for as long as your account is active. Upon account deletion, personal data is removed within 30 days. Usage logs may be retained for up to 12 months for billing and legal compliance.</p>

          <h2>6. Security</h2>
          <p>We use industry-standard security measures including encrypted connections (TLS), bcrypt password hashing, and server-side session management. We review security practices regularly.</p>

          <h2>7. Your Rights</h2>
          <p>You may request access to, correction of, or deletion of your personal data at any time by contacting us. Where applicable, you have the right to data portability and the right to object to processing.</p>

          <h2>8. Cookies</h2>
          <p>We use a single session cookie to maintain your login state. No third-party advertising or tracking cookies are used.</p>

          <h2>9. Children</h2>
          <p>The Service is not intended for users under 16 years of age. We do not knowingly collect data from children.</p>

          <h2>10. Changes</h2>
          <p>We may update this policy. We will notify you of significant changes via email or in-app notification.</p>

          <h2>11. Contact</h2>
          <p>For privacy inquiries: <a href="mailto:privacy@interpretai.com">privacy@interpretai.com</a></p>
        </div>
      </div>
    </div>
  );
}
