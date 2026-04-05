import { Resend } from "resend";
import { logger } from "./logger.js";

/** Verified Resend domain: interpreterai.org */

export const RESEND_FROM_ONBOARDING = "InterpreterAI <onboarding@interpreterai.org>";

export const RESEND_FROM_SUPPORT = "InterpreterAI Support <support@interpreterai.org>";

export const RESEND_FROM_NOREPLY = "InterpreterAI <noreply@interpreterai.org>";

export const RESEND_FROM_SECURITY = "InterpreterAI Security <security@interpreterai.org>";

/** @deprecated Use RESEND_FROM_ONBOARDING or another explicit sender. */
export const RESEND_FROM_ADDRESS = RESEND_FROM_ONBOARDING;

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

type SendParams = {
  to: string;
  subject: string;
  html: string;
  from: string;
  /** Optional plain-text part. */
  text?: string;
};

async function deliver(params: SendParams): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    logger.warn(
      { to: params.to, subject: params.subject, from: params.from },
      "RESEND_API_KEY not set — email not sent",
    );
    return false;
  }

  try {
    const client = new Resend(key);
    const result = await client.emails.send({
      from: params.from,
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
          from: params.from,
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
        from: params.from,
      },
      "Resend email sent successfully",
    );
    return true;
  } catch (err) {
    logger.error(
      { err, to: params.to, subject: params.subject, from: params.from },
      "Resend send failed (exception)",
    );
    return false;
  }
}

/**
 * Send mail via Resend. Pass the appropriate `from` for the email category.
 */
export async function sendEmail(params: SendParams): Promise<boolean> {
  return deliver(params);
}
