import { Link } from "wouter";
import { LegalDocument, LEGAL_SUPPORT_EMAIL } from "@/components/marketing/LegalDocument";

export default function Refund() {
  return (
    <LegalDocument eyebrow="Legal" title="Refund Policy" current="/refund">
      <p>
        This Refund Policy explains how cancellations and refunds work for InterpreterAI subscriptions. It applies together
        with our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2>Merchant of Record</h2>
      <p>
        Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our
        orders. Paddle provides all customer service inquiries and handles returns.
      </p>
      <p>
        Refunds and billing adjustments are processed by Paddle in line with this policy, applicable consumer law, and{" "}
        <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">
          Paddle’s Buyer Terms
        </a>
        .
      </p>

      <h2>Free trial</h2>
      <p>
        New accounts typically start with a free trial. No payment is taken for the trial itself, so there is nothing to
        refund for unused trial time. If you do not subscribe before the trial ends, the account simply stops having paid
        access.
      </p>

      <h2>14-day refund on your first paid purchase</h2>
      <p>
        If you are not satisfied with InterpreterAI, you may request a full refund of your <strong>first paid
        subscription charge</strong> within <strong>14 days</strong> of the purchase date.
      </p>
      <p>To request a refund:</p>
      <ul>
        <li>
          Email <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a> with the email on the account and the
          Paddle order / receipt ID from your confirmation email, or
        </li>
        <li>
          Contact Paddle directly through the link in your receipt or at{" "}
          <a href="https://www.paddle.com/help" target="_blank" rel="noreferrer">
            paddle.com/help
          </a>
        </li>
      </ul>
      <p>
        Approved refunds are returned to the original payment method by Paddle. Processing time depends on your bank or
        card issuer.
      </p>
      <p>
        Consumers in the European Economic Area, United Kingdom, and other regions with a statutory cooling-off period keep
        those rights. Where local law requires a longer or different remedy, that law controls.
      </p>

      <h2>Renewals and later charges</h2>
      <p>
        After the first paid period, monthly renewals are generally non-refundable except where required by law, where
        Paddle’s Buyer Terms require it, or where we agree in writing (for example a billing error or duplicate charge).
      </p>
      <p>
        You can cancel auto-renewal at any time. Cancellation takes effect at the end of the current paid period. We do not
        pro-rate unused days after a renewal unless required by law or approved as an exception.
      </p>

      <h2>How to cancel</h2>
      <p>
        Cancel from your account billing page, or email {LEGAL_SUPPORT_EMAIL}. Cancel before the renewal date to avoid the
        next charge. Access continues until the period you already paid for ends.
      </p>

      <h2>Chargebacks</h2>
      <p>
        Please contact us or Paddle before filing a card dispute. We will work to resolve billing issues directly. Unwarranted
        chargebacks may result in account suspension.
      </p>

      <h2>Contact</h2>
      <p>
        InterpreterAI support: <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`}>{LEGAL_SUPPORT_EMAIL}</a>
        <br />
        Paddle (Merchant of Record):{" "}
        <a href="https://www.paddle.com/help" target="_blank" rel="noreferrer">
          paddle.com/help
        </a>
      </p>
    </LegalDocument>
  );
}
