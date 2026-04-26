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

export type SendEmailResult = {
  ok: boolean;
  /** Resend message id when `ok` */
  messageId?: string;
  /** Present when Resend returned an error object */
  resendError?: { name?: string; message?: string; statusCode?: number };
  /** Set when an exception was thrown */
  exceptionMessage?: string;
};

async function deliverWithResult(params: SendParams): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    logger.warn(
      { to: params.to, subject: params.subject, from: params.from },
      "RESEND_API_KEY not set — email not sent",
    );
    return { ok: false, exceptionMessage: "RESEND_API_KEY not set" };
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
      const e = result.error;
      logger.error(
        {
          to: params.to,
          subject: params.subject,
          from: params.from,
          resendError: e,
          statusCode: e.statusCode,
          errorName: e.name,
        },
        "Resend send failed (API error)",
      );
      return {
        ok: false,
        resendError: {
          name: e.name,
          message: e.message,
          statusCode: e.statusCode ?? undefined,
        },
      };
    }

    const messageId = result.data?.id;
    logger.info(
      {
        to: params.to,
        subject: params.subject,
        messageId,
        from: params.from,
      },
      "Resend email sent successfully",
    );
    return { ok: true, messageId };
  } catch (err) {
    logger.error(
      { err, to: params.to, subject: params.subject, from: params.from },
      "Resend send failed (exception)",
    );
    return {
      ok: false,
      exceptionMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

async function deliver(params: SendParams): Promise<boolean> {
  const r = await deliverWithResult(params);
  return r.ok;
}

/**
 * Send mail via Resend. Pass the appropriate `from` for the email category.
 */
export async function sendEmail(params: SendParams): Promise<boolean> {
  return deliver(params);
}

/** Same as {@link sendEmail} but returns Resend response details for logging. */
export async function sendEmailWithResult(params: SendParams): Promise<SendEmailResult> {
  return deliverWithResult(params);
}
