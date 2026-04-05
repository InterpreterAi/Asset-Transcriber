import { Resend } from "resend";
import { logger } from "./logger.js";

const FROM_ADDRESS = "noreply@interpreterai.app";

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Send mail via Resend. Returns false if RESEND_API_KEY is missing or the request fails.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  try {
    const client = new Resend(key);
    await client.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to: params.to }, "Resend send failed");
    return false;
  }
}
