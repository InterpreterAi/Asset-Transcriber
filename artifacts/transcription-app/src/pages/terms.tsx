import { Link } from "wouter";
import { LegalDocument, LEGAL_CONTACT_EMAIL, LEGAL_SUPPORT_EMAIL } from "@/components/marketing/LegalDocument";

export default function Terms() {
  return (
    <LegalDocument eyebrow="Legal" title="Terms of Service" current="/terms">
      <p>
        These Terms of Service (“Terms”) govern access to and use of InterpreterAI, including the website, workspace, and
        related services (the “Service”). They are an agreement between you and the operator of InterpreterAI (“InterpreterAI,”
        “we,” “us,” or “our”).
      </p>
      <p>
        By creating an account, starting a trial, or using the Service, you agree to these Terms, our{" "}
        <Link href="/privacy">Privacy Policy</Link>, and our <Link href="/refund">Refund Policy</Link>. If you do not agree,
        do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        InterpreterAI provides real-time speech-to-text and translation assistance for professional interpreters, including
        over-the-phone (OPI) and video-remote (VRI) style workflows. The Service is a productivity aid. It does not replace a
        certified human interpreter, legal advice, medical advice, or your professional judgment.
      </p>
      <p>
        You are solely responsible for confirming that your use complies with employer rules, platform policies, confidentiality
        agreements, and applicable law. We are not responsible for how you apply captions or translations in a live encounter.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate account information and keep your credentials confidential. You are responsible for activity
        under your account. Notify us promptly at{" "}
        <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a> if you suspect unauthorized access.
      </p>
      <p>
        New accounts typically receive a time-limited free trial with a daily usage cap. Trial length and limits are shown in
        the product. After the trial, continued access requires a paid subscription unless we agree otherwise in writing.
      </p>

      <h2>3. Subscriptions and billing</h2>
      <p>
        Paid plans are billed in advance on a recurring monthly basis until cancelled. Current public plans are:
      </p>
      <ul>
        <li>
          <strong>Basic</strong> — $59 per month — up to 5 hours of interpreting time per day
        </li>
        <li>
          <strong>Professional</strong> — $99 per month — unlimited interpreting hours as offered in the product; a daily
          platform cap may still apply for reliability
        </li>
      </ul>
      <p>
        Prices, features, and limits may change. Material changes will be reflected on our{" "}
        <Link href="/pricing">Pricing</Link> page. Taxes may be added where required.
      </p>
      <p>
        Subscriptions renew automatically at the then-current rate unless you cancel before the renewal date. You can cancel
        from your account billing settings or by contacting support. Cancellation stops future renewals; you keep access until
        the end of the paid period unless a refund is issued under the <Link href="/refund">Refund Policy</Link>.
      </p>

      <h2>4. Payments and Merchant of Record</h2>
      <p>
        Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our
        orders. Paddle provides all customer service inquiries and handles returns.
      </p>
      <p>
        Payment cards and tax invoices are processed by Paddle, not by InterpreterAI. For checkout, receipts, tax, and
        payment-method questions, you may also contact Paddle at{" "}
        <a href="https://www.paddle.com/help" target="_blank" rel="noreferrer">
          paddle.com/help
        </a>
        .
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service where your employer, contracting platform, or applicable law prohibits third-party AI tools</li>
        <li>Process audio or content you do not have the right to handle</li>
        <li>Attempt to reverse-engineer, scrape, overload, or disrupt the Service</li>
        <li>Share an account, resell access, or circumvent usage limits</li>
        <li>Use the Service for unlawful, harmful, or abusive activity</li>
      </ul>
      <p>
        We may suspend or terminate accounts that violate these Terms, create risk, or fail to pay. Upon termination, access
        ends at the close of the current billing period unless we terminate immediately for cause.
      </p>

      <h2>6. Professional and confidentiality duties</h2>
      <p>
        Interpreters remain responsible for accuracy, ethics, and confidentiality. Do not treat model output as a certified
        record. If a session involves sensitive information, follow your organization’s privacy rules in addition to ours.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        InterpreterAI and its branding, software, and documentation remain our property or that of our licensors. You receive
        a limited, non-exclusive, non-transferable right to use the Service during your subscription. You retain rights in
        content you submit, and you grant us a limited license to process it solely to operate the Service.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        Live speech recognition and related processing may be performed by subprocessors (including speech and translation
        providers). Checkout is handled by Paddle. Those providers process data under their own terms and our instructions as
        described in the <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided “as is” and “as available.” Speech recognition and translation can be incomplete or incorrect.
        We do not warrant uninterrupted availability, specific accuracy, or fitness for a particular purpose, including
        medical, legal, or emergency interpretation.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, InterpreterAI and its operators are not liable for indirect, incidental,
        special, consequential, or punitive damages, or for lost profits, data, or business. Our aggregate liability for
        claims relating to the Service is limited to the amount you paid for the Service in the one month before the claim.
        Some jurisdictions do not allow certain limitations; in those places, our liability is limited to the maximum extent
        permitted.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms. The “Last updated” date will change when we do. Continued use after an update constitutes
        acceptance. If a change is material, we will provide additional notice where practical.
      </p>

      <h2>12. Contact</h2>
      <p>
        Product and account support:{" "}
        <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>
        <br />
        Legal notices:{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
        <br />
        Billing, invoices, and returns: Paddle.com (Merchant of Record),{" "}
        <a href="https://www.paddle.com/help" target="_blank" rel="noreferrer">
          paddle.com/help
        </a>
      </p>
    </LegalDocument>
  );
}
