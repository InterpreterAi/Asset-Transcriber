import { Resend } from "resend";
import { logger } from "./logger.js";

/** Verified Resend sending domain (interpreterai.org). */
export const RESEND_FROM_ADDRESS = "InterpreterAI <onboarding@interpreterai.org>";

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

type SendParams = {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text part; welcome / transactional HTML-only is OK for Resend. */
  text?: string;
};

async function deliver(params: SendParams): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    logger.warn(
      { to: params.to, subject: params.subject },
      "RESEND_API_KEY not set — email not sent",
    );
    return false;
  }

  try {
    const client = new Resend(key);
    const result = await client.emails.send({
      from: RESEND_FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text !== undefined ? { text: params.text } : {}),
    });

    if (result.error) {
      logger.error(
        {
          to: params.to,
          subject: params.subject,
          resendError: result.error,
          statusCode: result.error.statusCode,
          errorName: result.error.name,
        },
        "Resend send failed (API error)",
      );
      return false;
    }

    logger.info(
      {
        to: params.to,
        subject: params.subject,
        messageId: result.data?.id,
        from: RESEND_FROM_ADDRESS,
      },
      "Resend email sent successfully",
    );
    return true;
  } catch (err) {
    logger.error({ err, to: params.to, subject: params.subject }, "Resend send failed (exception)");
    return false;
  }
}

/**
 * Send mail via Resend (signup welcome, trial reminder, etc.).
 */
export async function sendEmail(params: SendParams): Promise<boolean> {
  return deliver(params);
}
