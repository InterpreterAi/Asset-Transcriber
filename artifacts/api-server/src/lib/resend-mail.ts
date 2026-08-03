import { Resend } from "resend";
import { logger } from "./logger.js";

/** Verified Resend domain: interpreterai.org */

export const RESEND_FROM_ONBOARDING = "InterpreterAI <onboarding@interpreterai.org>";

export const RESEND_FROM_SUPPORT = "InterpreterAI Support <support@interpreterai.org>";

export const RESEND_FROM_NOREPLY = "InterpreterAI <noreply@interpreterai.org>";

export const RESEND_FROM_SECURITY = "InterpreterAI Security <security@interpreterai.org>";

/** @deprecated Use RESEND_FROM_ONBOARDING or another explicit sender. */
export const RESEND_FROM_ADDRESS = RESEND_FROM_ONBOARDING;

/** Process-lifetime disable after missing/invalid key (stops scheduled job spam). */
let resendDisabledReason: string | null = null;
let invalidKeyLogged = false;

function isDevLike(): boolean {
  return process.env.NODE_ENV !== "production";
}

function looksLikePlaceholderKey(key: string): boolean {
  return /^(your[_-]?|xxx|placeholder|changeme|todo|test|invalid)/i.test(key);
}

function isInvalidApiKeyError(err: { name?: string; message?: string; statusCode?: number } | undefined): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  const name = (err.name ?? "").toLowerCase();
  if (err.statusCode === 401 || err.statusCode === 403) return true;
  return (
    msg.includes("api key is invalid") ||
    msg.includes("invalid api key") ||
    msg.includes("unauthorized") ||
    name.includes("validation") && msg.includes("api key")
  );
}

export function isResendConfigured(): boolean {
  if (resendDisabledReason) return false;
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  if (looksLikePlaceholderKey(key)) return false;
  return true;
}

type SendParams = {
  to: string;
  subject: string;
  html: string;
  from: string;
  /** Optional plain-text part. */
  text?: string;
};

function applySenderOverride(from: string): string {
  const override = process.env.SENDER_EMAIL?.trim();
  if (!override) return from;
  return override;
}

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
  const effectiveFrom = applySenderOverride(params.from);

  if (resendDisabledReason) {
    return { ok: false, exceptionMessage: resendDisabledReason };
  }

  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || looksLikePlaceholderKey(key)) {
    resendDisabledReason = !key ? "RESEND_API_KEY not set" : "RESEND_API_KEY looks like a placeholder";
    if (isDevLike()) {
      logger.debug(
        { to: params.to, subject: params.subject },
        "RESEND_API_KEY missing/placeholder — email skipped (local)",
      );
    } else {
      logger.warn(
        { to: params.to, subject: params.subject, from: effectiveFrom },
        "RESEND_API_KEY not set — email not sent",
      );
    }
    return { ok: false, exceptionMessage: resendDisabledReason };
  }

  try {
    const client = new Resend(key);
    const result = await client.emails.send({
      from: effectiveFrom,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.text !== undefined ? { text: params.text } : {}),
    });

    if (result.error) {
      const e = result.error;
      if (isInvalidApiKeyError(e)) {
        resendDisabledReason = e.message || "RESEND_API_KEY invalid";
        if (!invalidKeyLogged) {
          invalidKeyLogged = true;
          const payload = {
            resendError: e,
            statusCode: e.statusCode,
          };
          if (isDevLike()) {
            logger.warn(
              payload,
              "RESEND_API_KEY invalid — disabling email sends for this process (local). Fix key in repo-root .env",
            );
          } else {
            logger.error(payload, "Resend send failed (API error)");
          }
        }
        return {
          ok: false,
          resendError: {
            name: e.name,
            message: e.message,
            statusCode: e.statusCode ?? undefined,
          },
        };
      }

      logger.error(
        {
          to: params.to,
          subject: params.subject,
          from: effectiveFrom,
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
        from: effectiveFrom,
      },
      "Resend email sent successfully",
    );
    return { ok: true, messageId };
  } catch (err) {
    const exceptionMessage = err instanceof Error ? err.message : String(err);
    if (/api key is invalid|invalid api key|unauthorized/i.test(exceptionMessage)) {
      resendDisabledReason = exceptionMessage;
      if (!invalidKeyLogged) {
        invalidKeyLogged = true;
        if (isDevLike()) {
          logger.warn(
            { err: exceptionMessage },
            "RESEND_API_KEY invalid — disabling email sends for this process (local)",
          );
        } else {
          logger.error({ err }, "Resend send failed (exception)");
        }
      }
      return { ok: false, exceptionMessage };
    }

    logger.error(
      { err, to: params.to, subject: params.subject, from: effectiveFrom },
      "Resend send failed (exception)",
    );
    return { ok: false, exceptionMessage };
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
