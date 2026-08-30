import { Link } from "wouter";
import { LegalDocument, LEGAL_CONTACT_EMAIL, LEGAL_SUPPORT_EMAIL } from "@/components/marketing/LegalDocument";

export default function Privacy() {
  return (
    <LegalDocument eyebrow="Legal" title="Privacy Policy" current="/privacy">
      <p>
        This Privacy Policy explains how InterpreterAI (“we,” “us,” or “our”) collects, uses, and shares information when you
        use our website, workspace, and related services (the “Service”). It is written for customers, trial users, and
        visitors.
      </p>
      <p>
        We design the product around live assistance, not bulk recording. We do not sell personal information. More
        architecture detail is on our <Link href="/security">Security &amp; Privacy</Link> page.
      </p>

      <h2>1. Who we are</h2>
      <p>
        InterpreterAI operates a real-time transcription and translation workspace for professional interpreters. For privacy
        questions, contact <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> or{" "}
        <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>.
      </p>
      <p>
        Paid orders are processed by Paddle.com as Merchant of Record. Paddle is an independent controller for payment,
        tax, and invoice data. See{" "}
        <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noreferrer">
          Paddle’s privacy policy
        </a>
        .
      </p>

      <h2>2. Information we collect</h2>
      <h3>Account information</h3>
      <p>
        When you sign up we collect identifiers such as name or username, email address, password (stored as a hash), and
        optional profile settings (for example default languages). If you sign in with Google, we receive the profile
        information Google shares with us for authentication.
      </p>
      <h3>Usage and billing metadata</h3>
      <p>
        We keep operational records needed to run a subscription product: plan type, trial dates, minutes used, session
        start/stop times, language-pair labels, device or browser type, IP address, and similar diagnostics. These records
        are not call recordings.
      </p>
      <h3>Live audio and session text</h3>
      <p>
        Microphone or tab audio is streamed in real time so the Service can generate captions and translations during an
        active session. We do not store call recordings as a product feature. On-screen transcript and translation text is
        session-oriented and intended for the interpreter’s live workflow. Do not treat the workspace as an archive of
        patient, legal, or employer records.
      </p>
      <h3>Support communications</h3>
      <p>If you email us, we keep the message and metadata needed to respond and improve the Service.</p>
      <h3>Cookies and similar technology</h3>
      <p>
        We use essential cookies and local storage for sign-in, session security, and product preferences (such as theme).
        We do not use advertising pixels to sell your data.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>Provide, secure, and improve the Service</li>
        <li>Authenticate you and prevent abuse</li>
        <li>Enforce usage limits and administer subscriptions</li>
        <li>Communicate about the account, security, and product changes</li>
        <li>Comply with law and respond to lawful requests</li>
      </ul>
      <p>We do not sell personal information and we do not share it with advertisers for cross-context advertising.</p>

      <h2>4. Processors and third parties</h2>
      <p>We use service providers who process data on our behalf or as independent controllers where noted:</p>
      <ul>
        <li>
          <strong>Speech and translation providers</strong> — process live audio/text to generate captions and translations
          during a session
        </li>
        <li>
          <strong>Paddle.com</strong> — Merchant of Record for checkout, taxes, invoices, and payment-method data
        </li>
        <li>
          <strong>Hosting and infrastructure</strong> — operate the application and database
        </li>
        <li>
          <strong>Email and authentication providers</strong> — deliver transactional mail and optional Google sign-in
        </li>
      </ul>
      <p>
        These parties receive only what they need to perform their function. They may process data in the United States or
        other countries where they operate.
      </p>

      <h2>5. Retention</h2>
      <p>
        Account and billing metadata are kept for as long as the account is active and for a reasonable period afterward
        for security, accounting, and legal purposes. Live audio is processed for the session and is not retained as a
        recording archive. You can delete on-screen session text in the workspace as you work. You may request account
        closure by emailing {LEGAL_SUPPORT_EMAIL}.
      </p>

      <h2>6. Your choices and rights</h2>
      <p>
        Depending on where you live (including the EEA, UK, and certain US states), you may have rights to access, correct,
        delete, or export personal information, or to object to or restrict certain processing. Send requests to{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. We may need to verify your identity. You may
        also lodge a complaint with your local data-protection authority.
      </p>
      <p>
        Payment and invoice data held by Paddle should be requested from Paddle, or we can help route the request.
      </p>

      <h2>7. Security</h2>
      <p>
        We use encrypted transport, authenticated sessions, and access controls. No method of transmission or storage is
        perfectly secure. See <Link href="/security">Security &amp; Privacy</Link> for how sessions are designed. We describe
        practices carefully and do not claim certifications we have not earned.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is for professional adult users. We do not knowingly collect personal information from children under 16
        (or the age required in your country).
      </p>

      <h2>9. International users</h2>
      <p>
        If you access the Service from outside the country where we host systems, your information may be transferred to
        and processed in other countries that may have different data-protection laws. We use the Service only if those
        transfers are permitted for operating a global SaaS product, including through our processors.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this policy. The “Last updated” date will change when we do. Material changes will be posted on this
        page and, where appropriate, notified by email or in-product notice.
      </p>

      <h2>11. Contact</h2>
      <p>
        Privacy: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        <br />
        Support: <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>
      </p>
    </LegalDocument>
  );
}
