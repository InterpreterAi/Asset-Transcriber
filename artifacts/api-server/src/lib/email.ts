import { Resend } from "resend";
import { getStaticPublicBaseUrl } from "./authEnv.js";
import { logger } from "./logger.js";
const FROM_ADDRESS = "InterpreterAI <noreply@interpreterai.app>";

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.warn("RESEND_API_KEY is not set — email sending is disabled");
    return null;
  }
  return new Resend(key);
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Transactional send via Resend. Returns false if API key is missing or the request fails. */
export async function sendResendTransactionalEmail(
  to: string,
  subject: string,
  body: { html: string; text: string },
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  try {
    const client = new Resend(key);
    await client.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      text: body.text,
      html: body.html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to }, "Resend transactional email failed");
    return false;
  }
}

export async function sendWelcomeEmail(toEmail: string): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: "Welcome to InterpreterAI",
      text: [
        "Hello,",
        "",
        "Your InterpreterAI account has been successfully created.",
        "",
        "You can now access real-time transcription and translation for live interpretation.",
        "",
        `Login here:\n${getStaticPublicBaseUrl()}`,
        "",
        "If you did not create this account, please ignore this email.",
        "",
        "Best,",
        "InterpreterAI",
      ].join("\n"),
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#1d6ae5;padding:28px 36px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">InterpreterAI</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 28px;">
              <p style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-0.3px;">Welcome to InterpreterAI</p>
              <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6;">Hello,</p>
              <p style="margin:0 0 12px;font-size:15px;color:#555;line-height:1.6;">
                Your InterpreterAI account has been successfully created.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
                You can now access real-time transcription and translation for live interpretation.
              </p>
              <!-- Button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1d6ae5;border-radius:10px;">
                    <a href="${getStaticPublicBaseUrl()}"
                       style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Log In to InterpreterAI
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:28px 0 0;font-size:13px;color:#999;line-height:1.5;">
                If you did not create this account, please ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:12px;color:#aaa;">© 2026 InterpreterAI · All rights reserved</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
    logger.info({ email: toEmail }, "Welcome email sent");
  } catch (err) {
    logger.error({ err, email: toEmail }, "Failed to send welcome email");
  }
}

export async function sendSupportConfirmationEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to:   toEmail,
      subject: `[Ticket #${ticketId}] We received your support request`,
      text: [
        `Hi,`,
        ``,
        `We received your support request regarding: "${subject}"`,
        ``,
        `Our team will get back to you as soon as possible.`,
        `You can view your ticket status at: ${getStaticPublicBaseUrl()}`,
        ``,
        `Ticket ID: #${ticketId}`,
        ``,
        `Best,`,
        `InterpreterAI Support`,
      ].join("\n"),
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="background:#1d6ae5;padding:24px 36px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">InterpreterAI Support</p>
        </td></tr>
        <tr><td style="padding:32px 36px 24px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">We got your message</p>
          <p style="margin:0 0 16px;font-size:14px;color:#666;line-height:1.6;">Your support request has been received. We'll respond as soon as possible.</p>
          <div style="background:#f5f5f7;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em;">Subject</p>
            <p style="margin:0;font-size:14px;color:#333;">${subject}</p>
            <p style="margin:12px 0 0;font-size:11px;color:#aaa;">Ticket #${ticketId}</p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#1d6ae5;border-radius:10px;">
            <a href="${getStaticPublicBaseUrl()}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">View My Tickets</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 36px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:11px;color:#aaa;">© 2026 InterpreterAI · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
    logger.info({ email: toEmail, ticketId }, "Support confirmation email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send support confirmation email");
  }
}

export async function sendAdminReplyEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
  replyMessage: string,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to:   toEmail,
      subject: `[Ticket #${ticketId}] Re: ${subject}`,
      text: [
        `Hi,`,
        ``,
        `You have a new reply on your support request: "${subject}"`,
        ``,
        replyMessage,
        ``,
        `View your ticket at: ${getStaticPublicBaseUrl()}`,
        ``,
        `Best,`,
        `InterpreterAI Support`,
      ].join("\n"),
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="background:#1d6ae5;padding:24px 36px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">InterpreterAI Support</p>
        </td></tr>
        <tr><td style="padding:32px 36px 24px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">New reply on your ticket</p>
          <p style="margin:0 0 4px;font-size:12px;color:#999;">Subject: ${subject} · Ticket #${ticketId}</p>
          <div style="background:#f0f7ff;border-left:3px solid #1d6ae5;border-radius:6px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0;font-size:14px;color:#333;line-height:1.65;white-space:pre-wrap;">${replyMessage}</p>
          </div>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#1d6ae5;border-radius:10px;">
            <a href="${getStaticPublicBaseUrl()}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">View Full Thread</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 36px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:11px;color:#aaa;">© 2026 InterpreterAI · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
    logger.info({ email: toEmail, ticketId }, "Admin reply email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send admin reply email");
  }
}

export async function sendTicketResolvedEmail(
  toEmail: string,
  ticketId: number,
  subject: string,
): Promise<void> {
  const client = getClient();
  if (!client) return;

  try {
    await client.emails.send({
      from: FROM_ADDRESS,
      to:   toEmail,
      subject: `[Ticket #${ticketId}] Your request has been resolved`,
      text: [
        `Hi,`,
        ``,
        `Your support request has been marked as resolved.`,
        ``,
        `Subject: "${subject}"`,
        `Ticket: #${ticketId}`,
        ``,
        `If you still have questions or the issue isn't fixed, you can reply to this ticket at any time and it will automatically reopen.`,
        ``,
        `View your ticket at: ${getStaticPublicBaseUrl()}`,
        ``,
        `Best,`,
        `InterpreterAI Support`,
      ].join("\n"),
      html: `
<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <tr><td style="background:#16a34a;padding:24px 36px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">InterpreterAI Support</p>
        </td></tr>
        <tr><td style="padding:32px 36px 24px;">
          <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Your ticket has been resolved</p>
          <p style="margin:0 0 16px;font-size:14px;color:#666;line-height:1.6;">We've marked your support request as resolved. We hope your issue is sorted!</p>
          <div style="background:#f0fdf4;border-left:3px solid #16a34a;border-radius:6px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.05em;">Subject</p>
            <p style="margin:0;font-size:14px;color:#333;">${subject}</p>
            <p style="margin:8px 0 0;font-size:11px;color:#aaa;">Ticket #${ticketId}</p>
          </div>
          <p style="margin:0 0 20px;font-size:13px;color:#666;line-height:1.6;">
            Still having trouble? You can reply directly to this ticket at any time — it will automatically reopen so we can help.
          </p>
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#1d6ae5;border-radius:10px;">
            <a href="${getStaticPublicBaseUrl()}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">View My Tickets</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 36px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:11px;color:#aaa;">© 2026 InterpreterAI · All rights reserved</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    });
    logger.info({ email: toEmail, ticketId }, "Ticket resolved email sent");
  } catch (err) {
    logger.error({ err }, "Failed to send ticket resolved email");
  }
}
