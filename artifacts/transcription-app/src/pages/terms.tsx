import { useLocation } from "wouter";
import { ArrowLeft, Mic2 } from "lucide-react";

export default function Terms() {
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
          <h1>Terms of Service</h1>
          <p className="text-muted-foreground text-sm">Last updated: March 2026</p>

          <h2>1. Acceptance of Terms</h2>
          <p>By accessing or using InterpretAI ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>

          <h2>2. Description of Service</h2>
          <p>InterpretAI provides real-time AI-powered transcription and translation services for professional interpreters. The Service is provided on a subscription basis following a free trial period.</p>

          <h2>3. Free Trial</h2>
          <p>New accounts receive a 14-day free trial with a daily usage limit of 5 hours (300 minutes). The trial begins on the date of account creation. No credit card is required during the trial.</p>

          <h2>4. Subscription Plans</h2>
          <p>After the trial period, continued access requires a paid subscription. Plans are billed monthly and may be cancelled at any time. Usage limits apply per plan:</p>
          <ul>
            <li><strong>Basic</strong> – $40/month – 5 hours/day</li>
            <li><strong>Professional</strong> – $80/month – 7 hours/day</li>
            <li><strong>Unlimited</strong> – $120/month – Unlimited (system cap applies)</li>
          </ul>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to misuse the Service. You may not use the Service to transcribe content you do not have the legal right to process, to attempt to reverse-engineer proprietary technology, or to violate any applicable laws or regulations.</p>

          <h2>6. Data and Privacy</h2>
          <p>Audio processed through the Service is transmitted to third-party speech recognition providers. We do not permanently store audio data. Please review our Privacy Policy for full details on data handling.</p>

          <h2>7. Limitation of Liability</h2>
          <p>The Service is provided "as is." We make no warranties about accuracy, availability, or fitness for a particular purpose. Our liability is limited to the amount you paid for the Service in the preceding month.</p>

          <h2>8. Termination</h2>
          <p>We reserve the right to terminate accounts that violate these terms. You may cancel your account at any time. Upon termination, access to the Service will cease at the end of the billing period.</p>

          <h2>9. Changes to Terms</h2>
          <p>We may update these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.</p>

          <h2>10. Contact</h2>
          <p>For questions about these Terms, contact us at <a href="mailto:legal@interpretai.com">legal@interpretai.com</a>.</p>
        </div>
      </div>
    </div>
  );
}
